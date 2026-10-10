from __future__ import annotations

from collections.abc import Iterator, Mapping
from typing import Any

import pytest

from datasets.schema import EvalCase
from fixtures.public_api import BetterAuthPublicFixtureProvider
from personas.registry import ALL_SCOPES, READ_SCOPES, persona_aliases, persona_recipe

_ORIGIN = "http://eval.example.test"


class FakeBackend:
    def __init__(self) -> None:
        self.next_org = 1
        self.organization_allowed: dict[str, list[str]] = {}
        self.organization_revision: dict[str, int] = {}
        self.user_requested: dict[tuple[str, str], list[str]] = {}
        self.user_revision: dict[tuple[str, str], int] = {}
        self.invitations: dict[str, dict[str, str]] = {}
        self.projects: dict[str, dict[str, Any]] = {}
        self.documents: dict[str, dict[str, Any]] = {}
        self.tickets: dict[str, dict[str, Any]] = {}
        self.meetings: dict[str, dict[str, Any]] = {}
        self.access_keys: dict[str, dict[str, object]] = {}


class FakeProductSession:
    def __init__(self, backend: FakeBackend, label: str) -> None:
        self.backend = backend
        self.label = label
        self.user_id = f"user-{label}"
        self.username: str | None = None
        self.active_organization_id: str | None = None
        self.closed = False
        self.calls: list[tuple[str, object]] = []

    async def sign_up_email(
        self,
        *,
        email: str,
        name: str,
        password: str,
        username: str,
    ) -> dict[str, Any]:
        self.username = username
        self.calls.append(
            ("sign_up", {"email": email, "name": name, "username": username})
        )
        assert password
        return {"user": {"id": self.user_id, "username": username}}

    async def create_organization(
        self,
        *,
        name: str,
        slug: str,
        logo: str | None = None,
    ) -> dict[str, Any]:
        organization_id = f"org-{self.backend.next_org}"
        self.backend.next_org += 1
        self.backend.organization_allowed[organization_id] = list(READ_SCOPES)
        self.backend.organization_revision[organization_id] = 0
        self.backend.user_requested[(organization_id, self.user_id)] = list(READ_SCOPES)
        self.backend.user_revision[(organization_id, self.user_id)] = 0
        self.calls.append(
            (
                "create_organization",
                {
                    "id": organization_id,
                    "name": name,
                    "slug": slug,
                    "logo": logo,
                },
            )
        )
        return {
            "organization": {"id": organization_id, "slug": slug},
            "role": "owner",
        }

    async def set_active_organization(
        self,
        organization_id: str,
    ) -> dict[str, Any]:
        self.active_organization_id = organization_id
        self.calls.append(("set_active_organization", organization_id))
        return {"organizationId": organization_id}

    async def get_organization(self, organization_id: str) -> dict[str, Any]:
        self.calls.append(("get_organization", organization_id))
        return {
            "organization": {"id": organization_id, "slug": "fixture-org"},
            "role": "owner" if self.label == "bootstrap" else "member",
        }

    async def invite_organization_member(
        self,
        organization_id: str,
        *,
        recipient_username: str,
        role: str,
    ) -> dict[str, Any]:
        invitation_id = f"inv-{len(self.backend.invitations) + 1}"
        self.backend.invitations[invitation_id] = {
            "organizationId": organization_id,
            "recipientUsername": recipient_username,
            "role": role,
        }
        self.calls.append(("invite", self.backend.invitations[invitation_id]))
        return {"id": invitation_id, "role": role, "status": "pending"}

    async def accept_organization_invitation(
        self,
        invitation_id: str,
    ) -> dict[str, Any]:
        invitation = self.backend.invitations[invitation_id]
        organization_id = invitation["organizationId"]
        self.active_organization_id = organization_id
        self.backend.user_requested[(organization_id, self.user_id)] = list(READ_SCOPES)
        self.backend.user_revision[(organization_id, self.user_id)] = 0
        self.calls.append(("accept_invitation", invitation_id))
        return {"id": invitation_id, "status": "accepted"}

    async def get_mcp_access(
        self,
        organization_id: str,
    ) -> dict[str, Any]:
        key = (organization_id, self.user_id)
        requested = self.backend.user_requested.setdefault(key, list(READ_SCOPES))
        revision = self.backend.user_revision.setdefault(key, 0)
        return {
            "organizationId": organization_id,
            "organizationPolicy": {
                "allowedScopes": list(
                    self.backend.organization_allowed[organization_id]
                ),
                "revision": self.backend.organization_revision[organization_id],
            },
            "myPolicy": {
                "requestedScopes": list(requested),
                "revision": revision,
            },
            "effectiveScopes": [
                scope
                for scope in requested
                if scope in self.backend.organization_allowed[organization_id]
            ],
        }

    async def update_my_mcp_policy(
        self,
        organization_id: str,
        *,
        requested_scopes: list[str],
        expected_revision: int,
    ) -> dict[str, Any]:
        key = (organization_id, self.user_id)
        assert self.backend.user_revision[key] == expected_revision
        self.backend.user_requested[key] = list(requested_scopes)
        self.backend.user_revision[key] += 1
        self.calls.append(("update_my_mcp_policy", list(requested_scopes)))
        return await self.get_mcp_access(organization_id)

    async def update_organization_mcp_policy(
        self,
        organization_id: str,
        *,
        allowed_scopes: list[str],
        expected_revision: int,
    ) -> dict[str, Any]:
        assert self.backend.organization_revision[organization_id] == expected_revision
        self.backend.organization_allowed[organization_id] = list(allowed_scopes)
        self.backend.organization_revision[organization_id] += 1
        self.calls.append(("update_org_mcp_policy", list(allowed_scopes)))
        return await self.get_mcp_access(organization_id)

    async def create_mcp_access_key(
        self,
        *,
        name: str,
        scopes: list[str],
        organization_ids: list[str],
        idempotency_key: str,
        expires_in_days: int = 1,
    ) -> dict[str, Any]:
        key_id = f"key-{len(self.backend.access_keys) + 1}"
        secret = f"wos_mcp_{self.label}_{key_id}"
        self.backend.access_keys[key_id] = {
            "name": name,
            "scopes": list(scopes),
            "organizationIds": list(organization_ids),
            "idempotencyKey": idempotency_key,
            "expiresInDays": expires_in_days,
            "revoked": False,
            "secret": secret,
        }
        self.calls.append(("create_mcp_access_key", key_id))
        return {
            "key": {
                "id": key_id,
                "name": name,
                "scopes": list(scopes),
            },
            "secret": secret,
        }

    async def revoke_mcp_access_key(self, key_id: str) -> None:
        self.backend.access_keys[key_id]["revoked"] = True
        self.calls.append(("revoke_mcp_access_key", key_id))

    async def create_project(
        self,
        organization_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]:
        project = {
            "id": "project-1",
            "organizationId": organization_id,
            **dict(payload),
        }
        self.backend.projects["project-1"] = project
        self.calls.append(("create_project", dict(payload)))
        return project

    async def get_project(
        self,
        organization_id: str,
        project_id: str,
    ) -> dict[str, Any]:
        project = self.backend.projects[project_id]
        assert project["organizationId"] == organization_id
        self.calls.append(("get_project", project_id))
        return project

    async def list_project_columns(
        self,
        organization_id: str,
        project_id: str,
    ) -> dict[str, Any]:
        assert organization_id.startswith("org-")
        assert project_id == "project-1"
        return {
            "items": [
                {"id": "column-backlog", "name": "Backlog"},
                {"id": "column-todo", "name": "Todo"},
            ]
        }

    async def create_wiki_document(
        self,
        organization_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]:
        document = {
            "id": "document-1",
            "organizationId": organization_id,
            **dict(payload),
        }
        self.backend.documents["document-1"] = document
        self.calls.append(("create_wiki_document", dict(payload)))
        return document

    async def get_wiki_document(
        self,
        organization_id: str,
        document_id: str,
    ) -> dict[str, Any]:
        document = self.backend.documents[document_id]
        assert document["organizationId"] == organization_id
        self.calls.append(("get_wiki_document", document_id))
        return document

    async def create_ticket(
        self,
        organization_id: str,
        project_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]:
        ticket = {
            "id": "ticket-1",
            "organizationId": organization_id,
            "projectId": project_id,
            **dict(payload),
        }
        self.backend.tickets["ticket-1"] = ticket
        self.calls.append(("create_ticket", dict(payload)))
        return ticket

    async def get_ticket(
        self,
        organization_id: str,
        project_id: str,
        ticket_id: str,
    ) -> dict[str, Any]:
        ticket = self.backend.tickets[ticket_id]
        assert ticket["organizationId"] == organization_id
        assert ticket["projectId"] == project_id
        self.calls.append(("get_ticket", ticket_id))
        return ticket

    async def create_meeting(
        self,
        organization_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]:
        meeting = {
            "id": "meeting-1",
            "organizationId": organization_id,
            **dict(payload),
        }
        self.backend.meetings["meeting-1"] = meeting
        self.calls.append(("create_meeting", dict(payload)))
        return meeting

    async def get_meeting(
        self,
        organization_id: str,
        meeting_id: str,
    ) -> dict[str, Any]:
        meeting = self.backend.meetings[meeting_id]
        assert meeting["organizationId"] == organization_id
        self.calls.append(("get_meeting", meeting_id))
        return meeting

    def session_headers(self) -> dict[str, str]:
        return {
            "Cookie": f"session={self.label}-session",
            "Origin": _ORIGIN,
        }

    async def close(self) -> None:
        self.closed = True
        self.calls.append(("close", None))


