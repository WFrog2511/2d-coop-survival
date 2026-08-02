---
name: sync-detail-design-docgen
description: Create and maintain detailed design Markdown with DOCGEN_TODO reservations and code-derived DOCGEN blocks, then detect drift with the bundled Python synchronizer. Use when drafting detailed design before implementation, synchronizing design after Python code changes, investigating stale generated blocks, or adding a DOCGEN transform.
---

# Sync Detail Design DOCGEN

Read `docs/40_design/process/docgen.md` for the marker contract and supported transforms. Start a new document from `docs/40_design/templates/detail-design.md`.

## Before implementation

1. Write design intent, business rules, flows, state transitions, authorization, failure behavior, and test viewpoints by hand.
2. Reserve only code-recoverable facts with `DOCGEN_TODO` blocks.
3. Set `source`, `transform`, and `target` to the intended public implementation boundary. Keep uncertain targets as TODO.
4. Do not place DOCGEN blocks in requirements, ADRs, or basic design unless the project explicitly changes that boundary.

## After implementation

1. Confirm each source and target exists.
2. Run `python scripts/docgen.py "docs/40_design/detail/**/*.md"` from the repository root.
3. Review promoted TODO blocks and generated diffs. Never hand-edit content between `DOCGEN:START` and `DOCGEN:END`.
4. Run `python scripts/docgen.py --check "docs/40_design/detail/**/*.md"` and the Markdown link checker.
5. Record the commands and results in the PR.

## Change the generator

Add a transform only when an existing transform cannot express a stable code fact. Implement it under `scripts/docgen_lib/transforms/`, register it in `transforms/__init__.py`, and add pytest cases for synchronization, stale detection, and actionable failure output. Keep design decisions outside generated blocks.
