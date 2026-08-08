# Feedback Contract

## Required fields

| Field | Content |
| --- | --- |
| Observed symptom | Factual behavior, omission, or repeated misunderstanding |
| Expected behavior | Smallest useful behavior change |
| Reproduction and evidence | Sanitized steps, commands, logs, or durable links |
| Current workaround | Existing prevention or recovery, if any |
| Recurrence | Once, repeated in one consumer, two or more consumers, or urgent safety case |
| Generalization boundary | Where the change applies and where it does not |
| Proposed surface | Rule, Skill, validator, hook, eval, or decision |
| Risks | Security, privacy, data loss, compatibility, and migration impact |

## Ownership test

Keep the item local when it names product requirements, customer decisions, repository-only conventions, generated paths, or stack commands that are not broadly reusable. Treat it as a central candidate when evidence shows the same behavioral need across independent consumers.

An urgent security, privacy, or data-loss safeguard may bypass the recurrence threshold, but still requires sanitized evidence, explicit rationale, an eval when feasible, and human approval.

## Target selection

- Use a **rule** for concise context or judgment that should always be loaded.
- Use a **Skill** for a task-triggered, multi-step workflow.
- Use a **validator** for deterministic structure or contract checks.
- Use a **hook** only when prevention must be automatic and deterministic.
- Use an **eval** to preserve a behavior regression case.
- Use a **decision** to preserve a durable tradeoff or rejection rationale.

## Draft footer

End the draft with:

- Sanitization performed
- Missing or unverified evidence
- Requested human decision
- Consumer repositories affected, using non-sensitive identifiers when needed
