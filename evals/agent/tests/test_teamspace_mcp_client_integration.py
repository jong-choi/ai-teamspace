from __future__ import annotations

import asyncio
import socket
from contextlib import suppress
from typing import cast

from mcp.server import MCPServer
from mcp.server.mcpserver import Context

from clients.teamspace_mcp import MODERN_PROTOCOL_VERSION, TeamspaceMcpClient

_FIXTURE_TOKEN = "".join(("fixture", "-mcp-token"))


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


async def _wait_for_tcp(port: int) -> None:
    last_error: OSError | None = None
    for _ in range(100):
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
        except OSError as error:
            last_error = error
            await asyncio.sleep(0.01)
            continue
        writer.close()
        await writer.wait_closed()
        del reader
        return
    raise RuntimeError("fake MCP server did not start") from last_error


async def test_official_mcp_client_against_official_streamable_http_server() -> None:
    server = MCPServer(
        name="work-os-eval-fixture",
        version="1.0.0",
        description="Black-box MCP client fixture",
    )

    @server.tool(structured_output=True)
    async def echo(value: str, ctx: Context) -> dict[str, object]:
        headers = ctx.headers or {}
        return {
            "value": value,
            "authorization": headers.get("authorization"),
            "protocolVersion": ctx.protocol_version,
        }

    @server.resource(
        "fixture://status",
        name="fixture-status",
        description="Fixture resource",
        mime_type="text/plain",
    )
    async def fixture_status() -> str:
        return "ok"

    @server.prompt(name="fixture-greeting", description="Fixture prompt")
    async def fixture_greeting(name: str) -> str:
        return f"Hello {name}"

    port = _free_port()
    task = asyncio.create_task(
        server.run_streamable_http_async(
            host="127.0.0.1",
            port=port,
            streamable_http_path="/mcp",
            json_response=True,
            stateless_http=True,
        )
    )
    try:
        await _wait_for_tcp(port)
        client = TeamspaceMcpClient(
            f"http://127.0.0.1:{port}/mcp",
            bearer_token=_FIXTURE_TOKEN,
            timeout_seconds=5,
        )

        discovery = await client.discover()
        tools = await client.list_tools()
        resources = await client.list_resources()
        templates = await client.list_resource_templates()
        prompts = await client.list_prompts()
        result = await client.call_tool("echo", {"value": "hello"})

        assert discovery["protocolVersion"] == MODERN_PROTOCOL_VERSION
        server_info = cast(dict[str, object], discovery["serverInfo"])
        assert server_info["name"] == "work-os-eval-fixture"

        capabilities = cast(dict[str, object], discovery["capabilities"])
        assert "tools" in capabilities

        echo_tool = next(tool for tool in tools if tool["name"] == "echo")
        assert echo_tool["inputSchema"]["required"] == ["value"]

        assert resources == [
            {
                "uri": "fixture://status",
                "name": "fixture-status",
                "description": "Fixture resource",
                "mimeType": "text/plain",
            }
        ]
        assert templates == []
        assert [prompt["name"] for prompt in prompts] == ["fixture-greeting"]

        structured = cast(dict[str, object], result["structuredContent"])
        assert structured == {
            "value": "hello",
            "authorization": f"Bearer {_FIXTURE_TOKEN}",
            "protocolVersion": MODERN_PROTOCOL_VERSION,
        }
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
