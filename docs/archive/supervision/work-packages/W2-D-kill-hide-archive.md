# Work Package W2-D — Complete Hide / Archive / Kill semantics

## Context (read first)

The original roadmap's Phase 4 defined three distinct lifecycle actions: **Hide** (UI cleanup), **Archive** (history cleanup), **Kill** (process termination). The audit (deviation-map.md, ANN-7 / Phase-4 entry) found that the AgentCenter UI added all three buttons during the May 15 batch, but only **Kill** was wired to a real handler — and even that one only does the generic close flow, not actual process termination.

User feedback during W1-A verification confirmed this:

> _我在codex開的agent（説hi那個），他在cli裡還存在，即使我已經刪除了_

(Translation: even after deleting the Codex agent from pixel-agents UI, the CLI thread is still alive.)

This package completes Phase 4 with proper semantics for each action.

### Current state to investigate before coding

- `src/PixelAgentsViewProvider.ts:602` — `handleAgentAction(id, action: 'hide' | 'archive' | 'kill')` handler. Read it in full; report which branches are actually wired vs stub.
- `src/PixelAgentsViewProvider.ts:848-854` — the `agentAction` message dispatch from webview.
- `webview-ui/src/App.tsx:454-510` — the action modal UI showing the three buttons.
- `server/src/providers/file/codex/codex.ts:archiveCodexThread` — does this exist? (it should, based on the original audit notes). If yes, it's the SQLite update for archiving Codex threads. If no, you'll need to add it.

## Action semantics

| Action      | Effect on UI                                       | Effect on backend                                                                                | Effect on underlying CLI process                                                                            |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Hide**    | Remove from Agent Center + canvas                  | Set `agent.hidden=true`; persist                                                                 | None — process keeps running                                                                                |
| **Archive** | Remove from Agent Center + canvas, mark in history | Stop polling, remove from active map but write to archived-agents list; preserve transcript path | None — process keeps running                                                                                |
| **Kill**    | Remove from Agent Center + canvas                  | Dispose terminal + remove agent; for Codex: also archive the thread in SQLite (`archived=1`)     | Process terminated via `terminal.dispose()` (sends SIGHUP); the underlying `claude` / `codex` process exits |

The user-facing distinction:

- **Hide**: "I don't want to look at this right now, but I might come back to it later."
- **Archive**: "I'm done with this thread of work. Keep the history for reference, but it's not active."
- **Kill**: "Stop this process completely. I don't want it running."

## In scope

1. **Modal copy clarification**: ensure the action modal in `App.tsx` shows the three options with clear language matching the table above. If the existing copy is vague, replace it (small UI text edits only, no design changes).

2. **Wire Hide**: agent becomes `hidden=true` in state. Persisted. Filtered out from Agent Center rendering AND from office canvas character rendering. Bring-back path: a "Show hidden agents" toggle in the AgentCenter header (so user can un-hide). Hidden agents continue to track normally in the background (still polling, still receiving messages); they're just visually filtered.

3. **Wire Archive**: agent is moved out of the active `agents` Map into a persistent `archivedAgents` workspaceState key. File watcher stops; polling stops; the agent no longer appears in Agent Center or canvas. The agent record + last-known transcript path are preserved (so the user could conceptually browse archive in a future package — not in scope here, just preserve the data).

4. **Wire Kill (for both providers)**:
   - Common: dispose the agent's terminal (`agent.terminalRef?.dispose()`), call `removeAgent` (already exists in `agentManager.ts`).
   - Codex-specific: also call a new exported `archiveCodexThread(threadId)` (or use existing if present in `server/src/providers/file/codex/codex.ts` per the audit). This marks `archived=1` in SQLite so the thread doesn't get re-adopted by W2-A's scanner.
   - Claude-specific: just terminal dispose. Claude doesn't have a "thread archive" concept in pixel-agents' world.

