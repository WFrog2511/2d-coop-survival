# 2D協力メカサバイバル

ブラウザから1〜4人で参加し、視界と情報を共有しながら暴走機械群に対処して全員生還を目指す、見下ろし型2D協力サバイバルゲームです。現在のローカル1人用prototypeは、各2分30秒の3 combat waveとその間の各1分rest（既定09:30 run）、finite ammo、壁visibility、60秒directional spawnに加え、初期8体から12体への段階投入、死角recycle、基本敵の分散経路を実装しています。

合意済みの範囲は[Definition of Delivery Issue #12](https://github.com/WFrog2511/2d-coop-survival/issues/12)、[combat-choice-v1要件](docs/20_requirements/combat-choice-v1.md)、[Issue #22 DOD comment](https://github.com/WFrog2511/2d-coop-survival/issues/22#issuecomment-5222574276)、[directional-spawn-v1要件](docs/20_requirements/directional-spawn-v1.md)、[wave-progression-v1要件](docs/20_requirements/wave-progression-v1.md)を参照してください。[docs/企画書.md](docs/企画書.md)は企画入力であり、完了判断の正本ではありません。

## 正本と入口

| パス | 位置付け |
| --- | --- |
| [docs/企画書.md](docs/企画書.md) | 今回の企画入力。合意済み要件・完了判断の正本ではない |
| [AGENTS.md](AGENTS.md) | Agentが守る開発・承認・品質規約 |
| [docs/README.md](docs/README.md) | 正本ドキュメントの配置案内 |
| [docs/20_requirements/](docs/20_requirements/README.md) | 人間確認後の要件・受け入れ条件 |
| [docs/30_specs/](docs/30_specs/README.md) | 実装とテストが参照する検証可能な仕様 |
| [docs/01_project-journal/local-issues/](docs/01_project-journal/local-issues/README.md) | GitHubを使えない単独作業時の一時Issueと移行履歴 |

task、decision、question、customer-review、承認、PRの正本は[GitHub Issues](https://github.com/WFrog2511/2d-coop-survival/issues)とPRです。ローカルIssueはGitHubを使えない単独作業時だけ利用し、復帰後に移行します。

## 技術構成

現在のブラウザprototypeで使用中の構成は、クライアントのTypeScript、Phaser、Vite、HTML、CSSと、Vitest・Playwrightによるテストです。Node.js 22系とpnpm 10.33.2を使用します。

サーバーのTypeScript/Node.js/Colyseus、pnpm workspace、Zod、共有型・ゲームデータ、Colyseus統合テストは将来候補であり、現在のブラウザprototypeには含めません。導入時期と対応バージョンは、対象範囲を拡張するDefinition of Deliveryで決めます。

## 起動

初回にGit hookを有効にします。

```powershell
git config core.hooksPath .githooks
```

依存をlockfileどおりに導入し、開発サーバーを起動します。

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Viteが表示するローカルURL（通常は`http://127.0.0.1:5173/`）をPCブラウザで開きます。

## 操作

- 開始: 役職を1つ選択して「開始」ボタンを押す（現時点ではHUD表示だけ）
- 移動: WASD または矢印キー
- 回避: Space または Shift（照準方向へ80px、再使用待ち2秒）
- 武器: 1 アサルトライフル（左ボタン長押しで自動射撃） / 2 ショットガン（1クリック1射）
- 照準: マウス移動
- リロード: R（選択武器の残弾を補充。リロード中の射撃不可）
- 弾薬箱: 3x3近傍で表示されるE案内中にEで取得
- 敵balance: 基本敵HP4。高速ドローンは高速だがHP2で、ライフル1発で撃破可能
- Canvas HUD: 上中央はWave・夜（戦闘）/昼（休憩）・現在フェーズ残り、右上はキル数、player HPは左下、ammoは右下
- 再挑戦: 敗北表示の「再挑戦」ボタン

## TypeScript品質ゲート

profileと変更駆動gateは[AGENTS.md](AGENTS.md)を正本にします。TypeScript品質を変更する前に、lockfileどおりの依存を導入します。

```powershell
pnpm install --frozen-lockfile
pnpm check
# TypeScriptコメント/JSDocだけを直接確認する場合
corepack pnpm exec node scripts/check_typescript_comments.mjs .
# bundle / Vite runtime変更時だけ、pnpm checkの後に実行する
pnpm build:bundle
```

`pnpm check`はlint、typecheck、TypeScript日本語コメント規則、unitを内包する最終treeのcanonical full gateです。同じtreeへ`pnpm lint`、`pnpm typecheck`、`pnpm test`を重ねません。`pnpm build`は後方互換用でtypecheckを再実行するため、PR検証では`pnpm build:bundle`を使います。`pnpm lint:fix`は安全なlint修正、`pnpm format`はESLintのlayout修正だけを適用します。

pre-commit hookは`git diff --cached --check`、staged Python日本語コメント、staged TypeScriptコメント/JSDoc、staged acceptance matrixを検査し、Node.js 22のCorepackで`corepack pnpm lint`と`corepack pnpm typecheck`も実行します。いずれかが失敗するとcommitは中止されます。tests、bundle、E2E、全docs link、DOCGENはhookへ入れず、PR前の変更駆動gateで実行します。人間向けのTypeScriptコメントとJSDocには日本語を1文字以上含めます。ESLint、TypeScript、triple-slash、coverage、formatter、shebang、generatedのdirectiveは対象外です。

`pnpm test:e2e`はPlaywright Chromiumを使います。Google Chrome最新版での武器操作は[GitHub Issue #14](https://github.com/WFrog2511/2d-coop-survival/issues/14)、高速ドローンによる撃破優先度は[GitHub Issue #15](https://github.com/WFrog2511/2d-coop-survival/issues/15)、自動生成マップでの移動と遮蔽物判断は[GitHub Issue #17](https://github.com/WFrog2511/2d-coop-survival/issues/17)で人間確認しました。

### E2Eテストを画面で確認する

初回だけPlaywright Chromiumをインストールします。

```powershell
pnpm exec playwright install chromium
```

通常のE2Eテストはブラウザを表示しないheadlessモードで実行します。

```powershell
pnpm test:e2e
```

実際のブラウザ操作を表示する場合はheadedモードを使います。代表E2Eは、初期8体と3/6/9/12秒の段階投入、strict hidden spawn、60秒directional spawn phase、combat/rest境界と敵のcurrent phase respawn、時間/HP/ammo overlayを観測しながら、visibility、移動、射撃、有限弾薬、リロード、弾薬箱respawn、09:30既定runの勝利、敗北、retryを確認します。

```powershell
pnpm test:e2e --headed --workers=1
```

テストコード、実行ステップ、ブラウザ表示を一緒に確認する場合はUIモードを使います。Playwright画面で`prototype.spec.ts`の再生ボタンを押してください。

```powershell
pnpm test:e2e --ui
```

1ステップずつ停止しながら確認する場合はdebugモードを使います。

```powershell
pnpm test:e2e --debug
```

いずれのモードも`playwright.config.ts`がViteを`http://127.0.0.1:4173`で自動起動するため、別のターミナルで`pnpm dev`を起動する必要はありません。Node.jsまたはpnpmのバージョン警告が出る環境では、各コマンドの`pnpm`を`corepack pnpm`へ置き換えてください。Windowsで`pnpm exec playwright`が見つからない場合は、Chromium導入コマンドだけ`.\node_modules\.bin\playwright.cmd install chromium`を使用できます。

## Python・文書検査

既存の開発ツールはPython 3.10以上を使います。WindowsでUTF-8のSkillや文書を検査するときは`-X utf8`を付けます。

```powershell
python -X utf8 -m pytest
python -X utf8 scripts/check_japanese_comments.py .
python -X utf8 scripts/check_markdown_links.py docs
python -X utf8 scripts/docgen.py --check "docs/40_design/detail/**/*.md"
```

## Repository Skills

Codexが自動検出できるよう、Skillsは[.agents/skills/](.agents/skills/)に置きます。

| Skill | 用途 |
| --- | --- |
| [github-issue-development](.agents/skills/github-issue-development/SKILL.md) | GitHub IssueとPRを正本にした開発 |
| [ponytail](.agents/skills/ponytail/SKILL.md) | 既存資産と標準機能を優先する最小実装判断 |
| [manage-project-knowledge](.agents/skills/manage-project-knowledge/SKILL.md) | 根拠付きKnowledgeとLLM-Wiki候補の管理 |
| [manage-delivery-acceptance](.agents/skills/manage-delivery-acceptance/SKILL.md) | 受け入れマトリクスと顧客確認の管理 |
| [prepare-delivery-evidence](.agents/skills/prepare-delivery-evidence/SKILL.md) | 納品前診断、三層判定、証跡収集 |
| [sync-detail-design-docgen](.agents/skills/sync-detail-design-docgen/SKILL.md) | コード由来の詳細設計情報の同期 |

## ライセンス

このプロジェクトが著作権を持つコードと文書は[MIT License](LICENSE)で公開します。第三者著作物はルートMITへ再ライセンスされず、[Third-Party Notices](THIRD_PARTY_NOTICES.md)と各同梱ライセンスの条件が優先されます。

ゲーム素材はまだ含まれていません。外部のスプライト、音源、フォント等は自作またはCC0を基本とし、出所、作者、ライセンス、帰属表示、変更内容を記録してから追加します。詳細は[公開リポジトリ向けライセンス調査](docs/10_research/2026-08-02_public-license-review.md)を参照してください。

## 開発フレームワーク

- [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/): task / decision / question / customer-reviewのIssue Forms
- [.githooks/pre-commit](.githooks/pre-commit): staged diff、Python/TypeScript日本語、受け入れマトリクスとCorepack lint/typecheckのcommit時検査
- [.codex/](.codex/config.toml): trustedな新しいtaskで有効になる固定Luna Max planner/reviewer・sole writer設定
- [templates/](templates/): Definition of Delivery、PR、証跡、closeout、Agent引き継ぎ
- [scripts/](scripts/): 文書・設計・受け入れ・納品証跡の機械検査
- [third_party/ponytail/LICENSE](third_party/ponytail/LICENSE): Ponytail由来部分のMITライセンス

GitHub Actions、Branch Protection、デプロイ設定、プロダクト固有の自動化は、必要性と運用先が確定してから追加します。
