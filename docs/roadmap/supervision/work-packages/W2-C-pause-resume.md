# Work Package W2-C — Pause / Resume agent

## Context (read first)

User's vision (2026-05-27 daily-work driver): _"有時要暗 agent 休息下記「你先停」"_ — sometimes the user wants to tell an agent to pause its work, and resume later. This is a real lifecycle-control need that today's pixel-agents can't express.

### What "Pause / Resume" can mean

Several possible semantics, with different costs:

| Option                                  | Behavior                                                                                                                          | Cost / risk                                                                                                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. UI marker only**                   | A `paused` flag on the agent; UI shows pause icon; status is "Paused" in lifecycle. **Does not stop the underlying CLI process.** | Lowest. The agent is still alive in its terminal; user can resume work simply by typing. Pause is a self-discipline marker.                                                                                                   |
| **B. Send SIGSTOP / Ctrl-Z to process** | Genuine pause of the CLI process. Resume sends SIGCONT.                                                                           | Medium-high. Risk of corrupting state mid-tool-call. VS Code Terminal API does NOT expose direct signal sending (terminals are children of vscode). Requires PID tracking via `terminal.processId` (returns Promise<number>). |
| **C. Suppress new prompts**             | A queue layer that intercepts prompts; while paused, prompts buffer; on resume, they flush.                                       | High. User types directly in terminal — pixel-agents doesn't intercept terminal stdin. Would require redirecting through an extension-owned input box. Substantial UX change.                                                 |

**Recommended: Option A** (UI marker only). Defer B/C until A is shipped and the user has had time to see whether the visual marker is enough.

### What you'll be working with

- `src/types.ts` — `AgentState` interface (add field) and `PersistedAgent` (persist field)
- `src/agentManager.ts` — possibly add helper for setting paused state and posting it
- `src/PixelAgentsViewProvider.ts:802` — message handler for new `agentPause` / `agentResume` messages from webview
- `src/lifecycleStatus.ts` — extend `AgentLifecycleStatus` with `'paused'` value
- `webview-ui/src/components/AgentCenter.tsx` — Pause/Resume buttons in agent detail panel; visual marker in agent row
- `webview-ui/src/office/components/ToolOverlay.tsx` — optional: a small "paused" icon above paused characters

## In scope

1. **Backend state**: `agent.paused: boolean` field on `AgentState`, persisted in `PersistedAgent`. Default `false` for new and restored agents (unless persisted as true).

2. **Lifecycle status**: extend `AgentLifecycleStatus` union with `'paused'`. When an agent is paused, the lifecycle status helper functions (`postThinking`, `postToolRunning`, etc.) check `agent.paused` first and post `paused` instead of the otherwise-derived status. Resume restores normal status derivation on the next event.

3. **Webview messages**:
   - From webview → extension: `{ type: 'agentPause', id: number }` and `{ type: 'agentResume', id: number }`.
   - Extension handles these by toggling `agent.paused`, persisting, and posting `agentLifecycleStatus` reflecting the new state.

4. **UI in AgentCenter**:
   - Pause/Resume button in the agent's detail panel. Pause when not paused, Resume when paused.
   - Visual marker in the agent's row (e.g. pause icon next to the status badge).

