# W5-A Agent Center Navigation Shell Report

Date: 2026-06-02
Branch: `product/w5-a-agent-center-navigation-shell`

## Summary

Implemented Agent Center 2.0 Phase 1 as a page navigation shell in the webview UI. Office remains
the default page, while Agents, Usage, and Timeline are now top-level page destinations instead of
tabs inside an Agent Center modal.

This package did not change provider discovery, terminal launch, token parsing, Hide/Archive/Kill
semantics, or server behavior.

## Files Changed

- `webview-ui/src/App.tsx`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/AgentCenterNavigation.tsx`
- `webview-ui/src/components/BottomToolbar.tsx`
- `webview-ui/src/components/agentCenterPages.ts`
- `webview-ui/test/agent-center-navigation.test.ts`
- `docs/roadmap/supervision/reports/W5-A-agent-center-navigation-shell-report.md`

## Navigation Model

- Added app page state with four destinations: `office`, `agents`, `usage`, and `timeline`.
- `office` is the default page.
- Added a compact pixel-styled page navigation control at the top of the webview.
- The Bottom Toolbar `Agents` button now routes to the Agents page.
- The same page state drives the shell, the toolbar button state, and Office-only control visibility.

## Agent Center Extraction

The existing Agent Center modal body was extracted into `AgentCenterSurface`. Its previous Agents,
Usage, and Timeline tab content now renders as page content based on the active Agent Center page.

`AgentCenterSurface` remains mounted while the user switches between Office, Agents, Usage, and
Timeline, so page-local filters and detail selection can survive within the current webview session.

## Office Preservation

- `OfficeState`, editor state, selected agent state, hidden state, token metadata, and timeline data
  remain owned by `App`.
- Office renders the existing `OfficeCanvas`, overlays, zoom controls, editor toolbar, debug view,
  token summary, and tool overlay only on the Office page.
- The Kill confirmation modal and existing agent action copy remain unchanged.

## Bottom Toolbar and Provider Filter

- `+ Agent`, `Refresh`, `Agents`, and `Settings` remain available from the shell.
- `+ Agent` still opens the existing New Agent modal.
- Settings still opens the existing Settings modal.
- The Office provider filter and Layout button are shown only on the Office page, so they affect
  Office/canvas visibility only and do not scope Agents, Usage, or Timeline.

## Tests Added

Added `webview-ui/test/agent-center-navigation.test.ts` covering:

- Office as the default page and all four page destinations.
- Agent Center pages being separate from Office-only canvas controls.

## Validation

Commands run:

```powershell
npm run check-types
npm run build
npm run test:webview
npm run test:server
git diff --check
```

Results:

- `npm run check-types`: passed.
- `npm run build`: passed.
- `npm run test:webview`: 24 passed.
- `npm run test:server`: 204 passed.
- Combined test count: 228.
- `git diff --check`: passed.

## Visual QA

Browser mock smoke QA was performed against `http://127.0.0.1:5173/` after the production build
passed:

- Office loaded by default with the canvas present.
- All four page navigation buttons were uniquely reachable.
- Agents page rendered the Agent Center surface and hid the Office provider filter/Layout controls
  from the bottom toolbar.
- Usage page rendered nonblank provider usage content.
- Timeline page rendered nonblank timeline content.
- Returning to Office restored the canvas and Office-only toolbar controls.

No VS Code Extension Host manual QA was performed in this pass.

## Follow-Up

- Future W5 packages can deepen the Agents page into the dense Agent Center 2.0 table/detail
  experience.
- Usage and Timeline still reuse the existing content surfaces; full Usage Intelligence and
  timeline refinements remain separate packages.
