---
release: "prototype-v0"
definition_of_delivery: "https://github.com/WFrog2511/2d-coop-survival/issues/4"
acceptance_matrix: "acceptance-matrix.md"
---

# リリース準備判定

| 層 | 状態 | 根拠 | 制約・残件 |
| --- | --- | --- | --- |
| 文書整合 | PASS | 要件、仕様、基本設計、受け入れマトリクスを検査し、Markdownリンク・受け入れマトリクス・readiness検査がPASS | PR作成前の最終検査ログを追記する |
| 製品品質 | WAITING | unit、build、Playwright Chromiumを自動検査する | Google Chrome手動操作とFPS実測待ち |
| 納品受け入れ | WAITING | [GitHub Issue #3](https://github.com/WFrog2511/2d-coop-survival/issues/3)でプレイ確認を行う | Evidence package、tag、公開配信は対象外 |

状態は`PASS`、`FAIL`、`WAITING`、`対象外`のいずれかとする。一つの層の成功から、別の層の成功や顧客承認を推測しない。
