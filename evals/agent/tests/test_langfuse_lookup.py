from __future__ import annotations

from typing import Any

import pytest
from pydantic import SecretStr

from clients.langfuse import POLL_INTERVAL_SECONDS, LangfuseTraceLookup
from config.models import LangfuseLookupSettings


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def lookup_with(
    monkeypatch: pytest.MonkeyPatch,
    clock: FakeClock,
    responses: list[list[dict[str, Any]]],
) -> LangfuseTraceLookup:
    lookup = LangfuseTraceLookup(
        LangfuseLookupSettings(
            enabled=True,
            base_url="http://localhost:3300",
            public_key="pk-lf-test",
            secret_key=SecretStr("sk-lf-test"),
            project_alias="work-os-agent",
            ingestion_wait_seconds=3,
        ),
        sleep=clock.sleep,
        monotonic=clock.monotonic,
    )

    def observations_for_run(run_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
        del run_id, limit
        return responses.pop(0) if responses else []

    monkeypatch.setattr(lookup, "observations_for_run", observations_for_run)
    return lookup


def test_link_waits_for_asynchronous_ingestion(monkeypatch: pytest.MonkeyPatch) -> None:
    clock = FakeClock()
    lookup = lookup_with(monkeypatch, clock, [[], [], [{"id": "observation-1"}]])

    link = lookup.link_for_run("run-1")
    lookup.close()

    assert link.sampled is True
    assert link.linkage_error is None
    assert clock.sleeps == [POLL_INTERVAL_SECONDS, POLL_INTERVAL_SECONDS]


def test_link_reports_missing_trace_after_bounded_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    clock = FakeClock()
    lookup = lookup_with(monkeypatch, clock, [])

    link = lookup.link_for_run("run-1")
    lookup.close()

    assert link.sampled is False
    assert link.linkage_error == "trace not found or not sampled"
    assert sum(clock.sleeps) == 3
