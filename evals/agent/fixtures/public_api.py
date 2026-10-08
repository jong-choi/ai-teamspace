from __future__ import annotations

import hashlib
import secrets
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol, cast

from clients.product_api import ProductApiClient
from datasets.schema import EvalCase, FixtureDeclaration
from fixtures.lifecycle import FixtureLease
from personas.registry import ALL_SCOPES, PersonaRecipe, persona_recipe
from runner.trajectory import ObservedOutcome

# Agent delegation 완료 뒤 server가 돌려보낼 제품 화면 경로다.
AGENT_DELEGATION_RETURN_TO = "/ai"
_SUPPORTED_KINDS = frozenset(
    {"organization", "project", "wiki_document", "ticket", "meeting"}
)


class ProductFixtureSession(Protocol):
    async def sign_up_email(
        self,
        *,
        email: str,
        name: str,
        password: str,
        username: str,
    ) -> dict[str, Any]: ...

    async def create_organization(
        self,
        *,
        name: str,
        slug: str,
        logo: str | None = None,
    ) -> dict[str, Any]: ...

    async def set_active_organization(
        self,
        organization_id: str,
    ) -> dict[str, Any]: ...

    async def get_organization(self, organization_id: str) -> dict[str, Any]: ...

    async def invite_organization_member(
        self,
        organization_id: str,
        *,
        recipient_username: str,
        role: str,
    ) -> dict[str, Any]: ...

    async def accept_organization_invitation(
        self,
        invitation_id: str,
    ) -> dict[str, Any]: ...

    async def get_mcp_access(
        self,
        organization_id: str,
    ) -> dict[str, Any]: ...

    async def update_my_mcp_policy(
        self,
        organization_id: str,
        *,
        requested_scopes: list[str],
        expected_revision: int,
    ) -> dict[str, Any]: ...

    async def update_organization_mcp_policy(
        self,
        organization_id: str,
        *,
        allowed_scopes: list[str],
        expected_revision: int,
    ) -> dict[str, Any]: ...

    async def create_mcp_access_key(
        self,
        *,
        name: str,
        scopes: list[str],
        organization_ids: list[str],
        idempotency_key: str,
        expires_in_days: int = 1,
    ) -> dict[str, Any]: ...

    async def revoke_mcp_access_key(self, key_id: str) -> None: ...

    async def delegate_agent(self, *, return_to: str) -> None: ...

    async def get_agent_delegation(self) -> dict[str, Any]: ...

    async def revoke_agent_delegation(self) -> None: ...

    async def create_project(
        self,
        organization_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]: ...

    async def get_project(
        self,
        organization_id: str,
        project_id: str,
    ) -> dict[str, Any]: ...

    async def list_project_columns(
        self,
        organization_id: str,
        project_id: str,
    ) -> dict[str, Any]: ...

    async def create_wiki_document(
        self,
        organization_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]: ...

    async def get_wiki_document(
        self,
        organization_id: str,
        document_id: str,
    ) -> dict[str, Any]: ...

    async def create_ticket(
        self,
        organization_id: str,
        project_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]: ...

    async def get_ticket(
        self,
        organization_id: str,
        project_id: str,
        ticket_id: str,
    ) -> dict[str, Any]: ...

    async def create_meeting(
        self,
        organization_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]: ...

    async def get_meeting(
        self,
        organization_id: str,
        meeting_id: str,
    ) -> dict[str, Any]: ...

    def session_headers(self) -> dict[str, str]: ...

    async def close(self) -> None: ...


@dataclass(frozen=True)
class _ResourceRef:
    kind: str
    resource_id: str
    organization_id: str | None = None
    project_id: str | None = None


@dataclass(frozen=True)
class _CaseSessions:
    bootstrap: ProductFixtureSession
    actor: ProductFixtureSession
    recipe: PersonaRecipe


@dataclass(frozen=True)
class _McpCredential:
    key_id: str
    secret: str
    revoked: bool


def _digest(*parts: str) -> str:
    joined = "\x00".join(parts)
    return hashlib.sha256(joined.encode()).hexdigest()[:12]


def _require_string(
    values: Mapping[str, str | int | float | bool | None],
    key: str,
) -> str:
    value = values.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"fixture value {key!r} must be a non-empty string")
    return value


def _optional_string(
    values: Mapping[str, str | int | float | bool | None],
    key: str,
) -> str | None:
    value = values.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"fixture value {key!r} must be a string when present")
    return value


def _json_payload(
    declaration: FixtureDeclaration,
    *,
    excluded: set[str],
) -> dict[str, object]:
    return {
        key: value
        for key, value in declaration.values.items()
        if key not in excluded and value is not None
    }


