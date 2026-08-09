"""TypeScript日本語コメント検査CLIを検証する。"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

# ruff: noqa: S101  # pytestでは観測結果をassertで表現する。

REPO = Path(__file__).resolve().parents[2]
CHECKER = REPO / "scripts" / "check_typescript_comments.mjs"
GIT = shutil.which("git")
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(GIT is None or NODE is None, reason="GitとNode.jsが必要です。")


def run_checker(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    """指定ディレクトリで検査CLIを実行する。"""
    if NODE is None:
        pytest.skip("Node.jsが必要です。")
    return subprocess.run(  # noqa: S603  # 固定したNode.jsと検査CLIだけを実行する。
        [NODE, str(CHECKER), *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )


def run_git(cwd: Path, *args: str) -> None:
    """一時リポジトリでGitコマンドを実行する。"""
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


def test_english_comment_and_jsdoc_fail(tmp_path: Path) -> None:
    """英語だけのコメントとJSDocを拒否する。"""
    source = tmp_path / "english.ts"
    source.write_text(
        "// English comment\n/** English JSDoc */\nexport const value = 1;\n",
        encoding="utf-8",
    )

    result = run_checker(tmp_path, str(source))

    assert result.returncode == 1
    assert "日本語を1文字以上" in result.stderr
    assert result.stderr.count("(local/japanese-comments)") == 2
    assert f"{source}:1:1:" in result.stderr
    assert f"{source}:2:1:" in result.stderr


def test_japanese_comment_and_jsdoc_pass(tmp_path: Path) -> None:
    """日本語を含むコメントとJSDocを許可する。"""
    source = tmp_path / "japanese.tsx"
    source.write_text(
        "// 値を公開する。\n/** 値の表示を説明する。 */\nexport const value = <span>値</span>;\n",
        encoding="utf-8",
    )

    result = run_checker(tmp_path, str(source))

    assert result.returncode == 0, result.stderr
    assert "チェック: OK" in result.stdout


def test_directives_pass(tmp_path: Path) -> None:
    """ESLint local ruleと同じdirectiveコメントを許可する。"""
    source = tmp_path / "directives.mts"
    source.write_text(
        "// eslint-disable-next-line no-console\n"
        "// @ts-expect-error 説明なしでもdirectiveとして扱う。\n"
        "/// <reference types=\"node\" />\n"
        "// coverage: ignore next\n"
        "// prettier-ignore\n"
        "// @generated\n"
        "export const value = 1;\n",
        encoding="utf-8",
    )

    result = run_checker(tmp_path, str(source))

    assert result.returncode == 0, result.stderr


def test_comment_markers_inside_strings_are_ignored(tmp_path: Path) -> None:
    """文字列とtemplate literal内のcomment markerを無視する。"""
    source = tmp_path / "strings.cts"
    source.write_text(
        "const line = 'https://example.invalid// English';\n"
        'const block = "/* English block */";\n'
        "const template = `// English ${'/* English interpolation */'}`;\n",
        encoding="utf-8",
    )

    result = run_checker(tmp_path, str(source))

    assert result.returncode == 0, result.stderr


def test_comment_markers_inside_tsx_text_are_ignored(tmp_path: Path) -> None:
    """TSX text node内のURLとliteral markerをコメントとして扱わない。"""
    source = tmp_path / "tsx-text.tsx"
    source.write_text(
        "export const value = (\n"
        "  <span>https://example.invalid// English /* literal */</span>\n"
        ");\n",
        encoding="utf-8",
    )

    result = run_checker(tmp_path, str(source))

    assert result.returncode == 0, result.stderr


def test_english_comment_inside_tsx_expression_fails(tmp_path: Path) -> None:
    """TSX expression内の実際の英語コメントは検出する。"""
    source = tmp_path / "tsx-expression.tsx"
    source.write_text(
        "export const value = <span>{/* English comment */}</span>;\n",
        encoding="utf-8",
    )

    result = run_checker(tmp_path, str(source))

    assert result.returncode == 1
    assert "(local/japanese-comments)" in result.stderr
    assert f"{source}:1:29:" in result.stderr


def test_staged_checks_only_indexed_typescript_files(tmp_path: Path) -> None:
    """Git indexのTypeScriptだけを検査し、未ステージ編集を読まない。"""
    run_git(tmp_path, "init")
    staged = tmp_path / "staged.ts"
    staged.write_text("// ステージ済みの説明。\nexport const staged = true;\n", encoding="utf-8")
    unstaged = tmp_path / "unstaged.mts"
    unstaged.write_text("// English unstaged comment\nexport const unstaged = true;\n", encoding="utf-8")
    run_git(tmp_path, "add", staged.name)
    staged.write_text("// English worktree comment\nexport const staged = true;\n", encoding="utf-8")

    passed = run_checker(tmp_path, "--staged")

    assert passed.returncode == 0, passed.stderr
    run_git(tmp_path, "add", unstaged.name)

    failed = run_checker(tmp_path, "--staged")

    assert failed.returncode == 1
    assert unstaged.name in failed.stderr
    assert staged.name not in failed.stderr


def test_staged_without_typescript_changes_passes(tmp_path: Path) -> None:
    """ステージ済みTypeScriptがない場合は成功終了する。"""
    run_git(tmp_path, "init")
    (tmp_path / "untracked.ts").write_text("// English comment\n", encoding="utf-8")

    result = run_checker(tmp_path, "--staged")

    assert result.returncode == 0, result.stderr
    assert "ステージ済みTypeScriptファイルはありません" in result.stdout
