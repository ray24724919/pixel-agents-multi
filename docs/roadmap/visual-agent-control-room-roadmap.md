# Pixel Agents Visual Agent Control Room Roadmap

This document is the working roadmap for turning this fork of Pixel Agents into a more complete Claude + Codex visual agent control room.

The current extension can discover and display Codex, Claude Code, and Claude Desktop/Cowork sessions. The next goal is to make those sessions easier to understand, manage, coordinate, and replay across projects.

## Planning Method

This roadmap was assembled under supervised parallel planning. Three draft workstreams were delegated and then integrated:

- `docs/roadmap/drafts/status-timeline-replay.md`
- `docs/roadmap/drafts/agent-center-projects-integration.md`
- `docs/roadmap/drafts/zones-cost-actions-team.md`
- `docs/roadmap/drafts/supervisor-delegation-visibility.md`

The drafts are kept as supporting notes. This file is the canonical execution roadmap.

## Product Goals

- Make agent state legible at a glance.
- Turn Agent Center into a practical task and project control panel.
- Add structured timelines so debugging, replay, and reporting share one event model.
- Make work/rest behavior predictable as the office layout grows.
- Add safer controls for hiding, archiving, and killing sessions.
- Improve token and cost visibility for Codex/OpenAI and Claude usage.
- Prepare the architecture for richer team and supervisor/child-agent visualization.
- Show supervisor agents as working when they are actively delegating to child agents, teammates, or
  internal background workers.

## Recommended Build Order

1. Lifecycle status engine and status bubbles.
2. Event timeline foundation.
3. Agent Center task hub.
4. Hide / Archive / Kill action model.
5. Token and cost settings.
6. Project Dashboard.
7. Rest / Work zone system.
8. VS Code and terminal integration.
9. Team Meeting Mode.
10. Session Replay.

The first two phases should be treated as architecture foundation. Most later features depend on a shared status and event model.

## Implementation Progress

Last updated: 2026-05-18

| Phase                                         | Status      | Notes                                                                                                                                                                                                                |
| --------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Lifecycle status engine and status bubbles | Done        | Provider events now normalize into lifecycle snapshots and head/status UI.                                                                                                                                           |
| 2. Event timeline foundation                  | Done        | Timeline events are emitted and shown in Debug View / Agent Center detail.                                                                                                                                           |
| 3. Agent Center task hub                      | Done        | Agent Center has provider/status/project filters, detail panel, timeline, token boxes, refresh, focus, and actions.                                                                                                  |
| 4. Hide / Archive / Kill action model         | Done        | Action modal supports hide/archive/kill with safer provider-aware behavior.                                                                                                                                          |
| 5. Token and cost settings                    | Done        | Codex GPT-5.5 and Claude Opus 4.7 API-proxy estimates show input/output tokens and costs.                                                                                                                            |
| 6. Project Dashboard                          | Done        | Agent Center groups agents by project and supports project-scoped filtering.                                                                                                                                         |
| 7. Rest / Work zone system                    | In progress | Default split, room overlay, seat zone source, rest-zone idle preference, editor hover zone HUD, and `work` / `rest` / `meeting` / `neutral` zone paint are implemented. Furniture semantic tags remain future work. |
| 8. VS Code and terminal integration           | In progress | Agent Center and agent overlays can open project folders or transcripts. Project Dashboard can also open project folders. Stronger terminal linking remains future work.                                             |
| 9. Team Meeting Mode                          | In progress | Agent Center now has Team Dashboard, team badges, Team Roster controls, and meeting movement for idle selected-team members that prefers painted meeting zones. Conversation summaries remain future work.           |
| 10. Session Replay                            | Planned     | Needs persisted timeline replay controls.                                                                                                                                                                            |

## Phase 1: Lifecycle Status Engine And Status Bubbles

### Goal

Replace the current binary active/idle view with a provider-agnostic lifecycle state. The owner should be able to see whether an agent is thinking, running a tool, waiting for permission, waiting for user input, completed, or errored.

### Lifecycle Status

```ts
type AgentLifecycleStatus =
  | 'idle'
  | 'thinking'
  | 'tool_running'
  | 'waiting_user'
  | 'waiting_permission'
  | 'completed'
  | 'error';
```

### Status Snapshot

