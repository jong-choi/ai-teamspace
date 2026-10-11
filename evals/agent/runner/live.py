from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol, cast

import httpx

from clients.langfuse import LangfuseTraceLookup
from clients.teamspace_mcp import MODERN_PROTOCOL_VERSION, TeamspaceMcpClient
from clients.teamspace_mcp_raw import TeamspaceMcpRawClient
from config.models import EvalTargetAdapter
from config.settings import REPO_ROOT, EvalSettings
from datasets.schema import EvalCase, EvalDataset
from fixtures.deterministic import DeterministicFixtureProvider
from fixtures.lifecycle import FixtureLease, FixtureProvider
from fixtures.public_api import BetterAuthPublicFixtureProvider
from fixtures.seeded import SeededWorkspaceFixtureProvider
from personas.registry import canonical_persona_alias
from reports.render import summarize_trials
from reports.schema import EvalReport, RunManifest, TrialResult
from runner.agent_protocol_executor import AgentProtocolExecutor
from runner.case_runner import Judge
from runner.deterministic import DeterministicAgentExecutor
from runner.manifest import dependency_versions, tool_manifest_hash
from runner.suite_runner import run_dataset_trials

AGENT_PROTOCOL_VERSION = "v1"
TEAMSPACE_MCP_ALIAS = "work-os"
_DETERMINISTIC_RUNTIME_VERSION = "deterministic-fixture-v1"
_DETERMINISTIC_MODEL_NAME = "dataset-contract-v1"
_DETERMINISTIC_TOOL_NAMES = (
    "organizations_list",
    "organization_members_list",
    "organization_invitation_create",
    "chat_conversations_list",
    "chat_messages_list",
    "chat_message_send",
    "wiki_search",
    "wiki_document_get",
    "wiki_document_create",
    "wiki_document_update",
    "projects_list",
    "project_get",
    "project_ticket_get",
    "project_ticket_create",
    "project_ticket_update",
    "project_ticket_move",
    "calendar_meetings_list",
    "calendar_meeting_get",
    "calendar_availability_check",
    "calendar_meeting_create",
    "calendar_meeting_reschedule",
    "calendar_meeting_cancel",
    "calendar_meeting_rsvp",
)


class LiveFixtureProvider(FixtureProvider, Protocol):
    def agent_headers(self, lease: FixtureLease) -> dict[str, str]: ...

    def mcp_bearer_token(self, lease: FixtureLease) -> str: ...


@dataclass(frozen=True)
class LiveDiscovery:
    server_runtime_version: str
    agent_protocol_version: str
    mcp_protocol_version: str
    mcp_resource_alias: str
    tool_manifest_hash: str
    teamspace_tool_names: frozenset[str]
    tools: tuple[dict[str, Any], ...] = ()


def deterministic_discovery() -> LiveDiscovery:
    tools = [
        {
            "name": name,
            "description": "deterministic fixture capability",
            "inputSchema": {"type": "object"},
        }
        for name in _DETERMINISTIC_TOOL_NAMES
    ]
    return LiveDiscovery(
        server_runtime_version=_DETERMINISTIC_RUNTIME_VERSION,
        agent_protocol_version=AGENT_PROTOCOL_VERSION,
        mcp_protocol_version=MODERN_PROTOCOL_VERSION,
        mcp_resource_alias=TEAMSPACE_MCP_ALIAS,
        tool_manifest_hash=tool_manifest_hash(tools),
        teamspace_tool_names=frozenset(_DETERMINISTIC_TOOL_NAMES),
    )


def _evaluator_version() -> str:
    pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
    raw = tomllib.loads(pyproject.read_text(encoding="utf-8"))
    project_raw: object = raw.get("project")
    if not isinstance(project_raw, Mapping):
        raise RuntimeError("eval pyproject is missing [project]")
    version = cast(Mapping[str, object], project_raw).get("version")
    if not isinstance(version, str) or not version:
        raise RuntimeError("eval pyproject is missing project.version")
    return version


