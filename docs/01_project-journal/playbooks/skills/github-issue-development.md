# GitHub Issue開発（日本語補足）

通常時の正本はGitHub IssueとPRです。開始時は`AGENTS.md`、対象Issue、関連PR、現在差分を確認します。

1. 開始時に一つのharness profileを選ぶ。範囲が明確な`Prototype standard`は、人間確認済みのtask Issue本文をDefinition of Deliveryの正本にできる。未解決の選択肢、複数taskへ効く条件、独立した判断履歴が必要なときだけ`type:decision` Issueを作る。
2. レビュー可能な作業単位ごとに`type:task` Issueを作る。疑問は`type:question`を付ける。
3. 顧客またはプロジェクトオーナーの回答が必要なら、専用Formから一確認事項につき一つの`type:customer-review` Issueを作る。回答と反映先をコメントに残し、反映後に閉じる。技術検証を顧客承認へ読み替えない。
4. `develop`から`feature/<topic>`を作り、PRは原則`develop`へ出す。`main`への反映はリリース確認後にする。
5. `AGENTS.md`の変更駆動gateを最終treeへ一度実行し、修正で無効化されたgateだけを理由付きで再実行する。
6. PRにはIssue番号、profile、範囲・対象外、現在の検証、制約を記す。PR head SHA・状態・差分はPRを正本とし、リポジトリ文書へ戻すためだけのcommitを作らない。
7. Issueはユーザー承認後かつ全受け入れ条件の達成・反映後にだけ閉じる。mergeだけでは閉じず、再利用可能な判断と未解決事項をcloseoutへ残す。

GitHubを使えない単独作業時だけ、`docs/01_project-journal/local-issues/`に一時記録し、復帰時にGitHubへ移行してローカルIDとパスを置換します。詳細な実行手順は[英語版Skill](../../../../.agents/skills/github-issue-development/SKILL.md)を参照します。
