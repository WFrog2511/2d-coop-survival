# ruff: noqa: INP001
"""三層のリリース準備判定を機械検査する。"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

LAYERS = ("文書整合", "製品品質", "納品受け入れ")
ALLOWED_STATES = {"PASS", "FAIL", "WAITING", "対象外"}
COMPLETE_STATES = {"PASS", "対象外"}
HEADER = ("層", "状態", "根拠", "制約・残件")


def _cells(line: str) -> tuple[str, ...]:
    """Markdown表の一行をセルへ分割する。"""
    return tuple(cell.strip() for cell in line.strip().strip("|").split("|"))


def _validate_row(
    line_number: int,
    cells: tuple[str, ...],
    rows: dict[str, tuple[str, str]],
    *,
    release: bool,
) -> list[str]:
    """三層判定表の一行を検査する。"""
    if len(cells) != len(HEADER):
        return [f"{line_number}行目: 列数が{len(HEADER)}ではありません"]
    layer, state, evidence, _constraint = cells
    if layer not in LAYERS:
        return [f"{line_number}行目: 不明な層です: {layer}"]
    if layer in rows:
        return [f"{line_number}行目: 層が重複しています: {layer}"]

    findings: list[str] = []
    if state not in ALLOWED_STATES:
        findings.append(f"{line_number}行目: 状態が不正です: {state}")
    if state == "PASS" and not evidence:
        findings.append(f"{line_number}行目: PASSには根拠が必要です")
    if release and state not in COMPLETE_STATES:
        findings.append(f"{line_number}行目: 納品時に未完了です: {layer}={state}")
    if release and state == "対象外" and not evidence:
        findings.append(f"{line_number}行目: 対象外には判断根拠が必要です")
    rows[layer] = (state, evidence)
    return findings


def validate(path: Path, *, release: bool) -> list[str]:
    """三層判定を検査し、問題の一覧を返す。"""
    if not path.is_file():
        return [f"ファイルがありません: {path}"]

    lines = path.read_text(encoding="utf-8-sig").splitlines()
    header_index = next((i for i, line in enumerate(lines) if _cells(line) == HEADER), None)
    if header_index is None or header_index + 1 >= len(lines):
        return ["三層判定表のヘッダーがありません"]

    rows: dict[str, tuple[str, str]] = {}
    findings: list[str] = []
    for line_number, line in enumerate(lines[header_index + 2 :], start=header_index + 3):
        if not line.lstrip().startswith("|"):
            break
        findings.extend(_validate_row(line_number, _cells(line), rows, release=release))
    findings.extend(f"必須の層がありません: {layer}" for layer in LAYERS if layer not in rows)
    return findings


def main() -> int:
    """CLIを実行する。"""
    parser = argparse.ArgumentParser(description="三層のリリース準備判定を検査します。")
    parser.add_argument("path", type=Path)
    parser.add_argument("--release", action="store_true", help="納品完了条件を要求します。")
    args = parser.parse_args()
    findings = validate(args.path, release=args.release)
    if findings:
        sys.stderr.write("Delivery readiness check: FAILED\n")
        for finding in findings:
            sys.stderr.write(f"- {finding}\n")
        return 1
    sys.stdout.write("Delivery readiness check: PASSED\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
