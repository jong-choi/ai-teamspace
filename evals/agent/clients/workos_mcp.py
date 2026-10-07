from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

MODERN_PROTOCOL_VERSION = "2026-07-28"


class McpProtocolRegressionError(RuntimeError):
    pass


class WorkOsMcpClient:
    def __init__(
        self,
        resource_url: str,
        bearer_token: str | None = None,
        *,
        timeout_seconds: float = 30,
    ) -> None:
        self._resource_url = resource_url
        self._bearer_token = bearer_token
        self._timeout_seconds = timeout_seconds

    @asynccontextmanager
    async def _connect(self, mode: str) -> AsyncGenerator[Client, None]:
        headers = (
            {"Authorization": f"Bearer {self._bearer_token}"}
            if self._bearer_token
            else None
        )
        async with httpx2.AsyncClient(
            headers=headers,
            timeout=httpx2.Timeout(self._timeout_seconds),
            follow_redirects=False,
        ) as http_client:
            transport = streamable_http_client(
                self._resource_url,
                http_client=http_client,
            )
            async with Client(
                transport,
                mode=mode,
                read_timeout_seconds=self._timeout_seconds,
                raise_exceptions=True,
            ) as client:
                yield client

    async def discover(self) -> dict[str, Any]:
        # Auto mode performs the public discovery handshake; legacy negotiation
        # is never accepted as success by this harness.
        async with self._connect("auto") as client:
            version = str(client.protocol_version)
            server_info = client.server_info
            capabilities = client.server_capabilities

        if version != MODERN_PROTOCOL_VERSION:
            raise McpProtocolRegressionError(
                f"expected MCP {MODERN_PROTOCOL_VERSION}, negotiated {version}"
            )

        return {
            "protocolVersion": version,
            "serverInfo": (
                server_info.model_dump(mode="json", by_alias=True, exclude_none=True)
                if server_info is not None
                else None
            ),
            "capabilities": capabilities.model_dump(mode="json", by_alias=True, exclude_none=True),
        }

    async def assert_modern_protocol(self) -> str:
        discovery = await self.discover()
        return str(discovery["protocolVersion"])

    async def list_tools(self) -> list[dict[str, Any]]:
        async with self._connect(MODERN_PROTOCOL_VERSION) as client:
            result = await client.list_tools(cache_mode="bypass")
            return [
                tool.model_dump(mode="json", by_alias=True, exclude_none=True)
                for tool in result.tools
            ]

    async def list_resources(self) -> list[dict[str, Any]]:
        async with self._connect(MODERN_PROTOCOL_VERSION) as client:
            result = await client.list_resources(cache_mode="bypass")
            return [
                resource.model_dump(mode="json", by_alias=True, exclude_none=True)
                for resource in result.resources
            ]

    async def list_resource_templates(self) -> list[dict[str, Any]]:
        async with self._connect(MODERN_PROTOCOL_VERSION) as client:
            result = await client.list_resource_templates(cache_mode="bypass")
            return [
                template.model_dump(mode="json", by_alias=True, exclude_none=True)
                for template in result.resource_templates
            ]

    async def list_prompts(self) -> list[dict[str, Any]]:
        async with self._connect(MODERN_PROTOCOL_VERSION) as client:
            result = await client.list_prompts(cache_mode="bypass")
            return [
                prompt.model_dump(mode="json", by_alias=True, exclude_none=True)
                for prompt in result.prompts
            ]

    async def call_tool(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        async with self._connect(MODERN_PROTOCOL_VERSION) as client:
            result = await client.call_tool(
                name,
                arguments,
                read_timeout_seconds=self._timeout_seconds,
            )
            return result.model_dump(mode="json", by_alias=True, exclude_none=True)
