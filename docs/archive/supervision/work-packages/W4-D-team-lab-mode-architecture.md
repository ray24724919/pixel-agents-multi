# Work Package W4-D - Team / Lab Mode Architecture

## Context

The long-term product idea is a Team / Lab Mode for a small group, roughly 3-5 people, where members
can see shared AI agent work state across projects without exposing private raw transcripts by
default.

This should come after the personal local cockpit is stable:

- local provider monitoring,
- Agent Center 2.0,
- Usage Intelligence,
- reliable release verification,
- repo-centered collaboration.

This package is an architecture/research package. Do not implement Team / Lab Mode in product code.

## Goal

Produce a long-term architecture document for Team / Lab Mode that defines:

- what should be shared,
- what should stay private,
- how git repos can act as the first shared coordination layer,
- what data model should be reserved now,
- what future platform components would be needed.

## Required branch and preflight

Run from:

```text
C:\Users\User\Documents\raychen\pixel-agents-multi
```

Commands:

```powershell
git checkout main
git log -3 --oneline
git status --short --branch
git checkout -b product/w4-d-team-lab-mode-architecture
```

Expected:

- `main` includes `Merge W3-I: final Windows release handoff` or later.
- Worktree is clean before branching.

Begin by reading:

```text
docs/pixel-agents-product-strategy.html
docs/roadmap/supervision/cleanup-framework.md
docs/roadmap/supervision/deviation-map.md
docs/roadmap/supervision/symptoms-log.md
docs/roadmap/product/agent-center-2-product-spec.md
docs/roadmap/product/usage-intelligence-spec.md
```

If the W4-B or W4-C product specs do not exist yet, proceed with the product strategy HTML and note
that the architecture should be revisited after those specs are written.

## Deliverable

Write:

```text
docs/roadmap/product/team-lab-mode-architecture.md
```

Create the `docs/roadmap/product/` directory if it does not exist.

## Architecture requirements

Include:

- product objective,
- why this comes after personal local cockpit,
- target team size and use cases,
- non-goals,
- privacy model,
- visibility model,
- repo-centered collaboration model,
- handoff protocol,
- shared artifact schema,
- local agent record schema extensions,
- synchronization options,
- possible server/platform architecture,
- auth and identity considerations,
- audit trail model,
- Usage Intelligence across team members,
- risks and mitigations,
- phased rollout plan,
- acceptance criteria for a future MVP.

## Product principles

Use these principles:

- Do not build a surveillance tool.
- Do not sync raw prompts/transcripts by default.
- Prefer sharing status, summaries, artifacts, repo links, branches, PRs, and handoff notes.
- Let users opt into project/team visibility.
- Keep local-first operation useful even without a team server.
- Treat git repo artifacts as the first bridge between personal and team modes.

## Suggested phases

Document at least these phases:

1. Personal local cockpit.
2. Repo-centered collaboration.
3. Shared handoff protocol.
4. Optional team sync service.
5. Team/Lab dashboard.

## Validation

This package is docs-only. Run:

```powershell
git diff --check
```

If you change any code, stop and explain why.

## Report

Write:

```text
docs/roadmap/supervision/reports/W4-D-team-lab-mode-architecture-report.md
```

Include:

- summary,
- key architecture decisions,
- privacy stance,
- repo-centered collaboration stance,
- unresolved questions,
- files changed.

## Commit

Commit on the same branch.

Suggested commit:

```text
docs: outline Team Lab Mode architecture
```

Do not push, merge, rebase, or amend.
