"""DOCGENマーカーを解析してMarkdownを同期します."""

from __future__ import annotations

import re
import shlex
from dataclasses import dataclass, field
from pathlib import Path

from docgen_lib.transforms import run_transform

START_RE = re.compile(r"^<!--\s*DOCGEN(?P<todo>_TODO)?:START\s+(?P<attrs>.*?)\s*-->\s*$")
END_RE = re.compile(r"^<!--\s*DOCGEN(?P<todo>_TODO)?:END\s*-->\s*$")


class DocgenError(Exception):
    """人間が修正できるDOCGENエラーを表す。"""


@dataclass(frozen=True)
class DocgenBlock:
    """DOCGENブロックの解析結果です."""

    source: Path
    transform: str
    target: str
    options: dict[str, str]
    markdown_path: Path
    start_line: int


@dataclass(frozen=True)
class ProcessResult:
    """Markdown同期処理の結果です."""

    changed: bool
    warnings: tuple[str, ...] = field(default_factory=tuple)


def parse_attrs(raw_attrs: str, markdown_path: Path, line_no: int) -> dict[str, str]:
    """DOCGENマーカーの属性を解析する."""
    try:
        parts = shlex.split(raw_attrs, posix=True)
    except ValueError as exc:
        message = f"DOCGEN error in {markdown_path}:{line_no}\nInvalid marker attributes: {exc}"
        raise DocgenError(message) from exc

    attrs: dict[str, str] = {}
    for part in parts:
        if "=" not in part:
            message = (
                f"DOCGEN error in {markdown_path}:{line_no}\n"
                f"Invalid attribute `{part}`. Use key=value."
            )
            raise DocgenError(message)
        key, value = part.split("=", 1)
        attrs[key.strip()] = value.strip()

    for required in ("source", "transform", "target"):
        if not attrs.get(required):
            message = (
                f"DOCGEN error in {markdown_path}:{line_no}\n"
                f"Missing required attribute: {required}"
            )
            raise DocgenError(message)
    return attrs


def build_block(
    attrs: dict[str, str], markdown_path: Path, root: Path, line_no: int
) -> DocgenBlock:
    """解析済み属性からDOCGENブロックを構築する."""
    options = dict(attrs)
    source = options.pop("source")
    transform = options.pop("transform")
    target = options.pop("target")
    return DocgenBlock(
        source=(root / source).resolve(),
        transform=transform,
        target=target,
        options=options,
        markdown_path=markdown_path,
        start_line=line_no,
    )


def canonical_start_marker(raw_attrs: str) -> str:
    """同期済みDOCGENブロックの開始コメントを返す。"""
    return f"<!-- DOCGEN:START {raw_attrs} -->"


def canonical_end_marker() -> str:
    """同期済みDOCGENブロックの終了コメントを返す。"""
    return "<!-- DOCGEN:END -->"


def process_markdown_file(  # noqa: C901, PLR0915  # 状態機械を一か所で追跡可能に保つ。
    markdown_path: Path,
    root: Path,
    *,
    check: bool = False,
) -> ProcessResult:
    """Markdown内のDOCGENブロックを検査または同期する."""
    original = markdown_path.read_text(encoding="utf-8")
    lines = original.splitlines()
    output: list[str] = []
    warnings: list[str] = []
    index = 0
    changed = False
    in_code_fence = False

    while index < len(lines):
        line = lines[index]
        stripped = line.lstrip()
        if stripped.startswith(("```", "~~~")):
            in_code_fence = not in_code_fence
            output.append(line)
            index += 1
            continue

        start_match = None if in_code_fence else START_RE.match(line)
        if not start_match:
            if not in_code_fence and END_RE.match(line):
                message = (
                    f"DOCGEN error in {markdown_path}:{index + 1}\nDOCGEN:END without DOCGEN:START"
                )
                raise DocgenError(message)
            output.append(line)
            index += 1
            continue

        start_line_no = index + 1
        is_todo = start_match.group("todo") is not None
        raw_attrs = start_match.group("attrs")
        end_index = index + 1
        while end_index < len(lines) and not END_RE.match(lines[end_index]):
            if START_RE.match(lines[end_index]):
                message = (
                    f"DOCGEN error in {markdown_path}:{end_index + 1}\n"
                    "Nested DOCGEN:START is not allowed."
                )
                raise DocgenError(message)
            end_index += 1
        if end_index >= len(lines):
            message = f"DOCGEN error in {markdown_path}:{start_line_no}\nDOCGEN:END not found"
            raise DocgenError(message)

        try:
            attrs = parse_attrs(raw_attrs, markdown_path, start_line_no)
            block = build_block(attrs, markdown_path, root, start_line_no)
            generated = run_transform(block)
        except DocgenError as exc:
            if not is_todo:
                raise
            warnings.append(
                f"DOCGEN warning in {markdown_path}:{start_line_no}\n"
                "DOCGEN_TODO block is not ready yet and was left unchanged.\n"
                f"{exc}"
            )
            output.extend(lines[index : end_index + 1])
            index = end_index + 1
            continue

        replacement = [canonical_start_marker(raw_attrs) if is_todo else line]
        if generated:
            replacement.extend(generated.rstrip("\n").splitlines())
        replacement.append(canonical_end_marker() if is_todo else lines[end_index])

        current = lines[index : end_index + 1]
        if current != replacement:
            changed = True
        output.extend(replacement)
        index = end_index + 1

    new_text = "\n".join(output) + ("\n" if original.endswith("\n") else "")
    if changed and not check:
        markdown_path.write_text(new_text, encoding="utf-8", newline="\n")
    return ProcessResult(changed=changed, warnings=tuple(warnings))
