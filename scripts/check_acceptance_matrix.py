# ruff: noqa: INP001
"""受け入れマトリクスを高速な形式検査と納品検査に分けて検証する。"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote

MATRIX_NAME = "acceptance-matrix.md"
HEADER = (
    "受け入れID",
    "受け入れ項目",
    "要件・仕様",
    "実装",
    "技術検証",
    "顧客確認",
    "証跡",
    "制約・対象外",
)
TECHNICAL_STATES = {"未検証", "PASS", "FAIL"}
CUSTOMER_STATES = {"不要", "待ち", "承認", "変更要求"}
RELEASE_INCOMPLETE = {"", "-", "—", "未着手", "未作成", "TBD"}
ISSUE_REFERENCE = re.compile(r"(?:#\d+|https://github\.com/[^)\s]+/issues/\d+|LOCAL-\d+)")
INLINE_LINK = re.compile(r"!?\[[^\]]*]\(([^)]+)\)")
EXTERNAL_PREFIXES = ("data:", "http://", "https://", "mailto:", "tel:")


@dataclass(frozen=True)
class MatrixSource:
    """検査対象のパスとMarkdown本文を保持する。"""

    path: Path
    content: str


@dataclass(frozen=True)
class MatrixRow:
    """受け入れ行の行番号とセルを保持する。"""

    line_number: int
    cells: tuple[str, ...]


def split_row(line: str) -> tuple[str, ...]:
    """Markdown表の一行を前後空白を除いたセルへ分割する。"""
    return tuple(cell.strip() for cell in line.strip().strip("|").split("|"))


def parse_rows(content: str) -> tuple[list[MatrixRow], list[str]]:
    """所定の見出しを持つ表から受け入れ行を抽出する。"""
    lines = content.splitlines()
    for index, line in enumerate(lines):
        if split_row(line) != HEADER:
            continue
        if index + 1 >= len(lines):
            return [], ["表の区切り行がありません。"]
        separator = split_row(lines[index + 1])
        if len(separator) != len(HEADER) or not all(
            re.fullmatch(r":?-{3,}:?", cell) for cell in separator
        ):
            return [], ["表の区切り行が不正です。"]

        rows: list[MatrixRow] = []
        for row_index in range(index + 2, len(lines)):
            candidate = lines[row_index].strip()
            if not candidate.startswith("|"):
                break
            cells = split_row(candidate)
            if len(cells) != len(HEADER):
                return rows, [f"{row_index + 1}行目の列数が{len(HEADER)}列ではありません。"]
            rows.append(MatrixRow(line_number=row_index + 1, cells=cells))
        return rows, []
    return [], ["受け入れマトリクスの見出しがありません。"]


def customer_state(cell: str) -> str | None:
    """顧客確認セルから許可された状態を取り出す。"""
    for state in CUSTOMER_STATES:
        if cell == state or cell.startswith(f"{state} "):
            return state
    return None


def normalize_destination(raw: str) -> str:
    """Markdownリンクからタイトルとアンカーを除いたパスを返す。"""
    value = raw.strip()
    if value.startswith("<") and ">" in value:
        value = value[1 : value.index(">")]
    else:
        value = value.split(maxsplit=1)[0]
    return unquote(value.replace("\\", "/"))


def validate_local_links(content: str, path: Path, root: Path) -> list[str]:
    """マトリクス内のローカルリンク切れとリポジトリ外参照を検出する。"""
    errors: list[str] = []
    root = root.resolve()
    for raw in INLINE_LINK.findall(content):
        destination = normalize_destination(raw)
        if not destination or destination.startswith(("#", *EXTERNAL_PREFIXES)):
            continue
        path_part = destination.split("#", maxsplit=1)[0].split("?", maxsplit=1)[0]
        target = (path.parent / path_part).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            errors.append(f"リポジトリ外を参照しています: {destination}")
            continue
        if not target.exists():
            errors.append(f"ローカルリンクが存在しません: {destination}")
    return errors


def validate_row(row: MatrixRow, path: Path, identifiers: set[str]) -> list[str]:
    """一行のID、項目名、状態、GitHubまたは一時Issue参照を検査する。"""
    identifier, item, _, _, technical, customer, _, _ = row.cells
    prefix = f"{path}:{row.line_number}"
    findings: list[str] = []
    if not identifier or identifier in {"-", "—"}:
        findings.append(f"{prefix}: 受け入れIDがありません。")
    elif identifier in identifiers:
        findings.append(f"{prefix}: 受け入れIDが重複しています: {identifier}")
    identifiers.add(identifier)
    if not item or item in {"-", "—"}:
        findings.append(f"{prefix}: 受け入れ項目がありません。")
    if technical not in TECHNICAL_STATES:
        findings.append(f"{prefix}: 技術検証の状態が不正です: {technical}")
    confirmed_state = customer_state(customer)
    if confirmed_state is None:
        findings.append(f"{prefix}: 顧客確認の状態が不正です: {customer}")
    elif confirmed_state != "不要" and ISSUE_REFERENCE.search(customer) is None:
        findings.append(f"{prefix}: 顧客確認にはGitHub IssueまたはLOCAL Issue参照が必要です。")
    return findings


def validate_release_row(row: MatrixRow, path: Path) -> list[str]:
    """一行が納品可能な完了状態かを検査する。"""
    _, _, requirement, implementation, technical, customer, evidence, _ = row.cells
    prefix = f"{path}:{row.line_number}"
    findings: list[str] = []
    if technical != "PASS":
        findings.append(f"{prefix}: 納品時の技術検証はPASSである必要があります。")
    if customer_state(customer) not in {"不要", "承認"}:
        findings.append(f"{prefix}: 納品時の顧客確認が完了していません。")
    for label, value in (
        ("要件・仕様", requirement),
        ("実装", implementation),
        ("証跡", evidence),
    ):
        if value in RELEASE_INCOMPLETE:
            findings.append(f"{prefix}: 納品時の{label}が未記入です。")
    return findings


def validate_content(content: str, path: Path, *, release: bool, root: Path) -> list[str]:
    """一つのマトリクス本文を通常または納品モードで検査する。"""
    rows, errors = parse_rows(content)
    template = "templates" in path.parts
    if errors:
        return [f"{path}: {message}" for message in errors]
    if not rows and not template:
        return [f"{path}: 受け入れ項目がありません。"]
    if release and template:
        return [f"{path}: テンプレートは納品検査の対象にできません。"]

    identifiers: set[str] = set()
    findings = [f"{path}: {message}" for message in validate_local_links(content, path, root)]
    for row in rows:
        findings.extend(validate_row(row, path, identifiers))
        if release:
            findings.extend(validate_release_row(row, path))
    return findings


def collect_matrix_paths(paths: list[Path]) -> list[Path]:
    """指定先または既定の納品領域からマトリクスを列挙する。"""
    if not paths:
        delivery = Path("docs/70_delivery")
        if not delivery.is_dir():
            return []
        return sorted(path for path in delivery.rglob(MATRIX_NAME) if "templates" not in path.parts)

    matrices: set[Path] = set()
    for path in paths:
        if path.is_dir():
            matrices.update(path.rglob(MATRIX_NAME))
        elif path.name == MATRIX_NAME:
            matrices.add(path)
    return sorted(matrices)


def read_staged_sources() -> list[MatrixSource]:
    """Git indexに追加・変更されたマトリクス本文だけを読み取る。"""
    git = shutil.which("git")
    if git is None:
        raise RuntimeError("gitが見つかりません。")
    changed = subprocess.run(  # noqa: S603
        [git, "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    sources: list[MatrixSource] = []
    for raw_path in changed.stdout.splitlines():
        normalized = raw_path.replace("\\", "/")
        if Path(normalized).name != MATRIX_NAME:
            continue
        staged = subprocess.run(  # noqa: S603
            [git, "show", f":{normalized}"],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        sources.append(MatrixSource(path=Path(normalized), content=staged.stdout))
    return sources


def build_parser() -> argparse.ArgumentParser:
    """CLI引数を定義する。"""
    parser = argparse.ArgumentParser(description="受け入れマトリクスを検査します。")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--staged", action="store_true", help="ステージ済みだけを高速検査する")
    modes.add_argument("--check", action="store_true", help="通常の完全性検査を行う")
    modes.add_argument("--release", action="store_true", help="納品可能な状態か厳格に検査する")
    parser.add_argument("paths", nargs="*", type=Path, help="マトリクスまたは検索先")
    return parser


def main(argv: list[str] | None = None) -> int:
    """対象を読み、検査結果に応じた終了コードを返す。"""
    args = build_parser().parse_args(argv)
    root = Path.cwd()
    if args.staged:
        sources = read_staged_sources()
    else:
        sources = [
            MatrixSource(path=path, content=path.read_text(encoding="utf-8"))
            for path in collect_matrix_paths(args.paths)
        ]

    if not sources:
        if args.release:
            sys.stderr.write("納品検査対象の受け入れマトリクスがありません。\n")
            return 2
        sys.stdout.write("受け入れマトリクスの検査対象はありません。\n")
        return 0

    findings: list[str] = []
    for source in sources:
        findings.extend(
            validate_content(
                source.content,
                source.path,
                release=args.release,
                root=root,
            )
        )
    if findings:
        for finding in findings:
            sys.stderr.write(f"{finding}\n")
        return 1
    sys.stdout.write(f"Acceptance matrix check passed: {len(sources)} file(s).\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
