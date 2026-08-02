"""納品準備ツールの単体テスト。"""

# ruff: noqa: S101, SLF001  # pytestでは検査結果と安全拒否をassertする。

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]


def _load(name: str) -> ModuleType:
    """scripts配下の単一ファイルmoduleを読み込む。"""
    path = ROOT / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def test_readiness_allows_waiting_before_release(tmp_path: Path) -> None:
    """通常検査では未完了状態を許可する。"""
    module = _load("check_delivery_readiness")
    report = tmp_path / "readiness.md"
    report.write_text(
        "| 層 | 状態 | 根拠 | 制約・残件 |\n"
        "| --- | --- | --- | --- |\n"
        "| 文書整合 | PASS | docs check | |\n"
        "| 製品品質 | WAITING | | test pending |\n"
        "| 納品受け入れ | WAITING | | owner pending |\n",
        encoding="utf-8",
    )
    assert module.validate(report, release=False) == []
    assert module.validate(report, release=True)


def test_readiness_requires_evidence_for_complete_states(tmp_path: Path) -> None:
    """納品時のPASSと対象外には根拠を要求する。"""
    module = _load("check_delivery_readiness")
    report = tmp_path / "readiness.md"
    report.write_text(
        "| 層 | 状態 | 根拠 | 制約・残件 |\n"
        "| --- | --- | --- | --- |\n"
        "| 文書整合 | PASS | docs check | |\n"
        "| 製品品質 | PASS | tests | |\n"
        "| 納品受け入れ | 対象外 | owner decision | |\n",
        encoding="utf-8",
    )
    assert module.validate(report, release=True) == []


def test_evidence_collector_keeps_logs_on_command_failure(tmp_path: Path) -> None:
    """コマンド失敗時もログとmanifestを保持する。"""
    module = _load("collect_delivery_evidence")
    plan = tmp_path / "plan.json"
    plan.write_text(
        json.dumps(
            {
                "commands": [
                    {"name": "success", "argv": ["python", "-c", "print('ok')"]},
                    {"name": "failure", "argv": ["python", "-c", "raise SystemExit(3)"]},
                ]
            }
        ),
        encoding="utf-8",
    )
    output = tmp_path / "evidence"
    assert module.collect(tmp_path, plan, output) == 1
    assert (output / "01-success.log").is_file()
    assert (output / "02-failure.log").is_file()
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    assert {item["path"] for item in manifest["files"]} == {
        "01-success.log",
        "02-failure.log",
        "run-metadata.json",
    }


def test_evidence_plan_rejects_unsafe_name(tmp_path: Path) -> None:
    """ログ名へパストラバーサルを含められない。"""
    module = _load("collect_delivery_evidence")
    plan = tmp_path / "plan.json"
    plan.write_text(
        json.dumps({"commands": [{"name": "../escape", "argv": ["python", "--version"]}]}),
        encoding="utf-8",
    )
    try:
        module._load_plan(plan)
    except ValueError:
        pass
    else:
        raise AssertionError("安全でないnameが受理されました")
