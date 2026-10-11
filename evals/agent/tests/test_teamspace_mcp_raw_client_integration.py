from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, cast

import pytest

from clients.teamspace_mcp import MODERN_PROTOCOL_VERSION
from clients.teamspace_mcp_raw import TeamspaceMcpRawClient

_TOKEN = "".join(("wos_mcp_", "revoked-fixture"))


@dataclass(frozen=True)
class SeenRequest:
    authorization: str | None
    accept: str | None
    content_type: str | None
    body: dict[str, Any]


@pytest.fixture
def auth_probe_server() -> Iterator[tuple[str, list[SeenRequest]]]:
    seen: list[SeenRequest] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            length = int(self.headers.get("content-length", "0"))
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw)
            assert isinstance(payload, dict)
            seen.append(
                SeenRequest(
                    authorization=self.headers.get("authorization"),
                    accept=self.headers.get("accept"),
                    content_type=self.headers.get("content-type"),
                    body=cast(dict[str, Any], payload),
                )
            )
            self.send_response(401)
            self.send_header(
                "www-authenticate",
                'Bearer resource_metadata="http://fixture.invalid/.well-known/mcp"',
            )
            body = b'{"jsonrpc":"2.0","error":{"code":-32000},"id":null}'
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            del format, args

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = cast(tuple[str, int], server.server_address)
        yield f"http://{host}:{port}/mcp", seen
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


async def test_raw_mcp_helper_only_exposes_status_and_challenge(
    auth_probe_server: tuple[str, list[SeenRequest]],
) -> None:
    url, seen = auth_probe_server

    async with TeamspaceMcpRawClient(
        url,
        _TOKEN,
        timeout_seconds=5,
    ) as client:
        status, headers = await client.initialize_status()

    assert status == 401
    assert "resource_metadata=" in headers["www-authenticate"]
    assert len(seen) == 1
    request = seen[0]
    assert request.authorization == f"Bearer {_TOKEN}"
    assert request.accept == "application/json, text/event-stream"
    assert request.content_type == "application/json"
    assert request.body == {
        "jsonrpc": "2.0",
        "id": "eval-auth-probe",
        "method": "initialize",
        "params": {
            "protocolVersion": MODERN_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {
                "name": "teamspace-agent-evals",
                "version": "0.1.0",
            },
        },
    }
