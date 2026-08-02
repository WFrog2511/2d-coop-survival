"""DOCGEN変換関数の登録と実行境界を提供します."""

from __future__ import annotations

from typing import TYPE_CHECKING

from docgen_lib.transforms.python_api_routes import python_api_routes
from docgen_lib.transforms.python_class_members import (
    python_class_members,
    python_dataclass_fields,
)
from docgen_lib.transforms.python_class_source import python_class_source

if TYPE_CHECKING:
    from docgen_lib.markdown import DocgenBlock

TRANSFORMS = {
    "python_class_source": python_class_source,
    "python_class_members": python_class_members,
    "python_dataclass_fields": python_dataclass_fields,
    "python_api_routes": python_api_routes,
}


def run_transform(block: DocgenBlock) -> str:
    """指定された変換を実行し、共通形式のエラーへ変換する."""
    from docgen_lib.markdown import DocgenError

    transform = TRANSFORMS.get(block.transform)
    if transform is None:
        available = "\n".join(f"- {name}" for name in sorted(TRANSFORMS))
        message = (
            f"DOCGEN error in {block.markdown_path}:{block.start_line}\n"
            f"source: {block.source}\n"
            f"transform: {block.transform}\n"
            f"target: {block.target}\n"
            f"Unknown transform: {block.transform}\n"
            f"Available transforms:\n{available}"
        )
        raise DocgenError(message)
    try:
        return transform(block.source, block.target, block.options)
    except Exception as exc:
        message = (
            f"DOCGEN error in {block.markdown_path}:{block.start_line}\n"
            f"source: {block.source}\n"
            f"transform: {block.transform}\n"
            f"target: {block.target}\n"
            f"{exc}"
        )
        raise DocgenError(message) from exc