5. **Confirmation modal**: the Kill action gets a confirmation step (modal: "This will terminate the underlying process. Continue?"). Hide and Archive do not (they're reversible enough).

6. **Action timeline events**: each action emits a timeline event (`action.hide`, `action.archive`, `action.kill`) so the supervisor can see history. Reuse the existing `postAgentTimelineEvent` helper from `src/timelineEvents.ts`.

## Out of scope (do NOT touch)

- An archive browser UI (just preserve data, no viewing in this package).
- Bulk actions (kill all / archive all).
- Undo after Kill.
- Pause / Resume (W2-C).
- The Codex external sync logic (W2-A's `adoptCodexExternalThread`) — only ensure it respects the new archived state (which it will automatically because the thread becomes `archived=1` in SQLite).
- Hide/Archive for sub-agents / teammates (Kill on a parent agent should leave its teammates alone unless the user expects otherwise — surface this in your report).

## Required changes (end-state described)

### `src/types.ts`

- `AgentState`: add `hidden?: boolean`.
- `PersistedAgent`: add `hidden?: boolean`.
- New interface `ArchivedAgentRecord` (or reuse `PersistedAgent` with `archived: true` marker) for the archived list.

### `src/PixelAgentsViewProvider.ts`

- `handleAgentAction(id, 'hide')`: set `agent.hidden=true`, persist, post `agentLifecycleHidden` (or extend existing message) so webview filters it out. Post a timeline event `action.hide`.
- `handleAgentAction(id, 'archive')`: move agent to `archivedAgents` workspaceState key, call `removeAgent` for cleanup (file watchers, timers, knownJsonlFiles), post `agentArchived` to webview, post timeline event `action.archive`.
- `handleAgentAction(id, 'kill')`: dispose terminal, for Codex call `archiveCodexThread(agent.sessionId)`, then call `removeAgent`, post `agentClosed` (existing message) AND a timeline event `action.kill`.
- Storage key constant: add `WORKSPACE_KEY_ARCHIVED_AGENTS` to `src/constants.ts`.

### `src/agentManager.ts`

- `removeAgent` already exists and handles cleanup of timers and watchers. Confirm it does NOT delete the persistAgents entry for archive cases (you may need an overload or a parameter to skip the workspaceState delete). Inspect and adjust.

### `server/src/providers/file/codex/codex.ts`

- Confirm `archiveCodexThread(threadId): boolean` exists per audit. If not, add it: SQL `UPDATE threads SET archived = 1 WHERE id = ?`. Return success/failure.
- **G-7 NOTE**: this file is on the preserved-known-good list. If `archiveCodexThread` already exists, just call it. If you need to add it, that's a minimal, surgical change — surface it in your report.

### `webview-ui/src/App.tsx` (action modal)

- Verify the modal copy matches the semantics table above. Edit as needed for clarity.
- Add confirmation step for Kill only.

### `webview-ui/src/hooks/useExtensionMessages.ts`

- Handle the new messages: `agentArchived` (treat similarly to `agentClosed` for UI removal); `agentLifecycleHidden` (or whatever you choose for the hidden-flag delta). Pick names consistent with existing messages.

### `webview-ui/src/components/AgentCenter.tsx`

- Add a "Show hidden agents" toggle to the header (small checkbox or similar). Wire to filter agent list.
- Update Kill confirmation: render a small confirmation prompt before posting `agentAction kill`.

### Tests

- New `server/__tests__/agentActions.test.ts`:
  - **Test 1**: `handleAgentAction(id, 'hide')` sets `agent.hidden=true` and persists; agent still in `agents` map.
  - **Test 2**: `handleAgentAction(id, 'archive')` removes from `agents` map but adds to `archivedAgents` workspaceState.
  - **Test 3**: `handleAgentAction(id, 'kill')` calls `terminal.dispose()`, removes from `agents`, AND for Codex calls `archiveCodexThread`.
  - **Test 4**: a hidden agent reappears after toggling "Show hidden agents".
- Webview test if existing test harness allows: a Kill action triggers the confirmation modal first.
- Total `npm test` must be ≥165 (161 baseline + ≥4 new). If W2-C is merged first, ≥169.

## Guardrails (verbatim from cleanup-framework.md §1)

- **G-1 Polymorphic, never replace**: Hide / Archive / Kill all dispatch on `agent.providerId` only where behavior differs (Kill's Codex SQLite archive). Don't break Claude's path.
- **G-2 One package = one commit on branch `cleanup/w2-d-kill-hide-archive`**.
- **G-3 Scope frozen**: don't build the archive browser. Don't build bulk actions. If teammates' parent-kill semantics looks unclear, document and ask — don't decide unilaterally.
- **G-4 npm run build green + npm test green + user runtime verification**.
- **G-5 Provider symmetry**: Hide and Archive identical across providers; Kill has documented Codex-specific extension (SQLite archive). Document this.
- **G-6 No roadmap status edits**.
- **G-7 Preserve known-good list**: touching `codex.ts` for `archiveCodexThread` is permitted IF the function doesn't already exist; otherwise reuse without modifying the file. Surface the route taken.

## Acceptance criteria

After build + repackage + reinstall:

1. Clicking Hide on an agent: it disappears from Agent Center and canvas; the underlying terminal is still alive and running.
2. Toggle "Show hidden agents": hidden agents reappear.
3. Clicking Archive: agent disappears from Agent Center and canvas; the underlying terminal is still alive; the agent does NOT come back on reload (it's been moved to the archived list).
4. Clicking Kill: confirmation prompt appears. On confirm: the agent disappears AND the terminal is gone from VS Code Terminal panel AND the underlying CLI process (`claude` / `codex`) is no longer running.
5. For Codex Kill: the thread is marked `archived=1` in `~/.codex/state_5.sqlite`, so W2-A's external sync does NOT re-adopt it on the next scan.
6. Each action writes a timeline event with the appropriate `kind` (`action.hide`, `action.archive`, `action.kill`).
7. Hidden/archived/killed actions all persist across reload (hidden stays hidden, archived stays archived, killed stays gone).
8. `npm run build` green; `npm test` green with required new tests.

## Verification protocol (user runs after handback)

1. `git checkout cleanup/w2-d-kill-hide-archive`
2. `npm run build && npm test` — green.
3. Package + install + reload.

**Test sequence**:

- Spawn a Codex agent via + Agent. Spawn another via external `codex --cd $(pwd) "hi"` (W2-A adoption).
- On the spawned one: Hide. Confirm disappears from view. Open VS Code Terminal panel: terminal still alive. Toggle Show Hidden: agent reappears.
- On the same agent: Archive. Confirm disappears. Reload window. Confirm still gone.
- On the external-adopted one: Kill. Confirm prompt. Confirm. Confirm: agent disappears, terminal gone, codex CLI process should be terminated (check with `ps aux | grep codex`), thread archived in SQLite (`sqlite3 ~/.codex/state_5.sqlite "select archived from threads where id like '<short-id>%';"` returns 1).
- Repeat the Kill test with a Claude agent. Confirm same outcome (minus SQLite — Claude doesn't have that).

Record PASS / FAIL per acceptance criterion.

## Reporting back

Write your final report to `docs/roadmap/supervision/reports/W2-D-kill-hide-archive-report.md` and commit on the W2-D branch. The "Implementation choices made" section MUST document:

- Whether `archiveCodexThread` already existed in `codex.ts` or whether you added it.
- How you handled the "modify agentManager.removeAgent to optionally skip persistAgents-delete" — overload, new function, parameter?
- Whether timeline events use the existing `postAgentTimelineEvent` or required new infrastructure.
- Teammate / sub-agent behavior on parent Kill — what you decided and why.

Do NOT paste the report back via terminal — commit it on the branch.
