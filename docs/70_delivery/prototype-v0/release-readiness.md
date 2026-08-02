---
release: "prototype-v0"
definition_of_delivery: "../../01_project-journal/local-issues/2026-08-02_definition-of-delivery.md"
acceptance_matrix: "acceptance-matrix.md"
---

# リリース準備判定

| 層 | 状態 | 根拠 | 制約・残件 |
| --- | --- | --- | --- |
| 文書整合 | WAITING | 要件と実装仕様の作成待ち | GitHub Issue移行前 |
| 製品品質 | WAITING | 実装・自動検査・手動計測待ち | Chromeのみを対象 |
| 納品受け入れ | WAITING | LOCAL-004のプレイ確認待ち | Evidence package、tag、公開配信は対象外 |

状態は`PASS`、`FAIL`、`WAITING`、`対象外`のいずれかとする。一つの層の成功から、別の層の成功や顧客承認を推測しない。