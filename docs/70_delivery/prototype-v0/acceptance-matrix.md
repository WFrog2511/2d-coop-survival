---
release: "prototype-v0"
definition_of_delivery: "https://github.com/WFrog2511/2d-coop-survival/issues/4"
---

# 受け入れマトリクス

この文書は正本を複製せず、要件、仕様、実装、検証、顧客確認を結ぶ索引です。

| 受け入れID | 受け入れ項目 | 要件・仕様 | 実装 | 技術検証 | 顧客確認 | 証跡 | 制約・対象外 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-PROTOTYPE-LOOP | 最小戦闘ループを完走できる | [prototype-v0要件](../../20_requirements/prototype-v0.md)、[仕様](../../30_specs/prototype-v0.md) | `src/main.ts`、`src/rules.ts` | 未検証 | 待ち ([GitHub Issue #3](https://github.com/WFrog2511/2d-coop-survival/issues/3)) | 自動検査PASSのログをPRへ記録。Chrome手動確認待ち | 通信、永続化、Edge、公開配信は対象外 |
