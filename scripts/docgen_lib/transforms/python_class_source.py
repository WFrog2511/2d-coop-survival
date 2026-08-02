"""PythonクラスのソースをMarkdownコードブロックへ変換します."""

from __future__ import annotations

from pathlib import Path

from docgen_lib.python_ast import class_source, load_module


def python_class_source(source_path: Path, target: str, _options: dict[str, str]) -> str:
    """指定クラスのソースをPythonコードブロックとして返す."""
    module = load_module(source_path)
    source = class_source(module, target)
    return f"```python\n{source.rstrip()}\n```"
