# Work Package B — Codex multi-thread agent handling

## Context (read first)

The user has extended `pixel-agents` to support Codex agents alongside Claude. Two real-world symptoms were diagnosed during supervisor-led testing (see `docs/roadmap/supervision/symptoms-log.md#S-T2-01` for full trace):

**Symptom 1 — duplicate agent entries**
Codex CLI v0.130 in interactive mode creates a **new thread per user prompt** in `~/.codex/state_5.sqlite` (source=`cli`, fresh thread id each turn — not the same thread being appended to). The pixel-agents periodic scanner `scanCodexWorkspaceThreads()` in `src/PixelAgentsViewProvider.ts:478` adopts every recent non-subagent thread as an external Codex agent if the dedup keys (`sessionId`, `jsonlFile`) don't match an existing agent. Result: each user prompt creates a brand-new agent row in Agent Center, even though only one +Agent button was clicked.

**Symptom 2 — frozen status after first prompt**
The +Agent flow in `src/agentManager.ts:156` polls once for the first Codex thread after launch, binds the agent to that thread's rollout file (`agent.sessionId`, `agent.jsonlFile`), and stops polling. When Codex later creates a new thread for the second prompt in the same terminal, the agent's file watcher is still tailing the old rollout — so the agent's status, tokens, and tool activity all freeze from prompt #2 onward.

**Stale ghost agents** (related)
`removeStaleCodexAgents()` is called with `topLevelThreadIds` from a workspace-wide `findRecentCodexThreads(50)` call, not scoped to cwd. Old threads from unrelated cwds keep ghost Codex agents alive even after their threads are deleted. After this work package, ghost agents should not exist (we stop creating them in the first place); the staleness check should still be tightened defensively.

## Scope of this work package (B)

Two changes only:

1. **Stop auto-adopting external Codex threads as user-visible agents.**
2. **Make a +Agent-created Codex agent follow new threads created in the same cwd**, so multi-prompt sessions stay attached to one agent row.

Out of scope (do not touch):

- The full grouping data model for past-thread history (this is work package C, designed separately).
- Any Claude-side logic.
- Office canvas character rendering (the per-thread → per-cwd character question is settled: stays per-thread, which after this change means per-active-thread = effectively per-cwd).
- Any UI redesign in AgentCenter beyond what falls out of the backend changes.

## Required changes

### 1. Disable ghost adoption

In `src/PixelAgentsViewProvider.ts`:

- Keep `scanCodexWorkspaceThreads()` running for the `codexProjects` message (the picker UI uses it) — DO NOT remove the function.
- Remove (or feature-gate behind a setting defaulting OFF) the loop that calls `this.adoptCodexExternalThread(thread, ...)` at line 481-488. The `codexProjects` postMessage at line 491-494 must continue to fire.
- Update `removeStaleCodexAgents()` so it considers only threads in cwds that have at least one user-spawned agent. Threads in other cwds should not influence staleness (since we no longer adopt them, this is defensive).

If you keep the adoption code behind a setting, name it `pixel-agents.codex.autoAdoptExternalThreads` and default `false`.

### 2. Same-cwd thread follow-on

When a +Agent-created Codex agent is bound to thread A, and Codex CLI later creates thread B in the same cwd, the agent should switch to B:

- `agent.sessionId` ← B.id
- `agent.jsonlFile` ← B.rolloutPath
- File watcher rebinds to B's rollout file (keep the old offset state isolated; start at end-of-file for B to avoid replaying historical lines as new events)
- Accumulate tokens: `agent.inputTokens` and `agent.outputTokens` should be cumulative across threads (the previous thread's final counts are _added to_, not replaced by, the new thread's counts). Don't reset them on switch.
- Clear transient per-turn state (`activeToolIds`, `activeToolStatuses`, `activeToolNames`, `activeSubagentToolIds`, `activeSubagentToolNames`, `permissionSent`, `hadToolsInTurn`, `isWaiting`) so old tools from thread A don't show up in B's status.
- Post the appropriate `agentMetadata` + `agentTokenUsage` messages so the webview reflects the new transcript path and cumulative tokens.
- Log a clear console line: `[Pixel Agents] Codex: Agent N - thread A → thread B (same cwd follow-on)`.

