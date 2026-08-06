---
name: manage-delivery-acceptance
description: Maintain a Delivery-strict named-release acceptance matrix that links requirements, specifications, implementation, evidence, and customer-review Issues without treating partial test success as full acceptance.
---

# Manage Delivery Acceptance

Treat the matrix as a delivery index, not as the source of truth for requirements or approvals. This Skill applies by default to a `Delivery-strict` named release, not to each Prototype standard feature.

## Workflow

1. For `Prototype standard`, retain traceability in the task Issue, PR validation, executable tests, and any customer-review Issue. Do not create or update a per-feature matrix, readiness file, or evidence collection by default.
2. For a `Delivery-strict` named release, copy `docs/70_delivery/templates/acceptance-matrix.md` to `docs/70_delivery/<release-name>/acceptance-matrix.md` after Definition of Delivery approval.
3. Reuse a requirement ID, specification ID, or GitHub Issue number as the acceptance ID. Do not duplicate the same acceptance fact with both a requirement row and an Issue row.
4. Add or update a row only when release acceptance scope, implementation, evidence, or customer confirmation changes. Keep customer answers and approval in the linked `type:customer-review` Issue.
5. Before a related release PR, run `python -X utf8 scripts/check_acceptance_matrix.py --check <matrix>`.
6. Before delivery, verify linked customer-review Issues and run `python -X utf8 scripts/check_acceptance_matrix.py --release <matrix>`.

Existing matrices are historical records. Do not retroactively change them or create a follow-up commit only to copy current PR status or head SHA into repository files.

## Gate boundary

The pre-commit hook runs `--staged` only. It checks deterministic structure, duplicate IDs, states, Issue references, and local links without invoking an agent or the network.

Standard checks allow `未検証` and `待ち` while work is in progress. Release checks require technical `PASS`, customer `不要` or `承認`, implementation references, and evidence. Never auto-edit the matrix or infer approval from test success.
