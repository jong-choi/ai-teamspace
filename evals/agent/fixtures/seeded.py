from __future__ import annotations

import hashlib
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, cast

from clients.product_api import ProductApiClient
from datasets.schema import EvalCase, FixtureDeclaration
from fixtures.lifecycle import FixtureLease
from personas.registry import ALL_SCOPES
from runner.trajectory import ObservedOutcome

_LOOKUP_KINDS = frozenset({"project", "ticket", "wiki_document", "meeting"})


@dataclass(frozen=True)
class _SeededRef:
    kind: str
    resource_id: str
    project_id: str | None = None


@dataclass
class _SeededSession:
    client: ProductApiClient
    organization_id: str
    refs: dict[str, _SeededRef]
    access_key_id: str
    access_key_secret: str


class SeededWorkspaceFixtureProvider:
    """Run cases as an existing account inside an already seeded workspace.

    Preconditions name seeded resources instead of creating them, so every case sees
    the same projects, tickets, wiki documents, meetings and knowledge graph.
    Restoring the workspace between passes is the caller's job.
    """

    def __init__(
        self,
        client_factory: Callable[[], ProductApiClient],
        *,
        email: str,
        password: str,
        organization_slug: str,
    ) -> None:
        self._client_factory = client_factory
        self._email = email
        self._password = password
        self._organization_slug = organization_slug
        self._sessions: dict[str, _SeededSession] = {}

    @classmethod
    def for_http(
        cls,
        server_url: str,
        *,
        trusted_origin: str,
        email: str,
        password: str,
        organization_slug: str,
        timeout_seconds: float = 30,
    ) -> SeededWorkspaceFixtureProvider:
        return cls(
            lambda: ProductApiClient(
                server_url,
                trusted_origin=trusted_origin,
                timeout_seconds=timeout_seconds,
            ),
            email=email,
            password=password,
            organization_slug=organization_slug,
        )

    async def setup(self, case: EvalCase, *, owner: str) -> FixtureLease:
        if owner in self._sessions:
            raise ValueError(f"fixture owner already active: {owner}")

        client = self._client_factory()
        try:
            signed_in = await client.sign_in_email(
                email=self._email,
                password=self._password,
            )
            user_id = _id(_mapping(signed_in, "user"))
            organization_id = _id(
                _single(
                    _items(await client.list_organizations(), "items"),
                    "slug",
                    self._organization_slug,
                    label="organization",
                )
            )
            await client.set_active_organization(organization_id)

            refs: dict[str, _SeededRef] = {}
            for declaration in case.preconditions:
                refs[declaration.alias] = await self._lookup(
                    client,
                    organization_id,
                    declaration,
                    refs,
                )

            digest = hashlib.sha256(owner.encode()).hexdigest()[:16]
            created = await client.create_mcp_access_key(
                name=f"eval-{digest}",
                scopes=list(ALL_SCOPES),
                organization_ids=[organization_id],
                idempotency_key=f"eval-{digest}-mcp",
                expires_in_days=1,
            )
            secret = created.get("secret")
            if not isinstance(secret, str) or not secret:
                raise ValueError("MCP access-key response is missing secret")
        except Exception:
            await client.close()
            raise

        self._sessions[owner] = _SeededSession(
            client=client,
            organization_id=organization_id,
            refs=refs,
            access_key_id=_id(_mapping(created, "key")),
            access_key_secret=secret,
        )
        public_ids = {
            "user:" + case.persona: user_id,
            **{f"{ref.kind}:{alias}": ref.resource_id for alias, ref in refs.items()},
        }
        if case.organization_fixture is not None:
            public_ids["organization:" + case.organization_fixture] = organization_id
        return FixtureLease(
            owner=owner,
            persona_alias=case.persona,
            organization_alias=case.organization_fixture,
            public_ids=public_ids,
        )

    async def _lookup(
        self,
        client: ProductApiClient,
        organization_id: str,
        declaration: FixtureDeclaration,
        refs: Mapping[str, _SeededRef],
    ) -> _SeededRef:
        if declaration.kind not in _LOOKUP_KINDS:
            raise ValueError(f"unsupported seeded fixture kind: {declaration.kind}")
        values = declaration.values

        if declaration.kind == "project":
            project = _single(
                _items(await client.list_projects(organization_id), "items"),
                "name",
                _text(values, "name"),
                label="project",
            )
            return _SeededRef(kind="project", resource_id=_id(project))

        if declaration.kind == "ticket":
            project_ref = refs.get(_text(values, "projectAlias"))
            if project_ref is None or project_ref.kind != "project":
                raise ValueError("seeded ticket requires a prior project alias")
            ticket = _single(
                _items(
                    await client.list_tickets(organization_id, project_ref.resource_id),
                    "items",
                ),
                "title",
                _text(values, "title"),
                label="ticket",
            )
            return _SeededRef(
                kind="ticket",
                resource_id=_id(ticket),
                project_id=project_ref.resource_id,
            )

        if declaration.kind == "wiki_document":
            tree = await client.get_wiki_tree(organization_id)
            document = _single(
                _flatten(_items(tree, "documents")),
                "title",
                _text(values, "title"),
                label="wiki document",
            )
            return _SeededRef(kind="wiki_document", resource_id=_id(document))

        meeting = _single(
            _items(
                await client.list_meetings(
                    organization_id,
                    from_instant=_text(values, "from"),
                    to_instant=_text(values, "to"),
                ),
                "items",
            ),
            "title",
            _text(values, "title"),
            label="meeting",
        )
        return _SeededRef(kind="meeting", resource_id=_id(meeting))

    def agent_headers(self, lease: FixtureLease) -> dict[str, str]:
        return self._session(lease).client.session_headers()

    def mcp_bearer_token(self, lease: FixtureLease) -> str:
        return self._session(lease).access_key_secret

    async def observe(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> list[ObservedOutcome]:
        session = self._session(lease)
        outcomes: list[ObservedOutcome] = []
        for source in dict.fromkeys(item.source for item in case.outcome_assertions):
            kind, separator, alias = source.partition(":")
            ref = session.refs.get(alias)
            if not separator or ref is None or ref.kind != kind:
                raise ValueError(f"unknown seeded outcome source: {source}")
            outcomes.append(
                ObservedOutcome(
                    source=source,
                    payload=await self._observe(session, ref),
                )
            )
        return outcomes

    async def _observe(
        self,
        session: _SeededSession,
        ref: _SeededRef,
    ) -> dict[str, Any]:
        client = session.client
        organization_id = session.organization_id
        if ref.kind == "project":
            return await client.get_project(organization_id, ref.resource_id)
        if ref.kind == "wiki_document":
            return await client.get_wiki_document(organization_id, ref.resource_id)
        if ref.kind == "ticket":
            if ref.project_id is None:
                raise ValueError("seeded ticket is missing project id")
            return await client.get_ticket(
                organization_id,
                ref.project_id,
                ref.resource_id,
            )
        return await client.get_meeting(organization_id, ref.resource_id)

    async def cleanup(self, case: EvalCase, lease: FixtureLease) -> None:
        del case
        session = self._sessions.pop(lease.owner, None)
        if session is None:
            return
        try:
            await session.client.revoke_mcp_access_key(session.access_key_id)
        finally:
            await session.client.close()

    def _session(self, lease: FixtureLease) -> _SeededSession:
        session = self._sessions.get(lease.owner)
        if session is None:
            raise ValueError(f"fixture owner is not active: {lease.owner}")
        return session


def _mapping(payload: Mapping[str, Any], field: str) -> Mapping[str, Any]:
    value = payload.get(field)
    if not isinstance(value, Mapping):
        raise ValueError(f"public API response is missing {field!r} object")
    return cast(Mapping[str, Any], value)


def _id(payload: Mapping[str, Any]) -> str:
    value = payload.get("id")
    if not isinstance(value, str) or not value:
        raise ValueError("public API response is missing non-empty 'id'")
    return value


def _items(payload: Mapping[str, Any], field: str) -> list[Mapping[str, Any]]:
    value = payload.get(field)
    if not isinstance(value, list):
        raise ValueError(f"public API response is missing {field!r} list")
    return [
        cast(Mapping[str, Any], item)
        for item in cast(list[object], value)
        if isinstance(item, Mapping)
    ]


def _flatten(documents: list[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    flat: list[Mapping[str, Any]] = []
    for document in documents:
        flat.append(document)
        children = document.get("children")
        if isinstance(children, list):
            flat.extend(
                _flatten(
                    [
                        cast(Mapping[str, Any], child)
                        for child in cast(list[object], children)
                        if isinstance(child, Mapping)
                    ]
                )
            )
    return flat


def _single(
    items: list[Mapping[str, Any]],
    field: str,
    expected: str,
    *,
    label: str,
) -> Mapping[str, Any]:
    matches = [item for item in items if item.get(field) == expected]
    if len(matches) != 1:
        raise ValueError(
            f"seeded {label} {expected!r} matched {len(matches)} resources; expected 1"
        )
    return matches[0]


def _text(values: Mapping[str, object], field: str) -> str:
    value = values.get(field)
    if not isinstance(value, str) or not value:
        raise ValueError(f"seeded fixture requires {field!r}")
    return value
