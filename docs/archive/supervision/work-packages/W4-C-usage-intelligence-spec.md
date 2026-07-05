# Work Package W4-C - Usage Intelligence Spec

## Context

Pixel Agents Multi currently displays provider and agent token usage, including exact/estimated
labels and API proxy cost wording. The next product opportunity is Usage Intelligence: helping the
user understand where token usage went, whether something is unusual, and which agents/projects are
creating value.

This package is a product/technical specification package. Do not implement Usage Intelligence UI or
data storage in this package.

## Goal

Produce a Usage Intelligence specification that can later be used to implement analytics across:

- provider,
- model,
- project,
- agent,
- thread/session,
- time window,
- exact vs estimated usage,
- cache/reasoning/artifact token categories,
- API proxy estimate.

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
git checkout -b product/w4-c-usage-intelligence-spec
```

Expected:

- `main` includes `Merge W3-I: final Windows release handoff` or later.
- Worktree is clean before branching.

Begin by reading:

```text
docs/pixel-agents-product-strategy.html
docs/roadmap/supervision/reports/W3-C-usage-token-polish-report.md
docs/roadmap/supervision/reports/W3-G-usage-blank-regression-report.md
webview-ui/src/components/AgentCenter.tsx
webview-ui/src/office/engine/officeState.ts
server/src/providers/codex.ts
server/src/providers/claude.ts
server/src/tokenUsage.ts
```

If file paths differ, use `rg "tokenUsage|inputTokens|outputTokens|artifactOutputTokens|rateLimit"`
to locate the current usage code.

## Optional reference

The user mentioned this project as inspiration:

```text
https://github.com/iangithub/llm-usage-dashboard
```

If you inspect it, use it as product inspiration only. Do not copy code. Note which ideas are
relevant to Pixel Agents Multi and which are not.

## Deliverable

Write:

```text
docs/roadmap/product/usage-intelligence-spec.md
```

Create the `docs/roadmap/product/` directory if it does not exist.

## Spec requirements

Include:

- product objective,
- questions Usage Intelligence should answer,
- data sources currently available,
- data sources missing or unreliable,
- proposed normalized usage record schema,
- exact/estimated/proxy semantics,
- aggregation dimensions,
- time bucketing,
- charts/tables to display,
- empty/error states,
- privacy and local-first expectations,
- export format proposal,
- budget/threshold notification proposal,
- implementation phases,
- acceptance criteria.

## Required product semantics

Keep wording precise:

- exact provider usage when available,
- estimated usage when derived,
- API proxy estimate for cost-like display,
- never present proxy cost as subscription billing.

## Suggested UI model

Usage should have:

- top summary: provider totals and visible scope,
- provider breakdown,
- project breakdown,
- agent ledger,
- trend chart,
- anomaly/threshold area,
- export button.

This can live in Agent Center 2.0 as a full page, not a cramped modal.

## Validation

This package is docs-only. Run:

```powershell
git diff --check
```

If you inspect external resources, cite the URL in the report.

## Report

Write:

```text
docs/roadmap/supervision/reports/W4-C-usage-intelligence-spec-report.md
```

Include:

- summary,
- key data model decisions,
- chart/table proposal,
- external reference notes if used,
- unresolved questions,
- files changed.

## Commit

Commit on the same branch.

Suggested commit:

```text
docs: specify Usage Intelligence
```

Do not push, merge, rebase, or amend.
