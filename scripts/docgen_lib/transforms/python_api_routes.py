"""FastAPIルート定義をMarkdown表へ変換します."""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

from docgen_lib.python_ast import first_docstring_line, load_module
from docgen_lib.transforms.python_class_members import cell

HTTP_METHODS = {"delete", "get", "patch", "post", "put"}


@dataclass(frozen=True)
class ApiRouteInfo:
    """FastAPIルートからMarkdownへ同期するための情報です."""

    method: str
    path: str
    function_name: str
    response_model: str
    description: str


def python_api_routes(source_path: Path, target: str, options: dict[str, str]) -> str:
    """FastAPIルート定義をMarkdown表へ変換します."""
    _ = options
    module = load_module(source_path)
    routes = api_routes(module.tree)
    if target != "*":
        routes = [route for route in routes if route.function_name == target]
    if not routes:
        available = "\n".join(f"- {route.function_name}" for route in api_routes(module.tree))
        available = available or "- (none)"
        message = f"API route not found: {target}\nAvailable route functions:\n{available}"
        raise LookupError(message)

    rows = [
        "| Method | Path | Function | Response Model | Description |",
        "|---|---|---|---|---|",
    ]
    rows.extend(api_route_row(route) for route in routes)
    return "\n".join(rows)


def api_route_row(route: ApiRouteInfo) -> str:
    """APIルート1件をMarkdown表の行へ変換します."""
    return (
        "| "
        f"`{route.method}` | "
        f"`{cell(route.path)}` | "
        f"`{cell(route.function_name)}` | "
        f"`{cell(route.response_model)}` | "
        f"{cell(route.description)} |"
    )


def api_routes(tree: ast.Module) -> list[ApiRouteInfo]:
    """モジュール内のAPIRouterデコレータからルート一覧を抽出します."""
    router_prefixes = collect_router_prefixes(tree)
    routes: list[ApiRouteInfo] = []
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        for decorator in node.decorator_list:
            route = route_from_decorator(decorator, router_prefixes, node)
            if route is not None:
                routes.append(route)
    return routes


def collect_router_prefixes(tree: ast.Module) -> dict[str, str]:
    """APIRouter変数名とprefixを収集します."""
    prefixes: dict[str, str] = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not isinstance(node.value, ast.Call) or not is_api_router_call(node.value):
            continue
        prefix = keyword_text(node.value, "prefix") or ""
        for target in node.targets:
            if isinstance(target, ast.Name):
                prefixes[target.id] = prefix
    return prefixes


def is_api_router_call(node: ast.Call) -> bool:
    """APIRouter生成呼び出しかどうかを判定します."""
    func = node.func
    if isinstance(func, ast.Name):
        return func.id == "APIRouter"
    if isinstance(func, ast.Attribute):
        return func.attr == "APIRouter"
    return False


def route_from_decorator(
    decorator: ast.AST,
    router_prefixes: dict[str, str],
    function_node: ast.FunctionDef | ast.AsyncFunctionDef,
) -> ApiRouteInfo | None:
    """ルートデコレータをApiRouteInfoへ変換します."""
    if not isinstance(decorator, ast.Call):
        return None
    func = decorator.func
    if not isinstance(func, ast.Attribute) or func.attr.lower() not in HTTP_METHODS:
        return None
    if not isinstance(func.value, ast.Name) or func.value.id not in router_prefixes:
        return None

    relative_path = route_path_text(decorator)
    if relative_path is None:
        return None
    prefix = router_prefixes[func.value.id]
    response_model = keyword_text(decorator, "response_model") or ""
    return ApiRouteInfo(
        method=func.attr.upper(),
        path=join_paths(prefix, relative_path),
        function_name=function_node.name,
        response_model=response_model,
        description=first_docstring_line(function_node),
    )


def route_path_text(node: ast.Call) -> str | None:
    """デコレータ引数からAPIパス文字列を取得します."""
    if node.args:
        return literal_string(node.args[0])
    for keyword in node.keywords:
        if keyword.arg == "path":
            return literal_string(keyword.value)
    return None


def keyword_text(node: ast.Call, name: str) -> str:
    """キーワード引数を文字列化します."""
    for keyword in node.keywords:
        if keyword.arg == name:
            value = literal_string(keyword.value)
            return value if value is not None else ast.unparse(keyword.value)
    return ""


def literal_string(node: ast.AST) -> str | None:
    """文字列リテラルなら値を返します."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def join_paths(prefix: str, path: str) -> str:
    """FastAPIのprefixと相対パスを表示用に結合します."""
    if not prefix:
        return path
    if not path:
        return prefix
    return f"{prefix.rstrip('/')}/{path.lstrip('/')}"
