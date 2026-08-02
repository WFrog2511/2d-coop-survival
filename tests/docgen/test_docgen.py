"""DOCGENのCLIと変換処理を検証します."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# ruff: noqa: E501, S101  # DOCGEN marker examples intentionally stay on one line.


REPO = Path(__file__).resolve().parents[2]
DOCGEN = REPO / "scripts" / "docgen.py"


def run_docgen(tmp_path: Path, *args: str) -> subprocess.CompletedProcess[str]:
    """一時リポジトリでDOCGENを実行する."""
    return subprocess.run(  # noqa: S603  # 固定したPythonとDOCGENだけを実行する。
        [sys.executable, str(DOCGEN), *args],
        cwd=tmp_path,
        text=True,
        capture_output=True,
        check=False,
    )


def test_python_class_members_updates_markdown(tmp_path: Path) -> None:
    """クラスメンバー一覧でMarkdownを更新する."""
    source = tmp_path / "src" / "user_service.py"
    source.parent.mkdir()
    source.write_text(
        """class UserService:
    def __init__(self, repository: str):
        self.repository = repository

    def create_user(self, name: str, email: str) -> str:
        \"\"\"Create a new user.\"\"\"
        return name

    def _validate_email(self, email: str) -> bool:
        return True
""",
        encoding="utf-8",
    )
    doc = tmp_path / "docs" / "api.md"
    doc.parent.mkdir()
    doc.write_text(
        "# API\n\n"
        "<!-- DOCGEN:START source=src/user_service.py transform=python_class_members target=UserService include_private=false -->\n"
        "<!-- DOCGEN:END -->\n",
        encoding="utf-8",
    )

    result = run_docgen(tmp_path, "docs/**/*.md")

    assert result.returncode == 0, result.stderr
    text = doc.read_text(encoding="utf-8")
    assert "`create_user`" in text
    assert "Create a new user." in text
    assert "`_validate_email`" not in text


def test_check_fails_when_markdown_is_outdated(tmp_path: Path) -> None:
    """同期差分がある場合にcheckを失敗させる."""
    source = tmp_path / "src" / "models.py"
    source.parent.mkdir()
    source.write_text("class Appointment:\n    id: str\n", encoding="utf-8")
    doc = tmp_path / "docs" / "detail.md"
    doc.parent.mkdir()
    doc.write_text(
        "<!-- DOCGEN:START source=src/models.py transform=python_dataclass_fields target=Appointment -->\n"
        "<!-- DOCGEN:END -->\n",
        encoding="utf-8",
    )

    result = run_docgen(tmp_path, "--check", "docs/**/*.md")

    assert result.returncode == 1
    assert "Outdated files" in result.stderr


def test_missing_class_reports_available_classes(tmp_path: Path) -> None:
    """対象クラス不在時に利用可能なクラスを報告する."""
    source = tmp_path / "src" / "services.py"
    source.parent.mkdir()
    source.write_text("class AccountService:\n    pass\n", encoding="utf-8")
    doc = tmp_path / "docs" / "api.md"
    doc.parent.mkdir()
    doc.write_text(
        "<!-- DOCGEN:START source=src/services.py transform=python_class_members target=UserService -->\n"
        "<!-- DOCGEN:END -->\n",
        encoding="utf-8",
    )

    result = run_docgen(tmp_path, "docs/**/*.md")

    assert result.returncode == 1
    assert "Class not found: UserService" in result.stderr
    assert "AccountService" in result.stderr


def test_python_api_routes_updates_markdown(tmp_path: Path) -> None:
    """FastAPIルート一覧でMarkdownを更新する."""
    source = tmp_path / "src" / "api.py"
    source.parent.mkdir()
    source.write_text(
        """from fastapi import APIRouter

from app.models import UserResponse

