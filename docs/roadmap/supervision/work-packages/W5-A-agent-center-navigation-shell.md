# Work Package W5-A - Agent Center Navigation Shell

## Context

W4-B defined Agent Center 2.0 as a page-like local agent operations cockpit:

- Office: pixel office canvas and real-time visual state.
- Agents: all-agent management view.
- Usage: token and quota intelligence page.
- Timeline: global event and action history page.

The current product still treats Agent Center as a modal opened above the Office canvas. The modal
already contains Agents, Usage, and Timeline tabs, but the first Agent Center 2.0 implementation
needs a page navigation shell so later work can deepen each page without making the current modal
more cramped.

This package implements Phase 1 from:

```text
docs/roadmap/product/agent-center-2-product-spec.md
```

Do not implement full Usage Intelligence or Team/Lab Mode in this package.

## Goal

Implement the Agent Center 2.0 navigation shell in the webview UI:

- Add page state for `Office`, `Agents`, `Usage`, and `Timeline`.
- Keep `Office` as the default page.
- Make the bottom toolbar Agents button route to the `Agents` page instead of opening a modal.
- Keep New Agent and Settings behavior available and unchanged.
- Keep Office/canvas behavior unchanged.
- Keep the bottom-toolbar provider filter scoped to Office/canvas only.
- Reuse the existing Agent Center modal content as page content where possible.

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
git checkout -b product/w5-a-agent-center-navigation-shell
```

Expected:

- `main` includes W4-D (`docs: outline Team Lab Mode architecture`) or later.
- Worktree is clean before branching.

Begin by reading:

```text
docs/roadmap/product/agent-center-2-product-spec.md
docs/roadmap/product/usage-intelligence-spec.md
webview-ui/src/App.tsx
webview-ui/src/components/AgentCenter.tsx
webview-ui/src/components/BottomToolbar.tsx
webview-ui/src/index.css
webview-ui/test/*.test.ts
```

## Implementation Guidance

Prefer a conservative refactor:

- Introduce an app-level page state, for example:
  - `office`
  - `agents`
  - `usage`
  - `timeline`
- Render a compact page navigation control inside the webview shell.
- Office should render the existing `OfficeCanvas`, overlays, editor toolbar, token summary,
  `ToolOverlay`, zoom controls, debug view, and bottom toolbar behavior as before.
- Agents/Usage/Timeline should render the existing Agent Center tab content as page surfaces.
- If useful, extract the current Agent Center modal body into a reusable component such as
  `AgentCenterSurface` or `AgentCenterPages`.
- It is acceptable to remove the old Agent Center modal wrapper once page navigation replaces it.
- Do not change the Kill confirmation modal semantics in `App.tsx`.
- Do not conflate Hide, Archive, and Kill.
- Do not change provider adoption, token parsing, layout persistence, or terminal launch behavior.

Bottom toolbar expectations:

- `+ Agent` still opens the New Agent modal with the same behavior.
- Settings still opens the Settings modal with the same behavior.
- The Agents button should switch to the Agents page.
- The Office/canvas provider filter must not scope Agents, Usage, or Timeline pages.
- If the bottom toolbar remains visible outside Office, hide or disable Office-only controls such as
  provider canvas filtering and layout editing outside the Office page.
- If the bottom toolbar is only visible on Office, provide another obvious way to return to Office,
  open Settings, and create a new agent from the page shell.

Page behavior expectations:

- Switching pages must not recreate `OfficeState` or lose agents, seats, zoom, selected agent, token
  data, hidden state, or timeline data.
- Office remains pixel-styled and visually unchanged.
- Agents page is an all-agent management destination, not scoped by the Office provider filter.
- Usage page must not render blank when no usage exists.
- Timeline page must continue showing retained action events after Hide, Archive, and Kill.
- Page-local filters in Agents/Usage/Timeline should survive page switches during the current webview
  session.

Design constraints:

- Keep the existing pixel UI language for this first implementation.
- Do not create a marketing/landing page.
- Do not add nested cards or decorative page sections.
- Text must not overflow buttons or compact controls at narrow VS Code panel widths.
- Avoid one-note palette changes. This is a shell/navigation change, not a visual redesign.

## Suggested Files

Likely files:

```text
webview-ui/src/App.tsx
webview-ui/src/components/AgentCenter.tsx
webview-ui/src/components/BottomToolbar.tsx
webview-ui/src/components/AgentCenterNavigation.tsx   # optional
webview-ui/src/components/agentCenterPages.ts          # optional pure helpers
webview-ui/test/agent-center-navigation.test.ts        # optional but preferred
```

Use the existing component structure if a different extraction is cleaner.

## Non-Goals

Do not:

- implement the full dense Agent table from W4-B Phase 2,
- implement normalized Usage Intelligence storage from W4-C,
- implement Usage charts, exports, anomaly detection, or thresholds,
- implement Team/Lab Mode,
- change server/provider behavior,
- change extension identity or VSIX packaging,
- publish or install the extension unless asked.

## Validation

Run:

```powershell
npm run check-types
npm run build
npm run test:webview
npm run test:server
```

If you add a pure navigation helper, add or update a webview test. Current focused baseline after
W4 is:

- webview tests: 22
- server tests: 203
- combined: 225

Expected combined test count should remain at least 225. If this package adds a new webview test,
the combined count should be at least 226.

Also run:

```powershell
git diff --check
```

Manual/visual QA:

- Build the webview and inspect the shell if a browser/dev-host workflow is available.
- Verify Office is the default page.
- Verify Agents button opens the Agents page.
- Verify all four pages can be reached.
- Verify the Office provider filter affects only Office/canvas visibility.
- Verify Usage and Timeline pages are not blank.

## Report

Write:

```text
docs/roadmap/supervision/reports/W5-A-agent-center-navigation-shell-report.md
```

Include:

- summary,
- files changed,
- navigation model implemented,
- how existing Agent Center modal/tab content was reused or extracted,
- Office behavior preservation notes,
- bottom toolbar/provider filter behavior,
- validation commands and test counts,
- any visual QA performed,
- unresolved questions or follow-up packages.

## Commit

Commit on the same branch.

Suggested commit:

```text
feat: add Agent Center navigation shell
```

Do not push, merge, rebase, or amend.
