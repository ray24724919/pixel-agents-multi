# Work Package W5-B - Agents Page Management

## Context

W5-A implemented the Agent Center 2.0 navigation shell. The webview now has page-level destinations:

- Office
- Agents
- Usage
- Timeline

The Agents page still largely reuses the previous Agent Center modal/tab content. W5-B should deepen
the Agents page into the primary all-agent management surface described in:

```text
docs/roadmap/product/agent-center-2-product-spec.md
```

This package implements Agent Center 2.0 Phase 2.

Do not implement full Usage Intelligence, archived-history browsing, Team/Lab Mode, or provider/server
changes in this package.

## Goal

Turn the Agents page into a dense, searchable, sortable all-agent management view:

- Keep all active non-hidden agents visible by default.
- Ensure the Agents page is not scoped by the Office/canvas provider filter.
- Add search across agent identity and project/session metadata.
- Add sorting for the main agent list.
- Improve hidden, paused, waiting/needs-me, active, and error visual states.
- Keep the detail drawer persistent and useful while changing rows.
- Keep all existing action semantics and message protocol unchanged.

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
git checkout -b product/w5-b-agents-page-management
```

Expected:

- `main` includes W5-A (`feat: add Agent Center navigation shell`) or later.
- Worktree is clean before branching.

Begin by reading:

```text
docs/roadmap/product/agent-center-2-product-spec.md
docs/roadmap/supervision/reports/W5-A-agent-center-navigation-shell-report.md
webview-ui/src/App.tsx
webview-ui/src/components/AgentCenter.tsx
webview-ui/src/components/AgentCenterNavigation.tsx
webview-ui/src/components/BottomToolbar.tsx
webview-ui/src/components/agentCenterPages.ts
webview-ui/test/agent-center-hidden.test.ts
webview-ui/test/agent-center-navigation.test.ts
```

## Implementation Guidance

Prefer a focused webview refactor.

Likely improvements:

- Add a search input in the Agents page filter/search band.
- Search should match useful fields such as:
  - agent name,
  - agent id,
  - provider,
  - project/folder name,
  - project path,
  - transcript/session path,
  - team name and role,
  - current status/activity text.
- Add a sort control for the main agent list.
- Suggested sort keys:
  - Attention first (needs-me/error/waiting/active/paused/idle/hidden),
  - Recently updated,
  - Agent name,
  - Project,
  - Provider,
  - Token total.
- Keep provider, status, project, team, hidden toggle, search, and sort working together.
- Keep page-local filters/search/sort state alive while switching Office/Agents/Usage/Timeline during
  the current webview session.
- Make the agent rows more table-like and compact:
  - attention/status indicator,
  - agent name/id/provider badge,
  - project,
  - current activity,
  - compact token total and exact/estimated label,
  - safe quick actions only.
- Keep dangerous actions out of inline row controls. The existing drawer/actions modal path should
  remain the place for Hide, Archive, and Kill.
- Improve the detail drawer so it remains readable and useful for:
  - selected agent identity,
  - project and transcript/session paths,
  - current activity/status,
  - usage summary,
  - team metadata,
  - recent timeline,
  - action buttons.

If filtering/sorting logic becomes non-trivial, extract pure helpers, for example:

```text
webview-ui/src/components/agentCenterListModel.ts
```

Add tests for those helpers.

## Current Behavior To Preserve

- Office remains the default page.
- The top page navigation from W5-A remains available.
- The bottom toolbar `Agents` button routes to the Agents page.
- `+ Agent`, Refresh, and Settings behavior stay unchanged.
- The Office/canvas provider filter affects only Office/canvas visibility.
- Agents page starts from all active non-hidden agents, regardless of the Office provider filter.
- Existing action message protocol stays the same:
  - `focusAgent`
  - `openAgentProject`
  - `openAgentTranscript`
  - `agentPause`
  - `agentResume`
  - `agentAction`
- Kill still requires the existing confirmation modal.
- Hidden agents remain excluded until `Show hidden` is enabled.
- Timeline action events remain retained by the existing model.

## Non-Goals

Do not:

- implement archived-agent browsing or restore archived records,
- implement new provider scanners or change adoption behavior,
- change Hide/Archive/Kill backend semantics,
- implement full Usage Intelligence storage, charts, export, thresholds, or anomalies,
- implement Team/Lab Mode,
- add multi-select or bulk destructive actions,
- publish or install the VSIX unless asked.

## Design Constraints

- Keep the current pixel UI language for this phase.
- Prefer dense, scannable operational UI over decorative cards.
- Do not put UI cards inside other cards.
- Do not add marketing copy or a landing page.
- Text must fit in narrow VS Code panels.
- Row/drawer controls should be keyboard reachable and have clear labels.
- Preserve stable layout dimensions so status labels, token labels, and buttons do not resize the
  page unexpectedly.

## Validation

Run:

```powershell
npm run check-types
npm run build
npm run test:webview
npm run test:server
git diff --check
```

Add or update webview tests for search/filter/sort behavior. Current W5-A baseline is:

- webview tests: 24
- server tests: 204
- combined: 228

Expected combined test count should be at least 229 if you add a new test file or test case.

Manual/visual QA:

- Office is still the default page.
- Agents page shows all active non-hidden agents by default.
- Office provider filter does not change Agents page scope.
- Search, filter, and sort work together.
- Hidden agents appear only when `Show hidden` is enabled.
- Paused, waiting/needs-me, active, error, and hidden states are visually distinct.
- Detail drawer actions still send the existing messages.
- Usage and Timeline pages still render nonblank content after the Agents page changes.

## Report

Write:

```text
docs/roadmap/supervision/reports/W5-B-agents-page-management-report.md
```

Include:

- summary,
- files changed,
- search/filter/sort model,
- visual state improvements,
- detail drawer/action behavior,
- validation commands and test counts,
- any visual QA performed,
- unresolved questions or follow-up packages.

## Commit

Commit on the same branch.

Suggested commit:

```text
feat: improve Agents page management
```

Do not push, merge, rebase, or amend.
