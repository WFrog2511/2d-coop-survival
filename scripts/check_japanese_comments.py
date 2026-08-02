"""Pythonコメント/docstringに日本語が含まれているか検査するCLI."""

# ruff: noqa: INP001  # 単体CLIとして配置する。

from __future__ import annotations

import argparse
import ast
import os
import re
import shutil
import subprocess
import sys
import tokenize
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterable

JAPANESE_RE = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
EXCLUDED_DIRS = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "node_modules",
    "venv",
}
DIRECTIVE_PREFIXES = (
    "coding:",
    "coding=",
    "coverage:",
    "fmt:",
    "isort:",
    "mypy:",
    "noqa",
    "pragma:",
    "pylint:",
    "pyright:",
    "ruff:",
    "type:",
)


@dataclass(frozen=True)
class CommentIssue:
    """日本語コメント/docstring検査で見つかった問題."""

    path: Path
    line: int
    comment: str


def has_japanese(text: str) -> bool:
    """文字列に日本語文字が含まれるか判定する."""
    return bool(JAPANESE_RE.search(text))


def should_skip_comment(body: str, line_number: int) -> bool:
    """検査対象外にするdirectiveコメントか判定する."""
    stripped = body.strip()
    lowered = stripped.lower()
    if not stripped:
        return True
    if line_number == 1 and stripped.startswith("!"):
        return True
    return lowered.startswith(DIRECTIVE_PREFIXES)


def docstring_from_body(body: list[ast.stmt]) -> tuple[int, str] | None:
    """AST bodyの先頭からdocstring本文と行番号を取り出す."""
    if not body:
        return None
    first = body[0]
    if not isinstance(first, ast.Expr):
        return None
    value = first.value
    if not isinstance(value, ast.Constant) or not isinstance(value.value, str):
        return None
    return first.lineno, value.value


def iter_docstrings(tree: ast.Module) -> list[tuple[int, str]]:
    """module/class/functionのdocstringを列挙する."""
    docstrings: list[tuple[int, str]] = []
    module_docstring = docstring_from_body(tree.body)
    if module_docstring is not None:
        docstrings.append(module_docstring)
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        docstring = docstring_from_body(node.body)
        if docstring is not None:
            docstrings.append(docstring)
    return docstrings


def iter_python_files(paths: Iterable[Path]) -> list[Path]:
    """対象パス配下からPythonファイルを集める."""
    roots = list(paths) or [Path.cwd()]
    files: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        if root.is_file():
            if root.suffix == ".py":
                files.append(root)
            continue
        for path in root.rglob("*.py"):
            if any(part in EXCLUDED_DIRS for part in path.parts):
                continue
            files.append(path)
    return sorted({path.resolve() for path in files})


def staged_python_files() -> list[Path]:
    """ステージ済みPythonファイルをGitから安全に取得する."""
    git = shutil.which("git")
    if git is None:
        raise RuntimeError("Gitが見つかりません。")
    result = subprocess.run(  # noqa: S603  # 固定したGitコマンドだけを実行する。
        [git, "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
        check=False,
        capture_output=True,
    )
    if result.returncode != 0:
        message = os.fsdecode(result.stderr).strip() or "ステージ済みファイルを取得できません。"
        raise RuntimeError(message)
    return [
        Path(os.fsdecode(raw_path))
        for raw_path in result.stdout.split(b"\0")
        if raw_path and Path(os.fsdecode(raw_path)).suffix == ".py"
    ]


def find_issues(path: Path) -> list[CommentIssue]:
    """Pythonファイル内の英語だけのコメントとdocstringを検出する."""
    issues: list[CommentIssue] = []
    try:
        with path.open("rb") as stream:
            tokens = tokenize.tokenize(stream.readline)
            for token in tokens:
                if token.type != tokenize.COMMENT:
                    continue
                body = token.string.removeprefix("#")
                line_number = token.start[0]
                if should_skip_comment(body, line_number):
                    continue
                if not has_japanese(body):
                    issues.append(CommentIssue(path=path, line=line_number, comment=body.strip()))
    except (SyntaxError, tokenize.TokenError, UnicodeDecodeError) as exc:
        issues.append(CommentIssue(path=path, line=0, comment=f"parse error: {exc}"))
        return issues

    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError) as exc:
        issues.append(CommentIssue(path=path, line=0, comment=f"parse error: {exc}"))
        return issues

    for line_number, body in iter_docstrings(tree):
        if not body.strip():
            continue
        if not has_japanese(body):
            issues.append(
                CommentIssue(
                    path=path,
                    line=line_number,
                    comment=f"docstring: {body.strip()}",
                )
            )
    return issues


def format_issue(issue: CommentIssue) -> str:
    """検査結果をCLI向けの1行メッセージに変換する."""
    location = f"{issue.path}:{issue.line}" if issue.line else str(issue.path)
    return f"{location}: Pythonコメント/docstringに日本語を1文字以上含めてください: {issue.comment}"


def write_stdout(message: str) -> None:
    """標準出力へ1行を書き込む."""
    sys.stdout.write(f"{message}\n")


def write_stderr(message: str) -> None:
    """標準エラーへ1行を書き込む."""
    sys.stderr.write(f"{message}\n")


def main(argv: list[str] | None = None) -> int:
    """CLIの入口として引数を処理する."""
    parser = argparse.ArgumentParser(
        description="Pythonコメントとdocstring本文が日本語を1文字以上含むか検査します。"
    )
    parser.add_argument("paths", nargs="*", type=Path, help="検査対象のファイルまたはディレクトリ")
    parser.add_argument(
        "--staged",
        action="store_true",
        help="ステージ済みPythonファイルだけを検査する",
    )
    args = parser.parse_args(argv)
    if args.staged and args.paths:
        parser.error("--stagedとpathsは同時に指定できません。")

    selected_paths = args.paths
    if args.staged:
        try:
            selected_paths = staged_python_files()
        except RuntimeError as exc:
            write_stderr(str(exc))
            return 2
        if not selected_paths:
            write_stdout("ステージ済みPythonファイルはありません。")
            return 0

    issues: list[CommentIssue] = []
    for path in iter_python_files(selected_paths):
        issues.extend(find_issues(path))

    if issues:
        for issue in issues:
            write_stderr(format_issue(issue))
        return 1

    write_stdout("Pythonコメント/docstring日本語チェック: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
