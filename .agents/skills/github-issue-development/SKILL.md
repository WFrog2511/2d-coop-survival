---
name: github-issue-development
description: Run small AI-driven development slices and customer reviews through GitHub Issues and pull requests. Use when initializing a project, creating a task, decision, question, or customer-review Issue, preparing a pull request, recording customer confirmation, or closing a completed slice.
---

# GitHub Issue Development

GitHub is the source of truth when it is available. The repository contains only the minimal policy and templates needed to make work resumable in a new session.

## Workflow

1. Read `AGENTS.md`, the relevant GitHub Issue, and its linked pull requests.
2. Start a decision Issue when the Definition of Delivery is not agreed. Use [the template](../../../templates/definition-of-delivery.md) and record scope, acceptance, risk, and deferred work.
3. Create one task Issue per independently reviewable slice. Apply `type:task`, `type:decision`, or `type:question`.
4. Create one `type:customer-review` Issue per confirmation that needs a customer or project-owner response. Use the dedicated Issue Form, record the answer and affected artifacts in comments, and close it only after the decision is reflected.
5. Branch from `develop` as `feature/<topic>`. Keep the pull request target as `develop`; merge `develop` into `main` only after an explicit release confirmation.
6. Put the task Issue number and acceptance result in the PR using [the PR template](../../../templates/pr-description.md). Do not claim unexecuted checks as verified.
7. After the user approves and merges, close the Issue. Record reusable decisions and unresolved work with [the closeout template](../../../templates/closeout.md).

## Offline fallback

Use `docs/01_project-journal/local-issues/` only when GitHub is unavailable and one developer works locally. Assign local IDs there, then migrate each item to GitHub before shared or parallel work. Replace local IDs and paths with the GitHub Issue references after migration.

## Risk boundary

Use the light gate for isolated documentation or small changes, the standard gate for normal code changes, and the strict gate for authorization, personal data, irreversible side effects, external jobs, time boundaries, or state transitions. Record the selected gate and results in the PR.

Do not add GitHub Actions, branch-protection rules, or project-specific tooling unless the project explicitly needs them.
