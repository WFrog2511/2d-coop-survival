# 納品受け入れ管理（日本語補足）

受け入れマトリクスは要件や承認の正本ではなく、要件・仕様・実装・証跡・顧客確認を結ぶ索引です。

1. Definition of Delivery承認後、`docs/70_delivery/templates/acceptance-matrix.md`をリリース別フォルダへコピーする。
2. 受け入れIDには既存の要件ID・仕様ID・GitHub Issue番号を再利用する。
3. 受け入れ範囲、実装、証跡、顧客確認が変わるときだけ更新する。
4. PR前は`python scripts/check_acceptance_matrix.py --check <matrix>`を実行する。
5. 納品前は顧客レビューIssueを確認し、`python scripts/check_acceptance_matrix.py --release <matrix>`を実行する。

コミット時はhookがステージ済みマトリクスの機械検査だけを行います。通常検査は作業中の未検証・確認待ちを許可し、納品検査だけが全項目の完了を要求します。詳細は[英語版Skill](../../../../.agents/skills/manage-delivery-acceptance/SKILL.md)を参照します。
