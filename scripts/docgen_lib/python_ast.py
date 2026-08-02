"""Python ASTからDOCGEN向けの構造情報を抽出します."""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class MemberInfo:
    """クラスメンバーの表示情報です."""

    name: str
    kind: str
    signature: str
    description: str
    is_private: bool


@dataclass(frozen=True)
class FieldInfo:
    """データフィールドの表示情報です."""

    name: str
    type_name: str
    default: str
    description: str
    is_private: bool


@dataclass(frozen=True)
class PythonModule:
    """解析済みPythonモジュールです."""

    path: Path
    source: str
    tree: ast.Module


def load_module(path: Path) -> PythonModule:
    """Pythonソースを読み込んでASTを解析する."""
    if not path.exists():
        message = f"Source file not found: {path}"
        raise FileNotFoundError(message)
    source = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        message = f"Python syntax error in {path}:{exc.lineno}: {exc.msg}"
        raise SyntaxError(message) from exc
    return PythonModule(path=path, source=source, tree=tree)


def class_names(module: PythonModule) -> list[str]:
    """モジュール直下のクラス名を返す."""
    return [node.name for node in module.tree.body if isinstance(node, ast.ClassDef)]


def find_class(module: PythonModule, target: str) -> ast.ClassDef | None:
    """指定名のクラス定義を探す."""
    for node in module.tree.body:
        if isinstance(node, ast.ClassDef) and node.name == target:
            return node
    return None


def get_class_or_raise(module: PythonModule, target: str) -> ast.ClassDef:
    """指定クラスを返し、不在時は候補付きで失敗する."""
    node = find_class(module, target)
    if node is not None:
        return node
    available = "\n".join(f"- {name}" for name in class_names(module)) or "- (none)"
    message = f"Class not found: {target}\nAvailable classes:\n{available}"
    raise LookupError(message)


def class_source(module: PythonModule, target: str) -> str:
    """指定クラスのソース断片を返す."""
    node = get_class_or_raise(module, target)
    segment = ast.get_source_segment(module.source, node)
    if segment is None:
        lines = module.source.splitlines()
        return "\n".join(lines[node.lineno - 1 : node.end_lineno])
    return segment


def _annotation_text(node: ast.AST | None) -> str:
    return "" if node is None else ast.unparse(node)


def _default_text(node: ast.AST | None) -> str:
    return "" if node is None else ast.unparse(node)


def function_signature(  # noqa: C901  # Python引数形式を一つの順序で組み立てる。
    node: ast.FunctionDef | ast.AsyncFunctionDef,
) -> str:
    """関数定義から表示用シグネチャを生成する."""
    args = node.args
    positional = list(args.posonlyargs) + list(args.args)
    defaults: list[ast.AST | None] = [None] * (len(positional) - len(args.defaults)) + list(
        args.defaults
    )
    parts: list[str] = []
    for arg, default in zip(positional, defaults, strict=True):
        if arg.arg in {"self", "cls"}:
            continue
        text = arg.arg
        annotation = _annotation_text(arg.annotation)
        if annotation:
            text += f": {annotation}"
        default_text = _default_text(default)
        if default_text:
            text += f" = {default_text}"
        parts.append(text)
    if args.vararg:
        text = f"*{args.vararg.arg}"
        annotation = _annotation_text(args.vararg.annotation)
        if annotation:
            text += f": {annotation}"
        parts.append(text)
    for arg, default in zip(args.kwonlyargs, args.kw_defaults, strict=True):
        text = arg.arg
        annotation = _annotation_text(arg.annotation)
        if annotation:
            text += f": {annotation}"
        default_text = _default_text(default)
        if default_text:
            text += f" = {default_text}"
        parts.append(text)
    if args.kwarg:
        text = f"**{args.kwarg.arg}"
        annotation = _annotation_text(args.kwarg.annotation)
        if annotation:
            text += f": {annotation}"
        parts.append(text)
    signature = f"({', '.join(parts)})"
    returns = _annotation_text(node.returns)
    if returns:
        signature += f" -> {returns}"
    return signature


def first_docstring_line(node: ast.AST) -> str:
    """docstringの最初の非空行を返す."""
    docstring = ast.get_docstring(node) or ""
    for line in docstring.strip().splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def is_private_name(name: str) -> bool:
    """名前が非公開メンバーを表すか返す."""
    if name == "__init__":
        return False
    return name.startswith("_")


def class_members(module: PythonModule, target: str) -> list[MemberInfo]:
    """指定クラスのメンバー情報を抽出する."""
    node = get_class_or_raise(module, target)
    members: list[MemberInfo] = []
    for child in node.body:
        if isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef):
            members.append(
                MemberInfo(
                    name=child.name,
                    kind="async method" if isinstance(child, ast.AsyncFunctionDef) else "method",
                    signature=function_signature(child),
                    description=first_docstring_line(child),
                    is_private=is_private_name(child.name),
                )
            )
        elif isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name):
            members.append(
                MemberInfo(
                    name=child.target.id,
                    kind="attribute",
                    signature=_annotation_text(child.annotation),
                    description="",
                    is_private=is_private_name(child.target.id),
                )
            )
        elif isinstance(child, ast.Assign):
            members.extend(
                MemberInfo(
                    name=target_node.id,
                    kind="attribute",
                    signature="",
                    description="",
                    is_private=is_private_name(target_node.id),
                )
                for target_node in child.targets
                if isinstance(target_node, ast.Name)
            )
    return members


def field_description(value: ast.AST | None) -> str:
    """field呼び出しから説明文を抽出する."""
    if not isinstance(value, ast.Call):
        return ""
    for keyword in value.keywords:
        if keyword.arg == "description" and isinstance(keyword.value, ast.Constant):
            return str(keyword.value.value)
        if keyword.arg == "metadata" and isinstance(keyword.value, ast.Dict):
            for key, val in zip(keyword.value.keys, keyword.value.values, strict=True):
                if (
                    isinstance(key, ast.Constant)
                    and key.value == "description"
                    and isinstance(val, ast.Constant)
                ):
                    return str(val.value)
    return ""


def dataclass_fields(module: PythonModule, target: str) -> list[FieldInfo]:
    """指定クラスから型付きフィールド情報を抽出する."""
    node = get_class_or_raise(module, target)
    return [
        FieldInfo(
            name=child.target.id,
            type_name=_annotation_text(child.annotation),
            default=_default_text(child.value),
            description=field_description(child.value),
            is_private=is_private_name(child.target.id),
        )
        for child in node.body
        if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name)
    ]
