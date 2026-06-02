# W5-B Agents Page Management Report

Date: 2026-06-02
Branch: `product/w5-b-agents-page-management`

## Summary

Implemented Agent Center 2.0 Phase 2 for the Agents page. The page now has a searchable, sortable
agent list model, denser table-like rows, clearer state counters, and more explicit row/drawer
metadata while preserving the existing action message protocol.

This package did not change provider discovery, server behavior, terminal launch, token parsing,
Usage Intelligence storage, Team/Lab Mode, or Hide/Archive/Kill backend semantics.

## Files Changed

- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/agentCenterListModel.ts`
- `webview-ui/test/agent-center-list-model.test.ts`
- `docs/roadmap/supervision/reports/W5-B-agents-page-management-report.md`

## Search, Filter, and Sort Model

Added `agentCenterListModel.ts` as a pure helper for Agents page list behavior.

Search is case-insensitive and normalizes Windows/POSIX path separators. It indexes:

- agent name and id,
- provider,
- project name and project path,
- transcript path and session id,
- team name and role,
- current status/activity/detail text,
- recent timeline event text.

Filtering now combines provider, status, project, team, hidden state, and search query before
sorting. Supported sort keys are:

- attention first,
- recently updated,
- agent name,
- project,
- provider,
- token total,
- status.

Default attention sorting orders needs-me, error, active, paused, waiting, then hidden agents, with
recent update time and name as stable fallbacks.

## Visual State Improvements

- Added Agents page state counters for shown, visible, needs-me, error, active, paused, waiting, and
  hidden agents.
- Changed rows into a denser table-like grid with attention, identity, project, activity, and token
  columns.
- Added text-based attention badges so states are not color-only.
- Hidden rows are visually muted when shown.
- Paused, waiting/needs-me, active, and error states use distinct text labels and semantic border/dot
  colors.
- Token rows show compact totals and exact/estimated labels when row data exists.

## Detail Drawer and Actions

- The existing detail drawer remains the only place for the `Actions` button that opens
  Hide/Archive/Kill handling.
- Dangerous actions were not added to inline rows.
- Existing drawer actions continue to send the same messages:
  `focusAgent`, `openAgentProject`, `openAgentTranscript`, pause/resume, and the existing action
  modal path.
- The drawer now includes current activity, session id, updated time, and wrapped project/transcript
  paths when available.

## Tests Added

Added `webview-ui/test/agent-center-list-model.test.ts` covering:

- search across identity, paths, session metadata, team, and activity text,
- combined provider/status/project/team/search/hidden filtering,
- default attention sort order,
- token and recently updated sort behavior.

## Validation

Commands run after the final code changes:

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
- `npm run test:webview`: 28 passed.
- `npm run test:server`: 204 passed.
- Combined test count: 232.
- `git diff --check`: passed.

## Visual QA

Browser mock smoke QA was performed against `http://127.0.0.1:5173/`:

- Office loaded by default with the canvas present.
- Agents page rendered without the Office/canvas provider filter or Layout controls in the bottom
  toolbar.
- Search input and sort select were present.
- Searching showed the Clear filters control.
- Sort select changed to `tokens`.
- Show hidden checkbox toggled successfully.
- Usage and Timeline pages rendered nonblank content after visiting Agents.

The browser mock had no visible agents in this pass, so row-level visual verification for real
paused/waiting/needs-me/active/error/hidden agents still needs an Extension Host or live-session
manual QA pass.

## Follow-Up

- Future W5 packages can add archived-agent scopes once archived records are surfaced to the
  webview.
- Keyboard row navigation beyond normal button/tab behavior remains a later accessibility pass.
- Runtime visual QA with several live agents should verify row badge density at narrow VS Code panel
  widths.
