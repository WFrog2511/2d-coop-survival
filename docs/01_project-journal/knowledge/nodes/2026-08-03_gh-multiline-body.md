---
title: "PowerShellからgh本文を更新するときの改行保持"
summary: "Windows PowerShellでは複数行MarkdownをUTF-8ファイルに保存し、ghの--body-fileで更新すると改行を保持できる。"
status: verified
scope: "Windows PowerShell + gh CLIでのGitHub Issue・PR本文の作成と更新"
evidence:
  - "PR #16の本文は修正前に2626文字・改行3個まで崩れた。"
  - "UTF-8 Markdownファイルをgh pr edit 16 --body-fileで渡して修正後、本文は2593文字・改行103個となった。"
  - "gh pr view 16 --json bodyとGitHub上の描画で見出し、箇条書き、改行を確認した。"
related_issue: "#23"
related_docs:
  - ".agents/skills/github-issue-development/SKILL.md"
reviewed: 2026-08-03
llm_wiki_status: excluded
llm_wiki_ref: ""
---

# PowerShellからgh本文を更新するときの改行保持

## 主張

Windows PowerShellから`gh`で複数行Markdown本文を作成・更新する場合は、UTF-8のMarkdownファイルを`--body-file`で渡すと、本文の改行とMarkdown構造を保持できる。

## 適用条件・対象外

- 適用: Windows PowerShellで`gh pr create`、`gh pr edit`、`gh issue create`、`gh issue edit`を使う場合。
- 対象外: GitHub Web UI上で直接編集する本文、複数行を含まない短い本文。

## 根拠

- PR #16では、PowerShellで複数行出力を配列のまま本文引数へ渡した結果、本文が2626文字・改行3個に崩れた。
- UTF-8のMarkdownファイルを用意して`gh pr edit 16 --body-file <path>`で更新した結果、本文は2593文字・改行103個になり、`gh pr view 16 --json body`とGitHub上の描画で見出し、箇条書き、改行を確認できた。

## 変更時の影響

- 確認する要件・設計・コード・テスト・Skill: `.agents/skills/github-issue-development/SKILL.md`の本文更新手順。本文更新後は一時ファイルをcommit対象に含めず削除し、CLI出力とGitHub描画を確認してからPRをReadyまたはIssueをcloseする。

## 履歴

- 2026-08-03: PR #16の実地確認を根拠に`verified`として作成。
