#!/usr/bin/env python3
"""Markdown DOCGEN block updater.

設計書MarkdownのDOCGENブロックを更新する小さな同期ツール。
DOCGEN blocks keep design documents synchronized with selected source-code facts.
The hand-written sections remain the source of design intent; generated blocks are
strictly derived from code and are checked in CI with ``--check``.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from docgen_lib.markdown import DocgenError, process_markdown_file


def expand_inputs(patterns: list[str]) -> list[Path]:
    """ファイル指定とglob指定を重複なしのMarkdown一覧へ展開する."""
    paths: list[Path] = []
    for pattern in patterns:
        matches = list(Path.cwd().glob(pattern))
        if matches:
            paths.extend(matches)
        else:
            paths.append(Path(pattern))
    unique: list[Path] = []
    seen: set[Path] = set()
    for path in paths:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if path.is_file() and path.suffix.lower() == ".md":
            unique.append(path)
    return unique


def main(argv: list[str] | None = None) -> int:
    """DOCGENブロックを同期または検査して終了コードを返す."""
    parser = argparse.ArgumentParser(description="Update Markdown DOCGEN blocks from source code.")
    parser.add_argument(
        "paths", nargs="+", help="Markdown files or glob patterns, e.g. docs/**/*.md"
    )
    parser.add_argument(
        "--check", action="store_true", help="Fail if generated content would change."
    )
    args = parser.parse_args(argv)

    markdown_paths = expand_inputs(args.paths)
    if not markdown_paths:
        sys.stderr.write("DOCGEN error: no Markdown files matched.\n")
        return 2

    changed: list[Path] = []
    warnings: list[str] = []
    try:
        for markdown_path in markdown_paths:
            result = process_markdown_file(markdown_path, root=Path.cwd(), check=args.check)
            warnings.extend(result.warnings)
            if result.changed:
                changed.append(markdown_path)
    except DocgenError as exc:
        sys.stderr.write(f"{exc}\n")
        return 1

    for warning in warnings:
        sys.stderr.write(f"{warning}\n")

    if args.check and changed:
        sys.stderr.write("DOCGEN check failed. Outdated files:\n")
        for path in changed:
            sys.stderr.write(f"- {path}\n")
        sys.stderr.write("Run: python scripts/docgen.py docs/**/*.md\n")
        return 1

    for path in changed:
        sys.stdout.write(f"updated: {path}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
