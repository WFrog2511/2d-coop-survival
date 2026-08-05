---
release: "enemy-visibility-v1"
definition_of_delivery: "https://github.com/WFrog2511/2d-coop-survival/issues/25"
---

# 受け入れマトリクス

| 受け入れID | 受け入れ項目 | 要件・仕様 | 実装 | 技術検証 | 顧客確認 | 証跡 | 制約・対象外 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-ENEMY-VISIBILITY | wall遮蔽と境界silhouette | [要件](../../20_requirements/enemy-visibility-v1.md)、[仕様](../../30_specs/enemy-visibility-v1.md) | `src/arena-map.ts`、`src/main.ts`、`tests/arena-map.test.ts`、`e2e/prototype.spec.ts` | PASS | 承認 [GitHub Issue #26](https://github.com/WFrog2511/2d-coop-survival/issues/26) | 変更前（superseded）: 背景mask追加前の全ゲートPASS、Sol findingなし。変更後の技術結果（2026-08-05）: pnpm check（lint、typecheck、test:quality、unit 24）、build、固定seed Playwright 1/1、pytest 26、日本語コメント、Markdown links 52、DOCGEN、matrix、diff検査PASS、Sol findingなし。顧客再確認（2026-08-05）: [#26コメント](https://github.com/WFrog2511/2d-coop-survival/issues/26#issuecomment-5191493105)で実プレイ後「違和感のない実装」と承認 | fog、lighting、汎用FOV、距離FOV、探索履歴、共有視界、HUD秘匿、#21/#22は対象外 |
| #20 | Issue #20の最小縦切り | [GitHub Issue #20](https://github.com/WFrog2511/2d-coop-survival/issues/20)、[仕様](../../30_specs/enemy-visibility-v1.md) | `src/arena-map.ts`、`src/main.ts`、`e2e/prototype.spec.ts` | PASS | 承認 [GitHub Issue #26](https://github.com/WFrog2511/2d-coop-survival/issues/26) | 変更前（superseded）: 背景mask追加前の全ゲートPASS、Sol findingなし。変更後の技術結果（2026-08-05）: pnpm check（lint、typecheck、test:quality、unit 24）、build、固定seed Playwright 1/1、pytest 26、日本語コメント、Markdown links 52、DOCGEN、matrix、diff検査PASS、Sol findingなし。顧客再確認（2026-08-05）: [#26コメント](https://github.com/WFrog2511/2d-coop-survival/issues/26#issuecomment-5191493105)で実プレイ後「違和感のない実装」と承認 | DOD #25で合意したローカル試作のみ |
