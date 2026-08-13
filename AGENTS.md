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
- 未確定な選択肢、複数taskに効く条件、独立した承認履歴が必要なDefinition of Deliveryは、実装前に`type:decision` Issueで人間確認する。範囲が明確な小さなプロトタイプは、task Issue本文のDefinition of Deliveryと人間確認コメントを正本にできる。
- task / decision Issueには、選択した開発ハーネスprofile、成果物段階、必須範囲・対象外、検証、人間確認、条件変更を安定した記録として残す。

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
- 作業sliceの品質gateが通ったら、意図した変更だけを親が追加許可なしにstage・commitする。push、PR作成、merge、Issueクローズ、顧客承認は別途明示確認を受ける。
- PRには関連Issue、変更理由、検証結果、既知の制約を記載する。
- commit messageは `<type>(<scope>): <日本語の説明>` とする。
- `type`は`chore`、`docs`、`feat`、`fix`、`test`、`refactor`など変更目的を表す語、`scope`は`project`、`frontend`、`backend`、具体的なservice名など変更対象を表す語にする。
- 例: `chore(project): 開発環境とMITライセンスを初期化`

## 開発ハーネスと正本の境界

| 情報 | 正本 |
| --- | --- |
| 安定したtask、Definition of Delivery、受け入れ条件、変更判断 | task / decision Issue |
| 顧客・プロジェクトオーナーの回答と承認 | `type:customer-review` Issue |
| 実装差分、PR head、現在の検証結果、既知制約 | PR |
| 長期に再利用する要件、仕様、設計、固定版の納品索引 | repository Markdown |
| 実行可能な期待値 | unit / E2E |
| 固定revisionを複数Issue・PRから納品する索引 | `docs/70_delivery/<release>/acceptance-matrix.md` |

PR番号、open / mergeable状態、現在head SHAをリポジトリ文書へ転記するだけの追補commitは作らない。固定revisionの納品証跡だけがSHAを固定する。受け入れマトリクスは要件・承認の正本ではない。

### 開発ハーネスprofile

開始時に一つだけ選び、必要な成果物とgateをDefinition of Deliveryへ記録する。

| profile | 適用 | 必須成果物・gate | 原則不要 |
| --- | --- | --- | --- |
| Publish-only | 検証済みでcleanなexact treeのcommit / push / PR | branch・差分・除外、既存のexact-tree検証記録、意図したstage、PR本文を確認する | 新規matrix、readiness、evidence、sub-agent、tree未変更時の品質gate再実行 |
| Prototype standard | 通常のTypeScript機能・POC | task IssueのDefinition of Delivery、必要な要件/仕様、変更対象unit、利用経路・描画変更時の代表E2E、最終treeへのPR gate一式、必要時だけcustomer-review | featureごとのmatrix、release-readiness、evidence collection |
| Delivery-strict | main統合、tag、配布、外部引渡し、認可・PII・不可逆副作用 | 一つのnamed release matrix、固定clean revision、readiness、evidence、rollback、顧客承認、重要領域gate | featureごとの個別納品資料 |

Prototype standardでmatrix、release-readiness、evidenceを作成・更新するのは、Definition of DeliveryがDelivery-strictへ変更された場合だけとする。既存の`docs/70_delivery/*` matrixとreadinessは履歴であり、この方針への移行だけを理由に編集しない。

### Prototype standardの試遊優先モード

操作感、画面、ゲームバランスなど、プロジェクトオーナーが実際に触って方向を調整する変更では、Prototype standardの暫定local overrideとして[試遊優先モード](.agents/overrides/playtest-first.md)を選択できる。開始時にこのモードを使うことを明示し、方向性確認前の探索と、確認後の安定化を分ける。通常のPrototype standardやDelivery-strictのgateを恒久的に弱めるprofileではない。

### Codex Agent checkpoint

`.codex/config.toml`と`.codex/agents/`はtrusted projectだけで有効になる。変更後は新しいtrusted taskを開始し、`terra_max_planner_reviewer`と`terra_max_writer`が使えることを確認してから依存する。最大sub-agent数は3とし、将来のproject sub-agentは`gpt-5.6-terra` / `max`を使う。SOL root orchestrator（`gpt-5.6-sol`）はtask / Issue / Git / GitHub / agent orchestrationを担当し、Terra Max planner/reviewerとsole writerはplan / write / review / unitを担当する。`gpt-5.6-terra`が使えない場合の別モデルへのfallbackはユーザー確認後だけ行う。

