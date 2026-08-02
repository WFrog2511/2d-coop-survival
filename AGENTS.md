# Agent Instructions

## プロジェクト固有の入口

- `docs/企画書.md` は今回の企画入力であり、合意済み要件、Definition of Delivery、顧客承認の正本として扱わない。
- 人間確認済みの要件と受け入れ条件は `docs/20_requirements/`、検証可能な仕様は `docs/30_specs/` へ反映し、企画書だけを根拠に実装完了を判断しない。
- 企画書の開発段階1〜4を一括で開始せず、承認済みDefinition of Deliveryに対応する最初の縦切りから進める。
- 企画書上のTypeScript、Phaser、Vite、Node.js、Colyseus、pnpm、Zod、Vitest、Playwrightは計画中の構成であり、対応バージョンと導入時期は承認前に固定しない。
- Agent用Skillは `.agents/skills/` に置く。将来のゲームデータ `packages/game-data/skills/` とは用途が異なるため混同しない。

## 正本と開始

- GitHubを利用できる場合、task・decision・question・承認・PRの正本はGitHub IssueとPRに置く。
- 顧客またはプロジェクトオーナーの確認事項は、`type:customer-review` を付けたGitHub Issueを正本にする。一つのIssueには一つの確認事項を書く。
- 作業開始前に既存Issue、関連PR、設計、直近の変更を確認する。
- 単独オフライン時だけ、`docs/01_project-journal/local-issues/YYYY-MM-DD_簡潔な題名.md` に記録する。オンライン復帰後はGitHub Issueを作り、ローカル記録からリンクする。
- 新規プロジェクトは、実装前にDefinition of Deliveryを `decision:` Issueで人間確認する。

## ドキュメント配置

| パス | 正本にする内容 |
| --- | --- |
| `docs/01_project-journal/` | Knowledge、単独オフライン時の一時Issue、運用playbook |
| `docs/10_research/` | 正本化前の調査・比較 |
| `docs/15_customer-review/` | GitHub上の顧客レビュー運用への入口。回答の正本は置かない |
| `docs/20_requirements/` | 合意済み要件・業務ルール・受け入れ条件 |
| `docs/30_specs/` | 検証可能な仕様・公開インターフェース・E2E |
| `docs/40_design/` | 基本設計・詳細設計・テンプレート・設計プロセス |
| `docs/50_adr/` | 技術判断と理由 |
| `docs/60_output/` | 生成物・検証証跡・レビュー成果物 |
| `docs/70_delivery/` | リリース・納品・移行・ロールバック記録 |
| `docs/90_archive/` | 廃止済み資料・旧方式 |

新しい正本フォルダを番号なしで `docs/` 直下へ追加しない。既存区分で表現できない場合は、人間確認後に番号と用途を決める。

## ブランチと承認

```text
main -> develop -> feature/<topic>
```

- `main` はリリース用、`develop` は開発統合用とする。
- 作業は `feature/<topic>` ブランチで行い、原則として `develop` へPRを作る。
- マージはユーザー承認後にのみ行う。
- PRには関連Issue、変更理由、検証結果、既知の制約を記載する。
- commit messageは `<type>(<scope>): <日本語の説明>` とする。
- `type`は`chore`、`docs`、`feat`、`fix`、`test`、`refactor`など変更目的を表す語、`scope`は`project`、`frontend`、`backend`、具体的なservice名など変更対象を表す語にする。
- 例: `chore(project): 開発環境とMITライセンスを初期化`

## ライセンスと公開資産

- このプロジェクトが著作権を持つコードと文書は、ルート`LICENSE`のMIT Licenseを正本とする。
- 第三者コード、文書、フォント、画像、音源等をルートMITへ再ライセンスしない。出所、作者、版またはcommit、元ライセンス、帰属表示、変更内容を記録し、必要な原文またはNOTICEを保持する。
- 外部ゲーム素材は自作またはCC0を優先する。NonCommercial、personal use only、再配布禁止の素材は標準候補にしない。
- CC BY等の帰属条件がある素材は、ゲーム内または配布物で帰属表示を継続できることを確認してから追加する。
- package lockfile作成後と公開build前に、直接依存と推移依存のライセンスを確認する。
- ライセンス不明、作者不明、利用範囲不明の素材は取り込まない。

