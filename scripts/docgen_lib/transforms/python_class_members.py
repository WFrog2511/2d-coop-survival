"""Pythonクラス情報をMarkdown表へ変換します."""

from __future__ import annotations

from pathlib import Path

from docgen_lib.python_ast import class_members, dataclass_fields, load_module


def option_bool(options: dict[str, str], name: str, *, default: bool) -> bool:
    """文字列オプションを真偽値として取得する."""
    value = options.get(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def cell(value: str) -> str:
    """Markdown表セル用に文字列をエスケープする."""
    return value.replace("|", "\\|").replace("\n", " ")


def python_class_members(source_path: Path, target: str, options: dict[str, str]) -> str:
    """クラスメンバーをMarkdown表へ変換する."""
    module = load_module(source_path)
    include_private = option_bool(options, "include_private", default=True)
    include_docstring = option_bool(options, "include_docstring", default=True)
    members = class_members(module, target)
    if not include_private:
        members = [member for member in members if not member.is_private]

    rows = ["| Member | Kind | Signature | Description |", "|---|---|---|---|"]
    for member in members:
        description = member.description if include_docstring else ""
        rows.append(
            f"| `{cell(member.name)}` | {cell(member.kind)} | "
            f"`{cell(member.signature)}` | {cell(description)} |"
        )
    return "\n".join(rows)


def python_dataclass_fields(source_path: Path, target: str, options: dict[str, str]) -> str:
    """データクラスのフィールドをMarkdown表へ変換する."""
    module = load_module(source_path)
    include_private = option_bool(options, "include_private", default=False)
    fields = dataclass_fields(module, target)
    if not include_private:
        fields = [field for field in fields if not field.is_private]

    rows = ["| Field | Type | Default | Description |", "|---|---|---|---|"]
    for field in fields:
        default = field.default or ""
        rows.append(
            f"| `{cell(field.name)}` | `{cell(field.type_name)}` | "
            f"`{cell(default)}` | {cell(field.description)} |"
        )
    return "\n".join(rows)
