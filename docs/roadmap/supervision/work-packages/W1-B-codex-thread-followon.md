# Work Package W1-B — Codex thread follow-on + ghost adoption gate

## Context (read first)

This package counters **BLK-2** in [deviation-map.md](../deviation-map.md#severity-ranked-deviation-list-for-cleanup-framework) and addresses symptom **S-T2-01** in [symptoms-log.md](../symptoms-log.md#s-t2-01--one-agent-click-but-every-prompt-creates-a-new-agent-entry).

**Two related runtime failures** when running multi-prompt Codex sessions:

1. **Duplicate agent entries** — Codex CLI v0.130 in interactive mode creates a new thread in `~/.codex/state_5.sqlite` whenever the user runs `/clear` (and possibly on first prompt of a fresh session). The pixel-agents periodic scanner `scanCodexWorkspaceThreads()` in [src/PixelAgentsViewProvider.ts:478](../../../src/PixelAgentsViewProvider.ts) calls `adoptCodexExternalThread()`, which dedups only by `sessionId === thread.id || jsonlFile === thread.rolloutPath`. New thread → new id → not deduped → adopted as a fresh agent with `agentName = thread.title`. Result: each `/clear` (and each external Codex session anywhere on the system) creates a brand-new agent row.

2. **Frozen status after the first thread switch** — The +Agent flow in [src/agentManager.ts:156](../../../src/agentManager.ts) polls once for the first Codex thread after launch, binds the agent to that thread's rollout file (`agent.sessionId`, `agent.jsonlFile`), and stops polling. When Codex later creates a new thread in the same terminal, the agent's file watcher keeps tailing the old rollout — so the agent's status, tokens, and tool activity all freeze from the second thread onward.

**Stale ghost cleanup (related)** — `removeStaleCodexAgents()` is called with `topLevelThreadIds` from a workspace-wide `findRecentCodexThreads(50)` call, not scoped to cwd. Old threads from unrelated cwds keep ghost Codex agents alive even after deletion. After this package, ghost agents shouldn't exist (we stop creating them) but the staleness check should still be tightened defensively.

## In scope

1. **Disable auto-adoption of external Codex threads** — `scanCodexWorkspaceThreads()` no longer turns every recent thread into a visible agent.
2. **Same-cwd thread follow-on** — A +Agent-spawned Codex agent automatically switches its bound sessionId / jsonlFile / file watcher when Codex creates a new thread in that same cwd (e.g. after `/clear`). Tokens accumulate; per-turn transient state clears.
3. **Cwd-scope `removeStaleCodexAgents`** — Staleness check only considers threads in cwds that have at least one user-spawned agent.

## Out of scope (do NOT touch)

- The full grouping data model for past-thread history (option C from the earlier supervisor / user discussion; tentatively deferred or absorbed into a Wave 4 polish package if anyone wants it later).
- Any Claude-side launch / discovery / scan logic — W1-A handles Claude.
- Office canvas character rendering. Decision already taken: canvas stays per-active-thread per agent.
- AgentCenter UI rendering beyond what falls out of the backend's existing `agentMetadata` / `agentTokenUsage` message updates.
- Refactoring the parallel parsers in `server/src/providers/file/codex/codex.ts` vs `src/transcriptParser.ts` (per audit, that's not duplication — it's parse vs process layering — and it's working).
- Adding new message types. The switch can be expressed entirely through existing `agentMetadata` + `agentTokenUsage`.
- The `pixel-agents.codex.autoAdoptExternalThreads` feature flag is **OPTIONAL**: prefer to simply remove the adoption call. If you have a strong reason to gate behind a setting instead, surface it and pick — don't add the setting "just in case."

## Required changes (end-state described, not steps)

### `src/PixelAgentsViewProvider.ts`

- `scanCodexWorkspaceThreads()` keeps building and posting the `codexProjects` message (it powers the +Agent picker — preserve that). Remove the loop that calls `this.adoptCodexExternalThread(thread, ...)`. If you choose to gate behind a setting instead of removing, name it `pixel-agents.codex.autoAdoptExternalThreads` and default `false`; either approach is acceptable.
- `removeStaleCodexAgents()` now takes a cwd-scoped notion of "live thread ids." Concretely: build `topLevelThreadIds` from `findRecentCodexThreads(50)` but **filter to only threads in cwds that have at least one user-spawned (`isExternal=false`) Codex agent**. Threads in other cwds do not affect staleness decisions for our agents.
- `adoptCodexExternalThread()` can stay defined — useful if the feature flag path above is taken — but document with a one-line comment why it's no longer called by default (or remove it if you went the pure-removal route).

### `src/agentManager.ts`

- The polling logic at lines 154-213 currently uses `setInterval` with `clearInterval` once the first Codex thread is found. Convert this into a **persistent poll** keyed by cwd:
  - Each tick: query `findLatestCodexThread(cwd, 0)`.
  - If the returned thread's id differs from `agent.sessionId`, perform the **switch**:
    - `agent.sessionId` ← new `thread.id`
    - `agent.jsonlFile` ← new `thread.rolloutPath`
    - Rebind the file watcher: stop the current watcher (via the existing `fileWatchers` map cleanup), call `startFileWatching` with the new path. Start at end-of-file for the new rollout — do NOT replay the new thread's history as live events. Use `fs.statSync(path).size` for the new offset.
    - Cumulative tokens: `agent.inputTokens` and `agent.outputTokens` are added to (not replaced by) the new thread's tokens as they arrive in transcript events. Concretely: when reading the first `tokenUsage` event from thread B, add to the existing totals instead of overwriting. (You may want a per-thread `tokensSnapshotAtSwitch` field to compute deltas, or you may track per-thread running totals — your call. Pick one and explain.)
    - Clear transient per-turn state: `agent.activeToolIds`, `agent.activeToolStatuses`, `agent.activeToolNames`, `agent.activeSubagentToolIds`, `agent.activeSubagentToolNames`, `agent.permissionSent`, `agent.hadToolsInTurn`, `agent.isWaiting`. These represent thread-A turn context that doesn't apply to thread B.
    - Post `agentMetadata` (with the new `transcriptPath`) and `agentTokenUsage` (with the now-cumulative totals) so the webview reflects the switch.
    - Log: `[Pixel Agents] Codex: Agent <id> - thread <A-short> → <B-short> (same cwd follow-on)`.
  - If the same thread is returned: no-op.
  - Cleanup: when the agent is removed (`removeAgent`), the existing `jsonlPollTimers.delete(id)` cleanup must still cancel this persistent poll. Verify by inspection.
- Poll interval: reuse `JSONL_POLL_INTERVAL_MS`. Don't introduce a new constant.

### `src/types.ts`

- If you add a `tokensSnapshotAtSwitch` (or equivalent per-thread snapshot) field to `AgentState`, declare it here.

## Tests

- **Build / lint**: `npm run build` must remain green.
- **Existing tests**: `npm test` (147 baseline, ≥150 if W1-A landed first) must remain green.
- **New tests**:
  - Unit test for "same-cwd thread follow-on": mock `findLatestCodexThread` to return thread A on first call and thread B on second call (both same cwd, different ids). Assert agent's `sessionId`, `jsonlFile` update; transient state clears; cumulative tokens accumulate.
  - Unit test for "ghost adoption disabled": invoke `scanCodexWorkspaceThreads` with mock threads in cwds that have no agents — assert no new agent created, `codexProjects` message still posted.
  - Unit test for `removeStaleCodexAgents` cwd-scope: agents exist in cwd X; thread list contains threads in cwds X, Y, Z. Only threads in X are considered for staleness.
- New test count: ≥3 tests added.

## Guardrails (verbatim from cleanup-framework.md §1)

- **G-1 Polymorphic, never replace**: Codex logic only — Claude paths are untouched. Provider symmetry is satisfied by leaving Claude alone (no Codex-specific concept being introduced that Claude also needs).
- **G-2 One package = one commit on branch `cleanup/w1-b-codex-thread-followon`**.
- **G-3 Scope frozen**: if you find Codex parser bugs, AgentCenter rendering issues, or webview state-pipeline weirdness, **stop and surface** — those are W2 / W3 territory.
- **G-4 npm run build green + npm test green + user runtime verification**.
- **G-5 Provider symmetry**: the cwd-scoped staleness check looks workspace-wide today only because Codex adoption is the only thing that needed it. After this package, only the Codex paths in `PixelAgentsViewProvider.ts` are touched; Claude scanning paths are unchanged. Provider symmetry preserved.
- **G-6 No roadmap status edits unless explicitly in this package's scope** — not in scope here.
- **G-7 Preserve known-good list**: do not touch `server/src/providers/file/codex/codex.ts` (the parser is good). Do not touch lifecycle/timeline helpers (the contract is good).

## Acceptance criteria

After build + repackage + reinstall:

1. Click + Agent once and pick Codex → exactly 1 Codex agent appears in Agent Center.
2. Type 3 separate prompts in that Codex terminal, with `/clear` between any of them — still exactly 1 Codex agent in Agent Center. Its `agentName` may change as the latest thread's title updates. Its token total grows monotonically (never resets to 0 mid-session).
3. The agent's status updates correctly for every prompt (no freeze after the first thread switch). Lifecycle bubble cycles through thinking → tool_running → completed → idle each turn.
4. No Codex agent rows appear for threads the user did not spawn via + Agent — including:
   - Threads from prior `codex` invocations outside VS Code.
   - Threads from a different cwd.
   - Subagent threads from any Codex session.
5. Deleting the active Codex thread via Codex CLI (`codex thread delete <id>`) while the agent's terminal is still alive: agent detects the loss within one `JSONL_POLL_INTERVAL_MS` tick and either (a) picks up the next `findLatestCodexThread` result for that cwd, or (b) cleanly enters an idle/disconnected state until a new thread appears. Pick one behavior and document it.
6. All existing tests pass; new tests cover the three behaviors above.

## Verification protocol (user runs after handback)

1. `git checkout cleanup/w1-b-codex-thread-followon`.
2. `npm run build` + `npm test` — confirm both green.
3. Package + reinstall .vsix; reload window.
4. **Scenario A — multi-prompt Codex**:
   - Pre-condition: no Codex agent currently shown. (If there are stale ones from earlier testing, close them first.)
   - Click + Agent → Codex → Start. Confirm exactly 1 Codex agent.
   - In the terminal: type `read package.json`, wait for response, then `/clear`, then `say hi`, wait, then `/clear`, then `list scripts in package.json`. After each prompt: still 1 agent, token total ≥ previous turn, status visibly updates.
5. **Scenario B — external Codex stays invisible**:
   - Open a different terminal (outside the Pixel Agents +Agent flow). Run `codex --cd /tmp "what is 2+2"`.
   - In the Pixel Agents Agent Center: confirm NO new Codex agent appears (the existing one tracking your VS Code-spawned terminal is unaffected).
6. **Scenario C — thread deletion**:
   - With an active Codex agent, find its thread id (visible in Agent Center detail or via SQLite query).
   - `sqlite3 ~/.codex/state_5.sqlite "update threads set archived=1 where id='<thread-id>';"`.
   - Within ~5s, the agent in Agent Center either picks up a new thread (if Codex auto-creates one for the still-alive terminal) or enters a clean idle/disconnected state.
7. Record results in [symptoms-log.md](../symptoms-log.md) under S-T2-01 → "Resolved by W1-B" with the commit SHA and which behavior you chose for scenario C.

## Reporting back to supervisor

1. Branch name + commit SHA.
2. `git diff --stat cleanup/w1-b-codex-thread-followon...main` output.
3. Final summary lines of `npm run build` and `npm test`.
4. Implementation choices made (you'll have several to pick from above):
   - Removed `adoptCodexExternalThread` call or gated behind setting?
   - Per-thread token snapshot strategy?
   - Scenario C behavior on thread deletion (re-discover vs idle)?
5. Out-of-scope findings — anything else broken you noticed while in `PixelAgentsViewProvider.ts` / `agentManager.ts` / `fileWatcher.ts`. List with file:line.
