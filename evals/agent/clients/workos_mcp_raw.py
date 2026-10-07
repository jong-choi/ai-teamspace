from __future__ import annotations

from collections.abc import Mapping

import httpx

from clients.workos_mcp import MODERN_PROTOCOL_VERSION

_CLIENT_NAME = "work-os-agent-evals"
_CLIENT_VERSION = "0.1.0"


class WorkOsMcpRawClient:
    """MCP 상태/헤더 assertion에만 사용하는 최소 raw HTTP helper."""

    def __init__(
        self,
        resource_url: str,
        bearer_token: str,
        *,
        timeout_seconds: float = 30,
    ) -> None:
        self._client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {bearer_token}"},
            timeout=timeout_seconds,
            follow_redirects=False,
        )
        self._resource_url = resource_url

    async def initialize_status(self) -> tuple[int, Mapping[str, str]]:
        response = await self._client.post(
            self._resource_url,
            headers={
                "Accept": "application/json, text/event-stream",
                "Content-Type": "application/json",
            },
            json={
                "jsonrpc": "2.0",
                "id": "eval-auth-probe",
                "method": "initialize",
                "params": {
                    "protocolVersion": MODERN_PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {
                        "name": _CLIENT_NAME,
                        "version": _CLIENT_VERSION,
                    },
                },
            },
        )
        return response.status_code, dict(response.headers)

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> WorkOsMcpRawClient:
        return self

    async def __aexit__(
        self,
        exc_type: object,
        exc_value: object,
        traceback: object,
    ) -> None:
        await self.close()
