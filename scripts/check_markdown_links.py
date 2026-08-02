# ruff: noqa: INP001
"""Markdown内のローカルリンク切れを外部依存なしで検査する。"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import unquote

INLINE_LINK = re.compile(r"!?\[[^\]]*]\(([^)]+)\)")
REFERENCE_LINK = re.compile(r"^\s*\[[^\]]+]:\s*(\S+)", re.MULTILINE)
HTML_LINK = re.compile(r"""(?:href|src)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
EXTERNAL_PREFIXES = ("data:", "http://", "https://", "mailto:", "tel:")


def iter_markdown_files(roots: list[Path]) -> list[Path]:
    """指定範囲からMarkdownファイルを重複なく列挙する。"""
    files: set[Path] = set()
    for root in roots:
        if root.is_file() and root.suffix.lower() == ".md":
            files.add(root.resolve())
        elif root.is_dir():
            files.update(path.resolve() for path in root.rglob("*.md"))
    return sorted(files)


def strip_fenced_code(text: str) -> str:
    """コードフェンス内の疑似リンクを検査対象から除く。"""
    lines: list[str] = []
    marker: str | None = None
    for line in text.splitlines():
        stripped = line.lstrip()
        if marker is None and stripped.startswith(("```", "~~~")):
            marker = stripped[:3]
            lines.append("")
        elif marker is not None and stripped.startswith(marker):
            marker = None
            lines.append("")
        elif marker is None:
            lines.append(line)
        else:
            lines.append("")
    return "\n".join(lines)


def normalize_destination(raw: str) -> str:
    """Markdownリンクのタイトル部分を除き、パスだけを返す。"""
    value = raw.strip()
    if value.startswith("<") and ">" in value:
        value = value[1 : value.index(">")]
    else:
        value = value.split(maxsplit=1)[0]
    return unquote(value.replace("\\", "/"))


def find_broken_links(markdown_file: Path) -> list[tuple[str, Path]]:
    """一つのMarkdownに含まれる存在しないローカル参照を返す。"""
    text = strip_fenced_code(markdown_file.read_text(encoding="utf-8"))
    destinations = [*INLINE_LINK.findall(text), *REFERENCE_LINK.findall(text)]
    destinations.extend(HTML_LINK.findall(text))
    broken: list[tuple[str, Path]] = []

    for raw in destinations:
        destination = normalize_destination(raw)
        if not destination or destination.startswith(("#", *EXTERNAL_PREFIXES)):
            continue
        path_part = destination.split("#", maxsplit=1)[0].split("?", maxsplit=1)[0]
        if not path_part:
            continue
        if path_part.startswith("/"):
            target = (Path.cwd() / path_part.lstrip("/")).resolve()
        else:
            target = (markdown_file.parent / path_part).resolve()
        if not target.exists():
            broken.append((destination, target))
    return broken


def parse_args() -> argparse.Namespace:
    """CLI引数を解析する。"""
    parser = argparse.ArgumentParser(
        description="Markdown内のローカルリンク先が存在するか検査します。",
    )
    parser.add_argument(
        "paths",
        nargs="+",
        type=Path,
        help="検査するMarkdownファイルまたはディレクトリ",
    )
    return parser.parse_args()


def main() -> int:
    """リンク切れを表示し、検出時に終了コード1を返す。"""
    args = parse_args()
    markdown_files = iter_markdown_files(args.paths)
    failures: list[tuple[Path, str, Path]] = []
    for markdown_file in markdown_files:
        failures.extend(
            (markdown_file, destination, target)
            for destination, target in find_broken_links(markdown_file)
        )

    if failures:
        for markdown_file, destination, target in failures:
            sys.stderr.write(f"{markdown_file}: broken link: {destination} -> {target}\n")
        sys.stderr.write(f"Markdown link check failed: {len(failures)} broken link(s).\n")
        return 1

    sys.stdout.write(f"Markdown link check passed: {len(markdown_files)} file(s).\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