router = APIRouter(prefix=\"/api/users\", tags=[\"users\"])


@router.get(\"/{user_id}\", response_model=UserResponse)
def get_user(user_id: str) -> UserResponse:
    \"\"\"Get a user by id.\"\"\"
    raise NotImplementedError


@router.post(\"\", response_model=UserResponse)
def create_user() -> UserResponse:
    \"\"\"Create a user.\"\"\"
    raise NotImplementedError
""",
        encoding="utf-8",
    )
    doc = tmp_path / "docs" / "api.md"
    doc.parent.mkdir()
    doc.write_text(
        "<!-- DOCGEN:START source=src/api.py transform=python_api_routes target=* -->\n"
        "<!-- DOCGEN:END -->\n",
        encoding="utf-8",
    )

    result = run_docgen(tmp_path, "docs/**/*.md")

    assert result.returncode == 0, result.stderr
    text = doc.read_text(encoding="utf-8")
    assert "`GET`" in text
    assert "`/api/users/{user_id}`" in text
    assert "`POST`" in text
    assert "`/api/users`" in text
    assert "`UserResponse`" in text
    assert "Get a user by id." in text


def test_python_api_routes_target_filters_function(tmp_path: Path) -> None:
    """target指定で出力対象関数を絞り込む."""
    source = tmp_path / "src" / "api.py"
    source.parent.mkdir()
    source.write_text(
        """from fastapi import APIRouter

router = APIRouter(prefix=\"/api\")


@router.get(\"/public\")
def public_route() -> dict[str, str]:
    \"\"\"Public route.\"\"\"
    return {}


@router.get(\"/internal\")
def internal_route() -> dict[str, str]:
    \"\"\"Internal route.\"\"\"
    return {}
""",
        encoding="utf-8",
    )
    doc = tmp_path / "docs" / "api.md"
    doc.parent.mkdir()
    doc.write_text(
        "<!-- DOCGEN:START source=src/api.py transform=python_api_routes target=public_route -->\n"
        "<!-- DOCGEN:END -->\n",
        encoding="utf-8",
    )

    result = run_docgen(tmp_path, "docs/**/*.md")

    assert result.returncode == 0, result.stderr
    text = doc.read_text(encoding="utf-8")
    assert "public_route" in text
    assert "internal_route" not in text


def test_docgen_todo_promotes_when_source_exists(tmp_path: Path) -> None:
    """実装済みTODOブロックを通常ブロックへ昇格する."""
    source = tmp_path / "src" / "models.py"
    source.parent.mkdir()
    source.write_text("class Appointment:\n    id: str\n", encoding="utf-8")
    doc = tmp_path / "docs" / "detail.md"
    doc.parent.mkdir()
    doc.write_text(
        "<!-- DOCGEN_TODO:START source=src/models.py transform=python_dataclass_fields target=Appointment -->\n"
        "実装後にフィールド一覧を自動生成する。\n"
        "<!-- DOCGEN_TODO:END -->\n",
        encoding="utf-8",
    )

    result = run_docgen(tmp_path, "docs/**/*.md")

    assert result.returncode == 0, result.stderr
    text = doc.read_text(encoding="utf-8")
    assert "<!-- DOCGEN:START" in text
    assert "<!-- DOCGEN:END -->" in text
    assert "DOCGEN_TODO" not in text
    assert "`id`" in text


def test_docgen_todo_warns_and_keeps_block_when_source_is_missing(tmp_path: Path) -> None:
    """未実装TODOブロックを警告付きで維持する."""
    doc = tmp_path / "docs" / "detail.md"
    doc.parent.mkdir()
    original = (
        "<!-- DOCGEN_TODO:START source=src/missing.py transform=python_dataclass_fields target=Appointment -->\n"
        "実装後にフィールド一覧を自動生成する。\n"
        "<!-- DOCGEN_TODO:END -->\n"
    )
    doc.write_text(original, encoding="utf-8")

    result = run_docgen(tmp_path, "docs/**/*.md")

    assert result.returncode == 0, result.stderr
    assert "DOCGEN warning" in result.stderr
    assert "left unchanged" in result.stderr
    assert doc.read_text(encoding="utf-8") == original


def test_synced_docgen_still_fails_when_source_is_missing(tmp_path: Path) -> None:
    """同期対象の実装が消えた場合はエラーにする."""
    doc = tmp_path / "docs" / "detail.md"
    doc.parent.mkdir()
    doc.write_text(
        "<!-- DOCGEN:START source=src/missing.py transform=python_dataclass_fields target=Appointment -->\n"
        "<!-- DOCGEN:END -->\n",
        encoding="utf-8",
    )

    result = run_docgen(tmp_path, "docs/**/*.md")

    assert result.returncode == 1
    assert "DOCGEN error" in result.stderr
    assert "missing.py" in result.stderr
