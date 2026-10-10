from __future__ import annotations

from collections.abc import AsyncIterator, Mapping
from typing import Any, Literal, cast

from langgraph_sdk import get_client
from langgraph_sdk.schema import StreamMode


class AgentProtocolClient:
    def __init__(
        self,
        server_url: str,
        bearer_token: str | None = None,
        *,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        request_headers = dict(headers or {})
        if bearer_token is not None:
            if any(key.lower() == "authorization" for key in request_headers):
                raise ValueError("bearer_token conflicts with explicit Authorization header")
            request_headers["Authorization"] = f"Bearer {bearer_token}"
        self._client = get_client(
            url=server_url,
            headers=request_headers or None,
        )

    async def create_thread(self, *, thread_id: str | None = None) -> Mapping[str, Any]:
        result = await self._client.threads.create(thread_id=thread_id)
        return dict(result)

    async def get_thread(self, thread_id: str) -> Mapping[str, Any]:
        return dict(await self._client.threads.get(thread_id))

    async def search_threads(
        self,
        *,
        metadata: Mapping[str, Any] | None = None,
        limit: int = 100,
    ) -> list[Mapping[str, Any]]:
        result = await self._client.threads.search(
            metadata=dict(metadata) if metadata is not None else None,
            limit=limit,
        )
        return [dict(item) for item in result]

    async def get_state(
        self,
        thread_id: str,
        *,
        subgraphs: bool = False,
    ) -> Mapping[str, Any]:
        return dict(
            await self._client.threads.get_state(
                thread_id,
                subgraphs=subgraphs,
            )
        )

    async def get_history(
        self,
        thread_id: str,
        *,
        limit: int = 100,
    ) -> list[Mapping[str, Any]]:
        history = await self._client.threads.get_history(thread_id, limit=limit)
        return [dict(item) for item in history]

    async def delete_thread(self, thread_id: str) -> None:
        await self._client.threads.delete(thread_id)

    async def create_run(
        self,
        thread_id: str,
        assistant_id: str,
        *,
        input: Mapping[str, Any] | None = None,
        command: Mapping[str, Any] | None = None,
        stream_mode: StreamMode | list[StreamMode] = "values",
        stream_subgraphs: bool = False,
        config: Mapping[str, Any] | None = None,
    ) -> Mapping[str, Any]:
        kwargs: dict[str, Any] = {
            "input": input,
            "stream_mode": stream_mode,
            "stream_subgraphs": stream_subgraphs,
            "stream_resumable": True,
            "multitask_strategy": "reject",
        }
        if command is not None:
            kwargs["command"] = command
        if config is not None:
            kwargs["config"] = dict(config)
        result = await self._client.runs.create(
            thread_id,
            assistant_id,
            **kwargs,
        )
        return dict(result)

    async def stream_run(
        self,
        thread_id: str,
        assistant_id: str,
        *,
        input: Mapping[str, Any] | None = None,
        command: Mapping[str, Any] | None = None,
        stream_mode: StreamMode | list[StreamMode] = "values",
        last_event_id: str | None = None,
    ) -> AsyncIterator[Any]:
        if last_event_id is not None:
            raise ValueError("last_event_id is only valid when resuming a known run")

        kwargs: dict[str, Any] = {
            "input": input,
            "stream_mode": stream_mode,
            "stream_resumable": True,
            "multitask_strategy": "reject",
        }
        if command is not None:
            kwargs["command"] = command
        async for part in self._client.runs.stream(  # pyright: ignore[reportUnknownVariableType]
            thread_id,
            assistant_id,
            **kwargs,
        ):
            yield cast(Any, part)

    async def join_run(self, thread_id: str, run_id: str) -> Mapping[str, Any]:
        joined: Any = await self._client.runs.join(  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
            thread_id,
            run_id,
        )
        return cast(dict[str, Any], joined)

    async def resume_stream(
        self,
        thread_id: str,
        run_id: str,
        *,
        last_event_id: str | None = None,
        stream_mode: StreamMode | list[StreamMode] | None = None,
    ) -> AsyncIterator[Any]:
        async for part in self._client.runs.join_stream(
            thread_id,
            run_id,
            last_event_id=last_event_id,
            stream_mode=stream_mode,
        ):
            yield part

    async def cancel_run(
        self,
        thread_id: str,
        run_id: str,
        *,
        action: Literal["interrupt", "rollback"] = "interrupt",
        wait: bool = True,
    ) -> None:
        await self._client.runs.cancel(
            thread_id,
            run_id,
            action=action,
            wait=wait,
        )

    async def cancel_many(
        self,
        *,
        thread_id: str | None = None,
        run_ids: list[str] | None = None,
        action: Literal["interrupt", "rollback"] = "interrupt",
    ) -> None:
        await self._client.runs.cancel_many(
            thread_id=thread_id,
            run_ids=run_ids,
            action=action,
        )

    async def get_run(self, thread_id: str, run_id: str) -> Mapping[str, Any]:
        return dict(await self._client.runs.get(thread_id, run_id))

    async def list_runs(self, thread_id: str, *, limit: int = 100) -> list[Mapping[str, Any]]:
        runs = await self._client.runs.list(thread_id, limit=limit)
        return [dict(item) for item in runs]
