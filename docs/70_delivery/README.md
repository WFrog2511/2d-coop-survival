# Delivery

リリース判定、納品、移行、ロールバック、既知制約の記録を置きます。

Definition of Delivery承認後、[受け入れマトリクスのテンプレート](templates/acceptance-matrix.md)を`<release-name>/acceptance-matrix.md`へコピーします。マトリクスは要件や承認を複製せず、正本へのリンクと検証状態をまとめる納品索引です。

[三層判定のテンプレート](templates/release-readiness.md)も同じフォルダへコピーし、文書整合、製品品質、納品受け入れを別々に記録します。

- PR前: `python scripts/check_acceptance_matrix.py --check <matrix>`
- 納品前: `python scripts/check_acceptance_matrix.py --release <matrix>`
- 三層判定: `python scripts/check_delivery_readiness.py --release <readiness>`
- 環境診断: `python scripts/project_preflight.py --release`
- 証跡収集: `python scripts/collect_delivery_evidence.py --plan <plan.json> --output <new-directory>`

顧客確認が必要な行は、`type:customer-review`を付けたGitHub Issueへリンクします。
