---
name: manage-project-knowledge
description: Capture, verify, and maintain reusable project knowledge with evidence, then promote only approved and generalized knowledge to an external LLM-Wiki. Use during issue closeout, after discovering reusable procedures or troubleshooting, when a premise changes, or when the user asks to record, verify, audit, or publish project knowledge.
---

# Manage Project Knowledge

Keep project-specific reusable knowledge in `docs/01_project-journal/knowledge/`. Treat external LLM-Wiki as a cross-project knowledge hub, not as a copy of Issues or design documents.

## Capture

1. Review the Issue, PR, changed documentation, and executed evidence.
2. Skip transient progress, generic acknowledgements, raw logs, and facts already clear in canonical design documents.
3. Create `docs/01_project-journal/knowledge/nodes/YYYY-MM-DD_short-title.md` from `docs/01_project-journal/knowledge/templates/knowledge-node.md`.
4. Record one bounded claim, its scope, evidence, verification state, related Issue and documents, and review date.
5. Start uncertain knowledge as `proposed`; do not mark it `verified` without reproducible evidence.

## Change

When a knowledge claim changes, find its references in requirements, designs, code, tests, templates, and Skills. Update or flag every affected artifact before closing the Issue. Preserve superseded reasoning in Git history and link the replacement.

## Promote to LLM-Wiki

Treat promotion as an explicit closeout action, never as a Git hook.

1. Require human approval and a `verified` local node.
2. Remove secrets, personal data, machine-specific paths, project names, and unnecessary implementation detail.
3. Preserve applicability, limitations, evidence, and the source repository commit.
4. Invoke `@wiki` to resolve the configured hub, select a topic wiki, ingest the approved node as an immutable raw source, and compile or update the corresponding article.
5. Record the LLM-Wiki topic and article reference in the local node, then set `llm_wiki_status` to `published`.

If LLM-Wiki is unavailable, leave the node as `candidate`. Never invent a hub path or silently publish to a local `.wiki/`.