## Definition of Delivery

開始時に最低限、次を合意する。

1. 成果物の段階（プロトタイプ、ローカル検証版、本番運用可能のどれか）。
2. 必須範囲と明確な対象外。
3. 実行環境と外部依存。
4. 検証方法と人間確認の条件。
5. 証跡とリリース時の扱い。

条件を変更するときは、旧GO・旧証跡・旧承認を履歴扱いにするかを同じIssueで決める。

## 最初の縦切り

横展開する前に、Definition of Deliveryの対象環境で最小の利用経路を一つ完成させる。該当する場合は、利用者の入口、業務処理、永続化または外部境界、再起動後の状態、代表E2E、証跡までを含める。縦切り完了時にDefinition of Delivery、環境前提、受け入れ条件を再確認し、未達があれば範囲を広げない。プロトタイプで省略する境界は対象外として明記する。

## 受け入れマトリクス

受け入れマトリクスは要件や承認の正本ではなく、要件・仕様・実装・検証・顧客確認を結ぶ納品索引です。

1. Definition of Delivery承認後、`docs/70_delivery/templates/acceptance-matrix.md`を`docs/70_delivery/<release-name>/acceptance-matrix.md`へコピーする。
2. 受け入れIDには既存の要件ID・仕様ID・GitHub Issue番号を再利用し、独自連番を増やさない。
3. 受け入れ範囲、実装、証跡、顧客確認が変わるときだけ更新する。無関係な通常コミットでは更新しない。
4. コミット時はhookが`python scripts/check_acceptance_matrix.py --staged`を実行する。ステージ済みマトリクスがなければ即終了し、エージェントやネットワークは使わない。
5. 関連PRの前に`python scripts/check_acceptance_matrix.py --check <matrix>`を実行し、変更した作業単位の反映漏れを確認する。
6. 納品前に`type:customer-review` Issueのラベル・回答・反映先をGitHubで確認し、`python scripts/check_acceptance_matrix.py --release <matrix>`を実行する。

通常検査は`未検証`と`待ち`を許可する。納品検査では技術検証`PASS`、顧客確認`不要`または`承認`、実装参照、証跡を必須とする。テスト成功から顧客承認を推測せず、スクリプトからマトリクスを自動更新しない。

## 納品準備と証跡

1. 本検証前に`python scripts/project_preflight.py`を実行し、Definition of Deliveryに応じて必要コマンド、環境変数、書込先、DB等のポートを指定する。
2. `docs/70_delivery/templates/release-readiness.md`をリリース別フォルダへコピーし、文書整合、製品品質、納品受け入れを別々に判定する。
3. 固定revisionの納品検証ではpreflightへ`--release`を付け、未コミット・未追跡差分を失敗扱いにする。
4. `templates/evidence-plan.json`をコピーして検証コマンドをargv配列で定義し、`collect_delivery_evidence.py`で新規証跡ディレクトリへ収集する。
5. 証跡のcommit、終了コード、ログ、SHA-256 manifestを確認する。技術検証の成功を顧客承認へ読み替えない。
6. 完了時は`templates/closeout.md`でopen Issue、顧客レビュー、branch、差分、tag、制約、残件、Knowledgeを棚卸しする。

条件変更後の旧GOと旧証跡は削除せず、履歴化または無効化の判断をGitHub Issueへ残す。preflightと証跡収集はコミットごとに実行せず、最初の縦切り、納品判定前、環境変更時に実行する。

## リスク別の進め方

| 区分 | 例 | 最低条件 |
| --- | --- | --- |
| 軽量 | 文言、限定的な文書修正 | 差分確認、対象検査 |
| 標準 | 通常機能、複数文書・テスト変更 | lint、対象テスト、関連リンク確認 |
| 厳格 | 認可、PII、監査、状態遷移、外部副作用 | 人間承認、独立した期待値、失敗時無副作用の検証、影響記録 |

厳格変更は、重要判断と検証根拠が揃うまで実装へ進まない。

## 最小実装方針（Ponytail）

コードの実装、修正、設計、依存選定では `$ponytail` を使う。影響範囲を理解した後、不要、既存資産、標準ライブラリ、ネイティブ機能、導入済み依存、最小の直接実装の順に検討し、最初に要求を満たす方法を選ぶ。

