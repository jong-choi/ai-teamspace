from __future__ import annotations

import hashlib
import importlib.metadata
import json
import platform
from collections.abc import Mapping, Sequence
from typing import Any, cast

_ALLOWED_TOOL_KEYS = (
    "name",
    "description",
    "inputSchema",
    "outputSchema",
    "annotations",
)


def _canonicalize(value: Any) -> Any:
    if isinstance(value, Mapping):
        mapping = cast(Mapping[object, object], value)
        return {
            str(key): _canonicalize(mapping[key])
            for key in sorted(mapping, key=str)
        }
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        sequence = cast(Sequence[object], value)
        return [_canonicalize(item) for item in sequence]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def canonicalize_tool_manifest(tools: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    canonical: list[dict[str, Any]] = []
    for tool in tools:
        item = {
            key: _canonicalize(tool[key])
            for key in _ALLOWED_TOOL_KEYS
            if key in tool
        }
        if not isinstance(item.get("name"), str) or not item["name"]:
            raise ValueError("tool manifest item requires a non-empty name")
        canonical.append(item)
    canonical.sort(key=lambda item: str(item["name"]))
    return canonical


def tool_manifest_hash(tools: Sequence[Mapping[str, Any]]) -> str:
    payload = json.dumps(
        canonicalize_tool_manifest(tools),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def dependency_versions() -> dict[str, str]:
    names = (
        "deepeval",
        "langgraph-sdk",
        "mcp",
        "langfuse",
        "pydantic",
        "pydantic-settings",
        "httpx",
        "httpx2",
    )
    versions: dict[str, str] = {}
    for name in names:
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = "not-installed"
    versions["python"] = platform.python_version()
    return versions


def stable_text_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
