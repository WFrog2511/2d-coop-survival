# Project Knowledge管理（日本語補足）

プロジェクト内で再利用する知識は `docs/01_project-journal/knowledge/` を正本とします。Issue、設計書、生ログをそのままLLM-Wikiへ複製しません。

1. Issue完了時に、再利用できる主張・手順・トラブルシュートがあるか確認する。
2. 1ファイル1主張で、適用範囲、根拠、検証状態、関連Issue・文書を記録する。
3. 不確かな知識は `proposed`、再現可能な根拠を確認したものだけ `verified` にする。
4. 複数プロジェクトで使える知識だけを一般化し、秘密情報と端末固有情報を除く。
5. 人間承認後に `@wiki` で外部LLM-Wikiへ取り込み、取り込み先をローカルKnowledgeへ記録する。

LLM-Wikiへの公開は外部書込みなのでGit hookでは実行しません。未公開の候補は `candidate` のまま保持します。詳細は[英語版Skill](../../../../.agents/skills/manage-project-knowledge/SKILL.md)を参照します。
