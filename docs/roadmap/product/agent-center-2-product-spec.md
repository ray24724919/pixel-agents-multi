# Agent Center 2.0 Product Spec

## Product Objective

Agent Center 2.0 turns Pixel Agents Multi from a pixel office with a management modal into a
local-first agent operations cockpit. The office remains the visual real-time state surface. Agent
Center becomes the dense management surface for supervising many Claude and Codex sessions across
projects, providers, teams, and task states.

The core product promise:

- The user can see every active local AI coding agent that Pixel Agents Multi knows about.
- The user can quickly answer "what is running, where, what needs me, what is expensive, and what
  changed recently?"
- The user can safely act on an agent without losing history or accidentally killing the wrong
  process.
- The user can move between visual state, agent management, usage intelligence, and timeline
  history without opening a cramped modal.

Agent Center should remain an all-agent management view by default. The bottom-toolbar provider
filter controls canvas visibility only. Agent Center has its own internal filters and must not
inherit the canvas filter as its default scope.

## Target Users

- Solo developer running multiple Claude and Codex sessions while coding locally.
- Power user supervising several agent threads across one or more repositories.
- Technical lead using Pixel Agents Multi as a local status cockpit before creating handoff notes,
  branches, or reports.
- Maintainer validating provider adoption, token usage, and session state during local VSIX release
  testing.

## Non-Goals

- Do not replace the pixel office. Office remains the first visual state surface.
- Do not create a marketing-style landing page.
- Do not build a team SaaS dashboard or cloud sync model.
- Do not expose raw transcript contents by default.
- Do not implement bulk destructive actions in the first Agent Center 2.0 release.
- Do not make the bottom-toolbar provider filter drive Agent Center management scope.
- Do not redesign the layout editor as part of this package.
- Do not change provider adoption, transcript parsing, or token accounting semantics in the UI
  migration itself.

## Product Principles

- Dense but calm: use table/list surfaces and compact detail panels, closer to GitHub or Linear than
  a decorative card grid.
- Local-first: show local sessions, local paths, local transcripts, and local lifecycle state without
  implying cloud telemetry.
- Clear danger boundaries: Hide, Archive, and Kill must remain separate actions with separate copy.
- Exactness labels matter: token and lifecycle data should say when values are exact, estimated, or
  unavailable.
- Fit narrow panels: labels, controls, and table cells must truncate or wrap cleanly in VS Code side
  panels and narrow windows.
- No nested cards: pages use full-width bands, tables, split panes, drawers, and modals only where
  the task needs framing.

## Page-Level Navigation

Agent Center 2.0 should use page-like navigation inside the webview shell.

Primary pages:

- Office: pixel office canvas, toolbar, layout editor entry, current visual agent state.
- Agents: dense all-agent table/list plus detail drawer.
- Usage: token and quota intelligence by provider, project, model, and agent.
- Timeline: global event history, action history, and future handoff flow.

Recommended navigation model:

- Use a compact top or side navigation rail depending on available width.
- Office remains the default first page on extension open.
- The existing bottom-toolbar `Agents` button becomes a shortcut to the Agents page.
- The bottom-toolbar provider filter remains visible only on Office and continues to filter canvas
  visibility.
- Agents, Usage, and Timeline pages have their own filter state. They start with all active
  non-hidden agents unless the user changes page-local filters.
- Page navigation should preserve page-local filters during the current webview session.

## Agents Page Layout

The Agents page is the primary management screen.

Recommended desktop/wide layout:

- Header band:
  - Title: `Agents`
  - Summary counters: all active, active/running, waiting/needs me, paused, hidden, archived.
  - Refresh command.
  - Optional compact "last scan" timestamp.
- Filter/search band:
  - Search input.
  - Provider filter.
  - Project filter.
  - Status filter.
  - Hidden/archived scope controls.
  - Sort control.
- Main split:
  - Left or center: virtualized table/list of agents.
  - Right: persistent detail drawer for the selected agent.
- Footer/status strip:
  - Shows selected count only if multi-select arrives in a later phase.
  - Shows warnings such as provider scanner degraded, Claude CLI missing, or VS Code CLI unavailable
    only when relevant.

Recommended table columns:

- Attention: icon/status indicator for needs me, active, paused, error, hidden, archived.
- Agent: name, id, provider badge, team/role when available.
- Project: folder name plus path tooltip.
- Task/thread: thread title, session id snippet, or first prompt summary when known.
- Activity: current tool/lifecycle label and relative update time.
- Tokens: compact exact/estimated token total.
- State: lifecycle state badge.
- Actions: focus/open menu, with destructive actions kept out of inline one-click controls.

Rows should be compact and scannable. Avoid decorative cards. On hover/focus, reveal quick actions
that are safe: Focus, Project, Transcript. Dangerous actions stay in the drawer or confirmation
modal.