@pytest.fixture
def sessions() -> Iterator[
    tuple[FakeBackend, FakeProductSession, FakeProductSession, Iterator[FakeProductSession]]
]:
    backend = FakeBackend()
    bootstrap = FakeProductSession(backend, "bootstrap")
    actor = FakeProductSession(backend, "actor")
    yield backend, bootstrap, actor, iter((bootstrap, actor))


def provider_from(
    session_iterator: Iterator[FakeProductSession],
) -> BetterAuthPublicFixtureProvider:
    return BetterAuthPublicFixtureProvider(lambda: next(session_iterator))


def case_for(persona: str, *, outcomes: bool = False) -> EvalCase:
    payload: dict[str, object] = {
        "id": f"case-{persona}",
        "version": "1.0.0",
        "input": ["fixture"],
        "persona": persona,
        "organization_fixture": "org",
        "preconditions": [
            {
                "kind": "wiki_document",
                "alias": "doc",
                "values": {"title": "Eval Doc"},
            }
        ],
    }
    if outcomes:
        payload["outcome_assertions"] = [
            {
                "source": "wiki_document:doc",
                "path": "title",
                "operator": "equals",
                "value": "Eval Doc",
            }
        ]
    return EvalCase.model_validate(payload)


async def test_read_write_persona_separates_bootstrap_and_actor_sessions(
    sessions: tuple[
        FakeBackend,
        FakeProductSession,
        FakeProductSession,
        Iterator[FakeProductSession],
    ],
) -> None:
    backend, bootstrap, actor, iterator = sessions
    provider = provider_from(iterator)
    case = case_for("operator", outcomes=True)

    lease = await provider.setup(case, owner="run-1:case-1")
    outcomes = await provider.observe(case, lease)

    assert lease.persona_alias == "read-write-member"
    assert lease.public_ids["user:operator"] == "user-actor"
    assert lease.public_ids["user:read-write-member"] == "user-actor"
    assert lease.public_ids["organization:org"] == "org-1"
    assert backend.invitations["inv-1"]["role"] == "member"
    assert backend.organization_allowed["org-1"] == list(ALL_SCOPES)
    assert backend.user_requested[("org-1", "user-actor")] == list(ALL_SCOPES)
    assert actor.active_organization_id == "org-1"
    assert provider.agent_headers(lease)["Cookie"] == "session=actor-session"
    assert provider.mcp_bearer_token(lease) == "wos_mcp_actor_key-1"
    assert backend.access_keys["key-1"]["organizationIds"] == ["org-1"]
    assert backend.access_keys["key-1"]["scopes"] == list(ALL_SCOPES)
    assert outcomes[0].payload["id"] == "document-1"
    assert ("get_wiki_document", "document-1") in bootstrap.calls
    assert ("get_wiki_document", "document-1") not in actor.calls

    await provider.cleanup(case, lease)
    assert backend.access_keys["key-1"]["revoked"] is True
    assert bootstrap.closed and actor.closed


