---
name: manage-delivery-acceptance
description: Maintain a delivery acceptance matrix that links requirements, specifications, implementation, evidence, and customer-review Issues. Use when Definition of Delivery is agreed, acceptance conditions change, a pull request affects delivery scope, or release readiness must be verified without treating partial test success as full acceptance.
---

# Manage Delivery Acceptance

Treat the matrix as a delivery index, not as the source of truth for requirements or approvals.

## Workflow

1. After Definition of Delivery is approved, copy `docs/70_delivery/templates/acceptance-matrix.md` to `docs/70_delivery/<release-name>/acceptance-matrix.md`.
2. Reuse a requirement ID, specification ID, or GitHub Issue number as the acceptance ID. Do not create another local sequence.
3. Add or update a row when acceptance scope, implementation, evidence, or customer confirmation changes. Ordinary code commits that do not affect these facts need no matrix edit.
4. Link customer decisions to a `type:customer-review` Issue. Keep answers and approval in GitHub instead of copying them into the matrix.
5. Before a related pull request, run `python scripts/check_acceptance_matrix.py --check <matrix>` and review whether the changed slice needs a row update.
6. Before delivery, verify the linked customer-review Issues and run `python scripts/check_acceptance_matrix.py --release <matrix>`.

## Gate boundary

The pre-commit hook runs `--staged` only. It checks deterministic structure, duplicate IDs, states, Issue references, and local links without invoking an agent or the network.

Standard checks allow `未検証` and `待ち` while work is in progress. Release checks require technical `PASS`, customer `不要` or `承認`, implementation references, and evidence. Never auto-edit the matrix or infer approval from test success.
