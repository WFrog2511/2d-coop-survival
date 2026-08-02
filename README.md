# 2D協力メカサバイバル

ブラウザから1〜4人で参加し、視界と情報を共有しながら暴走機械群に対処して全員生還を目指す、見下ろし型2D協力サバイバルゲームです。

現在は開発環境の初期化段階です。企画内容は [docs/企画書.md](docs/企画書.md) にありますが、まだ合意済み要件やDefinition of Deliveryではありません。プロダクト用の`package.json`、依存パッケージ、実装コードは、最初のDelivery範囲を人間確認してから追加します。

## 正本と入口

| パス | 位置付け |
| --- | --- |
| [docs/企画書.md](docs/企画書.md) | 今回の企画書兼簡易要件定義。合意前の企画入力 |
| [AGENTS.md](AGENTS.md) | Agentが常に守る開発・承認・品質規約 |
| [docs/README.md](docs/README.md) | 正本ドキュメントの配置案内 |
| [docs/20_requirements/](docs/20_requirements/README.md) | 人間確認後の要件・受け入れ条件 |
| [docs/30_specs/](docs/30_specs/README.md) | 実装とテストが参照する検証可能な仕様 |
| [docs/01_project-journal/local-issues/](docs/01_project-journal/local-issues/README.md) | GitHub未接続中だけ使う一時Issue |

GitHub接続後はtask、decision、question、customer-review、承認、PRをGitHub Issue/PRで管理します。ローカルIssueは移行後にGitHubへのリンクへ置き換えます。

## 予定する技術構成

- クライアント: TypeScript、Phaser、Vite、HTML、CSS
- サーバー: TypeScript、Node.js、Colyseus
- 共有: pnpm workspace、Zod、共有型、ゲームルール、ゲームデータ
- テスト: Vitest、Playwright、Colyseus統合テスト

これは企画書上の候補です。ランタイムの対応バージョン、ホスティング先、導入時期はDefinition of Deliveryで確定します。

## ローカル開発環境

既存の開発ツールはPython 3.10以上を使います。WindowsでUTF-8のSkillや文書を検査するときは`-X utf8`を付けます。

```powershell
git --version
node --version
pnpm --version
python --version
```

Git hookを有効にします。

```powershell
git config core.hooksPath .githooks
```

現時点ではプロダクト依存をまだ定義していないため、`pnpm install`は実行しません。既存の開発フレームワークは次で検査できます。

```powershell
python -X utf8 -m pytest
python -X utf8 scripts/check_japanese_comments.py .
python -X utf8 scripts/check_markdown_links.py .
python -X utf8 scripts/docgen.py --check "docs/40_design/detail/**/*.md"
```

## Repository Skills

Codexが自動検出できるよう、Skillsは [.agents/skills/](.agents/skills/) に置きます。

| Skill | 用途 |
| --- | --- |
| [github-issue-development](.agents/skills/github-issue-development/SKILL.md) | GitHub IssueとPRを正本にした開発 |
| [ponytail](.agents/skills/ponytail/SKILL.md) | 既存資産と標準機能を優先する最小実装判断 |
| [manage-project-knowledge](.agents/skills/manage-project-knowledge/SKILL.md) | 根拠付きKnowledgeとLLM-Wiki候補の管理 |
| [manage-delivery-acceptance](.agents/skills/manage-delivery-acceptance/SKILL.md) | 受け入れマトリクスと顧客確認の管理 |
| [prepare-delivery-evidence](.agents/skills/prepare-delivery-evidence/SKILL.md) | 納品前診断、三層判定、証跡収集 |
| [sync-detail-design-docgen](.agents/skills/sync-detail-design-docgen/SKILL.md) | コード由来の詳細設計情報の同期 |

## 実装開始までのゲート

1. [Definition of Deliveryの一時decision](docs/01_project-journal/local-issues/2026-08-02_definition-of-delivery.md)を人間確認する。
2. 初回コミットの対象と除外を確認し、`main`の基準commitを作る。
3. `develop`を作り、以後は`feature/<topic>`から`develop`へPRを出す。
4. GitHub remoteを接続し、ラベルと最初のdecision/task Issueを作る。
5. 承認済み範囲に限ってpnpm workspaceと最初の縦切りを実装する。

段階1〜4の詳細と初期リリース判定基準は [企画書の開発段階](docs/企画書.md#26-開発段階) を参照してください。

## ライセンス

このプロジェクトが著作権を持つコードと文書は [MIT License](LICENSE) で公開します。第三者著作物はルートMITへ再ライセンスされず、[Third-Party Notices](THIRD_PARTY_NOTICES.md)と各同梱ライセンスの条件が優先されます。

ゲーム素材はまだ含まれていません。外部のスプライト、音源、フォント等は自作またはCC0を基本とし、出所、作者、ライセンス、帰属表示、変更内容を記録してから追加します。詳細は [公開リポジトリ向けライセンス調査](docs/10_research/2026-08-02_public-license-review.md) を参照してください。

## 開発フレームワーク

- [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/): task / decision / question / customer-reviewのIssue Forms
- [.githooks/pre-commit](.githooks/pre-commit): Python日本語、受け入れマトリクス、Markdownリンク、DOCGEN差分の検査
- [templates/](templates/): Definition of Delivery、PR、証跡、closeout、Agent引き継ぎ
- [scripts/](scripts/): 文書・設計・受け入れ・納品証跡の機械検査
- [third_party/ponytail/LICENSE](third_party/ponytail/LICENSE): Ponytail由来部分のMITライセンス

GitHub Actions、Branch Protection、デプロイ設定、プロダクト固有の自動化は、必要性と運用先が確定してから追加します。