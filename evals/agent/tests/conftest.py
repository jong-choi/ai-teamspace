from __future__ import annotations

import os

import pytest

from config.settings import EvalSettings

# DeepEval은 import할 때 현재 디렉터리의 .env를 os.environ에 읽어 들인다. test 결과가
# 개발자의 로컬 .env에 따라 달라지지 않도록 test module import 전에 끈다.
os.environ["DEEPEVAL_DISABLE_DOTENV"] = "1"


@pytest.fixture(autouse=True)
def isolate_eval_settings_from_local_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    # 로컬 evals/agent/.env와 shell의 EVAL_* 값이 settings 검증 test에 섞이지 않게 한다.
    monkeypatch.setitem(EvalSettings.model_config, "env_file", None)
    for name in [name for name in os.environ if name.startswith("EVAL_")]:
        monkeypatch.delenv(name)
