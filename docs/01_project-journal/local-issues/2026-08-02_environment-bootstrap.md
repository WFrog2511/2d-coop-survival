# GitHub Issue #1: 開発環境とAgent運用の初期化

> [GitHub Issue #1](https://github.com/WFrog2511/2d-coop-survival/issues/1)へ移行済み。この文書はオフライン作業時の記録として保持する。

## 状態

- 種別: task
- リスク区分: 軽量
- 状態: 完了（GitHub Issue #1へ移行済み）
- 日付: 2026-08-02

## 目的

企画書の機能実装を始める前に、プロジェクトの入口、Agent指示、Repository Skills、Git hook、判断記録を利用可能にする。

## 対象範囲

- READMEをプロジェクトの入口へ更新する。
- Agent用SkillsをCodex検出位置`.agents/skills/`へ配置する。
- Skill registryと相対リンクを新しい配置へ同期する。
- ローカルGitを`main`で初期化し、`.githooks`を有効にする。
- 未合意のDefinition of Deliveryを別decisionとして記録する。

## 対象外

- 初回commit、`develop`または`feature/*` branchの確立
- GitHub repository作成、remote接続、ラベル・Issue・PR作成
- pnpm workspace、プロダクト依存、ゲーム実装の追加
- GitHub Actions、Branch Protection、デプロイ設定

## 受け入れ条件

- [x] README、AGENTS、企画書、正本ドキュメントの関係が明記されている。
- [x] 6つのRepository SkillsをCodexが検出できる配置にし、各Skillの構造検査が成功する。
- [x] JSON、YAML、Markdownリンク、Pythonコメント、既存テストが成功する。
- [x] Git hookの設定値が`.githooks`である。
- [x] Definition of Delivery未承認とGitHub未接続が明記されている。

## 実施結果

- `python -X utf8 -m pytest -q`: 26 passed
- 6 Skillsの`quick_validate.py`: すべて`Skill is valid!`
- Skill registry JSONと6件の`agents/openai.yaml`: parse成功
- `python -X utf8 scripts/check_japanese_comments.py .`: OK
- `python -X utf8 scripts/check_markdown_links.py .`: 52ファイル成功
- `python -X utf8 scripts/docgen.py --check "docs/40_design/detail/**/*.md"`: 成功
- `git config --local --get core.hooksPath`: `.githooks`
- 更新ファイル: UTF-8 BOMなし

## Ponytail確認

- 既存の6 Skills、検査スクリプト、Issue Forms、テンプレートを再利用した。
- Python 3.12用の別環境と依存追加は行わず、`timezone.utc`と子プロセスUTF-8指定で既存Python 3.10へ適合させた。
- pnpm workspace、ゲーム依存、CI、デプロイ設定はDefinition of Delivery承認まで追加しない。
- 追加を再検討する条件: Delivery範囲、対応ランタイム、GitHub repositoryが人間確認されたとき。
## GitHub移行結果

- GitHub Issue: [#1](https://github.com/WFrog2511/2d-coop-survival/issues/1)（completed）
- 初期commit: [`57a39c0`](https://github.com/WFrog2511/2d-coop-survival/commit/57a39c0b154306a84b3c172a9cf2d3258821f0c1)