- `terra_max_planner_reviewer`は実行時互換性のため`workspace-write`で起動するが、developer promptにより振る舞い上はread-onlyの実装前plan・最終diff review checkpointとして動作する。これはsandboxによるセキュリティ境界ではなく、workspace、GitHub、Gitを書き換える権限を与えるものでもない。
- `terra_max_writer`は唯一の実装writerであり、writeと対象unitを担当する。同じtaskで他のwriterを並行起動せず、stage・commitは親が品質gate後に自動で行い、writer自身は行わない。push、merge、顧客承認は親の明示権限なしに行わない。
- Prototype standardの標準コード変更は、Terra Max planner/reviewerのplan → Terra Max sole writerのwriteと対象unit → Terra Max planner/reviewerのfinal diff reviewを原則とする。軽微なfinding修正後は変更箇所だけを再reviewし、厳格変更、重大finding、Definition of Delivery変更後は独立reviewを広げる。Publish-onlyではsub-agentを使わない。
- handoffにはIssue / Definition of Delivery、対象ファイル、現在diff、直近gate結果、停止条件だけを渡す。長い履歴やraw logを複製しない。
- 通常の`apply_patch`が一度実際に書込み失敗したと確認した場合だけ、対象パスを検証したcandidate、SHA-256、backup、原子的置換を使う。helperを先回りして追加せず、backupは検証とreviewが終わるまで保持する。

### Versioned harness adoption

- `.agents/harness.toml`、`.agents/harness.lock`、`.agents/overrides/`はconsumer側の正本とする。中央ハーネス更新は固定revisionを確認したreviewable adoptionで取り込み、live referenceや自動更新は行わない。
- `$grill-me`はユーザーが明示的に要求した決定インタビューだけで使い、通常の実装や調査には起動しない。
- `$report-harness-feedback`は再利用候補を秘密情報なしで中央review用に下書きするとき、`$retrospect-harness`は完了taskまたはpilotの根拠付き振り返りでlocal overrideと中央候補を分けるときに使う。外部Issue作成には別途人間承認が必要である。
- `codex-lsp-bridge` MCPはread-onlyなsemantic feedbackであり、Windowsではproject-local `.codex/lsp-client.json` からpackageのJavaScript entryをNodeで直接起動する。bridge 0.3.3では`lsp_diagnostics`をallowlistせず、診断は`corepack pnpm check`またはtypecheckを正本とする。bridge更新後にerror fixtureで成功応答を確認できた場合だけ再有効化する。
- `.codex/config.toml`のMCP変更は新しいtrusted taskでCodexをrestartしてから確認する。依存install前またはMCP不調時は通常のrepo-native validationへ戻す。

Issue #28はpilot slice 1である。次の二つのsliceを含む合計3 sliceまで、IssueまたはPRに集計値だけを残す: discovery / DOD、implementation、independent reviewとfinding修正、automated validation、customer review待ち、commit / push / PRのphase時間、full gate回数と再実行理由、Agent数とhandoff数、要求変更とハーネス起因の再作業。利用量が取得できる場合だけクレジット量を記録し、raw logや推測値は残さない。3 slice後に採用・修正・撤回を人間が判断する。

### 変更駆動validation DAG

PR前に最終treeへ必要なgateを一度だけ実行する。修正でtreeが変わったときだけ、無効化されたgateを再実行し、理由をPRへ記録する。個別commandと集約commandを同じtreeへ重ねない。

