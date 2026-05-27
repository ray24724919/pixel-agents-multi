# Work Package W2-A — Smart external Codex session sync

## Context (read first)

After Wave 1 landed, the user clarified their product vision: **a Claude + Codex work-status platform** where they can see all their active working sessions across providers and cwds at a glance, plus exercise lifecycle control (Kill / Pause / Resume).

Wave 1 fixed the per-session correctness (Claude launcher restored; Codex follows `/clear`; restored agents survive reload). But it left a gap: **W1-B disabled `adoptCodexExternalThread` entirely** to stop the "every /clear creates a ghost agent" bug. The trade-off was that Codex sessions started outside `+Agent` are now invisible.

This package re-enables that adoption — but smartly — so we get external visibility without ghosts. The "one cwd = one agent" invariant from W1-B's design (and W1-C's helper extraction) is what makes this safe now.

### What you'll be working with

- `src/PixelAgentsViewProvider.ts:478-495` — current `scanCodexWorkspaceThreads()` (post-W1-C). It still calls `findRecentCodexThreads(50)` and `getLiveCodexThreadIdsForSpawnedAgentCwds()` for staleness scoping, but no longer adopts.
- `src/agentManager.ts` — the `startCodexCwdPoll(...)` helper W1-C extracted. **Reuse it** — that's the whole point of having extracted it.
- The previous (pre-W1-B) `adoptCodexExternalThread` body lives in git history: `git show 142c49c^:src/PixelAgentsViewProvider.ts` (between commits W1-A merge and W1-B merge). Use it as reference for the AgentState shape and the postMessage payload, but **do NOT copy-paste verbatim** — its ghost-creating loop is exactly what we don't want.

## In scope

1. **Cwd-grouping invariant**: for each unique cwd in `findRecentCodexThreads(50)`, at most one Codex agent in Agent Center. If multiple threads exist for that cwd, pick the latest by `updated_at_ms` (already the SQL ordering).

2. **Scope filter** (controls how aggressively we adopt):
   - Default: adopt threads whose `cwd` is either (a) a workspace folder root the user has open in VS Code, or (b) a cwd that already owns at least one `+Agent`-spawned (`isExternal=false`) Codex agent.
   - Settings escape hatch: `pixel-agents.codex.discoverAllCwds` (boolean, default `false`). When true, adopt the latest thread for every cwd in the scan list, regardless of workspace membership.
   - Codex CLI sessions in totally unrelated cwds remain invisible by default. User opts in via the setting when they want the full view.