## Detail Drawer

The detail drawer is the place for inspection and actions. It should remain visible while the user
changes rows.

Drawer sections:

- Identity:
  - Agent name, provider, id, lifecycle state, hidden/archived/paused flags.
  - Project folder and full path.
  - Transcript/session path when available.
  - Thread/session id.
- Current activity:
  - Tool or lifecycle label.
  - Waiting/permission state.
  - Last update time.
  - Error or degraded scanner detail when present.
- Usage:
  - Input/output/reasoning/cache/artifact estimate where available.
  - Exact vs estimated label.
  - Codex quota snapshot and reset countdown when present.
- Team:
  - Lead/member role and team name when available.
  - Nearby team members for future team workflows.
- Recent timeline:
  - Latest lifecycle/action/tool events for this agent.
  - Action events must remain visible after Hide, Archive, and Kill.
- Actions:
  - Focus
  - Project
  - Transcript
  - Pause or Resume
  - Hide
  - Archive
  - Kill

Drawer behavior:

- Selecting a row updates the drawer without changing page filters.
- If the selected agent disappears because of Archive or confirmed Kill, keep a short terminal state
  in the drawer long enough to show the action result, then move selection to the next relevant row.
- If Kill fails for an external process, keep the agent selected and visible with the failure event.
- If no agent is selected, show a compact empty drawer with guidance to select an agent.

## Action Model

### Focus

Purpose: switch attention to the agent.

Behavior:

- Sends `focusAgent` for the agent id.
- On Office page, camera follows or selects the character.
- For sub-agents, focus should route to the parent terminal/session when applicable.
- Non-destructive and safe as an inline row action.

### Project

Purpose: open or reveal the agent project.

Behavior:

- Sends `openAgentProject` or equivalent.
- Disabled when no project path is known.
- Shows the full path in tooltip or drawer field.
- Non-destructive and safe as an inline row action.

### Transcript

Purpose: open the underlying transcript/log/session record.

Behavior:

- Sends `openAgentTranscript` or equivalent.
- Disabled when no transcript path is known.
- Label should be `Transcript` or `Log`, but copy must explain that this opens the local record.
- Non-destructive and safe as an inline row action.

### Pause

Purpose: stop or suspend agent work where the provider/runtime supports it.

Behavior:

- Sends the existing pause message.
- Row state changes to Paused when confirmed by extension state.
- Paused agents remain visible in active management by default.
- Pause action should not archive, hide, or kill.

### Resume

Purpose: resume a paused agent where supported.

Behavior:

- Sends the existing resume message.
- Replaces Pause in the drawer and row action when the agent is paused.
- If resume fails, keep the paused row visible and show an error event/detail.

### Hide

Purpose: remove visual clutter without stopping or archiving the agent.

Behavior:

- Hides the agent from normal Office and Agents views.
- Does not archive.
- Does not terminate a process.
- Does not prevent future active state updates.
- Hidden agents are restorable through `Show hidden` or a hidden scope filter.
- Action timeline event remains available.

### Archive

Purpose: remove the agent from active tracking while retaining history and preventing re-adoption.

Behavior:

- Archives the provider-specific thread/session where supported.
- For Codex, the archived SQLite state must prevent future external re-adoption.
- Removes the agent from active default management views.
- Retains action/lifecycle history in archived scope and Timeline.
- Does not terminate the process unless the provider explicitly defines archive as a termination
  operation. Current semantics should not conflate Archive with Kill.

### Kill

Purpose: terminate the underlying process or owned terminal, then archive/dismiss/remove only after
the termination path succeeds.

Behavior:

- Always requires a confirmation modal.
- Owned terminals: dispose terminal, archive provider thread/session where applicable, remove agent.
- External Codex: attempt safe process termination. Archive/dismiss/remove only after confirmed
  termination.
- External non-Codex with no safe kill path: keep visible, post a failure event, and explain the
  limitation.
- If Kill fails, the row remains active/visible so the user can retry or choose Archive.
- Action timeline event remains available whether success or failure.

## State Model

### Visible Active

Default row state for current non-hidden, non-archived agents. Included in all-agent management by
default.

### Hidden

Hidden agents are excluded from normal views but can be shown with `Show hidden` or a Hidden scope.
They remain live and should continue to receive lifecycle updates.

### Archived

Archived agents are excluded from the default active table. They are available through an Archived
scope and Timeline history. Archived Codex threads must not be re-adopted by external scans.

### Paused

Paused agents remain visible by default. They use a clear paused badge and swap Pause for Resume.
Paused is a lifecycle state, not a visibility state.

### Error

Error state covers provider scanner failures, missing transcript, missing CLI, unsafe kill failure,
or other lifecycle failures. Error rows remain visible by default and sort near the top unless the
user changes sorting.

### Waiting or Needs Me

