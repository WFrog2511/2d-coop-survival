---
release: "prototype-v0"
definition_of_delivery: "https://github.com/WFrog2511/2d-coop-survival/issues/4"
---

# 受け入れマトリクス

この文書は正本を複製せず、要件、仕様、実装、検証、顧客確認を結ぶ索引です。

| 受け入れID | 受け入れ項目 | 要件・仕様 | 実装 | 技術検証 | 顧客確認 | 証跡 | 制約・対象外 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-PROTOTYPE-LOOP | 最小戦闘ループを完走できる | [prototype-v0要件](../../20_requirements/prototype-v0.md)、[仕様](../../30_specs/prototype-v0.md) | `src/main.ts`、`src/rules.ts` | PASS | 承認 ([GitHub Issue #3](https://github.com/WFrog2511/2d-coop-survival/issues/3)) | [PR #10](https://github.com/WFrog2511/2d-coop-survival/pull/10): unit 4、build、Playwright Chromium 1。 [GitHub Issue #3](https://github.com/WFrog2511/2d-coop-survival/issues/3): Chrome手動プレイ、FPSおおむね60〜61、目立つ低下なし | 通信、永続化、Edge、公開配信は対象外。FPS閾値は[GitHub Issue #11](https://github.com/WFrog2511/2d-coop-survival/issues/11)で次段階前に決定 |
