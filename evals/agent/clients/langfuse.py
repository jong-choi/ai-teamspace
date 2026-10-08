from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from langfuse import Langfuse

from config.models import LangfuseLookupSettings
from reports.schema import LangfuseTraceLink

POLL_INTERVAL_SECONDS = 1.0


class LangfuseTraceLookup:
    def __init__(
        self,
        settings: LangfuseLookupSettings,
        *,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._settings = settings
        self._sleep = sleep
        self._monotonic = monotonic
        self._client: Langfuse | None = None
        if settings.enabled:
            assert settings.public_key is not None
            assert settings.secret_key is not None
            assert settings.base_url is not None
            self._client = Langfuse(
                public_key=settings.public_key,
                secret_key=settings.secret_key.get_secret_value(),
                base_url=settings.base_url,
                tracing_enabled=False,
            )

    def trace_id_for_run(self, run_id: str) -> str:
        if self._client is None:
            raise RuntimeError("Langfuse linkage is disabled")
        return self._client.create_trace_id(seed=run_id)

    def observations_for_run(
        self,
        run_id: str,
        *,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        if self._client is None:
            return []
        trace_id = self.trace_id_for_run(run_id)
        response = self._client.api.observations.get_many(
            trace_id=trace_id,
            limit=limit,
            parse_io_as_json=False,
        )
        return [item.model_dump(mode="json") for item in response.data]

    def link_for_run(self, run_id: str) -> LangfuseTraceLink:
        if self._client is None:
            return LangfuseTraceLink(
                run_id=run_id,
                trace_id="disabled",
                sampled=None,
                linkage_error="Langfuse linkage disabled",
            )

        trace_id = self.trace_id_for_run(run_id)
        try:
            observations = self._wait_for_observations(run_id)
            sampled = bool(observations)
            error = None if observations else "trace not found or not sampled"
        except Exception as error_value:
            sampled = None
            error = f"{type(error_value).__name__}: Langfuse lookup failed"

        ui_url = None
        if self._settings.ui_trace_url_template:
            ui_url = self._settings.ui_trace_url_template.format(trace_id=trace_id)

        return LangfuseTraceLink(
            run_id=run_id,
            trace_id=trace_id,
            sampled=sampled,
            ui_url=ui_url,
            linkage_error=error,
        )

    def _wait_for_observations(self, run_id: str) -> list[dict[str, Any]]:
        deadline = self._monotonic() + self._settings.ingestion_wait_seconds
        while True:
            observations = self.observations_for_run(run_id)
            if observations or self._monotonic() >= deadline:
                return observations
            self._sleep(POLL_INTERVAL_SECONDS)

    def close(self) -> None:
        if self._client is not None:
            self._client.shutdown()
