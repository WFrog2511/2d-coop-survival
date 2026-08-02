"""日本語コメントとdocstring検査CLIを検証する."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

# ruff: noqa: S101  # pytestでは観測結果をassertで表現する。

REPO = Path(__file__).resolve().parents[2]
CHECKER = REPO / "scripts" / "check_japanese_comments.py"
GIT = shutil.which("git")
pytestmark = pytest.mark.skipif(GIT is None, reason="Gitが必要です。")


def run_checker(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    """指定ディレクトリで検査CLIを実行する."""
    return subprocess.run(  # noqa: S603  # 固定したPythonと検査CLIだけを実行する。
        [sys.executable, "-X", "utf8", str(CHECKER), *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )


def run_git(cwd: Path, *args: str) -> None:
    """一時リポジトリでGitコマンドを実行する."""
    if GIT is None:
        pytest.skip("Gitが必要です。")
    result = subprocess.run(  # noqa: S603  # 固定したGitだけを実行する。
        [GIT, *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_english_comment_and_docstring_fail(tmp_path: Path) -> None:
    """英語だけのコメントとdocstringを拒否する."""
    source = tmp_path / "english.py"
    source.write_text(
        '"""English module docs."""\n# English comment\nVALUE = 1\n',
        encoding="utf-8",
    )

    result = run_checker(tmp_path, str(source))

    assert result.returncode == 1
    assert "日本語を1文字以上" in result.stderr
    assert "English module docs." in result.stderr
    assert "English comment" in result.stderr


def test_japanese_comment_and_docstring_pass(tmp_path: Path) -> None:
    """日本語を含むコメントとdocstringを許可する."""
    source = tmp_path / "japanese.py"
    source.write_text(
        '"""モジュールの説明."""\n# 値を保持する。\nVALUE = 1\n',
        encoding="utf-8",
    )

    result = run_checker(tmp_path, str(source))

    assert result.returncode == 0, result.stderr
    assert "チェック: OK" in result.stdout


def test_staged_checks_only_staged_python_files(tmp_path: Path) -> None:
    """ステージ済みPythonだけを検査する."""
    run_git(tmp_path, "init")
    staged = tmp_path / "日本語 staged.py"
    staged.write_text("# 日本語コメント。\n", encoding="utf-8")
    unstaged = tmp_path / "英語 comment.py"
    unstaged.write_text("# English comment\n", encoding="utf-8")
    run_git(tmp_path, "add", staged.name)

    passed = run_checker(tmp_path, "--staged")

    assert passed.returncode == 0, passed.stderr
    run_git(tmp_path, "add", unstaged.name)

    failed = run_checker(tmp_path, "--staged")

    assert failed.returncode == 1
    assert unstaged.name in failed.stderr


def test_staged_without_python_changes_passes(tmp_path: Path) -> None:
    """ステージ済みPythonがない場合は成功終了する."""
    run_git(tmp_path, "init")
    (tmp_path / "untracked.py").write_text("# English comment\n", encoding="utf-8")

    result = run_checker(tmp_path, "--staged")

    assert result.returncode == 0, result.stderr
    assert "ステージ済みPythonファイルはありません" in result.stdout
