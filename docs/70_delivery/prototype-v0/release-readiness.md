---
release: "prototype-v0"
definition_of_delivery: "https://github.com/WFrog2511/2d-coop-survival/issues/4"
acceptance_matrix: "acceptance-matrix.md"
---

# リリース準備判定

| 層 | 状態 | 根拠 | 制約・残件 |
| --- | --- | --- | --- |
| 文書整合 | PASS | 要件、仕様、基本設計、受け入れマトリクスを検査し、Markdownリンク・受け入れマトリクス・readiness検査がPASS | prototype-v0の記録であり、将来範囲の設計・運用判断は含まない |
| 製品品質 | PASS | [PR #10](https://github.com/WFrog2511/2d-coop-survival/pull/10)でunit 4、build、Playwright Chromium 1がPASS。[GitHub Issue #3](https://github.com/WFrog2511/2d-coop-survival/issues/3)でChrome手動プレイとFPSおおむね60〜61、目立つ低下なしを確認 | FPSの合否閾値は[GitHub Issue #11](https://github.com/WFrog2511/2d-coop-survival/issues/11)で後続段階の判断前に決定する |
| 納品受け入れ | PASS | [GitHub Issue #3](https://github.com/WFrog2511/2d-coop-survival/issues/3)でプロジェクトオーナーがprototype-v0を承認 | Evidence package、tag、公開配信はDefinition of Deliveryの対象外。production readyを意味しない |

状態は`PASS`、`FAIL`、`WAITING`、`対象外`のいずれかとする。一つの層の成功から、別の層の成功や顧客承認を推測しない。
