from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import cast
from urllib.parse import parse_qs, urlsplit

import pytest

from clients.agent_protocol import AgentProtocolClient
from clients.agent_protocol_raw import AgentProtocolRawClient

_TIMESTAMP = "2026-10-07T00:00:00+00:00"
_FIXTURE_TOKEN = "".join(("fixture", "-token"))


@dataclass(frozen=True)
class RecordedRequest:
    method: str
    path: str
    query: dict[str, list[str]]
    authorization: str | None
    body: object | None


@pytest.fixture
def fake_agent_api() -> Iterator[tuple[str, list[RecordedRequest]]]:
    requests: list[RecordedRequest] = []
    threads: dict[str, dict[str, object]] = {}
    runs: dict[tuple[str, str], dict[str, object]] = {}

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: object) -> None:
            return None

        def _read_json(self) -> object | None:
            length = int(self.headers.get("content-length", "0"))
            if length == 0:
                return None
            raw = self.rfile.read(length)
            return json.loads(raw)

        def _record(self, body: object | None) -> tuple[str, dict[str, list[str]]]:
            split = urlsplit(self.path)
            query = parse_qs(split.query)
            requests.append(
                RecordedRequest(
                    method=self.command,
                    path=split.path,
                    query=query,
                    authorization=self.headers.get("authorization"),
                    body=body,
                )
            )
            return split.path, query

        def _json(self, status: int, payload: object) -> None:
            encoded = json.dumps(payload, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def _empty(self, status: int = 204) -> None:
            self.send_response(status)
            self.send_header("content-length", "0")
            self.end_headers()

        def do_POST(self) -> None:
            body = self._read_json()
            path, _ = self._record(body)

            if path == "/threads":
                payload = cast(dict[str, object], body or {})
                thread_id = str(payload.get("thread_id") or "generated-thread")
                thread: dict[str, object] = {
                    "thread_id": thread_id,
                    "created_at": _TIMESTAMP,
                    "updated_at": _TIMESTAMP,
                    "metadata": {},
                    "status": "idle",
                    "values": {},
                }
                threads[thread_id] = thread
                self._json(200, thread)
                return

            if path == "/threads/search":
                self._json(200, list(threads.values()))
                return

            if path == "/runs/cancel":
                self._json(200, {})
                return

            if path.endswith("/history") and path.startswith("/threads/"):
                history: list[dict[str, object]] = [
                    {
                        "values": {"history": True},
                        "next": [],
                        "tasks": [],
                        "checkpoint": {},
                        "metadata": {},
                        "created_at": _TIMESTAMP,
                        "parent_config": None,
                    }
                ]
                self._json(200, history)
                return

            parts = path.strip("/").split("/")
            if len(parts) == 3 and parts[0] == "threads" and parts[2] == "runs":
                thread_id = parts[1]
                payload = cast(dict[str, object], body or {})
                run_id = "run-1"
                run: dict[str, object] = {
                    "run_id": run_id,
                    "thread_id": thread_id,
                    "assistant_id": str(payload.get("assistant_id") or "agent"),
                    "created_at": _TIMESTAMP,
                    "updated_at": _TIMESTAMP,
                    "status": "pending",
                    "metadata": {},
                    "multitask_strategy": payload.get("multitask_strategy"),
                }
                runs[(thread_id, run_id)] = run
                self._json(200, run)
                return

            if (
                len(parts) == 5
                and parts[0] == "threads"
                and parts[2] == "runs"
                and parts[4] == "cancel"
            ):
                self._json(200, {})
                return

            self._json(404, {"error": "not found"})

        def do_GET(self) -> None:
            path, _ = self._record(None)
            parts = path.strip("/").split("/")

            if path == "/raw-redirect":
                self.send_response(302)
                self.send_header("location", "/threads")
                self.send_header("x-fixture", "raw")
                self.send_header("content-length", "0")
                self.end_headers()
                return

            if len(parts) == 2 and parts[0] == "threads":
                thread = threads.get(parts[1])
                if thread is None:
                    self._json(404, {"error": "thread missing"})
                    return
                self._json(200, thread)
                return

            if len(parts) == 3 and parts[0] == "threads" and parts[2] == "state":
                state: dict[str, object] = {
                    "values": {"state": True},
                    "next": [],
                    "tasks": [],
                    "checkpoint": {},
                    "metadata": {},
                    "created_at": _TIMESTAMP,
                    "parent_config": None,
                }
                self._json(200, state)
                return

            if len(parts) == 3 and parts[0] == "threads" and parts[2] == "runs":
                self._json(
                    200,
                    [
                        run
                        for (thread_id, _), run in runs.items()
                        if thread_id == parts[1]
                    ],
                )
                return

            if (
                len(parts) == 4
                and parts[0] == "threads"
                and parts[2] == "runs"
            ):
                run = runs.get((parts[1], parts[3]))
                if run is None:
                    self._json(404, {"error": "run missing"})
                    return
                self._json(200, run)
                return

            if (
                len(parts) == 5
                and parts[0] == "threads"
                and parts[2] == "runs"
                and parts[4] == "join"
            ):
                self._json(200, {"values": {"joined": True}})
                return

            self._json(404, {"error": "not found"})

        def do_DELETE(self) -> None:
            path, _ = self._record(None)
            parts = path.strip("/").split("/")
            if len(parts) == 2 and parts[0] == "threads":
                threads.pop(parts[1], None)
                self._empty()
                return
            self._json(404, {"error": "not found"})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = cast(tuple[str, int], server.server_address)
    try:
        yield f"http://{host}:{port}", requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


async def test_official_agent_protocol_client_against_fake_http_boundary(
    fake_agent_api: tuple[str, list[RecordedRequest]],
) -> None:
    base_url, requests = fake_agent_api
    client = AgentProtocolClient(base_url, bearer_token=_FIXTURE_TOKEN)

    created = await client.create_thread(thread_id="thread-1")
    searched = await client.search_threads(limit=5)
    fetched = await client.get_thread("thread-1")
    state = await client.get_state("thread-1")
    history = await client.get_history("thread-1", limit=3)

    created_run = await client.create_run(
        "thread-1",
        "agent",
        input={"messages": [{"role": "user", "content": "hello"}]},
    )
    fetched_run = await client.get_run("thread-1", "run-1")
    listed_runs = await client.list_runs("thread-1", limit=4)
    joined = await client.join_run("thread-1", "run-1")
    await client.cancel_run("thread-1", "run-1", wait=False)
    await client.cancel_many(thread_id="thread-1", run_ids=["run-1"])
    await client.delete_thread("thread-1")

    assert created["thread_id"] == "thread-1"
    assert searched[0]["thread_id"] == "thread-1"
    assert fetched["thread_id"] == "thread-1"
    assert state["values"] == {"state": True}
    assert history[0]["values"] == {"history": True}
    assert created_run["run_id"] == "run-1"
    assert fetched_run["run_id"] == "run-1"
    assert listed_runs[0]["run_id"] == "run-1"
    assert joined["values"] == {"joined": True}

    assert requests
    assert all(request.authorization == "Bearer fixture-token" for request in requests)

    run_create = next(
        request
        for request in requests
        if request.method == "POST" and request.path == "/threads/thread-1/runs"
    )
    run_body = cast(dict[str, object], run_create.body)
    assert run_body["stream_resumable"] is True
    assert run_body["multitask_strategy"] == "reject"

    cancel = next(
        request
        for request in requests
        if request.method == "POST"
        and request.path == "/threads/thread-1/runs/run-1/cancel"
    )
    assert cancel.query == {"wait": ["0"], "action": ["interrupt"]}

    bulk_cancel = next(
        request
        for request in requests
        if request.method == "POST" and request.path == "/runs/cancel"
    )
    assert cast(dict[str, object], bulk_cancel.body) == {
        "thread_id": "thread-1",
        "run_ids": ["run-1"],
    }
    assert bulk_cancel.query == {"action": ["interrupt"]}


async def test_raw_agent_protocol_helper_does_not_follow_redirects(
    fake_agent_api: tuple[str, list[RecordedRequest]],
) -> None:
    base_url, requests = fake_agent_api
    client = AgentProtocolRawClient(base_url, bearer_token=_FIXTURE_TOKEN)
    try:
        status, headers = await client.request_status("GET", "/raw-redirect")
    finally:
        await client.close()

    assert status == 302
    assert headers["x-fixture"] == "raw"
    assert requests[-1].path == "/raw-redirect"
    assert requests[-1].authorization == "Bearer fixture-token"
