# GitHub Issue開発（日本語補足）

通常時の正本はGitHub IssueとPRです。開始時は`AGENTS.md`、対象Issue、関連PRを確認します。

1. 要求や受入条件が未確定なら、Definition of Deliveryを`type:decision` Issueで合意する。
2. レビュー可能な作業単位ごとに`type:task` Issueを作る。疑問は`type:question`を付ける。
3. 顧客またはプロジェクトオーナーの回答が必要なら、専用Formから一確認事項につき一つの`type:customer-review` Issueを作る。回答と反映先をコメントに残し、反映後に閉じる。
4. `develop`から`feature/<topic>`を作り、PRは原則`develop`へ出す。`main`への反映はリリース確認後にする。
5. PRにはIssue番号、実行した検証、未実行の確認を記す。未実行を検証済みとして扱わない。
6. 承認・マージ後にIssueを閉じ、再利用可能な判断と未解決事項をcloseoutへ残す。

GitHubを使えない単独作業時だけ、`docs/01_project-journal/local-issues/`に一時記録し、復帰時にGitHubへ移行してローカルIDとパスを置換します。詳細な実行手順は[英語版Skill](../../../../.agents/skills/github-issue-development/SKILL.md)を参照します。
