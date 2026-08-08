---
release: "prototype-v1"
definition_of_delivery: "https://github.com/WFrog2511/2d-coop-survival/issues/48"
acceptance_matrix: "acceptance-matrix.md"
---

# リリース準備判定

| 層 | 状態 | 根拠 | 制約・残件 |
| --- | --- | --- | --- |
| 文書整合 | WAITING | prototype-v1 matrix、要件・仕様・設計リンク、Markdown link、DOCGENを検証予定 | main統合前の固定revisionで判定する |
| 製品品質 | WAITING | `pnpm check`、bundle、代表E2E、preflight、証跡収集を検証予定 | 通常プレイ性能の数値profileは未実施だが、ユーザーの長時間プレイ確認は完了 |
| 納品受け入れ | WAITING | [Definition of Delivery #48](https://github.com/WFrog2511/2d-coop-survival/issues/48)と[customer review #49](https://github.com/WFrog2511/2d-coop-survival/issues/49)を確認予定 | wave/preparation以降、multiplayer、公開配信は次スライス |
