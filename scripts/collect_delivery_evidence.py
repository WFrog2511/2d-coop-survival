# ruff: noqa: INP001
"""検証コマンドのログと再現情報を証跡パッケージへ収集する。"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SAFE_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$")


def _git(root: Path, *arguments: str) -> str:
    """Git情報を取得し、取得不能なら空文字を返す。"""
    result = subprocess.run(  # noqa: S603  # 固定Git引数だけをshellなしで実行する。
        ["git", *arguments],  # noqa: S607  # PATH上のGitを使用する。
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def _sha256(path: Path) -> str:
    """ファイルのSHA-256を返す。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_plan(path: Path) -> list[dict[str, Any]]:
    """shellを使わないargv形式の証跡計画を読み込む。"""
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    commands = payload.get("commands") if isinstance(payload, dict) else None
    if not isinstance(commands, list) or not commands:
        raise ValueError("commandsには1件以上の配列が必要です")
    for command in commands:
        if not isinstance(command, dict):
            raise TypeError("commandはobjectである必要があります")
        name = command.get("name")
        argv = command.get("argv")
        if not isinstance(name, str) or not SAFE_NAME.fullmatch(name):
            message = f"安全でないcommand nameです: {name}"
            raise ValueError(message)
        if (
            not isinstance(argv, list)
            or not argv
            or not all(isinstance(item, str) and item for item in argv)
        ):
            message = f"{name}: argvには空でない文字列配列が必要です"
            raise ValueError(message)
    return commands


def collect(root: Path, plan_path: Path, output: Path) -> int:
    """計画を実行し、ログとmanifestを新規ディレクトリへ保存する。"""
    if output.exists():
        message = f"出力先が既に存在します: {output}"
        raise FileExistsError(message)
    commands = _load_plan(plan_path)
    output.mkdir(parents=True)
    started_at = datetime.now(timezone.utc).isoformat()
    results: list[dict[str, Any]] = []
    files: list[Path] = []
    for index, command in enumerate(commands, start=1):
        name = str(command["name"])
        argv = list(command["argv"])
        started = datetime.now(timezone.utc)
        result = subprocess.run(  # noqa: S603  # 承認済みargvをshellなしで実行する。
            argv,
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        log_path = output / f"{index:02d}-{name}.log"
        log_path.write_text(
            f"argv: {json.dumps(argv, ensure_ascii=False)}\n"
            f"exit_code: {result.returncode}\n"
            "--- stdout ---\n"
            f"{result.stdout}"
            "--- stderr ---\n"
            f"{result.stderr}",
            encoding="utf-8",
        )
        files.append(log_path)
        results.append(
            {
                "name": name,
                "argv": argv,
                "exit_code": result.returncode,
                "started_at": started.isoformat(),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "log": log_path.name,
            }
        )

    metadata_path = output / "run-metadata.json"
    metadata_path.write_text(
        json.dumps(
            {
                "started_at": started_at,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "root": str(root),
                "commit": _git(root, "rev-parse", "HEAD"),
                "branch": _git(root, "branch", "--show-current"),
                "git_status": _git(root, "status", "--porcelain=v1"),
                "python": sys.version,
                "platform": platform.platform(),
                "commands": results,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    files.append(metadata_path)
    manifest_path = output / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {"files": [{"path": path.name, "sha256": _sha256(path)} for path in files]},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return 1 if any(item["exit_code"] != 0 for item in results) else 0


def main() -> int:
    """CLIを実行する。"""
    parser = argparse.ArgumentParser(description="検証ログとmanifestを収集します。")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        return collect(args.root.resolve(), args.plan.resolve(), args.output.resolve())
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        sys.stderr.write(f"Evidence collection: FAILED: {exc}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