@pytest.mark.parametrize(
    ("persona", "role", "scopes"),
    [
        ("read-only-member", "member", READ_SCOPES),
        ("organization-admin", "admin", ALL_SCOPES),
        ("restricted-mcp-policy", "member", ("wiki:read",)),
    ],
)
async def test_target_personas_use_public_invitation_and_exact_scopes(
    persona: str,
    role: str,
    scopes: tuple[str, ...],
    sessions: tuple[
        FakeBackend,
        FakeProductSession,
        FakeProductSession,
        Iterator[FakeProductSession],
    ],
) -> None:
    backend, _, actor, iterator = sessions
    provider = provider_from(iterator)
    case = case_for(persona)

    lease = await provider.setup(case, owner=f"run:{persona}")

    assert backend.invitations["inv-1"]["role"] == role
    assert backend.user_requested[("org-1", "user-actor")] == list(scopes)
    assert actor.active_organization_id == "org-1"

    await provider.cleanup(case, lease)


async def test_other_organization_user_never_joins_target(
    sessions: tuple[
        FakeBackend,
        FakeProductSession,
        FakeProductSession,
        Iterator[FakeProductSession],
    ],
) -> None:
    backend, _, actor, iterator = sessions
    provider = provider_from(iterator)
    case = case_for("other-organization-user")

    lease = await provider.setup(case, owner="run:other")

    assert backend.invitations == {}
    assert lease.public_ids["organization:org"] == "org-1"
    assert actor.active_organization_id == "org-2"
    assert backend.user_requested[("org-2", "user-actor")] == list(ALL_SCOPES)
    assert ("org-1", "user-actor") not in backend.user_requested

    await provider.cleanup(case, lease)


