# 納品準備と証跡

納品前は次の順に確認します。

1. Definition of Deliveryと対象revisionを固定する。
2. `project_preflight.py`で環境を診断する。
3. 文書整合、製品品質、納品受け入れを別々に判定する。
4. `collect_delivery_evidence.py`でコマンド、終了コード、ログ、commit、hashを保存する。
5. 受け入れマトリクスと顧客承認を照合する。
6. `templates/closeout.md`でIssue、branch、tag、差分、残件を棚卸しする。

証跡の成功を顧客承認として扱いません。条件変更後も古い証跡を消さず、履歴または無効化の判断をGitHub Issueへ残します。