| 変更またはphase | gate | 境界 |
| --- | --- | --- |
| すべてのcommit | `git diff --cached --check`、`python -X utf8 scripts/check_japanese_comments.py --staged`、`corepack pnpm exec node scripts/check_typescript_comments.mjs --staged`、`python -X utf8 scripts/check_acceptance_matrix.py --staged`、`corepack pnpm lint`、`corepack pnpm typecheck` | pre-commitはstaged機械検査に加えてNode.js 22/Corepackの静的解析を実行する。tests、bundle、E2E、全docs link、DOCGENは実行しない |
| TypeScript品質変更 | `pnpm check` | `lint`、`typecheck`、`test:quality`、unitを内包する唯一のfull TypeScript gate。最終treeで`pnpm lint`や`pnpm typecheck`を別途重ねない |
| bundle / Vite runtime変更 | `pnpm build:bundle` | `pnpm check`後にVite bundleだけを検証する。`pnpm build`は後方互換用の`typecheck && build:bundle`であり、PR手順では使わない |
| 利用経路、描画、ブラウザ状態変更 | 関連する`pnpm test:e2e` | Definition of Deliveryの代表利用経路を対象化する |
| Python / tooling変更 | 関連pytestと対象Pythonの日本語コメント検査 | Python未変更ならpytest全体を要求しない |
| `docs/`変更 | `python -X utf8 scripts/check_markdown_links.py docs` | 変更後の文書リンクを確認する |
| 詳細設計またはPython DOCGEN source変更 | `python -X utf8 scripts/docgen.py --check "docs/40_design/detail/**/*.md"` | TypeScript設計同期の保証ではない |
| `.codex/`変更 | 3つのTOML差分をreviewし、新しいtrusted taskでrole smokeを行う | 設定がtaskのstarting refに存在し、実際のmodel / effort / sandbox動作を観測するまで完了扱いにしない |
| matrix変更 | `python -X utf8 scripts/check_acceptance_matrix.py --check <matrix>` | Delivery-strictでだけ`--release`を追加する |
| Delivery-strict | `project_preflight.py --release`、matrix `--release`、readiness check、evidence collection | 固定clean revision、rollback、顧客承認を含める |

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

受け入れマトリクスは要件や承認の正本ではなく、固定した納品revisionで要件・仕様・実装・検証・顧客確認を結ぶ索引である。Delivery-strictのnamed releaseだけで、`docs/70_delivery/templates/acceptance-matrix.md`を`docs/70_delivery/<release-name>/acceptance-matrix.md`へコピーする。

1. Prototype standardではtask Issueの受け入れ条件、PR検証、unit / E2E、必要時のcustomer-reviewを追跡に使い、featureごとのmatrixを原則作成・更新しない。
2. Delivery-strictでは既存の要件ID・仕様ID・GitHub Issue番号を受け入れIDに再利用し、同じ内容の要件行とIssue行を重複させない。
3. matrixを変更したときだけPR前に`python -X utf8 scripts/check_acceptance_matrix.py --check <matrix>`を実行する。matrix checkerの`--staged`はエージェントやネットワークを使わない機械検査だけであり、hook全体はcommit時のlint/typecheckも実行する。
4. 納品前に`type:customer-review` Issueのラベル・回答・反映先をGitHubで確認し、`python -X utf8 scripts/check_acceptance_matrix.py --release <matrix>`を実行する。

通常検査は`未検証`と`待ち`を許可する。納品検査では技術検証`PASS`、顧客確認`不要`または`承認`、実装参照、証跡を必須とする。テスト成功から顧客承認を推測せず、スクリプトからマトリクスを自動更新しない。既存matrixは履歴として保持し、方針移行だけの遡及編集をしない。

## 納品準備と証跡

この節はDelivery-strictだけに適用する。Prototype standardとPublish-onlyはrelease-readinessやevidence collectionを新規作成・更新しない。

1. named release、Definition of Delivery、rollback、対象revisionを固定し、clean treeで`python -X utf8 scripts/project_preflight.py --release`を実行する。
2. `docs/70_delivery/templates/release-readiness.md`をrelease別フォルダへコピーし、文書整合、製品品質、納品受け入れを別々に判定する。
3. `templates/evidence-plan.json`をコピーして検証コマンドをargv配列で定義し、`collect_delivery_evidence.py`で新規証跡ディレクトリへ収集する。
4. matrix `--release`、readiness、顧客Issue、commit、終了コード、ログ、SHA-256 manifestを確認する。技術検証の成功を顧客承認へ読み替えない。
5. 完了時は`templates/closeout.md`でopen Issue、顧客レビュー、branch、差分、tag、rollback、制約、残件、Knowledgeを棚卸しする。

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

## テスト設計と調整値