def _top_level_id(payload: Mapping[str, Any], *, field: str = "id") -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value:
        raise ValueError(f"public API response is missing non-empty {field!r}")
    return value


def _organization_id(payload: Mapping[str, Any]) -> str:
    organization = payload.get("organization")
    if not isinstance(organization, Mapping):
        raise ValueError("organization response is missing organization object")
    return _top_level_id(cast(Mapping[str, Any], organization))


def _nested_mapping(
    payload: Mapping[str, Any],
    field: str,
) -> Mapping[str, Any]:
    value = payload.get(field)
    if not isinstance(value, Mapping):
        raise ValueError(f"public API response is missing {field!r} object")
    return cast(Mapping[str, Any], value)


def _revision(payload: Mapping[str, Any], field: str) -> int:
    policy = _nested_mapping(payload, field)
    value = policy.get("revision")
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"public MCP policy response has invalid {field}.revision")
    return value


def _scope_list(payload: Mapping[str, Any], field: str, scopes_field: str) -> list[str]:
    policy = _nested_mapping(payload, field)
    raw: object = policy.get(scopes_field)
    if not isinstance(raw, list):
        raise ValueError(
            f"public MCP policy response has invalid {field}.{scopes_field}"
        )
    values = cast(list[object], raw)
    if not all(isinstance(value, str) for value in values):
        raise ValueError(
            f"public MCP policy response has non-string {field}.{scopes_field}"
        )
    return [cast(str, value) for value in values]


