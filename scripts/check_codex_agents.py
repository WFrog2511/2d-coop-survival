# ruff: noqa: INP001
"""固定したCodex Agent設定の必須値を静的検査する。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

MODEL = '"gpt-5.6-luna"'
EFFORT = '"max"'
ROOT = Path(".codex/config.toml")
AGENTS = {
    Path(".codex/agents/luna_max_planner_reviewer.toml"): (
        "luna_max_planner_reviewer",
        '"read-only"',
    ),
    Path(".codex/agents/luna_max_writer.toml"): (
        "luna_max_writer",
        '"workspace-write"',
    ),
}


def has_assignment(text: str, key: str, value: str) -> bool:
    """指定した固定代入がTOML本文にあるか確認する。"""
    return re.search(rf"(?m)^{re.escape(key)}\s*=\s*{re.escape(value)}\s*$", text) is not None


def has_text(text: str, key: str) -> bool:
    """説明用の空でない文字列または複数行文字列を確認する。"""
    quoted = rf'(?m)^{re.escape(key)}\s*=\s*"[^"\r\n]*\S[^"\r\n]*"\s*$'
    multiline = rf'(?ms)^{re.escape(key)}\s*=\s*"""\s*(\S.*?)\s*"""\s*$'
    return re.search(quoted, text) is not None or re.search(multiline, text) is not None


def read(path: Path, findings: list[str]) -> str:
    """UTF-8設定を読み、欠落時は検査結果へ追加する。"""
    if not path.is_file():
        findings.append(f"{path}: 設定ファイルがありません。")
        return ""
    return path.read_text(encoding="utf-8")


def main() -> int:
    """二つの固定roleとプロジェクト既定値を検査する。"""
    findings: list[str] = []
    root = read(ROOT, findings)
    agents_match = re.search(r"(?ms)^\[agents\]\s*$\n(.*?)(?=^\[|\Z)", root)
    if agents_match is None:
        findings.append(f"{ROOT}: [agents] テーブルがありません。")
    section = agents_match.group(1) if agents_match else ""
    for key, value in (
        ("enabled", "true"),
        ("max_concurrent_threads_per_session", "3"),
        ("default_subagent_model", MODEL),
        ("default_subagent_reasoning_effort", EFFORT),
    ):
        if not has_assignment(section, key, value):
            findings.append(f"{ROOT}: [agents].{key} が {value} ではありません。")
    for path, (name, sandbox) in AGENTS.items():
        text = read(path, findings)
        for key, value in (("name", f'"{name}"'), ("model", MODEL), ("model_reasoning_effort", EFFORT), ("sandbox_mode", sandbox)):
            if not has_assignment(text, key, value):
                findings.append(f"{path}: {key} が {value} ではありません。")
        for key in ("description", "developer_instructions"):
            if not has_text(text, key):
                findings.append(f"{path}: {key} が空です。")
    if findings:
        sys.stderr.write("\n".join(findings) + "\n")
        return 1
    sys.stdout.write("Codex Agent設定検査: OK\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