3. **Adoption wiring**: when adopting a thread as a new external Codex agent:
   - Set `isExternal: true`, `providerId: 'codex'`, agent name from `thread.title ?? thread.agentNickname ?? thread.agentRole ?? 'Codex'`.
   - Start file watching at end-of-file (so we don't replay history as live events).
   - **Wire through `startCodexCwdPoll`** so any subsequent thread switch in the same cwd updates this agent (just like a `+Agent`-spawned one). This is the key W1-C-leveraged piece — without it, ghosts come back.
   - Read existing token usage from the transcript via `readTokenUsageFromTranscript` so the badge reflects accumulated tokens, not zero.
   - Persist to `workspaceState` so external agents survive reload.

4. **Dedup against existing agents**: before adopting any thread for cwd C, check that no Codex agent already exists with `path.resolve(agent.projectDir) === path.resolve(C)`. If one exists, do nothing (its `startCodexCwdPoll` already handles the latest-thread switch).

5. **Stale-cleanup still works**: `removeStaleCodexAgents` (W1-B/W1-C cwd-scoped version) keeps doing its job. Adopted external agents whose cwd has zero live (non-archived) threads should be cleaned up on the next scan.

## Out of scope (do NOT touch)

- Claude-side adoption (Claude's scanners are separate; their dedup was tightened in W1-C and is fine).
- AgentCenter UI rendering.
- Office canvas character logic.
- The `pixel-agents.codex.autoAdoptExternalThreads` setting from the original W1-B draft (we are not gating, we are replacing with a smarter version).
- Pause / Resume agent (W2-C).
- Kill / Hide / Archive action plumbing (W2-D).
- Adding a "Show external Codex sessions" UI toggle — the setting handles that, no UI work in this package.

## Required changes (end-state described)

### `package.json`

- Add a new contributed configuration setting `pixel-agents.codex.discoverAllCwds`:
  - type: `boolean`
  - default: `false`
  - description: `When enabled, Pixel Agents adopts the latest Codex thread for every cwd in the recent-threads scan, not just cwds matching the current VS Code workspace or an existing user-spawned agent.`

### `src/PixelAgentsViewProvider.ts`

- Add a private helper `adoptCodexExternalThread(thread: CodexThread): AgentState | null` that performs the cwd-dedup check + creates the agent + wires through `startCodexCwdPoll`. Do not call `syncCodexThreadMetadata` (that helper was removed in W1-C; the `startCodexCwdPoll` cycle covers what it did).
- Add a private helper `getAdoptionCandidates(threads: CodexThread[]): CodexThread[]` that:
  - Determines the scope filter mode by reading the `pixel-agents.codex.discoverAllCwds` setting via `vscode.workspace.getConfiguration(...)`.
  - In "default" mode: builds the set of allowed cwds = workspace folder roots ∪ cwds with `isExternal=false` Codex agents. Filters threads to those in this set.
  - In "discoverAll" mode: returns all threads.
  - Groups remaining threads by cwd and returns one (the latest by `updated_at_ms`) per cwd, EXCLUDING cwds where any Codex agent already exists.
- Modify `scanCodexWorkspaceThreads()`:
  - After `findRecentCodexThreads(50)`, call `getAdoptionCandidates(threads)`.
  - For each returned candidate, call `adoptCodexExternalThread(thread)`. Log adoption (`console.log` similar to the old code, but the format `[Pixel Agents] Codex: adopted external thread <id> (<cwd>/<rolloutBasename>)`).
  - Keep the `removeStaleCodexAgents(topLevelThreadIds)` call as-is. Keep the `codexProjects` postMessage as-is.

### `src/agentManager.ts`

- Export `startCodexCwdPoll` if it isn't already accessible from outside the module (W1-C made it a local helper).
- If it's already module-private and not export-able cleanly (because of internal coupling), surface this in your report and propose an alternative (e.g. an `adoptExternalCodexThread` wrapper inside `agentManager.ts` that the View Provider calls).

### Persistence (`persistAgents` / `restoreAgents`)

- No type changes expected; `isExternal` already supported.
- On restore: agents with `isExternal=true && providerId='codex'` should also start their cwd poll. Verify by reading the current `restoreAgents` — W1-C added the poll for restored Codex agents but the `isExternal=true` branch in `restoreAgents` only checks for jsonl existence, not poll setup. **Confirm**: does the existing `if (agent.providerId === 'codex')` branch in `restoreAgents` (added in W1-C) execute for `isExternal=true` agents? Test this; if it doesn't, fix it.

### Tests

- New test file or extension to `codexFollowon.test.ts`:
  - **Test 1**: Given 3 threads in SQLite for cwd `/foo`, scan should produce ONE adopted agent (the latest), not three.
  - **Test 2**: Given threads in `/foo` (a workspace folder) and `/bar` (not a workspace folder, no existing agent), default scope only adopts `/foo`. With `discoverAllCwds=true`, both adopted.
  - **Test 3**: Given a thread in cwd `/foo` and an existing +Agent-spawned Codex agent for `/foo`, scan should NOT adopt the thread (the existing agent already handles it).
  - **Test 4**: After adoption, the adopted agent's `startCodexCwdPoll` fires; if a newer thread appears for that cwd, the agent's sessionId updates without creating a duplicate.

- New test count: ≥3 added. Total `npm test` must be ≥160 (157 baseline + ≥3 new).

## Guardrails (verbatim from cleanup-framework.md §1)

- **G-1 Polymorphic, never replace**: this package only touches Codex paths. Claude scanning paths are not modified.
- **G-2 One package = one commit on branch `cleanup/w2-a-codex-external-sync`**, based on the current `main` (post-Wave 1).
- **G-3 Scope frozen**: if the investigation reveals that `startCodexCwdPoll` needs deeper refactoring to support external adoption cleanly, STOP and surface in your report — discuss with supervisor before expanding scope.
- **G-4 Build green + tests green + user runtime verification**.
- **G-5 Provider symmetry**: Claude already has external session adoption working (per W1-C); the symmetry note here is just to document why this package is Codex-only.
- **G-6 No roadmap status edits**.
- **G-7 Preserve known-good list**: do not touch `server/src/providers/file/codex/codex.ts` or `src/lifecycleStatus.ts`.

## Acceptance criteria

After build + repackage + reinstall on a fresh window:

1. With no Codex agents in pixel-agents but Codex threads in SQLite for the current VS Code workspace folder: within ~5 seconds of opening pixel-agents, one Codex agent per cwd appears in Agent Center (latest thread bound).
2. Even if a cwd has multiple threads (because of past `/clear`s), only ONE Codex agent appears for that cwd.
3. With `pixel-agents.codex.discoverAllCwds: false` (default): threads in cwds outside the VS Code workspace and not owned by an existing agent are NOT adopted.
4. With `pixel-agents.codex.discoverAllCwds: true`: those threads ARE adopted (one per cwd).
5. Existing `+Agent`-spawned Codex agents are not duplicated by the scanner re-adopting their cwd.
6. After adoption, a new `/clear` in any of those external Codex terminals updates the existing agent (the new thread's id becomes the agent's `sessionId`) — NO new agent is created.
7. Archiving the active thread of an adopted external agent (via `codex thread delete` or SQLite update) cleans up that agent within ~5s (existing `removeStaleCodexAgents` behavior).
8. `npm run build` and `npm test` green; new tests cover the cwd-grouping invariant + scope-filter modes.

## Verification protocol (user runs after handback)

1. `git checkout cleanup/w2-a-codex-external-sync`
2. `npm run build` + `npm test` — both green, ≥160 tests.
3. `rm -f pixel-agents-*.vsix && npx @vscode/vsce package -o pixel-agents-W2A.vsix && code --install-extension /Users/raychen/Documents/pixel-agents/pixel-agents-W2A.vsix --force`
4. Reload Window.

**Test 1 — default scope sync**:

- Pre: have at least one Codex thread in SQLite for the current pixel-agents cwd (start a fresh codex session in a terminal: `codex --cd /Users/raychen/Documents/pixel-agents` and send a small prompt).
- Open pixel-agents view → wait ~5s → confirm exactly one Codex agent appears, bound to the latest thread for that cwd.

**Test 2 — multi-thread same-cwd dedup**:

- In the running Codex session above, `/clear` and send another prompt. SQLite now has two threads for the cwd.
- Pixel Agents Agent Center: still exactly one Codex agent.

**Test 3 — scope filter**:

- Without changing the setting, run `codex --cd /tmp "test"` in a separate terminal. Wait ~5s.
- Confirm: NO new Codex agent in Agent Center (because /tmp is not your workspace folder).
- Open VS Code settings → enable `pixel-agents.codex.discoverAllCwds` → reload.
- Confirm: the /tmp thread now appears as an agent.

**Test 4 — no double-adoption against +Agent agents**:

- Spawn a Codex agent via +Agent in current workspace. Wait 10s.
- Confirm: exactly one Codex agent for this cwd, the +Agent one. Scanner doesn't create a parallel "external" copy.

Record PASS/FAIL on each acceptance criterion.

## Reporting back

Paste the following structure verbatim into your final reply (user will forward to supervisor):

```
# W2-A Execution Report

A. Branch + commit SHA
B. git diff --stat main...cleanup/w2-a-codex-external-sync
C. Per-file change narrative
D. How did you handle `startCodexCwdPoll` export/access (was it cleanly exportable, or did you need a wrapper)?
E. Default scope filter — confirm it matches spec (workspace folders ∪ existing-agent cwds) or describe deviation
F. restoreAgents check — does the W1-C-added poll branch execute for isExternal=true agents? If you changed restoreAgents, describe.
G. Final summary lines of `npm run build` and `npm test`
H. Acceptance criteria check (8 items, PASS/FAIL/one line)
I. Out-of-scope findings (file:line + one-line, or "none")
J. Deviations from spec, with reason
K. Items for supervisor to double-check
```
