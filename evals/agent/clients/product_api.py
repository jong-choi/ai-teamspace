from __future__ import annotations

from collections.abc import Mapping
from typing import Any, cast
from urllib.parse import quote, urlsplit

import httpx


class ProductApiError(RuntimeError):
    def __init__(self, method: str, path: str, status_code: int) -> None:
        super().__init__(f"{method.upper()} {path} returned HTTP {status_code}")
        self.method = method.upper()
        self.path = path
        self.status_code = status_code


def _segment(value: str) -> str:
    return quote(value, safe="")


def _validate_origin(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("trusted origin must be an absolute http(s) URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("trusted origin must not contain credentials/query/fragment")
    if parsed.path not in {"", "/"}:
        raise ValueError("trusted origin must not contain a path")
    return value.rstrip("/")


class ProductApiClient:
    """Cookie-jar client for normal Better Auth + public product HTTP APIs."""

    def __init__(
        self,
        server_url: str,
        *,
        trusted_origin: str,
        timeout_seconds: float = 30,
    ) -> None:
        self._trusted_origin = _validate_origin(trusted_origin)
        self._client = httpx.AsyncClient(
            base_url=server_url,
            headers={"Origin": self._trusted_origin},
            timeout=timeout_seconds,
            follow_redirects=False,
        )

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        json_body: Mapping[str, object] | None = None,
        headers: Mapping[str, str] | None = None,
        expected_status: int,
    ) -> dict[str, Any]:
        response = await self._client.request(
            method,
            path,
            json=json_body,
            headers=headers,
        )
        if response.status_code != expected_status:
            raise ProductApiError(method, path, response.status_code)
        payload: object = response.json()
        if not isinstance(payload, dict):
            raise ProductApiError(method, path, response.status_code)
        return cast(dict[str, Any], payload)

    async def _request_empty(
        self,
        method: str,
        path: str,
        *,
        expected_status: int,
    ) -> None:
        response = await self._client.request(method, path)
        if response.status_code != expected_status:
            raise ProductApiError(method, path, response.status_code)

    async def sign_up_email(
        self,
        *,
        email: str,
        name: str,
        password: str,
        username: str,
    ) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            "/api/auth/sign-up/email",
            json_body={
                "email": email,
                "name": name,
                "password": password,
                "username": username,
            },
            expected_status=200,
        )

    async def create_organization(
        self,
        *,
        name: str,
        slug: str,
        logo: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, object] = {"name": name, "slug": slug}
        if logo is not None:
            body["logo"] = logo
        return await self._request_json(
            "POST",
            "/organizations",
            json_body=body,
            expected_status=201,
        )

    async def set_active_organization(
        self,
        organization_id: str,
    ) -> dict[str, Any]:
        return await self._request_json(
            "PUT",
            "/organizations/active",
            json_body={"organizationId": organization_id},
            expected_status=200,
        )

    async def get_organization(self, organization_id: str) -> dict[str, Any]:
        return await self._request_json(
            "GET",
            f"/organizations/{_segment(organization_id)}",
            expected_status=200,
        )

    async def invite_organization_member(
        self,
        organization_id: str,
        *,
        recipient_username: str,
        role: str,
    ) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"/organizations/{_segment(organization_id)}/invitations",
            json_body={
                "recipientUsername": recipient_username,
                "role": role,
            },
            expected_status=201,
        )

    async def accept_organization_invitation(
        self,
        invitation_id: str,
    ) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"/invitations/{_segment(invitation_id)}/accept",
            expected_status=200,
        )

    async def get_mcp_access(
        self,
        organization_id: str,
    ) -> dict[str, Any]:
        return await self._request_json(
            "GET",
            f"/organizations/{_segment(organization_id)}/mcp-access",
            expected_status=200,
        )

    async def update_my_mcp_policy(
        self,
        organization_id: str,
        *,
        requested_scopes: list[str],
        expected_revision: int,
    ) -> dict[str, Any]:
        return await self._request_json(
            "PATCH",
            f"/organizations/{_segment(organization_id)}/mcp-access/me",
            json_body={
                "requestedScopes": requested_scopes,
                "expectedRevision": expected_revision,
            },
            expected_status=200,
        )

    async def update_organization_mcp_policy(
        self,
        organization_id: str,
        *,
        allowed_scopes: list[str],
        expected_revision: int,
    ) -> dict[str, Any]:
        return await self._request_json(
            "PATCH",
            (
                f"/organizations/{_segment(organization_id)}"
                "/mcp-access/organization-policy"
            ),
            json_body={
                "allowedScopes": allowed_scopes,
                "expectedRevision": expected_revision,
            },
            expected_status=200,
        )

    async def create_mcp_access_key(
        self,
        *,
        name: str,
        scopes: list[str],
        organization_ids: list[str],
        idempotency_key: str,
        expires_in_days: int = 1,
    ) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            "/mcp/access-keys",
            json_body={
                "name": name,
                "scopes": scopes,
                "organizationGrant": {
                    "mode": "selected",
                    "organizationIds": organization_ids,
                },
                "expiresInDays": expires_in_days,
            },
            headers={"Idempotency-Key": idempotency_key},
            expected_status=201,
        )

    async def revoke_mcp_access_key(self, key_id: str) -> None:
        await self._request_empty(
            "DELETE",
            f"/mcp/access-keys/{_segment(key_id)}",
            expected_status=204,
        )

    async def create_project(
        self,
        organization_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"/organizations/{_segment(organization_id)}/projects",
            json_body=payload,
            expected_status=201,
        )

    async def get_project(
        self,
        organization_id: str,
        project_id: str,
    ) -> dict[str, Any]:
        return await self._request_json(
            "GET",
            (
                f"/organizations/{_segment(organization_id)}"
                f"/projects/{_segment(project_id)}"
            ),
            expected_status=200,
        )

    async def list_project_columns(
        self,
        organization_id: str,
        project_id: str,
    ) -> dict[str, Any]:
        return await self._request_json(
            "GET",
            (
                f"/organizations/{_segment(organization_id)}"
                f"/projects/{_segment(project_id)}/columns"
            ),
            expected_status=200,
        )

    async def create_wiki_document(
        self,
        organization_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"/organizations/{_segment(organization_id)}/wiki/documents",
            json_body=payload,
            expected_status=201,
        )

    async def get_wiki_document(
        self,
        organization_id: str,
        document_id: str,
    ) -> dict[str, Any]:
        return await self._request_json(
            "GET",
            (
                f"/organizations/{_segment(organization_id)}"
                f"/wiki/documents/{_segment(document_id)}"
            ),
            expected_status=200,
        )

    async def delete_wiki_document(
        self,
        organization_id: str,
        document_id: str,
    ) -> None:
        await self._request_empty(
            "DELETE",
            (
                f"/organizations/{_segment(organization_id)}"
                f"/wiki/documents/{_segment(document_id)}"
            ),
            expected_status=204,
        )

    async def create_ticket(
        self,
        organization_id: str,
        project_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            (
                f"/organizations/{_segment(organization_id)}"
                f"/projects/{_segment(project_id)}/tickets"
            ),
            json_body=payload,
            expected_status=201,
        )

    async def get_ticket(
        self,
        organization_id: str,
        project_id: str,
        ticket_id: str,
    ) -> dict[str, Any]:
        return await self._request_json(
            "GET",
            (
                f"/organizations/{_segment(organization_id)}"
                f"/projects/{_segment(project_id)}/tickets/{_segment(ticket_id)}"
            ),
            expected_status=200,
        )

    async def create_meeting(
        self,
        organization_id: str,
        payload: Mapping[str, object],
    ) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"/organizations/{_segment(organization_id)}/calendar/meetings",
            json_body=payload,
            expected_status=201,
        )

    async def get_meeting(
        self,
        organization_id: str,
        meeting_id: str,
    ) -> dict[str, Any]:
        return await self._request_json(
            "GET",
            (
                f"/organizations/{_segment(organization_id)}"
                f"/calendar/meetings/{_segment(meeting_id)}"
            ),
            expected_status=200,
        )

    def session_headers(self) -> dict[str, str]:
        request = httpx.Request("GET", self._client.base_url)
        self._client.cookies.set_cookie_header(request)
        cookie = request.headers.get("cookie")
        if not cookie:
            raise RuntimeError("Better Auth session cookie is unavailable")
        return {
            "Cookie": cookie,
            "Origin": self._trusted_origin,
        }

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> ProductApiClient:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: object | None,
    ) -> None:
        await self.close()
