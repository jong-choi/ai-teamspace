from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import cast
from urllib.parse import urlsplit

import pytest

from clients.product_api import ProductApiClient, ProductApiError


@dataclass(frozen=True)
class SeenRequest:
    method: str
    path: str
    origin: str | None
    cookie: str | None
    idempotency_key: str | None
    body: dict[str, object] | None


@pytest.fixture
def fake_product_api() -> Iterator[tuple[str, list[SeenRequest]]]:
    seen: list[SeenRequest] = []

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: object) -> None:
            return None

        def _body(self) -> dict[str, object] | None:
            length = int(self.headers.get("content-length", "0"))
            if length == 0:
                return None
            payload: object = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                return None
            return cast(dict[str, object], payload)

        def _record(self, body: dict[str, object] | None) -> str:
            path = urlsplit(self.path).path
            seen.append(
                SeenRequest(
                    method=self.command,
                    path=path,
                    origin=self.headers.get("origin"),
                    cookie=self.headers.get("cookie"),
                    idempotency_key=self.headers.get("idempotency-key"),
                    body=body,
                )
            )
            return path

        def _json(
            self,
            status: int,
            payload: object,
            *,
            set_cookie: str | None = None,
        ) -> None:
            encoded = json.dumps(payload, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            if set_cookie:
                self.send_header("set-cookie", set_cookie)
            self.end_headers()
            self.wfile.write(encoded)

        def do_POST(self) -> None:
            body = self._body()
            path = self._record(body)

            if path == "/api/auth/sign-up/email":
                self._json(
                    200,
                    {"user": {"id": "user-1", "username": body and body.get("username")}},
                    set_cookie="session=fixture-session; Path=/; HttpOnly",
                )
                return

            if path == "/organizations":
                self._json(
                    201,
                    {
                        "organization": {
                            "id": "org-1",
                            "slug": body and body.get("slug"),
                        },
                        "role": "owner",
                    },
                )
                return

            if path == "/organizations/org-1/invitations":
                self._json(
                    201,
                    {
                        "id": "inv-1",
                        "role": body and body.get("role"),
                        "status": "pending",
                    },
                )
                return

            if path == "/invitations/inv-1/accept":
                self._json(
                    200,
                    {"id": "inv-1", "status": "accepted"},
                )
                return

            if path == "/mcp/access-keys":
                self._json(
                    201,
                    {
                        "key": {
                            "id": "key-1",
                            "name": body and body.get("name"),
                            "scopes": body and body.get("scopes"),
                        },
                        "secret": "wos_mcp_fixture-secret",
                    },
                )
                return

            if path == "/organizations/org-1/projects":
                self._json(
                    201,
                    {
                        "id": "project-1",
                        "key": body and body.get("key"),
                        "name": body and body.get("name"),
                    },
                )
                return

            if path == "/organizations/org-1/wiki/documents":
                self._json(
                    201,
                    {
                        "id": "document-1",
                        "title": body and body.get("title"),
                    },
                )
                return

            self._json(404, {"detail": "not found"})

        def do_PUT(self) -> None:
            body = self._body()
            path = self._record(body)
            if path == "/organizations/active":
                self._json(
                    200,
                    {
                        "organizationId": body and body.get("organizationId"),
                    },
                )
                return
            self._json(404, {"detail": "not found"})

        def do_PATCH(self) -> None:
            body = self._body()
            path = self._record(body)
            if path == "/organizations/org-1/mcp-access/organization-policy":
                allowed_scopes = body and body.get("allowedScopes")
                self._json(
                    200,
                    {
                        "organizationId": "org-1",
                        "organizationPolicy": {
                            "allowedScopes": allowed_scopes,
                            "revision": 1,
                        },
                        "myPolicy": {
                            "requestedScopes": ["wiki:read"],
                            "revision": 0,
                        },
                        "effectiveScopes": ["wiki:read"],
                        "canManageOrganizationPolicy": True,
                        "capabilities": [],
                    },
                )
                return
            if path == "/organizations/org-1/mcp-access/me":
                requested_scopes = body and body.get("requestedScopes")
                self._json(
                    200,
                    {
                        "organizationId": "org-1",
                        "organizationPolicy": {
                            "allowedScopes": ["wiki:read", "wiki:write"],
                            "revision": 1,
                        },
                        "myPolicy": {
                            "requestedScopes": requested_scopes,
                            "revision": 1,
                        },
                        "effectiveScopes": requested_scopes,
                        "canManageOrganizationPolicy": True,
                        "capabilities": [],
                    },
                )
                return
            self._json(404, {"detail": "not found"})

        def do_DELETE(self) -> None:
            path = self._record(None)
            if path == "/mcp/access-keys/key-1":
                self.send_response(204)
                self.send_header("content-length", "0")
                self.end_headers()
                return
            self._json(404, {"detail": "not found"})

        def do_GET(self) -> None:
            path = self._record(None)
            if path == "/organizations/org-1":
                self._json(
                    200,
                    {"organization": {"id": "org-1", "slug": "eval-org"}, "role": "owner"},
                )
                return
            if path == "/organizations/org-1/mcp-access":
                self._json(
                    200,
                    {
                        "organizationId": "org-1",
                        "organizationPolicy": {
                            "allowedScopes": ["wiki:read"],
                            "revision": 0,
                        },
                        "myPolicy": {
                            "requestedScopes": ["wiki:read"],
                            "revision": 0,
                        },
                        "effectiveScopes": ["wiki:read"],
                        "canManageOrganizationPolicy": True,
                        "capabilities": [],
                    },
                )
                return
            if path == "/organizations/org-1/projects/project-1":
                self._json(200, {"id": "project-1", "name": "Eval Project"})
                return
            if path == "/organizations/org-1/wiki/documents/document-1":
                self._json(200, {"id": "document-1", "title": "Eval Doc"})
                return
            if path == "/organizations/forbidden":
                self._json(403, {"secret": "do-not-leak"})
                return
            self._json(404, {"detail": "not found"})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = cast(tuple[str, int], server.server_address)
    try:
        yield f"http://{host}:{port}", seen
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


async def test_better_auth_cookie_jar_and_public_product_routes(
    fake_product_api: tuple[str, list[SeenRequest]],
) -> None:
    base_url, seen = fake_product_api
    origin = "http://eval.example.test"

    async with ProductApiClient(base_url, trusted_origin=origin) as client:
        signed_up = await client.sign_up_email(
            email="case@example.test",
            name="Case User",
            password="".join(("Strong", "Password123!")),
            username="caseuser",
        )
        organization = await client.create_organization(
            name="Eval Org",
            slug="eval-org",
        )
        active = await client.set_active_organization("org-1")
        invitation = await client.invite_organization_member(
            "org-1",
            recipient_username="memberuser",
            role="member",
        )
        accepted = await client.accept_organization_invitation("inv-1")
        access = await client.get_mcp_access("org-1")
        updated_org_policy = await client.update_organization_mcp_policy(
            "org-1",
            allowed_scopes=["wiki:read", "wiki:write"],
            expected_revision=0,
        )
        updated_user_policy = await client.update_my_mcp_policy(
            "org-1",
            requested_scopes=["wiki:read", "wiki:write"],
            expected_revision=0,
        )
        access_key = await client.create_mcp_access_key(
            name="eval-key",
            scopes=["wiki:read", "wiki:write"],
            organization_ids=["org-1"],
            idempotency_key="eval-key-1",
        )
        await client.revoke_mcp_access_key("key-1")
        session_headers = client.session_headers()
        project = await client.create_project(
            "org-1",
            {"key": "EV", "name": "Eval Project", "description": "fixture"},
        )
        document = await client.create_wiki_document(
            "org-1",
            {"title": "Eval Doc", "contentMarkdown": "fixture"},
        )
        fetched_org = await client.get_organization("org-1")
        fetched_project = await client.get_project("org-1", "project-1")
        fetched_document = await client.get_wiki_document("org-1", "document-1")

    assert signed_up["user"]["id"] == "user-1"
    assert organization["organization"]["id"] == "org-1"
    assert active["organizationId"] == "org-1"
    assert invitation == {"id": "inv-1", "role": "member", "status": "pending"}
    assert accepted == {"id": "inv-1", "status": "accepted"}
    assert access["myPolicy"]["revision"] == 0
    assert updated_org_policy["organizationPolicy"]["allowedScopes"] == [
        "wiki:read",
        "wiki:write",
    ]
    assert updated_user_policy["myPolicy"]["requestedScopes"] == [
        "wiki:read",
        "wiki:write",
    ]
    assert access_key["key"]["id"] == "key-1"
    assert access_key["secret"] == "".join(("wos_mcp_fixture", "-secret"))
    assert session_headers == {
        "Cookie": "session=fixture-session",
        "Origin": origin,
    }
    assert project["id"] == "project-1"
    assert document["id"] == "document-1"
    assert fetched_org["organization"]["slug"] == "eval-org"
    assert fetched_project["id"] == "project-1"
    assert fetched_document["id"] == "document-1"

    assert seen[0].path == "/api/auth/sign-up/email"
    assert all(request.origin == origin for request in seen)
    assert seen[0].cookie is None
    assert all(
        request.cookie == "session=fixture-session"
        for request in seen[1:]
    )

    invite_request = next(
        request
        for request in seen
        if request.method == "POST"
        and request.path == "/organizations/org-1/invitations"
    )
    assert invite_request.body == {
        "recipientUsername": "memberuser",
        "role": "member",
    }
    accept_request = next(
        request
        for request in seen
        if request.method == "POST"
        and request.path == "/invitations/inv-1/accept"
    )
    assert accept_request.body is None

    organization_policy_request = next(
        request
        for request in seen
        if request.method == "PATCH"
        and request.path
        == "/organizations/org-1/mcp-access/organization-policy"
    )
    assert organization_policy_request.body == {
        "allowedScopes": ["wiki:read", "wiki:write"],
        "expectedRevision": 0,
    }

    user_policy_request = next(
        request
        for request in seen
        if request.method == "PATCH"
        and request.path == "/organizations/org-1/mcp-access/me"
    )
    assert user_policy_request.body == {
        "requestedScopes": ["wiki:read", "wiki:write"],
        "expectedRevision": 0,
    }

    access_key_request = next(
        request
        for request in seen
        if request.method == "POST"
        and request.path == "/mcp/access-keys"
    )
    assert access_key_request.idempotency_key == "eval-key-1"
    assert access_key_request.body == {
        "name": "eval-key",
        "scopes": ["wiki:read", "wiki:write"],
        "organizationGrant": {
            "mode": "selected",
            "organizationIds": ["org-1"],
        },
        "expiresInDays": 1,
    }
    assert any(
        request.method == "DELETE"
        and request.path == "/mcp/access-keys/key-1"
        for request in seen
    )


async def test_product_api_errors_do_not_include_response_body(
    fake_product_api: tuple[str, list[SeenRequest]],
) -> None:
    base_url, _ = fake_product_api
    client = ProductApiClient(base_url, trusted_origin="http://eval.example.test")
    try:
        with pytest.raises(ProductApiError) as captured:
            await client.get_organization("forbidden")
    finally:
        await client.close()

    assert captured.value.status_code == 403
    assert "do-not-leak" not in str(captured.value)


def test_trusted_origin_rejects_paths_and_credentials() -> None:
    with pytest.raises(ValueError):
        ProductApiClient(
            "http://127.0.0.1:1",
            trusted_origin="http://user:pass@example.test/path",
        )