async def test_no_active_organization_keeps_actor_unscoped(
    sessions: tuple[
        FakeBackend,
        FakeProductSession,
        FakeProductSession,
        Iterator[FakeProductSession],
    ],
) -> None:
    backend, _, actor, iterator = sessions
    provider = provider_from(iterator)
    case = case_for("no-active-organization")

    lease = await provider.setup(case, owner="run:no-active")

    assert backend.invitations == {}
    assert actor.active_organization_id is None
    assert ("org-1", "user-actor") not in backend.user_requested
    with pytest.raises(ValueError, match="has no MCP credential"):
        provider.mcp_bearer_token(lease)

    await provider.cleanup(case, lease)


async def test_invalid_credential_persona_never_exposes_valid_actor_cookie(
    sessions: tuple[
        FakeBackend,
        FakeProductSession,
        FakeProductSession,
        Iterator[FakeProductSession],
    ],
) -> None:
    backend, _, _, iterator = sessions
    provider = provider_from(iterator)
    case = case_for("expired-invalid-credential")

    lease = await provider.setup(case, owner="run:invalid")
    headers = provider.agent_headers(lease)

    assert headers["Cookie"] == "eval-invalid-session=expired"
    assert "actor-session" not in headers["Cookie"]
    assert provider.mcp_bearer_token(lease) == "wos_mcp_actor_key-1"
    assert backend.access_keys["key-1"]["revoked"] is True

    await provider.cleanup(case, lease)


def test_persona_registry_is_bounded_and_compatibility_aliases_are_canonical() -> None:
    assert persona_aliases() == (
        "expired-invalid-credential",
        "no-active-organization",
        "organization-admin",
        "other-organization-user",
        "read-only-member",
        "read-write-member",
        "restricted-mcp-policy",
        "seeded-owner",
    )
    assert persona_recipe("operator").alias == "read-write-member"
    assert persona_recipe("member").alias == "read-only-member"
    with pytest.raises(ValueError, match="unknown persona alias"):
        persona_recipe("arbitrary-owner-role")


async def test_unsupported_fixture_kind_fails_closed_and_closes_both_sessions(
    sessions: tuple[
        FakeBackend,
        FakeProductSession,
        FakeProductSession,
        Iterator[FakeProductSession],
    ],
) -> None:
    _, bootstrap, actor, iterator = sessions
    provider = provider_from(iterator)
    case = EvalCase.model_validate(
        {
            "id": "unsupported-fixture",
            "version": "1.0.0",
            "input": ["fixture"],
            "persona": "read-only-member",
            "preconditions": [
                {
                    "kind": "raw_sql",
                    "alias": "dangerous",
                    "values": {},
                }
            ],
        }
    )

    with pytest.raises(ValueError, match="unsupported fixture kind"):
        await provider.setup(case, owner="run:unsupported")

    assert bootstrap.closed and actor.closed