Waiting means idle or awaiting user input. Needs me means permission or attention is required.
Needs-me rows should be visually prominent and sort above ordinary idle rows by default.

## Filters, Sorting, and Search

### Provider Filter

Values:

- All
- Codex
- Claude

This is page-local. It is not the bottom-toolbar canvas filter.

### Project Filter

Values:

- All projects
- One value per known project/folder
- Optional "No project" bucket for unknown paths

Project filter should show counts and preserve the full path in tooltip/detail text.

### Status Filter

Values:

- All
- Active
- Needs me
- Waiting
- Paused
- Error
- Hidden
- Archived

Hidden and Archived may also be expressed as a scope selector if that fits the final UI better.

### Search

Search should match:

- agent name
- id
- provider
- project folder name
- project path
- task/thread title
- session id
- transcript path
- current activity label
- team name or role

Search should be case-insensitive and tolerate path separators on Windows.

### Sorting

Default sort:

1. Needs me
2. Error
3. Active
4. Paused
5. Waiting/idle
6. Hidden
7. Archived
8. Most recently updated within each group

Supported sorts:

- Attention/default
- Recently updated
- Project
- Provider
- Name
- Token usage
- Status

Sorting should be stable enough that rows do not jump excessively during live updates. Avoid
resorting on every token tick unless the active sort depends on token usage.

## Usage Page Relationship

Usage is a page-level analytics view, not just an Agents tab.

Relationship to Agents:

- Agents page shows compact per-agent token totals for triage.
- Usage page provides provider/project/model/agent breakdowns.
- Usage page should inherit no canvas filter by default.
- Usage page can accept a context link from an agent detail drawer, such as "View usage for this
  agent/project/provider."
- Exact vs estimated labels must remain visible.
- Codex quota and reset countdown appear at provider level when available.

Future Usage page additions:

- Daily/monthly/project aggregation.
- Budget thresholds.
- Export to CSV/JSON.
- Model-level grouping.

## Timeline Page Relationship

Timeline is the audit and handoff surface.

Relationship to Agents:

- Agents page drawer shows recent events for the selected agent.
- Timeline page shows global history across visible and historical agents.
- Action events for Hide, Archive, Kill, Pause, Resume, and failed actions remain available after
  the row leaves the active table.
- Timeline can link back to an agent detail state when the agent is still active or archived.

Future Timeline page additions:

- Filter by provider/project/status/event kind.
- Handoff-ready summaries.
- Export recent history to markdown.
- Correlate agent events with branch/commit/PR metadata.

## Empty, Loading, and Error States

### Office Page Empty

Show the office and toolbar. If no agents exist, the office should remain usable and the primary
action is `+ Agent`.

### Agents Page Empty

When no agents exist:

- Show a compact empty state: "No agents yet."
- Provide `+ Agent` and Refresh.
- Mention provider discovery only if scanners are enabled and no sessions are found.

When filters hide all rows:

- Show "No agents match these filters."
- Provide Clear filters.
- If hidden agents exist, offer Show hidden.

### Usage Page Empty

Show no usage yet and explain that usage appears after tracked agents report token data. Do not show
blank panels.

### Timeline Page Empty

Show no events yet and explain that lifecycle/action/tool events will appear as agents run.

### Loading

Use compact inline loading states:

- Initial webview load.
- Refresh scan in progress.
- Provider scanner degraded or unavailable.

Avoid full-screen blockers after the office has loaded.

### Error

Errors should be local and actionable:

- Missing Claude CLI: explain that the VS Code extension alone is not enough and point to command
  path setting.
- Provider scan failure: show provider and root/path involved when safe.
- Kill failure: keep the agent visible and show the reason.
- Transcript missing: disable Transcript action and show the expected path if known.

## Keyboard and Accessibility Expectations

- Page navigation is keyboard reachable.
- Table/list rows support arrow navigation.
- Enter opens/selects the detail drawer row.
- Escape closes transient dialogs/drawers only when it does not discard an important confirmation.
- Tab order follows page header, filters, table, drawer actions.
- Buttons have visible focus states and accessible names.
- Icon-only controls need tooltips and labels.
- Status badges are not color-only. Include text such as Active, Needs me, Paused, Error.
- Kill confirmation must focus the least destructive action first.
- Search input should be reachable with a common shortcut such as `/` or Ctrl+F within the webview
  if feasible.
- Table cells should expose readable text, not only canvas or pixel visuals.

## Mobile and Narrow Panel Behavior

Agent Center must work in narrow VS Code side panels and small windows.

Behavior:

- Navigation collapses to a compact top tab row or menu.
- Agents table becomes a one-column dense list.
- Detail drawer becomes a slide-over or stacked section below the selected row.
- Filters collapse into a single filter button or wrapping control group.
- Long project paths and transcript paths truncate in rows and wrap in detail fields.
- Dangerous actions remain in the drawer and confirmation modal, not inline in cramped rows.
- No horizontal scrolling should be required for primary actions.