def _repository_commit() -> str:
    git = shutil.which("git")
    if git is None:
        raise RuntimeError("git executable is unavailable")
    result = subprocess.run(  # noqa: S603
        [git, "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    commit = result.stdout.strip()
    if not commit:
        raise RuntimeError("git rev-parse returned an empty commit")
    return commit


async def _server_info(settings: EvalSettings) -> Mapping[str, Any]:
    async with httpx.AsyncClient(
        base_url=settings.server_url,
        timeout=settings.case_timeout_seconds,
        follow_redirects=False,
    ) as client:
        response = await client.get("/info")
    if response.status_code != 200:
        raise RuntimeError(
            f"Agent Protocol GET /info returned HTTP {response.status_code}"
        )
    payload: object = response.json()
    if not isinstance(payload, Mapping):
        raise RuntimeError("Agent Protocol GET /info returned a non-object")
    return cast(Mapping[str, Any], payload)


def _server_runtime_version(info: Mapping[str, Any]) -> str:
    version = info.get("version")
    if isinstance(version, str) and version:
        return version
    langgraph_version = info.get("langgraph_js_version")
    if isinstance(langgraph_version, str) and langgraph_version:
        return f"unreported;langgraph-js={langgraph_version}"
    return "unreported"


def _tool_names(tools: list[dict[str, Any]]) -> frozenset[str]:
    names: set[str] = set()
    for tool in tools:
        name = tool.get("name")
        if not isinstance(name, str) or not name:
            raise RuntimeError("MCP tools/list returned a tool without a name")
        names.add(name)
    if not names:
        raise RuntimeError("MCP tools/list returned no tools for full-scope eval actor")
    return frozenset(names)


def _mutate_mcp_secret(secret: str) -> str:
    if not secret:
        raise ValueError("MCP secret must be non-empty")
    replacement = "A" if secret[-1] != "A" else "B"
    return secret[:-1] + replacement


async def _assert_mcp_access_key_rejected(
    settings: EvalSettings,
    secret: str,
    *,
    label: str,
) -> None:
    async with TeamspaceMcpRawClient(
        settings.mcp_resource_url,
        secret,
        timeout_seconds=settings.case_timeout_seconds,
    ) as client:
        status, headers = await client.initialize_status()

    if status != 401:
        raise RuntimeError(
            f"{label} MCP access key was not rejected with HTTP 401; status={status}"
        )
    challenge = headers.get("www-authenticate", "")
    if "resource_metadata=" not in challenge:
        raise RuntimeError(
            f"{label} MCP access key rejection omitted discovery challenge"
        )


async def capture_live_discovery(
    settings: EvalSettings,
    fixtures: LiveFixtureProvider,
) -> LiveDiscovery:
    info = await _server_info(settings)
    probe = EvalCase(
        id="manifest-probe",
        version="1.0.0",
        input=["manifest discovery probe"],
        persona="read-write-member",
        organization_fixture="manifest-org",
    )
    owner = f"{settings.run_namespace}:manifest-probe"
    lease = await fixtures.setup(probe, owner=owner)
    secret = fixtures.mcp_bearer_token(lease)
    try:
        mcp = TeamspaceMcpClient(
            settings.mcp_resource_url,
            bearer_token=secret,
            timeout_seconds=settings.case_timeout_seconds,
        )
        discovery = await mcp.discover()
        protocol_version = discovery.get("protocolVersion")
        if protocol_version != MODERN_PROTOCOL_VERSION:
            raise RuntimeError(
                "MCP discovery did not return the required modern protocol version"
            )
        tools = await mcp.list_tools()
        await _assert_mcp_access_key_rejected(
            settings,
            _mutate_mcp_secret(secret),
            label="invalid",
        )
    finally:
        await fixtures.cleanup(probe, lease)

    await _assert_mcp_access_key_rejected(
        settings,
        secret,
        label="revoked",
    )

    return LiveDiscovery(
        server_runtime_version=_server_runtime_version(info),
        agent_protocol_version=AGENT_PROTOCOL_VERSION,
        mcp_protocol_version=MODERN_PROTOCOL_VERSION,
        mcp_resource_alias=TEAMSPACE_MCP_ALIAS,
        tool_manifest_hash=tool_manifest_hash(tools),
        teamspace_tool_names=_tool_names(tools),
        tools=tuple(tools),
    )


def build_run_manifest(
    settings: EvalSettings,
    dataset: EvalDataset,
    discovery: LiveDiscovery,
    *,
    repository_commit: str | None = None,
    timestamp: datetime | None = None,
    model_provider: str | None = None,
    model_name: str | None = None,
    model_parameters: Mapping[str, str | int | float | bool | None] | None = None,
) -> RunManifest:
    versions = dependency_versions()
    return RunManifest(
        repository_commit=repository_commit or _repository_commit(),
        build_id=os.environ.get("GITHUB_RUN_ID") or os.environ.get("BUILD_ID"),
        server_runtime_version=discovery.server_runtime_version,
        python_version=versions["python"],
        dependency_versions=versions,
        model_provider=model_provider,
        model_name=model_name,
        model_parameters=dict(model_parameters or {}),
        prompt_hash=None,
        agent_protocol_version=discovery.agent_protocol_version,
        mcp_protocol_version=discovery.mcp_protocol_version,
        mcp_resource_alias=discovery.mcp_resource_alias,
        tool_manifest_hash=discovery.tool_manifest_hash,
        dataset_id=dataset.id,
        dataset_version=dataset.version,
        evaluator_version=_evaluator_version(),
        persona_aliases=sorted(
            {canonical_persona_alias(case.persona) for case in dataset.cases}
        ),
        random_seed=settings.random_seed,
        trial_count=settings.trials,
        timestamp=timestamp or datetime.now(UTC),
        langfuse_environment=None,
        langfuse_project_alias=settings.langfuse_project_alias,
    )


def _write_tool_manifest(output_dir: Path, discovery: LiveDiscovery) -> None:
    """Keep the tool names, descriptions and input schemas the model was offered."""

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "tool-manifest.json").write_text(
        json.dumps(list(discovery.tools), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


async def _attach_langfuse_links(
    trials: list[TrialResult],
    settings: EvalSettings,
) -> list[TrialResult]:
    if not settings.langfuse_enabled:
        return trials

    lookup = LangfuseTraceLookup(settings.langfuse())
    try:
        linked: list[TrialResult] = []
        for trial in trials:
            run_ids = [
                run_id
                for run_id in trial.trajectory.run_ids
                if not run_id.endswith(":not-started")
            ]
            links = [
                await asyncio.to_thread(lookup.link_for_run, run_id)
                for run_id in run_ids
            ]
            linked.append(trial.model_copy(update={"langfuse": links}))
        return linked
    finally:
        lookup.close()


async def run_live_dataset(
    settings: EvalSettings,
    dataset: EvalDataset,
    *,
    judge: Judge | None = None,
) -> EvalReport:
    if settings.target_adapter != EvalTargetAdapter.PUBLIC_HTTP:
        raise ValueError("run_live_dataset requires EVAL_TARGET_ADAPTER=public-http")
    if dataset.id != settings.dataset:
        raise ValueError(
            f"dataset id {dataset.id!r} does not match EVAL_DATASET={settings.dataset!r}"
        )
    if settings.judge() is not None and judge is None:
        raise ValueError(
            "judge settings are configured but no reviewed judge adapter was supplied"
        )

    seeded = settings.seeded_workspace()
    fixtures: LiveFixtureProvider
    if seeded is None:
        fixtures = BetterAuthPublicFixtureProvider.for_http(
            settings.server_url,
            trusted_origin=settings.trusted_origin,
            timeout_seconds=settings.case_timeout_seconds,
        )
    else:
        email, password, organization_slug = seeded
        fixtures = SeededWorkspaceFixtureProvider.for_http(
            settings.server_url,
            trusted_origin=settings.trusted_origin,
            email=email,
            password=password,
            organization_slug=organization_slug,
            timeout_seconds=settings.case_timeout_seconds,
        )
    discovery = await capture_live_discovery(settings, fixtures)
    _write_tool_manifest(settings.output_dir, discovery)
    executor = AgentProtocolExecutor.for_http(
        settings.server_url,
        headers_for_lease=fixtures.agent_headers,
        assistant_id="workos",
        teamspace_tool_names=discovery.teamspace_tool_names,
        raw_dir=settings.output_dir / "raw",
    )
    trials = await run_dataset_trials(
        dataset,
        run_namespace=settings.run_namespace,
        limits=settings.limits(),
        fixtures=fixtures,
        executor=executor,
        judge=judge,
    )
    trials = await _attach_langfuse_links(trials, settings)
    return EvalReport(
        manifest=build_run_manifest(settings, dataset, discovery),
        summary=summarize_trials(trials),
        trials=trials,
    )


async def run_deterministic_dataset(
    settings: EvalSettings,
    dataset: EvalDataset,
) -> EvalReport:
    if settings.target_adapter != EvalTargetAdapter.DETERMINISTIC_FIXTURE:
        raise ValueError(
            "run_deterministic_dataset requires "
            "EVAL_TARGET_ADAPTER=deterministic-fixture"
        )
    if dataset.id != settings.dataset:
        raise ValueError(
            f"dataset id {dataset.id!r} does not match EVAL_DATASET={settings.dataset!r}"
        )
    if settings.judge() is not None:
        raise ValueError("deterministic fixture target cannot use judge credentials")
    if settings.langfuse_enabled:
        raise ValueError("deterministic fixture target cannot enable Langfuse linkage")

    fixtures = DeterministicFixtureProvider()
    executor = DeterministicAgentExecutor(fixtures)
    discovery = deterministic_discovery()
    trials = await run_dataset_trials(
        dataset,
        run_namespace=settings.run_namespace,
        limits=settings.limits(),
        fixtures=fixtures,
        executor=executor,
        judge=None,
    )
    return EvalReport(
        manifest=build_run_manifest(
            settings,
            dataset,
            discovery,
            model_provider="fixture",
            model_name=_DETERMINISTIC_MODEL_NAME,
            model_parameters={
                "target_adapter": EvalTargetAdapter.DETERMINISTIC_FIXTURE.value,
            },
        ),
        summary=summarize_trials(trials),
        trials=trials,
    )


async def run_configured_dataset(
    settings: EvalSettings,
    dataset: EvalDataset,
    *,
    judge: Judge | None = None,
) -> EvalReport:
    if settings.target_adapter == EvalTargetAdapter.PUBLIC_HTTP:
        return await run_live_dataset(settings, dataset, judge=judge)
    if judge is not None:
        raise ValueError("deterministic fixture target does not accept a judge adapter")
    return await run_deterministic_dataset(settings, dataset)
