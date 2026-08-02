# Project Knowledge

このフォルダは、同じプロジェクト内で繰り返し参照する知識の正本です。作業履歴はGitHub IssueとPR、確定仕様は要件・設計書に置き、ここには根拠付きで再利用する主張だけを置きます。

## 運用

1. IssueのcloseoutでKnowledge候補を確認する。
2. `templates/knowledge-node.md` から `nodes/YYYY-MM-DD_簡潔な題名.md` を作る。
3. 根拠を再現できるまで `status: proposed` とする。
4. 変更時は関連する要件、設計、コード、テスト、Skillへの影響を確認する。
5. 複数プロジェクトに通用するものだけを、承認後にLLM-Wikiへ取り込む。

LLM-Wikiは外部の横断知識ハブです。Issueや設計書のバックアップではありません。秘密情報、生ログ、個人情報、端末固有パス、未検証の主張は公開しません。