## Migration Plan From Current Modal

Current baseline:

- `AgentCenter.tsx` is a modal with tabs: Agents, Usage, Timeline.
- Agents tab already has provider/status/project/team filters.
- The current split layout has list rows and a detail panel.
- `App.tsx` owns the close/action confirmation modal.
- Bottom toolbar provider filter controls Office/canvas visibility.

Migration sequence:

1. Introduce page navigation shell while keeping Office behavior unchanged.
2. Move the existing Agent Center modal contents into an Agents page route/state.
3. Preserve existing filter logic and `Show hidden` behavior.
4. Preserve current message protocol for Focus, Project, Transcript, Pause/Resume, and agent
   actions.
5. Move or adapt the action confirmation modal so Kill copy and semantics remain unchanged.
6. Promote Usage and Timeline from modal tabs to sibling pages.
7. Add archived/history scope once archived records can be surfaced cleanly in webview state.
8. Tune narrow panel behavior and accessibility after the page shell is stable.

Migration guardrails:

- Do not regress the office canvas filter.
- Do not remove Agent Center all-agent default management scope.
- Do not lose action timeline events when rows are removed.
- Do not change provider adoption/session logic as part of UI migration.
- Do not ship a page shell that hides the Office canvas behind a marketing layout.

## Implementation Phases

### Phase 1: Navigation Shell

- Add page state for Office, Agents, Usage, Timeline.
- Keep Office as default.
- Route bottom toolbar Agents button to Agents page.
- Keep Settings and New Agent behavior unchanged.

Acceptance:

- User can switch between all four pages.
- Office canvas behavior is unchanged.
- Bottom-toolbar provider filter still only affects Office/canvas.

### Phase 2: Agents Page

- Convert current Agents modal tab into page content.
- Keep all existing row/detail/action behavior.
- Add search and sorting.
- Improve hidden/paused/error visual states.

Acceptance:

- Agents page shows all active non-hidden agents by default regardless of canvas provider filter.
- Search/filter/sort work together.
- Detail drawer actions map to existing message protocol.

### Phase 3: Actions and History Hardening

- Ensure Hide, Archive, Kill, Pause, Resume events remain visible in drawer and Timeline.
- Add archived scope when archived records are available.
- Preserve failed Kill rows and surface failure details.

Acceptance:

- Hide does not archive or kill.
- Archive prevents re-adoption where provider supports it.
- Kill only removes after confirmed process/terminal termination path succeeds.
- Failure events remain visible.

### Phase 4: Usage Page

- Promote current Usage tab into a page.
- Add provider/project/model/agent grouping where data exists.
- Keep exact/estimated labels and quota snapshots visible.

Acceptance:

- Usage page never renders blank when no usage exists.
- Codex and Claude provider rows remain visible with zero agents or zero usage.
- Agent detail drawer can link to usage context.

### Phase 5: Timeline Page

- Promote current Timeline tab into a page.
- Add filters by provider/project/event kind.
- Prepare markdown handoff export design without implementing export unless separately scoped.

Acceptance:

- Timeline includes lifecycle and action events.
- Removed/archived/killed agent action history remains available.
- Timeline can be filtered without changing Agents page filters.

### Phase 6: Narrow Panel and Accessibility Pass

- Add responsive list/drawer behavior.
- Audit keyboard navigation and focus handling.
- Add accessible labels and status text.

Acceptance:

- Primary workflows work at narrow panel widths.
- Kill confirmation is keyboard-safe.
- Status is readable without relying on color.

## Acceptance Criteria

Agent Center 2.0 is ready when:

- Office, Agents, Usage, and Timeline are page-level destinations.
- Office remains the default visual surface.
- Agents page is an all-agent management view by default and is not scoped by the Office/canvas
  provider filter.
- Agents page has provider, project, status, hidden/archived controls, search, and sorting.
- Agents page uses a dense table/list plus detail drawer, not decorative cards.
- Detail drawer shows identity, project, transcript, activity, usage, recent timeline, and actions.
- Focus, Project, Transcript, Pause, Resume, Hide, Archive, and Kill have documented and implemented
  semantics.
- Kill still requires confirmation and does not silently remove external agents when termination
  fails.
- Hidden agents are restorable.
- Archived agents do not reappear through provider adoption where provider support exists.
- Paused and error states remain visible and actionable.
- Usage page clearly distinguishes exact and estimated usage.
- Timeline keeps action history visible after Hide, Archive, and Kill.
- Empty/loading/error states are explicit and do not produce blank pages.
- Keyboard navigation and accessible labels cover primary workflows.
- Narrow panel behavior avoids horizontal scrolling for primary workflows.
- No provider adoption/session behavior changes are introduced solely by the Agent Center migration.
