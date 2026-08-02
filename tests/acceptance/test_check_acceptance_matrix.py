"""受け入れマトリクスの通常検査と納品検査を確認する。"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

# ruff: noqa: S101  # pytestでは検査結果をassertで表現する。

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "check_acceptance_matrix.py"
HEADER = (
    "| 受け入れID | 受け入れ項目 | 要件・仕様 | 実装 | 技術検証 | "
    "顧客確認 | 証跡 | 制約・対象外 |\n"
    "| --- | --- | --- | --- | --- | --- | --- | --- |"
)


def load_module() -> ModuleType:
    """検査スクリプトをテスト対象のモジュールとして読み込む。"""
    spec = importlib.util.spec_from_file_location("check_acceptance_matrix", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


MODULE = load_module()


def matrix(*rows: str) -> str:
    """指定行を持つ最小の受け入れマトリクスを返す。"""
    return "\n".join(("# 受け入れマトリクス", "", HEADER, *rows, ""))


def test_standard_check_accepts_valid_in_progress_matrix() -> None:
    """通常検査では未検証・確認待ちの作業中状態を許可する。"""
    content = matrix(
        "| REQ-001 | 予約できる | REQ-001 | 未着手 | 未検証 | 待ち (#123) | 未作成 | なし |"
    )

    findings = MODULE.validate_content(
        content,
        Path("docs/70_delivery/mvp/acceptance-matrix.md"),
        release=False,
        root=ROOT,
    )

    assert findings == []


def test_standard_check_accepts_local_customer_review_reference() -> None:
    """GitHub未接続時は一時Issue参照を許可する。"""
    content = matrix(
        "| REQ-001 | 予約できる | REQ-001 | 未着手 | 未検証 | "
        "待ち (LOCAL-004) | 未作成 | なし |"
    )

    findings = MODULE.validate_content(
        content,
        Path("docs/70_delivery/mvp/acceptance-matrix.md"),
        release=False,
        root=ROOT,
    )

    assert findings == []


def test_standard_check_rejects_duplicate_id_and_invalid_states() -> None:
    """重複IDと許可されない状態値を検出する。"""
    content = matrix(
        "| REQ-001 | 予約できる | REQ-001 | PR #1 | 完了 | 確認中 | 証跡 | なし |",
        "| REQ-001 | 変更できる | REQ-002 | PR #2 | PASS | 不要 | 証跡 | なし |",
    )

    findings = MODULE.validate_content(
        content,
        Path("docs/70_delivery/mvp/acceptance-matrix.md"),
        release=False,
        root=ROOT,
    )

    assert any("技術検証の状態が不正" in finding for finding in findings)
    assert any("顧客確認の状態が不正" in finding for finding in findings)
    assert any("受け入れIDが重複" in finding for finding in findings)


def test_release_check_rejects_incomplete_acceptance() -> None:
    """納品検査では未検証・確認待ち・証跡不足を拒否する。"""
    content = matrix(
        "| REQ-001 | 予約できる | REQ-001 | 未着手 | 未検証 | 待ち (#123) | 未作成 | なし |"
    )

    findings = MODULE.validate_content(
        content,
        Path("docs/70_delivery/mvp/acceptance-matrix.md"),
        release=True,
        root=ROOT,
    )

    assert any("技術検証はPASS" in finding for finding in findings)
    assert any("顧客確認が完了していません" in finding for finding in findings)
    assert any("納品時の実装が未記入" in finding for finding in findings)
    assert any("納品時の証跡が未記入" in finding for finding in findings)


def test_release_check_accepts_completed_acceptance() -> None:
    """納品検査では技術・顧客・実装・証跡が揃った行を許可する。"""
    content = matrix(
        "| REQ-001 | 予約できる | REQ-001 | PR #10 | PASS | 承認 (#123) | run-001 | なし |"
    )

    findings = MODULE.validate_content(
        content,
        Path("docs/70_delivery/mvp/acceptance-matrix.md"),
        release=True,
        root=ROOT,
    )

    assert findings == []


def test_empty_template_is_valid_for_standard_check() -> None:
    """配布用テンプレートは受け入れ行がなくても形式検査を通す。"""
    findings = MODULE.validate_content(
        matrix(),
        Path("docs/70_delivery/templates/acceptance-matrix.md"),
        release=False,
        root=ROOT,
    )

    assert findings == []
