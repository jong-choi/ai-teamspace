from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

OrganizationRole = Literal["admin", "member"]
MembershipMode = Literal["target", "other", "none"]
AgentAuthMode = Literal["session", "invalid-session"]
McpAuthMode = Literal["active-key", "revoked-key", "none"]
AgentDelegationMode = Literal["delegated", "none"]

READ_SCOPES = (
    "organizations:read",
    "chat:read",
    "wiki:read",
    "projects:read",
    "calendar:read",
)
ALL_SCOPES = (
    "organizations:read",
    "organizations:write",
    "chat:read",
    "chat:write",
    "wiki:read",
    "wiki:write",
    "projects:read",
    "projects:write",
    "calendar:read",
    "calendar:write",
)


@dataclass(frozen=True)
class PersonaRecipe:
    alias: str
    membership: MembershipMode
    organization_role: OrganizationRole | None
    requested_scopes: tuple[str, ...]
    agent_auth: AgentAuthMode = "session"
    mcp_auth: McpAuthMode = "active-key"
    # Work OS Agent는 사용자의 OAuth 위임으로 Work OS MCP를 호출한다.
    agent_delegation: AgentDelegationMode = "delegated"

    @property
    def requires_target_organization(self) -> bool:
        return self.membership == "target"


_PERSONAS = {
    "read-only-member": PersonaRecipe(
        alias="read-only-member",
        membership="target",
        organization_role="member",
        requested_scopes=READ_SCOPES,
    ),
    "read-write-member": PersonaRecipe(
        alias="read-write-member",
        membership="target",
        organization_role="member",
        requested_scopes=ALL_SCOPES,
    ),
    "organization-admin": PersonaRecipe(
        alias="organization-admin",
        membership="target",
        organization_role="admin",
        requested_scopes=ALL_SCOPES,
    ),
    "other-organization-user": PersonaRecipe(
        alias="other-organization-user",
        membership="other",
        organization_role="member",
        requested_scopes=ALL_SCOPES,
    ),
    "no-active-organization": PersonaRecipe(
        alias="no-active-organization",
        membership="none",
        organization_role=None,
        requested_scopes=(),
        mcp_auth="none",
        agent_delegation="none",
    ),
    "expired-invalid-credential": PersonaRecipe(
        alias="expired-invalid-credential",
        membership="target",
        organization_role="member",
        requested_scopes=READ_SCOPES,
        agent_auth="invalid-session",
        mcp_auth="revoked-key",
        agent_delegation="none",
    ),
    "restricted-mcp-policy": PersonaRecipe(
        alias="restricted-mcp-policy",
        membership="target",
        organization_role="member",
        requested_scopes=("wiki:read",),
    ),
}

_COMPATIBILITY_ALIASES = {
    "operator": "read-write-member",
    "member": "read-only-member",
}


def persona_recipe(alias: str) -> PersonaRecipe:
    canonical = _COMPATIBILITY_ALIASES.get(alias, alias)
    try:
        return _PERSONAS[canonical]
    except KeyError as error:
        supported = ", ".join(sorted(_PERSONAS))
        raise ValueError(
            f"unknown persona alias {alias!r}; supported personas: {supported}"
        ) from error


def canonical_persona_alias(alias: str) -> str:
    return persona_recipe(alias).alias


def persona_aliases() -> tuple[str, ...]:
    return tuple(sorted(_PERSONAS))