```ts
type AgentStatusSnapshot = {
  agentId: number;
  sessionId: string;
  providerId: 'codex' | 'claude' | string;
  status: AgentLifecycleStatus;
  label: string;
  detail?: string;
  since: number;
  updatedAt: number;
  severity?: 'info' | 'success' | 'warning' | 'error';
  activeTool?: {
    name: string;
    callId?: string;
    command?: string;
  };
};
```

### Provider Mapping

Claude and Codex should map raw events into the same status set.

| Source event                                | Normalized status        |
| ------------------------------------------- | ------------------------ |
| Codex `task_started`                        | `thinking`               |
| Codex tool start / dynamic tool request     | `tool_running`           |
| Codex permission request                    | `waiting_permission`     |
| Codex user input request                    | `waiting_user`           |
| Codex `task_complete`                       | `completed`, then `idle` |
| Claude assistant text/thinking              | `thinking`               |
| Claude/Cowork `system.status.requesting`    | `thinking`               |
| Claude tool_use                             | `tool_running`           |
| Claude permission prompt                    | `waiting_permission`     |
| Claude AskUserQuestion / user prompt needed | `waiting_user`           |
| Claude turn duration / stop                 | `completed`, then `idle` |
| Provider error / aborted turn               | `error`                  |

### UI Behavior

- Agent head bubble is driven by `AgentStatusSnapshot`, not raw transcript events.
- `idle`: hidden by default unless hovered/selected.
- `thinking`: small animated bubble, e.g. `Thinking`.
- `tool_running`: show tool label, e.g. `Editing file`, `Running command`.
- `waiting_user`: persistent prompt bubble.
- `waiting_permission`: warning-style permission bubble.
- `completed`: short-lived success bubble, then fade.
- `error`: persistent until dismissed or superseded by a new run.

### Implementation Steps

1. Add shared lifecycle status types.
2. Add a status engine function that accepts normalized events and produces snapshots.
3. Emit new webview messages, e.g. `agentLifecycleStatus`.
4. Keep existing `agentStatus` messages during migration.
5. Add head bubble rendering based on lifecycle status.
6. Update Debug View to show lifecycle status, raw status, and last normalized event.

### Acceptance Criteria

- A running Claude Cowork agent shows `thinking` as soon as `status=requesting` is appended.
- A Codex turn shows `thinking` immediately on `task_started`.
- Tool execution shows a tool-specific label above the agent.
- Permission and user-input waits cannot be overwritten by ordinary tool output.
- Completed status is visible briefly and then returns to idle.

## Phase 2: Event Timeline Foundation

### Goal

Create a single append-only event stream for each agent/thread/project. This will power Debug View, Agent Center detail panels, Project Dashboard, and later Session Replay.

### Timeline Event Shape

```ts
type TimelineEventKind =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'status.changed'
  | 'assistant.thinking'
  | 'assistant.message'
  | 'tool.started'
  | 'tool.output'
  | 'tool.completed'
  | 'tool.failed'
  | 'permission.requested'
  | 'permission.resolved'
  | 'user_input.requested'
  | 'user_input.received'
  | 'token.usage'
  | 'action.hide'
  | 'action.archive'
  | 'action.kill';

type TimelineEvent = {
  id: string;
  agentId: number;
  sessionId: string;
  projectName?: string;
  providerId: string;
  runId?: string;
  timestamp: number;
  kind: TimelineEventKind;
  title: string;
  summary?: string;
  statusAfter?: AgentLifecycleStatus;
  severity?: 'info' | 'success' | 'warning' | 'error';
  payload?: unknown;
  visibility: 'default' | 'verbose' | 'debug';
};
```

### UI

- Add a compact timeline to Debug View first.
- Add an Agent Center detail timeline after the Agent Center refactor.
- Group tool start/output/completion into expandable groups.
- Keep raw payload collapsed under debug mode only.
- Add filters by agent, provider, project, event kind, and severity.

### Acceptance Criteria

- Every lifecycle status change appends a timeline event.
- Tool start and tool done events can be traced to the same call id.
- Webview reload can rebuild current status from recent snapshot plus timeline.
- Debug View can show the last N normalized events without reading raw logs.

## Phase 3: Agent Center Task Hub

### Goal

Upgrade Agent Center from an agent list into a task-oriented control panel.