5. **Optional UI on canvas**: a small pause indicator above paused characters in the office. If this requires extending the character render path beyond a trivial change, defer to a follow-up (don't do it here).

6. **Persistence**: paused state survives reload via existing `persistAgents` / `restoreAgents` pipeline. Test: pause an agent, reload window, confirm still paused.

## Out of scope (do NOT touch)

- Actually stopping the CLI process (Option B / C above) — defer.
- Pause/Resume for sub-agents / teammates — start with top-level agents only.
- Bulk pause / pause-all.
- Pause queue / scheduled resume.
- Codex archive interaction (W2-D).
- Refactoring lifecycle status engine beyond adding the `paused` value.

## Required changes (end-state described)

### `src/types.ts`

- `AgentState`: add `paused?: boolean`.
- `PersistedAgent`: add `paused?: boolean`.

### `src/lifecycleStatus.ts`

- Extend the `AgentLifecycleStatus` union (which currently includes `idle | thinking | tool_running | waiting_user | waiting_permission | completed | error` per the type's definition — confirm current shape) with `'paused'`.
- In every `post*` helper (`postThinking`, `postToolRunning`, `postWaitingPermission`, `postCompleted`, `postError`, etc.), add a guard: if `agent.paused === true`, instead post a `paused` status (don't return early — still emit, but with kind `paused`). Reasoning: keeping the status engine the single source of truth means consumers don't need to dual-check paused.
- Provide a new helper `postAgentPaused(webview, agentId)` for the explicit pause toggle.

### `src/agentManager.ts`

- New exported function `setAgentPaused(agentId: number, paused: boolean, ...)` that:
  - Sets `agent.paused`
  - Calls `persistAgents`
  - Posts the updated lifecycle status

### `src/PixelAgentsViewProvider.ts`

- In `onDidReceiveMessage`, add handlers for `'agentPause'` and `'agentResume'` that call `setAgentPaused(message.id, true | false, ...)`.

### `webview-ui/src/hooks/useExtensionMessages.ts`

- Surface a `pausedAgents: Set<number>` or read `paused` flag from `agentLifecycleStatuses` (whichever fits the existing pattern with less churn). Pick one and explain in the report.

### `webview-ui/src/components/AgentCenter.tsx`

- Pause/Resume button in the agent detail panel. Wire to send `{ type: 'agentPause', id } | { type: 'agentResume', id }`.
- Visual marker (pause icon) in the agent row when paused.

### Tests

- New test file `server/__tests__/pauseResume.test.ts`:
  - **Test 1**: `setAgentPaused(id, true)` sets the agent's `paused` field and posts a lifecycle status of `'paused'`.
  - **Test 2**: `setAgentPaused(id, false)` clears the flag.
  - **Test 3**: while paused, `postThinking(agent)` emits `'paused'`, not `'thinking'`.
  - **Test 4**: after resume, subsequent `postThinking(agent)` emits `'thinking'` as normal.
- Webview test (if existing webview tests cover hooks): a hook update on `agentLifecycleStatus` with `paused` value updates the displayed status.
- Total `npm test` must be ≥165 (161 baseline + ≥4 new).

## Guardrails (verbatim from cleanup-framework.md §1)

- **G-1 Polymorphic, never replace**: Pause is a new dimension; do not break existing lifecycle flow for non-paused agents.
- **G-2 One package = one commit on branch `cleanup/w2-c-pause-resume`**.
- **G-3 Scope frozen**: if the lifecycle status guard turns out to be more invasive than expected (e.g. multiple helper functions need updating in ways that overlap with W3-A's pipeline consolidation work), STOP and report.
- **G-4 npm run build green + npm test green + user runtime verification**.
- **G-5 Provider symmetry**: pause should work for both Claude and Codex agents identically.
- **G-6 No roadmap status edits**.
- **G-7 Preserve known-good list**.

## Acceptance criteria

After build + repackage + reinstall:

1. Each agent in Agent Center has Pause/Resume buttons in its detail panel.
2. Clicking Pause: agent's status badge changes to `Paused`; the row shows a paused indicator; persists across reload.
3. Clicking Resume: status returns to whatever the agent is currently doing (`thinking` if mid-prompt, `idle` if quiescent, etc.).
4. Paused agents do NOT stop their underlying CLI process. The user can still see new output appear in the terminal; the agent's status will continue showing `Paused` in pixel-agents (because the guard suppresses normal status updates).
5. Resuming a paused agent that has accumulated activity during pause shows the most recent real status, not "paused".
6. State persists across window reload.
7. Pause/Resume works identically for Claude and Codex agents.
8. `npm run build` green; `npm test` green with ≥165 total.

## Verification protocol (user runs after handback)

1. `git checkout cleanup/w2-c-pause-resume`
2. `npm run build && npm test` — green.
3. Package + install + reload.

**Test sequence**:

- Spawn a Claude agent via + Agent. Start typing a longer prompt that takes time.
- Mid-thinking, click Pause in the detail panel.
- Confirm: badge shows `Paused`; row has pause indicator; agent character on canvas optionally shows paused marker.
- Click Resume. Confirm: status returns to `thinking` (or whatever Claude is actually doing).
- Reload window. Pause an idle agent. Reload again. Confirm it's still paused.
- Repeat with a Codex agent: same behavior.

Record PASS / FAIL per acceptance criterion.

## Reporting back

Write your final report to `docs/roadmap/supervision/reports/W2-C-pause-resume-report.md` and commit on the W2-C branch. Use the same shape as W2-A's report. The "Implementation choices made" section MUST document:

- Whether you chose Option A (UI marker) or attempted Option B (process signal). The spec recommends A; if you deviated, justify.
- How you surfaced `paused` in the webview state (new Set vs reusing `agentLifecycleStatuses`).
- Whether you added a canvas-side paused indicator or deferred.

Do NOT paste the report into terminal back to the user — commit it on the branch.
