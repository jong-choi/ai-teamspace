from __future__ import annotations

from collections.abc import Mapping

import httpx


class AgentProtocolRawClient:
    """Narrow HTTP boundary for assertions hidden by langgraph-sdk abstractions."""

    def __init__(
        self,
        server_url: str,
        bearer_token: str | None = None,
        *,
        timeout_seconds: float = 30,
    ) -> None:
        headers = {"Authorization": f"Bearer {bearer_token}"} if bearer_token else None
        self._client = httpx.AsyncClient(
            base_url=server_url,
            headers=headers,
            timeout=timeout_seconds,
            follow_redirects=False,
        )

    async def request_status(
        self,
        method: str,
        path: str,
        *,
        json_body: Mapping[str, object] | None = None,
    ) -> tuple[int, Mapping[str, str]]:
        response = await self._client.request(method, path, json=json_body)
        return response.status_code, dict(response.headers)

    async def close(self) -> None:
        await self._client.aclose()
