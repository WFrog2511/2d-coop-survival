---
name: report-harness-feedback
description: Capture recurring agent failures, unclear instructions, repeated workarounds, or safety gaps as sanitized, structured harness feedback. Use when deciding whether an observation should remain a consumer override or become a candidate central rule, Skill, validator, hook, or eval, and when drafting a review-ready central feedback issue.
---

# Report Harness Feedback

Turn observed behavior into evidence that can be reviewed without leaking consumer-specific or sensitive context.

## Workflow

1. Read [references/feedback-contract.md](references/feedback-contract.md).
2. Gather the smallest reproducible evidence: symptom, expected behavior, reproduction, current workaround, impact, and recurrence.
3. Remove secrets, personal data, confidential product details, and irrelevant logs. Ask for a safe summary when evidence cannot be sanitized.
4. Classify the candidate:
   - Keep it in the consumer override when it depends on one product, stack, command, path, or temporary constraint.
   - Propose central review when it recurs in two independent consumers and is generalizable.
   - Flag security, privacy, or data-loss prevention for immediate review even after one occurrence.
5. Select the weakest effective target surface: rule, Skill, validator, hook, eval, or decision.
6. Draft every required feedback field and link the sanitized evidence. State uncertainty explicitly.
7. Obtain human approval before creating or editing an external issue. Never stage, commit, publish, or promote the proposal unless separately authorized.

## Output

Return a review-ready draft, the recommended ownership (`consumer override` or `central candidate`), the proposed enforcement surface, missing evidence, and the approval still required. Do not call a candidate an accepted harness rule.
