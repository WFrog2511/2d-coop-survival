---
name: retrospect-harness
description: Review a completed task, pilot slice, adoption, incident, or repeated workflow to find evidence-backed problems in the agent-development harness, separate consumer-local issues from central candidates, and create or update a sanitized Issue in the central harness repository when authenticated write access and explicit authorization are available. Use when the user asks for a harness retrospective, after harness-driven work exposes friction or repeated work, or at a planned pilot checkpoint.
---

# Retrospect Harness

Review how the harness affected the work. Do not treat product defects, delivery outcomes, or general dissatisfaction as harness failures without evidence.

## Workflow

1. Fix the review window: task, Issue, PR, pilot slices, commits, agents, rules, Skills, gates, and relevant failures. Review the full window rather than only the final busy period.
2. Compare intended behavior with observed behavior. Record useful behavior to preserve, friction, skipped or misunderstood instructions, repeated workarounds, unnecessary gates, unsafe gaps, and missing validation.
3. For each problem, capture the smallest factual evidence: symptom, expected behavior, reproduction, impact, workaround, recurrence, and uncertainty. Do not invent timings, cost, or causality.
4. Classify ownership:
   - Keep product requirements, repository-only commands, model availability, temporary environment failures, and customer decisions in the consumer.
   - Keep a one-repository convention as a consumer override unless it exposes a defect in a shared component.
   - Mark a reusable shared-component failure as a central candidate. Security, privacy, or data-loss risks may be urgent after one observation; ordinary promotion still needs the central evidence threshold.
5. For each central candidate, follow the sibling [feedback contract](../report-harness-feedback/references/feedback-contract.md). Sanitize secrets, personal data, confidential product facts, machine-specific paths, and irrelevant logs.
6. Resolve the central repository from the consumer's pinned harness source or the current central checkout. Do not guess a repository. Search open and closed Issues for the same root problem before writing.
7. Check both authority and capability:
   - Apply instruction precedence first. A current explicit denial, narrower scope, or revocation overrides durable repository authority for that invocation.
   - Treat explicit authorization in the current request or a durable repository instruction as authority to create or update the central Issue.
   - Treat authenticated Issue-write access as capability, not authorization by itself.
   - When both exist, create one Issue per independent root problem using the central harness-feedback fields. Add evidence to an existing Issue instead when it already tracks the same root problem and the authorization covers edits.
   - When either is missing, do not write externally. Return a paste-ready Issue draft and state the missing authority or capability.
8. Leave every created Issue as a candidate inbox item. Do not change shared rules, promote the finding, close the Issue, or claim acceptance as part of the retrospective.

## Output

Return the review window, behavior to preserve, evidence-backed problems, ownership decisions, local follow-ups, central Issue URLs or drafts, sanitization performed, missing evidence, and the authority used or still required.