- unit test はロジックの不変条件、状態遷移、失敗時契約に最小化し、外出し値の確認だけを目的とするtestを作らない。
- 手動調整用のdamage、speed、distance、cooldown、duration、count、multiplierなどと、それらからの派生値だけを固定期待値にしない。値の変更だけで期待値の修正が必要になるtestを原則作らない。
- 調整値をfixtureやclockの駆動に使う場合は構成値または観測値から導き、値の変更後にtest編集を要しないようにする。
- 代表E2Eでは利用経路、状態遷移、不変条件を検証し、調整値の妥当性は手動プレイで確認する。
- security、schema、protocol、API、Definition of Deliveryで合意済みの非調整契約は弱めない。

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
- pre-commitではステージ済みPythonだけを `python -X utf8 scripts/check_japanese_comments.py --staged` で検査する。
- リポジトリ全体を確認するときは `python -X utf8 scripts/check_japanese_comments.py .` を使う。
- WindowsでUTF-8のGitHubデータを取得・解析するPython subprocessは、呼出しを`python -X utf8`にし、`text=True`で出力を読む場合は`encoding="utf-8"`を明示する。plugin cacheをvendor・編集して回避しない。

## 詳細設計とDOCGEN

- 詳細設計は `docs/40_design/detail/` に置き、`docs/40_design/templates/detail-design.md` から作る。
- 設計意図、業務ルール、状態遷移、権限、失敗時動作、テスト観点は手書きする。
- コードから復元できるフィールド、publicメンバー、APIルートなどだけをDOCGENで同期する。
- 実装前は `DOCGEN_TODO`、実装後は `DOCGEN` を使い、生成範囲を手編集しない。
- 同期は `python scripts/docgen.py "docs/40_design/detail/**/*.md"`、検査は `python scripts/docgen.py --check "docs/40_design/detail/**/*.md"` を使う。
- DOCGEN差分がある状態で設計・実装・テストを完了扱いにしない。
- 現行DOCGEN transformはPython sourceだけを対象にする。TypeScript詳細設計は手動reviewを行い、`docgen.py --check`のPASSをTypeScript同期のPASSへ読み替えない。TypeScript transformは本sliceで追加せず、[Issue #31](https://github.com/WFrog2511/2d-coop-survival/issues/31)で扱う。
## 完了時

- PR前に、対象の品質検査とリンク確認を実行する。
- `templates/closeout.md` を使い、残件、既知制約、次の判断をIssueまたはPRへ残す。
- 再利用できる判断・手順は `docs/01_project-journal/knowledge/` に根拠付きで短く記録する。
- 複数プロジェクトで使えるKnowledgeだけを候補化し、人間確認後にLLM-Wikiへ取り込む。
- LLM-Wikiには秘密情報、生ログ、プロダクト固有情報、未検証の主張をコピーしない。
- `docs/` を変更した場合は `python scripts/check_markdown_links.py docs` を実行する。

## TypeScript品質ゲート

- 人間向けのTypeScriptコメントとJSDocには日本語を1文字以上含める。ESLint、TypeScript、triple-slash、coverage、formatter、shebang、generatedのdirectiveは検査対象外とする。
- pre-commitではステージ済みTypeScriptだけを既存の`typescript-eslint` parserとlocal ESLint ruleで `corepack pnpm exec node scripts/check_typescript_comments.mjs --staged` により検査し、Node.js 22/Corepackで`corepack pnpm lint`と`corepack pnpm typecheck`を実行する。失敗時はcommitを中止し、tests、bundle、E2EはPR前gateに残す。
- 最終treeのTypeScript full gateは`pnpm check`だけである。`pnpm check`に含まれる`pnpm lint`、`pnpm typecheck`、`pnpm test:quality`、`pnpm test`を同じtreeへ別途実行しない。`pnpm lint:fix`は安全なlint修正、`pnpm format`はESLintのlayout修正だけを行う。
- bundle検証が必要な場合は、`pnpm check`後に`pnpm build:bundle`を実行する。`pnpm build`は後方互換であり、PR gateの重複回避には使わない。
- Terra Max planner/reviewerがplanとreviewを、Terra Max writerが唯一の実装writerとしてwriteと対象unitを担当する。Agentの結果は人間承認の代替にしない。
