from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any, cast
from urllib.parse import urlsplit, urlunsplit

_REDACTED = "[REDACTED]"
_TRUNCATED = "[TRUNCATED]"
_SENSITIVE_KEY = re.compile(
    r"(?:^|[_-])(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|"
    r"authorization|auth|bearer|cookie|set[_-]?cookie|credential|password|secret|"
    r"client[_-]?secret|authorization[_-]?code|oauth[_-]?code|pkce[_-]?verifier|"
    r"oauth[_-]?state|discovery[_-]?state|personal[_-]?access[_-]?key)(?:$|[_-])",
    re.IGNORECASE,
)
_INLINE_SECRET = re.compile(
    r"((?:bearer\s+)|(?:authorization\s*[:=]\s*[\"']?(?:bearer\s+)?)|"
    r"(?:(?:access|refresh|id)[_-]?token|api[_-]?key|client[_-]?secret|"
    r"cookie|set-cookie|password|credential|pkce[_-]?verifier|oauth[_-]?state)"
    r"\s*[:=]\s*[\"']?)[^\"'\s,;&]+",
    re.IGNORECASE,
)
_URL = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)


def _sanitize_url(raw: str) -> str:
    try:
        parts = urlsplit(raw)
    except ValueError:
        return raw
    if not parts.scheme or not parts.hostname:
        return raw
    host = parts.hostname
    if parts.port:
        host = f"{host}:{parts.port}"
    return urlunsplit((parts.scheme, host, parts.path, "", ""))


def _sanitize_string(value: str, max_length: int) -> str:
    value = _INLINE_SECRET.sub(lambda match: f"{match.group(1)}{_REDACTED}", value)
    value = _URL.sub(lambda match: _sanitize_url(match.group(0)), value)
    if len(value) > max_length:
        return value[:max_length] + _TRUNCATED
    return value


def redact_report_value(
    value: Any,
    *,
    max_depth: int = 6,
    max_items: int = 128,
    max_string_length: int = 2_000,
) -> Any:
    seen: set[int] = set()

    def visit(current: Any, depth: int) -> Any:
        if current is None or isinstance(current, (bool, int, float)):
            return current
        if isinstance(current, str):
            stripped = current.strip()
            if (
                (stripped.startswith("{") and stripped.endswith("}"))
                or (stripped.startswith("[") and stripped.endswith("]"))
            ):
                try:
                    parsed = json.loads(current)
                except json.JSONDecodeError:
                    pass
                else:
                    return _sanitize_string(
                        json.dumps(visit(parsed, depth + 1), separators=(",", ":")),
                        max_string_length,
                    )
            return _sanitize_string(current, max_string_length)

        if depth >= max_depth:
            return _TRUNCATED

        if isinstance(current, Mapping):
            mapping = cast(Mapping[object, object], current)
            marker = id(mapping)
            if marker in seen:
                return "[CIRCULAR]"
            seen.add(marker)
            mapped: dict[str, Any] = {}
            for index, (key, nested) in enumerate(mapping.items()):
                if index >= max_items:
                    mapped["__truncated__"] = True
                    break
                safe_key = str(key)[:200]
                mapped[safe_key] = (
                    _REDACTED
                    if _SENSITIVE_KEY.search(safe_key)
                    else visit(nested, depth + 1)
                )
            return mapped

        if isinstance(current, Sequence) and not isinstance(current, (str, bytes, bytearray)):
            sequence = cast(Sequence[object], current)
            marker = id(sequence)
            if marker in seen:
                return "[CIRCULAR]"
            seen.add(marker)
            items: list[Any] = [
                visit(item, depth + 1) for item in sequence[:max_items]
            ]
            if len(sequence) > max_items:
                items.append(_TRUNCATED)
            return items

        return f"[{type(current).__name__}]"

    return visit(value, 0)
