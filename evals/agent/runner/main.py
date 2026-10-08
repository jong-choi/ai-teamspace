from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import NoReturn

from config.models import DeepEvalAsyncMode
from config.settings import EvalSettings, load_settings
from datasets.schema import load_dataset
from metrics.ollama_cloud_judge import create_ollama_cloud_judge
from reports.baseline import compare_reports, load_report
from reports.render import write_report
from runner.case_runner import Judge
from runner.live import run_configured_dataset
from runner.manifest import dependency_versions


def _fail(message: str) -> NoReturn:
    raise SystemExit(message)


def command_settings() -> int:
    settings = load_settings()
    payload = settings.safe_manifest().model_dump(mode="json")
    payload["dependency_versions"] = dependency_versions()
    print(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def command_validate_dataset(path: Path) -> int:
    dataset = load_dataset(path)
    print(
        json.dumps(
            {
                "dataset": dataset.id,
                "version": dataset.version,
                "case_count": len(dataset.cases),
                "case_ids": [case.id for case in dataset.cases],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


def command_run(
    path: Path,
    *,
    baseline_report: Path | None = None,
) -> int:
    settings = load_settings()
    dataset = load_dataset(path)
    try:
        report = asyncio.run(
            run_configured_dataset(settings, dataset, judge=configured_judge(settings))
        )
        if baseline_report is not None:
            baseline = load_report(baseline_report)
            diff = compare_reports(
                baseline,
                report,
                baseline_id=settings.baseline,
            )
            report = report.model_copy(
                update={"baseline_diff": diff.model_dump(mode="json")}
            )
    except Exception as error:
        _fail(f"{type(error).__name__}: evaluation failed")

    json_path, markdown_path = write_report(report, settings.output_dir)
    baseline_status = (
        report.baseline_diff.get("status")
        if report.baseline_diff is not None
        else None
    )
    print(
        json.dumps(
            {
                "dataset": report.manifest.dataset_id,
                "version": report.manifest.dataset_version,
                "trials": report.summary.trial_count,
                "passed_trials": report.summary.passed_trials,
                "failed_trials": report.summary.failed_trials,
                "pass_rate": report.summary.pass_rate,
                "flaky_cases": report.summary.flaky_cases,
                "baseline_status": baseline_status,
                "report_json": str(json_path),
                "report_markdown": str(markdown_path),
            },
            indent=2,
            sort_keys=True,
        )
    )
    if baseline_status == "incompatible":
        return 2
    return 0 if report.summary.failed_trials == 0 else 1


def configured_judge(settings: EvalSettings) -> Judge | None:
    judge_settings = settings.judge()
    if judge_settings is None:
        return None
    return create_ollama_cloud_judge(
        judge_settings,
        async_mode=settings.deepeval_async_mode == DeepEvalAsyncMode.ASYNC,
        timeout_seconds=settings.case_timeout_seconds,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Work OS Agent black-box eval harness")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("settings", help="validate settings and print a secret-free manifest")
    validate = subparsers.add_parser("validate-dataset", help="validate a tracked JSON dataset")
    validate.add_argument("path", type=Path)
    run = subparsers.add_parser(
        "run",
        help="run a dataset against the configured eval target adapter",
    )
    run.add_argument("path", type=Path)
    run.add_argument(
        "--baseline-report",
        type=Path,
        default=None,
        help="optional prior report.json for apples-to-apples diffing",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "settings":
        return command_settings()
    if args.command == "validate-dataset":
        return command_validate_dataset(args.path)
    if args.command == "run":
        return command_run(
            args.path,
            baseline_report=args.baseline_report,
        )
    _fail(f"unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
