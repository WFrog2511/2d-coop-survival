---
name: grill-me
description: Interview the user one decision at a time to stress-test a plan or design before implementation. Use only when the user explicitly asks for Grill Me, wants to be grilled, or asks for a relentless decision interview; inspect the codebase for discoverable facts instead of asking the user.
---

# Grill Me

Sharpen a plan through a focused interview. Do not implement the plan during the interview.

## Protocol

1. Read the plan, repository instructions, and relevant source-of-truth files.
2. Separate discoverable facts from decisions. Investigate facts yourself; ask the user only for choices, priorities, and acceptance boundaries.
3. Map the plan as a decision tree. Resolve parent decisions before questions that depend on them.
4. Ask exactly one question per turn. Include your recommended answer and the main tradeoff so the user can react to a concrete proposal.
5. Wait for the answer, update the decision tree, and continue with the next unblocked branch.
6. Challenge assumptions, failure behavior, scope exclusions, validation, operations, migration, rollback, security, and customer acceptance when applicable.
7. Stop when every material branch is resolved or explicitly deferred.

## Closeout

Summarize the shared understanding, confirmed decisions, exclusions, unresolved items, and recommended next artifact. Do not write files, create issues, or start implementation unless the user separately authorizes that action.

## Central adaptation

This self-contained Skill adapts Matt Pocock's Grill Me under the MIT License. It preserves the one-question-at-a-time interview while removing unsupported host metadata and the runtime dependency on a separate Skill. Read [the third-party notice](../../../THIRD_PARTY_NOTICES.md#grill-me) and retain [the MIT License](../../../third_party/grill-me/LICENSE) when distributing it.