class BetterAuthPublicFixtureProvider:
    """Creates eval actors/resources through Better Auth and public product APIs."""

    def __init__(
        self,
        client_factory: Callable[[], ProductFixtureSession],
    ) -> None:
        self._client_factory = client_factory
        self._sessions: dict[str, _CaseSessions] = {}
        self._resources: dict[str, dict[str, _ResourceRef]] = {}
        self._mcp_credentials: dict[str, _McpCredential] = {}
        self._delegated_owners: set[str] = set()

    @classmethod
    def for_http(
        cls,
        server_url: str,
        *,
        trusted_origin: str,
        timeout_seconds: float = 30,
    ) -> BetterAuthPublicFixtureProvider:
        return cls(
            lambda: ProductApiClient(
                server_url,
                trusted_origin=trusted_origin,
                timeout_seconds=timeout_seconds,
            )
        )

    async def setup(
        self,
        case: EvalCase,
        *,
        owner: str,
    ) -> FixtureLease:
        if owner in self._sessions:
            raise ValueError(f"fixture owner already active: {owner}")

        recipe = persona_recipe(case.persona)
        bootstrap = self._client_factory()
        actor = self._client_factory()
        sessions = _CaseSessions(
            bootstrap=bootstrap,
            actor=actor,
            recipe=recipe,
        )
        self._sessions[owner] = sessions
        refs: dict[str, _ResourceRef] = {}
        self._resources[owner] = refs

        try:
            digest = _digest(owner, recipe.alias)
            bootstrap_username = f"evaladmin{digest}"
            await self._sign_up(
                bootstrap,
                username=bootstrap_username,
                display_name=f"Eval fixture admin {digest}",
            )
            actor_username = f"evalactor{digest}"
            actor_user_id = await self._sign_up(
                actor,
                username=actor_username,
                display_name=f"Eval {recipe.alias}",
            )

            declarations = list(case.preconditions)
            organization_alias = case.organization_fixture
            if organization_alias and not any(
                item.kind == "organization" and item.alias == organization_alias
                for item in declarations
            ):
                declarations.insert(
                    0,
                    FixtureDeclaration(
                        kind="organization",
                        alias=organization_alias,
                        values={},
                    ),
                )

            for declaration in declarations:
                await self._create_declaration(
                    bootstrap,
                    case,
                    owner,
                    declaration,
                    refs,
                )

            target_organization_id = self._target_organization_id(case, refs)
            actor_organization_id = await self._configure_persona(
                sessions,
                actor_username=actor_username,
                target_organization_id=target_organization_id,
                owner=owner,
            )
            await self._provision_mcp_credential(
                sessions,
                owner=owner,
                organization_id=actor_organization_id,
            )
            await self._delegate_agent(sessions, owner=owner)

            public_ids = {
                "user:" + case.persona: actor_user_id,
                **{
                    f"{ref.kind}:{alias}": ref.resource_id
                    for alias, ref in refs.items()
                },
            }
            if recipe.alias != case.persona:
                public_ids["user:" + recipe.alias] = actor_user_id

            return FixtureLease(
                owner=owner,
                persona_alias=recipe.alias,
                organization_alias=case.organization_fixture,
                public_ids=public_ids,
            )
        except Exception as setup_error:
            self._sessions.pop(owner, None)
            self._resources.pop(owner, None)
            credential = self._mcp_credentials.pop(owner, None)
            try:
                if credential is not None and not credential.revoked:
                    await sessions.actor.revoke_mcp_access_key(credential.key_id)
            except Exception as cleanup_error:
                await self._close_sessions(sessions)
                raise ExceptionGroup(
                    "fixture setup and MCP credential cleanup both failed",
                    [setup_error, cleanup_error],
                ) from None
            await self._close_sessions(sessions)
            raise

    async def _sign_up(
        self,
        client: ProductFixtureSession,
        *,
        username: str,
        display_name: str,
    ) -> str:
        signed_up = await client.sign_up_email(
            email=f"{username}@eval.invalid",
            name=display_name,
            password=secrets.token_urlsafe(24) + "Aa1!",
            username=username,
        )
        user = signed_up.get("user")
        if not isinstance(user, Mapping):
            raise ValueError("signup response is missing user object")
        return _top_level_id(cast(Mapping[str, Any], user))

    def _target_organization_id(
        self,
        case: EvalCase,
        refs: Mapping[str, _ResourceRef],
    ) -> str | None:
        if case.organization_fixture is None:
            return None
        target = refs.get(case.organization_fixture)
        if target is None or target.kind != "organization":
            raise ValueError(
                "organization_fixture must reference an organization fixture"
            )
        return target.resource_id

    async def _configure_persona(
        self,
        sessions: _CaseSessions,
        *,
        actor_username: str,
        target_organization_id: str | None,
        owner: str,
    ) -> str | None:
        recipe = sessions.recipe

        if recipe.membership == "none":
            return None

        if recipe.membership == "other":
            other = await sessions.actor.create_organization(
                name=f"Eval actor organization {_digest(owner, 'other')}",
                slug=f"eval-actor-{_digest(owner, 'other')}",
            )
            actor_organization_id = _organization_id(other)
            await sessions.actor.set_active_organization(actor_organization_id)
            await self._configure_scopes(
                administrator=sessions.actor,
                actor=sessions.actor,
                organization_id=actor_organization_id,
                desired_scopes=recipe.requested_scopes,
            )
            return actor_organization_id

        if target_organization_id is None:
            raise ValueError(
                f"persona {recipe.alias!r} requires case.organization_fixture"
            )
        if recipe.organization_role is None:
            raise ValueError(f"persona {recipe.alias!r} has no target organization role")

        invitation = await sessions.bootstrap.invite_organization_member(
            target_organization_id,
            recipient_username=actor_username,
            role=recipe.organization_role,
        )
        invitation_id = _top_level_id(invitation)
        await sessions.actor.accept_organization_invitation(invitation_id)
        await sessions.actor.set_active_organization(target_organization_id)
        await self._configure_scopes(
            administrator=sessions.bootstrap,
            actor=sessions.actor,
            organization_id=target_organization_id,
            desired_scopes=recipe.requested_scopes,
        )
        return target_organization_id

    async def _configure_scopes(
        self,
        *,
        administrator: ProductFixtureSession,
        actor: ProductFixtureSession,
        organization_id: str,
        desired_scopes: tuple[str, ...],
    ) -> None:
        if not desired_scopes:
            return

        admin_access = await administrator.get_mcp_access(organization_id)
        organization_allowed = _scope_list(
            admin_access,
            "organizationPolicy",
            "allowedScopes",
        )
        if not set(desired_scopes).issubset(organization_allowed):
            organization_revision = _revision(
                admin_access,
                "organizationPolicy",
            )
            expanded = [
                scope
                for scope in ALL_SCOPES
                if scope in set(organization_allowed).union(desired_scopes)
            ]
            await administrator.update_organization_mcp_policy(
                organization_id,
                allowed_scopes=expanded,
                expected_revision=organization_revision,
            )

        actor_access = await actor.get_mcp_access(organization_id)
        requested = _scope_list(actor_access, "myPolicy", "requestedScopes")
        if requested != list(desired_scopes):
            await actor.update_my_mcp_policy(
                organization_id,
                requested_scopes=list(desired_scopes),
                expected_revision=_revision(actor_access, "myPolicy"),
            )

    async def _provision_mcp_credential(
        self,
        sessions: _CaseSessions,
        *,
        owner: str,
        organization_id: str | None,
    ) -> None:
        recipe = sessions.recipe
        if recipe.mcp_auth == "none":
            return
        if organization_id is None or not recipe.requested_scopes:
            raise ValueError(
                f"persona {recipe.alias!r} cannot provision an MCP access key"
            )

        digest = _digest(owner, recipe.alias, "mcp")
        response = await sessions.actor.create_mcp_access_key(
            name=f"eval-{digest}",
            scopes=list(recipe.requested_scopes),
            organization_ids=[organization_id],
            idempotency_key=f"eval-{digest}-mcp",
            expires_in_days=1,
        )
        key = _nested_mapping(response, "key")
        key_id = _top_level_id(key)
        secret = response.get("secret")
        if not isinstance(secret, str) or not secret:
            raise ValueError("MCP access-key response is missing secret")

        revoked = recipe.mcp_auth == "revoked-key"
        if revoked:
            await sessions.actor.revoke_mcp_access_key(key_id)
        self._mcp_credentials[owner] = _McpCredential(
            key_id=key_id,
            secret=secret,
            revoked=revoked,
        )

    async def _delegate_agent(self, sessions: _CaseSessions, *, owner: str) -> None:
        if sessions.recipe.agent_delegation == "none":
            return
        await sessions.actor.delegate_agent(return_to=AGENT_DELEGATION_RETURN_TO)
        delegation = await sessions.actor.get_agent_delegation()
        if delegation.get("status") != "active":
            raise ValueError("Agent delegation did not become active")
        self._delegated_owners.add(owner)

    async def _create_declaration(
        self,
        client: ProductFixtureSession,
        case: EvalCase,
        owner: str,
        declaration: FixtureDeclaration,
        refs: dict[str, _ResourceRef],
    ) -> None:
        if declaration.kind not in _SUPPORTED_KINDS:
            raise ValueError(f"unsupported fixture kind: {declaration.kind}")
        if declaration.alias in refs:
            raise ValueError(f"duplicate fixture alias: {declaration.alias}")

        if declaration.kind == "organization":
            slug = _optional_string(declaration.values, "slug")
            if slug is None:
                slug = f"eval-{_digest(owner, declaration.alias)}"
            name = _optional_string(declaration.values, "name")
            response = await client.create_organization(
                name=name or f"Eval {declaration.alias}",
                slug=slug,
                logo=_optional_string(declaration.values, "logo"),
            )
            refs[declaration.alias] = _ResourceRef(
                kind="organization",
                resource_id=_organization_id(response),
            )
            return

        organization_alias = (
            _optional_string(declaration.values, "organizationAlias")
            or case.organization_fixture
        )
        if organization_alias is None:
            raise ValueError(
                f"{declaration.kind} fixture requires organizationAlias "
                "or case.organization_fixture"
            )
        organization = refs.get(organization_alias)
        if organization is None or organization.kind != "organization":
            raise ValueError(f"unknown organization fixture alias: {organization_alias}")
        organization_id = organization.resource_id

        if declaration.kind == "project":
            payload = _json_payload(
                declaration,
                excluded={"organizationAlias"},
            )
            payload.setdefault(
                "key",
                "E" + _digest(owner, declaration.alias)[:10].upper(),
            )
            payload.setdefault("name", f"Eval {declaration.alias}")
            payload.setdefault("description", "evaluation fixture")
            response = await client.create_project(organization_id, payload)
            refs[declaration.alias] = _ResourceRef(
                kind="project",
                resource_id=_top_level_id(response),
                organization_id=organization_id,
            )
            return

        if declaration.kind == "wiki_document":
            payload = _json_payload(
                declaration,
                excluded={"organizationAlias"},
            )
            payload.setdefault("title", f"Eval {declaration.alias}")
            payload.setdefault("contentMarkdown", "evaluation fixture")
            response = await client.create_wiki_document(organization_id, payload)
            refs[declaration.alias] = _ResourceRef(
                kind="wiki_document",
                resource_id=_top_level_id(response),
                organization_id=organization_id,
            )
            return

        if declaration.kind == "ticket":
            project_alias = _require_string(declaration.values, "projectAlias")
            project = refs.get(project_alias)
            if project is None or project.kind != "project":
                raise ValueError(f"unknown project fixture alias: {project_alias}")

            columns_response = await client.list_project_columns(
                organization_id,
                project.resource_id,
            )
            raw_items: object = columns_response.get("items")
            if not isinstance(raw_items, list) or not raw_items:
                raise ValueError("project fixture has no public columns")
            items = cast(list[object], raw_items)
            columns = [
                cast(Mapping[str, Any], item)
                for item in items
                if isinstance(item, Mapping)
            ]
            column_name = _optional_string(declaration.values, "columnName")
            selected_column = next(
                (
                    column
                    for column in columns
                    if column_name is None or column.get("name") == column_name
                ),
                None,
            )
            if selected_column is None:
                raise ValueError(
                    f"project fixture has no column named {column_name!r}"
                )

            payload = _json_payload(
                declaration,
                excluded={
                    "organizationAlias",
                    "projectAlias",
                    "columnName",
                },
            )
            payload.setdefault("columnId", _top_level_id(selected_column))
            payload.setdefault("title", f"Eval {declaration.alias}")
            response = await client.create_ticket(
                organization_id,
                project.resource_id,
                payload,
            )
            refs[declaration.alias] = _ResourceRef(
                kind="ticket",
                resource_id=_top_level_id(response),
                organization_id=organization_id,
                project_id=project.resource_id,
            )
            return

        payload = _json_payload(
            declaration,
            excluded={"organizationAlias"},
        )
        response = await client.create_meeting(organization_id, payload)
        refs[declaration.alias] = _ResourceRef(
            kind="meeting",
            resource_id=_top_level_id(response),
            organization_id=organization_id,
        )

    def agent_headers(self, lease: FixtureLease) -> dict[str, str]:
        sessions = self._sessions.get(lease.owner)
        if sessions is None:
            raise ValueError(f"fixture owner is not active: {lease.owner}")

        headers = sessions.actor.session_headers()
        if sessions.recipe.agent_auth == "invalid-session":
            return {
                **headers,
                "Cookie": "eval-invalid-session=expired",
            }
        return headers

    def mcp_bearer_token(self, lease: FixtureLease) -> str:
        if lease.owner not in self._sessions:
            raise ValueError(f"fixture owner is not active: {lease.owner}")
        credential = self._mcp_credentials.get(lease.owner)
        if credential is None:
            raise ValueError(
                f"persona {lease.persona_alias!r} has no MCP credential"
            )
        return credential.secret

    async def observe(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> list[ObservedOutcome]:
        sessions = self._sessions.get(lease.owner)
        refs = self._resources.get(lease.owner)
        if sessions is None or refs is None:
            raise ValueError(f"fixture owner is not active: {lease.owner}")

        outcomes: list[ObservedOutcome] = []
        for source in dict.fromkeys(
            assertion.source for assertion in case.outcome_assertions
        ):
            kind, separator, alias = source.partition(":")
            if not separator or kind not in _SUPPORTED_KINDS:
                raise ValueError(
                    "public outcome source must use a supported kind:alias reference"
                )
            ref = refs.get(alias)
            if ref is None or ref.kind != kind:
                raise ValueError(f"unknown public outcome fixture source: {source}")

            payload = await self._observe_ref(sessions.bootstrap, ref)
            outcomes.append(ObservedOutcome(source=source, payload=payload))
        return outcomes

    async def _observe_ref(
        self,
        client: ProductFixtureSession,
        ref: _ResourceRef,
    ) -> dict[str, Any]:
        if ref.kind == "organization":
            return await client.get_organization(ref.resource_id)

        if ref.organization_id is None:
            raise ValueError(f"{ref.kind} fixture is missing organization id")

        if ref.kind == "project":
            return await client.get_project(ref.organization_id, ref.resource_id)
        if ref.kind == "wiki_document":
            return await client.get_wiki_document(
                ref.organization_id,
                ref.resource_id,
            )
        if ref.kind == "ticket":
            if ref.project_id is None:
                raise ValueError("ticket fixture is missing project id")
            return await client.get_ticket(
                ref.organization_id,
                ref.project_id,
                ref.resource_id,
            )
        if ref.kind == "meeting":
            return await client.get_meeting(ref.organization_id, ref.resource_id)
        raise ValueError(f"unsupported fixture kind: {ref.kind}")

    async def cleanup(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> None:
        # Resource rows are intentionally not removed through private DB shortcuts.
        # Dedicated eval-environment teardown owns destructive Postgres/Redis cleanup.
        del case
        self._resources.pop(lease.owner, None)
        sessions = self._sessions.pop(lease.owner, None)
        credential = self._mcp_credentials.pop(lease.owner, None)
        delegated = lease.owner in self._delegated_owners
        self._delegated_owners.discard(lease.owner)
        if sessions is None:
            return
        try:
            if credential is not None and not credential.revoked:
                await sessions.actor.revoke_mcp_access_key(credential.key_id)
            if delegated:
                await sessions.actor.revoke_agent_delegation()
        finally:
            await self._close_sessions(sessions)

    async def _close_sessions(self, sessions: _CaseSessions) -> None:
        seen: set[int] = set()
        for client in (sessions.actor, sessions.bootstrap):
            identity = id(client)
            if identity in seen:
                continue
            seen.add(identity)
            await client.close()