### Task Model

```ts
type AgentTask = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  agentId: number;
  threadId?: string;
  sessionId: string;
  providerId: 'codex' | 'claude' | string;
  status: AgentLifecycleStatus;
  statusReason?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  endedAt?: number;
  cwd?: string;
  transcriptPath?: string;
  tokenUsage?: TokenUsageSummary;
  availableActions: AgentControlAction[];
};
```

### UI Layout

- Header: total agents, active agents, waiting agents, errors, token summary.
- Filters: All / Codex / Claude / Active / Waiting / Needs me / Error.
- Task list: title, provider, project, status, last event, token usage.
- Detail panel: status, timeline, token/cost, transcript path, actions.

### Controls

- Focus.
- Open project.
- Open transcript.
- Hide.
- Archive.
- Kill.

Controls should come from a backend/action capability layer so the UI does not pretend unsupported actions are available.

### Acceptance Criteria

- Owner can identify active, waiting, and failed tasks within 10 seconds.
- Selecting an agent opens a detail panel with timeline and controls.
- Agent Center does not parse terminal output to infer state.
- Task list and canvas agree on lifecycle status.

## Phase 4: Hide / Archive / Kill Action Model

### Goal

Separate visual cleanup from provider/session termination. Closing an agent should not be ambiguous.

### Actions

| Action  | Meaning                       | Effect                                                 |
| ------- | ----------------------------- | ------------------------------------------------------ |
| Hide    | Visual-only cleanup           | Remove from canvas/list, keep provider session running |
| Archive | Product-level history cleanup | Remove from active roster, preserve transcript/history |
| Kill    | Stop work                     | Attempt to terminate provider run/process/session      |

### Provider-Specific Behavior

Codex:

- Hide: remove visual tracking only.
- Archive: mark Codex thread archived when possible.
- Kill: dispose managed terminal or terminate known process if safely mapped.

Claude:

- Hide: remove visual tracking only.
- Archive: stop tracking / hide session; preserve transcript/audit path.
- Kill: only offer when a terminal/process mapping is reliable.

### UI

Replace a single close action with a modal:

```text
What do you want to do?

Hide from canvas
Archive session
Kill running process
```

### Acceptance Criteria

- Hide never kills a provider session.
- Archive warns if the session is still active.
- Kill requires confirmation and writes a timeline event.
- Unsupported kill actions are disabled with an explanation.

## Phase 5: Token And Cost Model

### Goal

Make token use and estimated cost understandable per agent, project, and provider.

### Usage Model

```ts
type TokenUsageSummary = {
  providerId: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  estimatedCost?: number;
  currency?: 'USD';
  isEstimated: boolean;
  usageSource: 'provider' | 'transcript' | 'sqlite' | 'approximation';
};
```

### Settings

Add provider/model pricing settings:

- OpenAI/Codex input price per 1M tokens.
- OpenAI/Codex output price per 1M tokens.
- Claude input price per 1M tokens.
- Claude output price per 1M tokens.
- Label whether cost is exact, estimated, or unavailable.

### UI Levels

- Per agent: badge and detail line.
- Per project: project total and provider split.
- Global: total usage across visible agents.

### Acceptance Criteria

- Claude is not shown as `GPT-5.5 estimate`.
- Codex total-only usage displays a range or proxy label.
- Mixed-provider totals are clearly marked as estimates/proxies.
- Cost warnings do not automatically kill sessions in the MVP.

## Phase 6: Project Dashboard

### Goal

Add a project-level command center so the owner can understand all agents working inside one project.

### Recommended Presentation

Implement Project Dashboard as a tab inside Agent Center first:

```text
[Agents] [Projects] [Timeline] [Settings]
```

Project row:

```text
pixel-agents
  Codex: 2 active / 4 total
  Claude: 0 active / 1 total
  Tokens: 123k
  Last activity: 2m ago
```

Project detail:

- Overview: active/waiting/error/completed counts.
- Threads: task/thread list scoped to the project.
- Timeline: project-scoped event stream.
- Tokens: provider and model usage distribution.

### Acceptance Criteria

- Owner can open a project and see all Codex/Claude sessions for that project.
- Project dashboard can filter by provider and status.
- Project rows show last activity and action-needed counts.
- Opening a project does not require a separate route in the MVP.

