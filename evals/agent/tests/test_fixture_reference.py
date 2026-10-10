from __future__ import annotations

import pytest

from fixtures.lifecycle import resolve_fixture_reference

PUBLIC_IDS = {"ticket:bug": "ticket-1", "organization:org": "org-1"}


def test_fixture_reference_resolves_strings_and_lists() -> None:
    assert resolve_fixture_reference("$ticket:bug", PUBLIC_IDS) == "ticket-1"
    assert resolve_fixture_reference(
        ["$organization:org", "literal"],
        PUBLIC_IDS,
    ) == ["org-1", "literal"]


def test_fixture_reference_leaves_plain_values_untouched() -> None:
    assert resolve_fixture_reference("urgent", PUBLIC_IDS) == "urgent"
    assert resolve_fixture_reference(3, PUBLIC_IDS) == 3


def test_fixture_reference_rejects_unknown_alias() -> None:
    with pytest.raises(ValueError, match="unknown fixture reference"):
        resolve_fixture_reference("$ticket:missing", PUBLIC_IDS)
