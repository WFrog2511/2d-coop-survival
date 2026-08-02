"""番号付きドキュメント構成を検証する。"""

import json
from pathlib import Path

# ruff: noqa: S101  # pytestでは構成の観測結果をassertで表現する。

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
SKILLS = ROOT / ".agents" / "skills"
EXPECTED_TOP_LEVEL = {
    "01_project-journal",
    "10_research",
    "15_customer-review",
    "20_requirements",
    "30_specs",
    "40_design",
    "50_adr",
    "60_output",
    "70_delivery",
    "90_archive",
}


def test_docs_top_level_directories_are_numbered() -> None:
    """docs直下のフォルダが番号付き区分だけであることを確認する。"""
    actual = {path.name for path in DOCS.iterdir() if path.is_dir()}

    assert actual == EXPECTED_TOP_LEVEL


def test_canonical_operating_paths_exist() -> None:
    """Skillとhookが参照する正本パスの存在を確認する。"""
    required = {
        DOCS / "01_project-journal" / "knowledge" / "templates" / "knowledge-node.md",
        DOCS / "01_project-journal" / "local-issues" / "README.md",
        DOCS / "01_project-journal" / "playbooks" / "ponytail.md",
        DOCS / "15_customer-review" / "README.md",
        DOCS / "40_design" / "basic" / "README.md",
        DOCS / "40_design" / "detail" / "README.md",
        DOCS / "40_design" / "process" / "docgen.md",
        DOCS / "40_design" / "templates" / "detail-design.md",
        DOCS / "70_delivery" / "templates" / "acceptance-matrix.md",
        DOCS / "70_delivery" / "templates" / "release-readiness.md",
        ROOT / "scripts" / "check_acceptance_matrix.py",
        ROOT / "scripts" / "check_delivery_readiness.py",
        ROOT / "scripts" / "collect_delivery_evidence.py",
        ROOT / "scripts" / "project_preflight.py",
        SKILLS / "manage-delivery-acceptance" / "SKILL.md",
        SKILLS / "prepare-delivery-evidence" / "SKILL.md",
        ROOT / "templates" / "agent-handoff.md",
        ROOT / "templates" / "migration-plan.md",
        ROOT / "templates" / "evidence-plan.json",
    }

    assert all(path.is_file() for path in required)


def test_customer_review_issue_form_uses_dedicated_label() -> None:
    """顧客レビュー用Formが専用ラベルを自動付与することを確認する。"""
    issue_form = ROOT / ".github" / "ISSUE_TEMPLATE" / "customer-review.yml"
    content = issue_form.read_text(encoding="utf-8")

    assert 'labels: ["type:customer-review"]' in content
    assert 'title: "review: "' in content


def test_skill_registry_contains_every_skill_directory() -> None:
    """registryがSkillの追加漏れを検出できることを確認する。"""
    registry = json.loads((SKILLS / "registry.json").read_text(encoding="utf-8"))
    registered = {item["name"] for item in registry["skills"]}
    actual = {path.name for path in SKILLS.iterdir() if (path / "SKILL.md").is_file()}

    assert registered == actual