## Phase 7: Rest And Work Zone System

### Goal

Make office movement meaningful as layouts and furniture grow. Working agents should occupy workstations. Idle agents should prefer rest/neutral areas and avoid computer-adjacent tiles.

### Three-Stage Zone Plan

Stage 1: default split

- Left half: work zone.
- Right half: rest zone.
- Computer-adjacent work seats still override the split.
- Idle wander prefers rest-zone walkable tiles.

Stage 2: zone paint

- Add Layout Editor mode for `work`, `rest`, `meeting`, and `neutral`.
- Store zone data in layout JSON.
- Show zone overlay only in editor/debug modes.
- Team meeting movement prefers painted `meeting` tiles, then falls back to rest/neutral tiles.

Stage 3: furniture semantic tags

- Furniture can define `work_surface`, `computer`, `rest_seat`, `meeting_anchor`, `blocked_surface`, `approach_points`, `facing_direction`, and `capacity`.
- Agents target approach/seat points, not furniture sprite centers.

### Movement Rules

- Active coding/review/debug status can use work seats.
- Idle agents release work seats and prefer rest or neutral standable tiles.
- Waiting permission can remain near the work desk because user action is needed.
- Waiting user may remain near work briefly, then move to standby/rest after a timeout.
- Sofa/chair surfaces must distinguish `walkable`, `standable`, `sittable`, and `interactable`.

### Acceptance Criteria

- Without manual zone paint, idle agents prefer the right/rest side.
- Adding a computer does not attract idle agents unless they are active.
- Adding a sofa does not cause agents to stand on the sofa sprite center.
- Debug View can show current zone and destination reason.

## Phase 8: VS Code And Terminal Integration

### Goal

Use Pixel Agents as a navigation entry point into project folders, terminals, transcripts, and eventually VS Code commands.

### MVP

- Track `projectPath`, `cwd`, `transcriptPath`, `threadId`, `terminalName`, and known terminal/process metadata.
- Provide Open Project action with safe fallback.
- Provide Open Transcript action.
- Provide Focus action for Pixel Agents camera/selection.
- Provide terminal details even if focus is not supported.

### Later

- Add VS Code extension command/deep-link bridge.
- Focus known VS Code terminals when terminal id is reliable.
- Open files or transcript paths via command URI.
- Add provider-specific resume/retry where safe.

### Risks

- VS Code does not expose reliable external control for arbitrary existing terminals.
- CWD and terminal title are not enough to reliably identify a session.
- OS/sandbox permissions may block opening apps or paths.

## Phase 9: Team Meeting Mode

### Goal

Make supervisor/child-agent collaboration feel like a team discussion instead of unrelated logs.

### Concepts

- Supervisor: assigns tasks, reviews results, summarizes decisions.
- Child agents: report observations or completed work.
- Meeting zone: visual gathering area around a meeting table/whiteboard.
- Consensus panel: decisions, risks, and next actions.

### UI Behavior

- Supervisor stands near a meeting anchor.
- Child agents gather around the painted meeting zone when one exists.
- Speaking agent receives a subtle highlight or bubble.
- Parent-child task spawn/completion events appear as conversation beats.
- Team cost meter appears during multi-agent meetings.

### Acceptance Criteria

- Parent-child agent relationships are visible.
- Current speaker or reporting agent is visually clear.
- Meeting summary can list decisions and next actions.
- Team mode does not hide individual agent timelines.

## Phase 10: Session Replay

### Goal

Replay past agent work from normalized timeline events.

### MVP

- Load a timeline for one agent/thread.
- Play, pause, change speed, and jump to event.
- Reconstruct lifecycle status and head bubbles.
- Move timeline cursor during playback.

### Later

- Reconstruct canvas position and camera.
- Replay tool output streaming rhythm.
- Export replay bundle for demos or bug reports.
- Compare two runs with a timeline diff.

### Acceptance Criteria

- Replay uses timeline events, not screen recording.
- Replay can show status changes and major tool events.
- Sensitive payloads can be hidden or redacted before export.

## Shared Risks