- 根本原因と呼び出し元を確認してから変更箇所を決める。
- 未要求の抽象化、将来用設定、少量コードのための新規依存を追加しない。
- 最小化を理由に、信頼境界の検証、認証・認可、セキュリティ、アクセシビリティ、データ損失防止、監査、合意済み要件を削らない。
- 非自明なロジックには小さな実行可能チェックを残し、上記のリスク別品質ゲートを優先する。
- 意図的な簡略化に上限がある場合は、Issueへ上限と再検討条件を残す。

## 重要領域別の検証

- 全体coverageの数値だけでリリース可能と判断しない。
- Definition of Deliveryで、認証・認可、PII、Repository、migration、状態遷移、外部副作用など該当する重要領域と必須ケースを固定する。
- 重要領域は受け入れマトリクスから仕様、実装、テスト、証跡へ追跡できるようにする。
- coverageは未検証箇所を探す補助指標とし、必須ケース成功の代替にしない。

## 大量移行

大量の文書、Issue、ID、ファイルを移行するときは`templates/migration-plan.md`を使い、inventory、dry-run、適用、検査を分ける。件数だけでなく、ID対応、旧新ファイルパス、相互リンク、文字コード、UTF-8 BOM、hash、衝突、rollbackを確認する。dry-run結果を確認するまで正本を切り替えない。

## Agent引き継ぎ

作業を別Agentまたは別セッションへ渡す場合は`templates/agent-handoff.md`を使い、目的、Issue、branch、commit、変更ファイル、試行、失敗原因、証跡、停止条件、次の一手を残す。同じ原因での再試行は2回までとし、それ以上は前提変更、追加権限、人間判断の必要性を明示する。引き継ぎ文書は承認や実行権限の代替にしない。

## Pythonコメントとdocstring

- 人間向けのPythonコメントとdocstringには、日本語を1文字以上含める。
- formatter、lint、型検査などのdirectiveコメントは検査対象外とする。
- pre-commitではステージ済みPythonだけを `python scripts/check_japanese_comments.py --staged` で検査する。
- リポジトリ全体を確認するときは `python scripts/check_japanese_comments.py .` を使う。

## 詳細設計とDOCGEN

- 詳細設計は `docs/40_design/detail/` に置き、`docs/40_design/templates/detail-design.md` から作る。
- 設計意図、業務ルール、状態遷移、権限、失敗時動作、テスト観点は手書きする。
- コードから復元できるフィールド、publicメンバー、APIルートなどだけをDOCGENで同期する。
- 実装前は `DOCGEN_TODO`、実装後は `DOCGEN` を使い、生成範囲を手編集しない。
- 同期は `python scripts/docgen.py "docs/40_design/detail/**/*.md"`、検査は `python scripts/docgen.py --check "docs/40_design/detail/**/*.md"` を使う。
- DOCGEN差分がある状態で設計・実装・テストを完了扱いにしない。
## 完了時

- PR前に、対象の品質検査とリンク確認を実行する。
- `templates/closeout.md` を使い、残件、既知制約、次の判断をIssueまたはPRへ残す。
- 再利用できる判断・手順は `docs/01_project-journal/knowledge/` に根拠付きで短く記録する。
- 複数プロジェクトで使えるKnowledgeだけを候補化し、人間確認後にLLM-Wikiへ取り込む。
- LLM-Wikiには秘密情報、生ログ、プロダクト固有情報、未検証の主張をコピーしない。
- `docs/` を変更した場合は `python scripts/check_markdown_links.py docs` を実行する。

## TypeScript品質ゲート

- 人間向けのTypeScriptコメントとJSDocには日本語を1文字以上含める。ESLint、TypeScript、triple-slash、coverage、formatter、shebang、generatedのdirectiveは検査対象外とする。
- TypeScript品質変更では`pnpm lint`、`pnpm typecheck`、`pnpm check`を実行する。`pnpm lint:fix`は安全なlint修正、`pnpm format`はESLintのlayout修正だけを行う。
- Solが計画・レビューし、Terraが実装する。writerは常に1 Agentとし、Agentの結果は人間承認の代替にしない。
