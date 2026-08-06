# Delivery

リリース判定、納品、移行、ロールバック、既知制約の記録を置きます。profileと変更駆動gateの正本は[AGENTS.md](../../AGENTS.md)です。

Delivery artifactは、main統合、tag、配布、外部引渡しなどの`Delivery-strict` named releaseだけで作成・更新します。Definition of Delivery承認後、[受け入れマトリクスのテンプレート](templates/acceptance-matrix.md)と[三層判定のテンプレート](templates/release-readiness.md)を同じ`<release-name>/`フォルダへコピーします。

`Prototype standard`はtask Issue、PR検証、unit / E2E、必要時のcustomer-reviewで追跡し、featureごとのmatrix、release-readiness、evidence collectionを原則作成・更新しません。既存のdelivery artifactは履歴として保持し、方針移行やPRの現在head SHA・状態を転記するだけの更新をしません。

matrixは要件や顧客承認を複製する正本ではなく、固定revisionの納品索引です。current PR diff、head SHA、検証結果、既知制約はPRを正本にし、顧客確認が必要な行は`type:customer-review` GitHub Issueへリンクします。

Delivery-strictの最終gate:

- `python -X utf8 scripts/check_acceptance_matrix.py --check <matrix>`
- `python -X utf8 scripts/check_acceptance_matrix.py --release <matrix>`
- `python -X utf8 scripts/check_delivery_readiness.py --release <readiness>`
- `python -X utf8 scripts/project_preflight.py --release`
- `python -X utf8 scripts/collect_delivery_evidence.py --plan <plan.json> --output <new-directory>`
