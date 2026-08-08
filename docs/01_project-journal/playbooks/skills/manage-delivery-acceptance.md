# 納品受け入れ管理（日本語補足）

受け入れマトリクスは要件や承認の正本ではなく、固定したDelivery-strict納品revisionで要件・仕様・実装・証跡・顧客確認を結ぶ索引です。Prototype standardのfeatureごとには原則適用しません。

1. Prototype standardはtask Issue、PRの検証、unit / E2E、必要時のcustomer-review Issueで追跡し、featureごとのmatrix、readiness、evidenceを原則作成・更新しない。
2. Delivery-strictのnamed releaseでは、Definition of Delivery承認後に`docs/70_delivery/templates/acceptance-matrix.md`をリリース別フォルダへコピーする。
3. 受け入れIDには既存の要件ID・仕様ID・GitHub Issue番号を再利用し、同じ受け入れ内容の要件行とIssue行を重複させない。
4. releaseの受け入れ範囲、実装、証跡、顧客確認が変わるときだけ更新する。顧客回答・承認は`type:customer-review` Issueを正本にする。
5. 関連release PR前は`python -X utf8 scripts/check_acceptance_matrix.py --check <matrix>`を実行する。
6. 納品前は顧客レビューIssueを確認し、`python -X utf8 scripts/check_acceptance_matrix.py --release <matrix>`を実行する。

コミット時はhookがステージ済みmatrixの機械検査だけを行います。通常検査は作業中の未検証・確認待ちを許可し、納品検査だけが全項目の完了を要求します。既存matrixは履歴として保持し、現在のPR状態・head SHAを転記するだけの追補commitや方針移行だけの遡及更新をしません。詳細は[英語版Skill](../../../../.agents/skills/manage-delivery-acceptance/SKILL.md)を参照します。