- Provider event schemas will change; adapter boundaries must stay tight.
- Too many status changes can cause UI flicker; use minimum display times and priority rules.
- Timeline payloads can contain sensitive commands, prompts, or file paths.
- Kill semantics differ across providers and should not be over-promised.
- Cost estimates can be misleading unless every estimate is clearly labeled.
- Zone logic can become hard to debug without editor/debug overlays.

## Suggested Next Implementation Slice

Start with a small vertical slice:

1. Add `AgentLifecycleStatus` and `AgentStatusSnapshot`.
2. Map current Claude/Codex active/waiting/tool events into lifecycle snapshots.
3. Add head status bubbles.
4. Append lifecycle changes into a simple in-memory timeline.
5. Show the last 20 timeline events in Debug View.

This slice is small enough to test quickly and unlocks the later Agent Center, Project Dashboard, cost, kill, team, and replay work.

## Future Work Package Prompts

These prompts can be handed to future subagents/workers.

### Work Package A: Lifecycle Status Engine

```text
You are working in the Pixel Agents repo. Do not revert other changes.

Implement the first lifecycle status engine slice:
- Add shared AgentLifecycleStatus and AgentStatusSnapshot types.
- Map existing Claude/Codex active/waiting/tool/permission events into lifecycle snapshots.
- Send lifecycle snapshots to the webview.
- Keep legacy agentStatus messages working during migration.
- Add focused tests for Claude Cowork requesting, Codex task_started/task_complete, and permission states.

Own files: src/transcriptParser.ts, server/src/providers/file/codex/codex.ts if needed, src/types.ts, webview-ui/src/hooks/useExtensionMessages.ts, focused tests.
Report changed files and test results.
```

### Work Package B: Status Bubbles And Debug Timeline

```text
You are working in the Pixel Agents repo. Do not revert other changes.

Implement UI for lifecycle status:
- Store lifecycle status per agent in webview state.
- Render compact status bubbles above agents.
- Add hover detail and Debug View fields.
- Add a simple in-memory recent event list showing the last 20 normalized events per agent.
- Do not redesign Agent Center yet.

Own files: webview-ui/src/hooks/useExtensionMessages.ts, webview-ui/src/office/components/ToolOverlay.tsx, webview-ui/src/components/DebugView.tsx, related types.
Report changed files and screenshots/testing notes if available.
```

### Work Package C: Agent Center Task Hub

```text
You are working in the Pixel Agents repo. Do not revert other changes.

Upgrade Agent Center toward a task hub:
- Add filters for provider/status/project/action-needed.
- Add a right-side detail panel.
- Show lifecycle status, current task label, timeline preview, token usage, and safe controls.
- Keep existing Refresh and Focus behavior.
- Do not implement Project Dashboard yet; leave clear extension points.

Own files: webview-ui/src/components/AgentCenter.tsx and related webview state/types.
Report changed files and test results.
```

### Work Package D: Project Dashboard

```text
You are working in the Pixel Agents repo. Do not revert other changes.

Add a Projects tab inside Agent Center:
- Group visible agents by projectName/folderName/cwd.
- Show provider counts, active/waiting/error counts, last activity, and token totals.
- Add project-scoped thread list and timeline preview.
- Add Open Project fallback action that at minimum reveals/displays the path.

Own files: AgentCenter UI and supporting selectors/state only.
Report changed files and test results.
```

### Work Package E: Safe Actions

```text
You are working in the Pixel Agents repo. Do not revert other changes.

Replace one-size close behavior with Hide / Archive / Kill:
- Define provider-specific action availability.
- Add confirmation modal with clear text.
- Hide must only remove visual tracking.
- Archive must preserve history and warn if active.
- Kill must only be enabled when process/session control is reliable.
- Append action events to the timeline.

Own files: src/PixelAgentsViewProvider.ts, src/agentManager.ts if needed, AgentCenter/App close UI, tests where practical.
Report changed files and test results.
```

### Work Package F: Rest/Work Zones

```text
You are working in the Pixel Agents repo. Do not revert other changes.

Implement rest/work zone MVP:
- Add default split: left work, right rest.
- Idle agents prefer rest-zone walkable tiles.
- Active agents use computer-adjacent work seats.
- Add debug metadata for zone and destination reason.
- Do not implement zone paint yet.

Own files: webview-ui/src/office/engine/officeState.ts, layout/types as needed, DebugView if needed.
Report changed files and test results.
```
