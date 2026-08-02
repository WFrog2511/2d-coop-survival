---
name: ponytail
description: Apply YAGNI, reuse, standard-library-first, and native-platform-first decisions to coding, fixing, refactoring, design, dependency selection, and code review. Use when implementing code or when the user asks for Ponytail, the simplest correct solution, less boilerplate, fewer dependencies, or an over-engineering review. Do not use for prose-only work.
---

# Ponytail

Choose the smallest correct implementation after understanding the affected flow. Efficient means less code to own, not less investigation or safety.

## Decision ladder

Stop at the first option that fully satisfies the confirmed requirement:

1. Skip work that is speculative or already unnecessary.
2. Reuse an existing helper, type, pattern, Skill, hook, or tool in the repository.
3. Use the language standard library.
4. Use a native platform, browser, database, framework, or operating-system feature.
5. Reuse an already-installed dependency.
6. Use the smallest direct implementation.

Read the relevant code and trace callers before choosing a rung. For a bug, fix the shared root cause when that is smaller and safer than patching each symptom.

## Guardrails

- Do not add speculative abstractions, one-implementation interfaces, one-product factories, future-only configuration, or dependencies for a few clear lines.
- Prefer deletion and a small diff, but keep code boring and maintainable rather than compressed or clever.
- Never remove trust-boundary validation, authorization, security, accessibility, data-loss prevention, required error handling, auditability, or explicitly requested behavior.
- Keep calibration or configuration that real hardware or deployment variance requires.
- Leave one small runnable check for non-trivial branches, loops, parsers, money, security, or state transitions. Follow stricter repository quality gates when they apply.
- Record a deliberate shortcut only when it has a real ceiling. Use `ponytail: <ceiling>, revisit when <trigger>` in a code comment or the related Issue.
- If the user explicitly chooses the fuller design after seeing the trade-off, implement it without repeating the objection.

## Closeout

State the implemented minimum, what was deliberately omitted, and the concrete trigger for adding it. Do not invent savings numbers. Ponytail supplements correctness, security, performance, and domain review; it does not replace them.

## Local adaptation

This Skill adapts Dietrich Gebert's Ponytail under the MIT License. The starter omits upstream persistent modes, response-length rules, and lifecycle hooks so repository instructions and human approval remain authoritative. See [the local guide](../../../docs/01_project-journal/playbooks/ponytail.md) and [the MIT License](../../../third_party/ponytail/LICENSE).
