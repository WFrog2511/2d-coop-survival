---
name: prepare-delivery-evidence
description: Prepare a release or delivery with local preflight diagnostics, separate documentation/product/acceptance decisions, reproducible command logs, SHA-256 evidence manifests, and closeout inventory. Use before a release validation, delivery decision, evidence collection, or project closeout.
---

# Prepare delivery evidence

1. Confirm the approved Definition of Delivery and copy both templates under `docs/70_delivery/<release-name>/`.
2. Run `python scripts/project_preflight.py` before expensive validation. Add required commands, environment variables, writable paths, and ports from the Definition of Delivery. Use `--release` only on the fixed clean revision.
3. Update `release-readiness.md` without combining the documentation, product-quality, and delivery-acceptance decisions. Validate it with `check_delivery_readiness.py`.
4. Copy `templates/evidence-plan.json`, replace placeholders, and keep every command as an argv array. Do not use shell expressions or place secrets in arguments.
5. Run `collect_delivery_evidence.py` into a new directory. A failed command must keep its log and make the collector fail.
6. Verify the generated commit, status, exit codes, logs, and hashes. A package records technical evidence; it does not grant customer approval.
7. Complete `templates/closeout.md`, including GitHub Issues, branches, tags, uncommitted changes, constraints, and Knowledge candidates.

Never overwrite an existing evidence directory or edit generated logs to make a failed run appear successful. Preserve old evidence when delivery conditions change.