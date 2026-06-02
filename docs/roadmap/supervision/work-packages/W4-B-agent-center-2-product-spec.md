# Work Package W4-B - Agent Center 2.0 Product Spec

## Context

The current Agent Center works, but it is still constrained by a modal layout. The product direction
is to evolve Pixel Agents Multi from a pixel office plus modal into a local-first agent operations
cockpit with page-like navigation:

- Office: visual real-time state.
- Agents: dense management table and detail drawer.
- Usage: analytics and token intelligence.
- Timeline: event history and handoff flow.

This package is a product/UX specification package. Do not implement the new UI in this package.

## Goal

Produce a clear Agent Center 2.0 specification that can later be handed to an implementation
executor. The spec should define the information architecture, interaction model, states, and
acceptance criteria for a page-like Agent Center.

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
git checkout -b product/w4-b-agent-center-2-product-spec
```

Expected:

- `main` includes `Merge W3-I: final Windows release handoff` or later.
- Worktree is clean before branching.

Begin by reading:

```text
docs/pixel-agents-product-strategy.html
docs/roadmap/supervision/reports/W3-I-final-windows-release-handoff-report.md
webview-ui/src/components/AgentCenter.tsx
webview-ui/src/App.tsx
webview-ui/src/components/BottomToolbar.tsx
webview-ui/src/office/engine/officeState.ts
```

## Deliverable

Write:

```text
docs/roadmap/product/agent-center-2-product-spec.md
```

Create the `docs/roadmap/product/` directory if it does not exist.

## Spec requirements

Include:

- product objective,
- target users,
- non-goals,
- page-level navigation proposal,
- Agents page layout,
- Usage page relationship,
- Timeline page relationship,
- detail drawer design,
- action model for Focus / Project / Transcript / Pause / Resume / Hide / Archive / Kill,
- hidden/archived/paused/error states,
- provider/project/status filters,
- sorting and search,
- empty/loading/error states,
- keyboard/accessibility expectations,
- mobile/narrow panel behavior,
- migration plan from current modal,
- implementation phases,
- acceptance criteria.

## Design direction

Use the product report's design guidance:

- Office can remain pixel-art oriented.
- Agent Center can be denser and more GitHub/Linear-like.
- Avoid marketing-page layout.
- Avoid nested cards.
- Use table/list surfaces for management, not decorative cards.
- Keep dangerous actions in a detail drawer or confirmation modal.
- Make text fit in compact panel widths.

## Important product decision

Agent Center should remain an all-agent management view by default. The bottom-toolbar provider
filter changes the canvas visibility; Agent Center can have its own internal filters. Document this
explicitly so future implementers do not confuse canvas filtering with management filtering.

## Validation

This package is docs-only. Run:

```powershell
git diff --check
```

If you change any code, stop and explain why the package scope expanded.

## Report

Write:

```text
docs/roadmap/supervision/reports/W4-B-agent-center-2-product-spec-report.md
```

Include:

- summary of the proposed Agent Center 2.0 model,
- key decisions,
- unresolved questions,
- files changed.

## Commit

Commit on the same branch.

Suggested commit:

```text
docs: specify Agent Center 2.0
```

Do not push, merge, rebase, or amend.
