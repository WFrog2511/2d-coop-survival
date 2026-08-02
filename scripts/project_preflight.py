# ruff: noqa: INP001
"""本検証前にローカル開発環境の前提を診断する。"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class CheckResult:
    """一つの診断結果を表す。"""

    name: str
    status: str
    detail: str


def _run_git(root: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    """GitをUTF-8で実行する。"""
    return subprocess.run(  # noqa: S603  # 固定Git引数だけをshellなしで実行する。
        ["git", *arguments],  # noqa: S607  # PATH上のGitを使用する。
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def check_git(root: Path, *, release: bool) -> list[CheckResult]:
    """Gitリポジトリ、ブランチ、作業ツリーを診断する。"""
    inside = _run_git(root, "rev-parse", "--is-inside-work-tree")
    if inside.returncode != 0 or inside.stdout.strip() != "true":
        return [CheckResult("git-repository", "FAIL", "Gitリポジトリではありません")]
    branch = _run_git(root, "branch", "--show-current").stdout.strip() or "detached HEAD"
    status = _run_git(root, "status", "--porcelain=v1")
    dirty = bool(status.stdout.strip())
    dirty_status = "FAIL" if release and dirty else "WARN" if dirty else "PASS"
    dirty_detail = "未コミットまたは未追跡の差分があります" if dirty else "作業ツリーはクリーンです"
    upstream = _run_git(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
    upstream_status = "PASS" if upstream.returncode == 0 else "WARN"
    upstream_detail = (
        upstream.stdout.strip() if upstream.returncode == 0 else "upstreamがありません"
    )
    return [
        CheckResult("git-repository", "PASS", f"branch={branch}"),
        CheckResult("git-worktree", dirty_status, dirty_detail),
        CheckResult("git-upstream", upstream_status, upstream_detail),
    ]


def check_writable(path: Path) -> CheckResult:
    """指定ディレクトリへ一時ファイルを作成できるか確認する。"""
    try:
        path.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=path, prefix="preflight-", delete=True):
            pass
    except OSError as exc:
        return CheckResult(f"writable:{path}", "FAIL", str(exc))
    return CheckResult(f"writable:{path}", "PASS", "書き込み可能です")


def check_port(value: str) -> CheckResult:
    """host:portへTCP接続できるか確認する。"""
    try:
        host, port_text = value.rsplit(":", 1)
        with socket.create_connection((host, int(port_text)), timeout=2):
            pass
    except (OSError, ValueError) as exc:
        return CheckResult(f"port:{value}", "FAIL", str(exc))
    return CheckResult(f"port:{value}", "PASS", "接続可能です")


def collect(args: argparse.Namespace) -> list[CheckResult]:
    """指定された診断を実行する。"""
    root = args.root.resolve()
    results = [
        CheckResult("python", "PASS", f"{sys.version.split()[0]} ({sys.executable})"),
        *check_git(root, release=args.release),
    ]
    for command in args.require_command:
        location = shutil.which(command)
        results.append(
            CheckResult(
                f"command:{command}",
                "PASS" if location else "FAIL",
                location or "PATHにありません",
            )
        )
    for name in args.require_env:
        value = os.environ.get(name)
        results.append(
            CheckResult(
                f"env:{name}", "PASS" if value else "FAIL", "設定済み" if value else "未設定"
            )
        )
    results.extend(check_writable((root / path).resolve()) for path in args.writable)
    results.extend(check_port(value) for value in args.port)
    return results


def main() -> int:
    """CLIを実行する。"""
    parser = argparse.ArgumentParser(description="本検証前の環境診断を行います。")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument(
        "--release", action="store_true", help="作業ツリーの差分を失敗扱いにします。"
    )
    parser.add_argument("--require-command", action="append", default=[])
    parser.add_argument("--require-env", action="append", default=[])
    parser.add_argument("--writable", action="append", default=["."])
    parser.add_argument("--port", action="append", default=[])
    parser.add_argument("--json", action="store_true", help="JSONで出力します。")
    args = parser.parse_args()
    results = collect(args)
    if args.json:
        sys.stdout.write(
            json.dumps([asdict(result) for result in results], ensure_ascii=False, indent=2) + "\n"
        )
    else:
        for result in results:
            sys.stdout.write(f"[{result.status}] {result.name}: {result.detail}\n")
    return 1 if any(result.status == "FAIL" for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