Implementation suggestion (you are free to pick a different shape):

- Convert the `setInterval` in `src/agentManager.ts:156` from "stop after first thread found" to "always-on poll keyed by cwd". Each tick: query `findLatestCodexThread(cwd, 0)`. If the returned thread.id differs from `agent.sessionId`, perform the switch above.
- Keep the poll interval reasonable (`JSONL_POLL_INTERVAL_MS` is fine — already the same cadence as initial thread discovery).
- Only one such poll per agent. If the agent is removed, clear the timer (the existing `jsonlPollTimers.delete(id)` cleanup must still work).

### 3. Tests

- Add focused unit tests in `server/__tests__/codex.test.ts` or a new file for the "same-cwd follow-on" behavior. Mock `findLatestCodexThread` to return thread A then thread B; assert the agent's sessionId / jsonlFile update and tokens accumulate.
- Do not weaken existing tests (147 are currently green; final count must be ≥147 with all passing).

## Constraints

- Use existing constants and patterns (no new magic numbers; pull from `server/src/constants.ts` or `src/constants.ts`).
- TypeScript: no `enum`, use `as const`. Use `import type` for type-only imports.
- No new dependencies.
- Don't add comments explaining what the code does. Only add a comment if you've encoded a non-obvious _why_ (e.g., "start at EOF on rebind to avoid replaying thread B's history as live events").
- Don't refactor unrelated code. Resist the urge to clean up duplication in `transcriptParser.ts` vs `codex.ts` parsing — that's design work for later.
- Don't introduce a new message type unless absolutely necessary. The existing `agentMetadata` + `agentTokenUsage` cover the switch.
- Build must still pass: `npm run build` (tsc + eslint + esbuild + vite).
- All tests must pass: `npm test`.

## Acceptance criteria

After your changes are applied, built, and the .vsix repackaged and installed:

1. Clicking + Agent once → exactly 1 Codex agent appears in Agent Center.
2. Typing 3 separate prompts in that Codex terminal (regardless of whether Codex creates 1 or 3 underlying threads) → still exactly 1 Codex agent in Agent Center. Its `agentName` may change to reflect the latest thread title; its token total grows monotonically across prompts.
3. The agent's status updates correctly for each prompt (no freeze from prompt 2 onward). When the user is waiting for input, the agent shows the appropriate waiting state.
4. No Codex agent rows appear for threads that the user did not spawn via +Agent (no ghost adoption from other cwds or from prior sessions outside this VS Code instance).
5. Deleting the active Codex thread via Codex CLI (e.g., `codex thread delete <id>`) while the agent's terminal is still alive: the agent should detect the loss within ~5 seconds and either (a) re-discover a new latest thread for that cwd or (b) enter an idle/disconnected state — your choice, but document which.
6. All existing tests pass; new tests cover the follow-on behavior.

## Verification protocol (user-side, after you return)

The user will:

1. `npm run build && npm run package` (or whatever the project's vsix command is — confirm in `package.json scripts`).
2. Uninstall the existing Pixel Agents extension from their main VS Code, install the new .vsix.
3. Reload window.
4. Click + Agent (Codex) → confirm 1 agent appears.
5. Type "read package.json", wait for response, type "read package.json", wait, type "say hi".
6. Confirm: still 1 agent, status updates each turn, token total grows.
7. Open `~/.codex/state_5.sqlite` and confirm new threads exist for those prompts (proving Codex did create new threads but our agent kept up).

## Reporting back

When you finish:

1. Summarize the changes (file paths, brief description of each).
2. Paste the new test names.
3. Confirm `npm run build` and `npm test` are both green; paste their final summary lines.
4. Note anything you chose differently from the suggestions above, with the reason.
5. Flag anything you noticed that looked broken but stayed out of scope (so the supervisor can decide whether to spin a follow-up).
