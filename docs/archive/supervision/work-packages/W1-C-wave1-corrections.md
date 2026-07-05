# Work Package W1-C — Wave 1 corrections + Claude parity findings

## Context (read first)

Runtime verification of W1-A (Claude launcher restore) and W1-B (Codex thread follow-on) uncovered three issues. Two are pre-existing problems uncovered during testing; one is a regression introduced by W1-B that this package must repair before W1-B can be merged to `main`.

The supervisor's static review missed the W1-B regression by checking only the new spawn path (`launchNewTerminal`) without cross-checking the parallel agent-creation paths (`restoreAgents`, hook adoption, external scanner). The spec for this package builds in that cross-check explicitly.

### Symptom A — Restored Codex agents all disappear after install + reload (W1-B regression, blocker)

After installing the W1-B .vsix and reloading the window, ALL previously-persisted Codex agents vanish from Agent Center. Newly-spawned Codex agents (via + Agent) still work correctly.

**Root cause** (confirmed by supervisor):

- W1-B added a persistent cwd-keyed poll inside `launchNewTerminal` that switches `agent.sessionId` / `agent.jsonlFile` whenever Codex creates a new thread in the agent's cwd.
- W1-B did NOT add the same poll inside `restoreAgents` (`src/agentManager.ts`).
- W1-B tightened `removeStaleCodexAgents` to require `findCodexThreadById(agent.sessionId)` to succeed.
- Restored Codex agents keep their old persisted `sessionId`. If that thread was archived/deleted between sessions (very common after a `/clear`), the staleness check removes them — and there's no follow-on to rescue them.

### Symptom B — Pixel Agents shows 2 Claude agents when CLI shows only 1 (pre-existing, annoying)

User report from W1-A verification: opened a single Claude session via + Agent, but Agent Center displays two Claude agent entries; CLI / `~/.claude/projects/` has only one matching JSONL.

**Suspected root cause** (executor must confirm):

Claude has at least four distinct adoption code paths that can each create a new agent for a given JSONL file:

- `scanClaudeRecentSessions` (called from `scanClaudeWorkspaceThreads` in `src/PixelAgentsViewProvider.ts:497`)
- `scanClaudeCoworkSessions` (also called from `scanClaudeWorkspaceThreads`)
- `adoptExternalSessionFromHook` in `src/fileWatcher.ts:842`
- The core `adoptExternalSession` in `src/fileWatcher.ts:952` (called from multiple sites — search for `adoptExternalSession(`)

The dedup keys used by these adopters may not be aligned. A user-spawned Claude agent (created via `launchNewTerminal`) and an external adopter both creating agents for the same JSONL is the most likely race.

### Symptom C — Claude Code mode agents have no title (pre-existing, annoying)

When Claude is started in regular `claude` mode (not `claude cowork`) — either via + Agent or externally — its agent in Pixel Agents shows the generic name `Claude` instead of a meaningful per-session title (like Codex shows `read package.json` or the user's first prompt).

**Suspected root cause** (executor must confirm):

- `src/fileWatcher.ts:929` hardcodes `agentName: 'Claude'` for the regular Claude path.
- Claude Cowork path reads `metadata.threadName` from a sidecar metadata file (lines 1141, 1612).
- Regular Claude Code JSONL files don't have a clean named title field, but typically contain a `summary` record or the first `user` message — either could serve as a title.

## Scope of this work package

Three fixes, one branch (`cleanup/w1-c-wave1-corrections`), one commit. The branch is based on `cleanup/w1-b-codex-thread-followon` so the new restore-poll can reuse the helper introduced in W1-B.

### In scope

1. **Fix A — Restore-time cwd polling for Codex (blocker, repairs W1-B regression)**

   In `src/agentManager.ts` `restoreAgents`, for any restored agent with `providerId === 'codex'`, set up the same persistent cwd-keyed poll that `launchNewTerminal` sets up in W1-B. The poll's job is identical: every tick, query `findLatestCodexThread(cwd, 0)`; if the returned thread.id differs from `agent.sessionId`, perform the same switch (sessionId / jsonlFile / file watcher rebind at EOF / token base accumulate / clear transient state / cancel timers / postMessage `agentMetadata` + `agentTokenUsage` + `agentToolsClear` / log line).

   Strongly preferred implementation: extract the per-tick poll body from `launchNewTerminal` into a private helper (e.g. `startCodexCwdPoll(agent, cwd, ...)`) and call it from both `launchNewTerminal` and `restoreAgents`. Two-call-sites for the same logic prevents the next divergence.

2. **Fix B — Eliminate duplicate Claude agent rows (annoying)**

   Investigate why a single Claude session (one JSONL file under `~/.claude/projects/<hash>/`) produces two Agent Center entries. Likely causes to evaluate (not exhaustive):
   - User-spawned agent from `launchNewTerminal` (`isExternal: false`) and an external adoption (`isExternal: true`) for the same JSONL race the dedup key check.
   - `adoptExternalSession` checks `knownJsonlFiles` but may not check against `agents` map by `jsonlFile` field.
   - Hook-based adoption (`adoptExternalSessionFromHook`) and file-scanner-based adoption (`scanClaudeRecentSessions` → `adoptExternalSession`) may dedup against different sets.

   Fix: ensure that **for any given JSONL path, at most one Claude agent exists**. Acceptable approaches:
   - Strengthen the `adoptExternalSession` precondition to also reject when `[...agents.values()].some(a => path.resolve(a.jsonlFile) === path.resolve(targetJsonl))`, regardless of who created the existing agent.
   - Or: ensure `knownJsonlFiles` is updated consistently by all adoption paths.

   Whichever approach, document the chosen invariant in a short comment in `fileWatcher.ts` near the dedup site, e.g. `// invariant: one Claude agent per jsonlFile path; all adopters must check both agents map and knownJsonlFiles`.

3. **Fix C — Title extraction for regular Claude Code mode (annoying)**

   For Claude agents that are NOT cowork (i.e., `agentName` would otherwise fall back to the hardcoded `'Claude'`), derive a per-session title from the JSONL transcript:
   - Read the first ~50 lines of the JSONL (`readNewLines` first batch, or open + read header).
   - Find the first record with `role: "user"` that has a non-tool `content` (either a string or an array with a `text` block).
   - Extract the first ~40 characters of that text as the title.
   - Set `agent.agentName` to that title; post `agentMetadata` to the webview.
   - If no user message is found within the first read batch, leave `agentName: 'Claude'` and try again on the next `readNewLines` invocation until found.

   Cowork mode is unaffected (it already uses `metadata.threadName`).

### Out of scope (do NOT touch)

- The "Pixel Agents UI delete doesn't kill Codex CLI process" issue (the Hide/Archive/Kill safe-action model). That's W3-D / original Phase 4 scope.
- Codex parser (`server/src/providers/file/codex/codex.ts`) — G-7.
- Lifecycle status engine (`src/lifecycleStatus.ts`) — G-7.
- AgentCenter UI changes — Wave 2 territory.
- Refactoring the two-stage Codex parsing in `transcriptParser.ts` vs `codex.ts` — design call for later.
- Any expansion of W1-A's launcher dispatch beyond what already merged.
- Refactoring `adoptExternalSession`'s many call sites — only fix the dedup invariant, don't reduce the call-site count.

## Required changes (end-state described)

### `src/agentManager.ts`

- Extract the Codex per-tick poll body (currently inline inside `launchNewTerminal`'s `setInterval`) into a private helper. Suggested signature:
  ```
  function pollCodexCwdForFollowOn(
    agentId: number,
    cwd: string,
    agents: Map<number, AgentState>,
    knownJsonlFiles: Set<string>,
    fileWatchers, pollingTimers, waitingTimers, permissionTimers, jsonlPollTimers,
    webview, persistAgents,
  ): void
  ```
  It owns the `setInterval` itself; caller doesn't need to manage the timer.
- `launchNewTerminal`'s Codex branch calls this helper instead of inlining the loop.
- `restoreAgents`, after restoring a `providerId === 'codex'` agent, ALSO calls this helper, passing the agent's `projectDir` as cwd.
- The helper handles both "initial bind" (first call when agent has no `jsonlFile` yet, e.g. fresh +Agent) and "running" cases via the `isInitialBind = !agent.jsonlFile` flag already present in W1-B.
- The Claude branch in `launchNewTerminal` is untouched.

### `src/fileWatcher.ts`

- **Fix B**: Strengthen the dedup invariant. Likely site: at the top of `adoptExternalSession` (and / or `adoptExternalSessionFromHook`), reject when any existing agent already has the same `jsonlFile` path. Add a short comment naming the invariant.
- **Fix C**: For the regular Claude branch (where `agentName: 'Claude'` is currently set, line 929), do NOT set the final name there. Instead, set a placeholder and queue a title-extraction step. Or do the extraction inline if you have access to the JSONL header at that point. Pick the implementation that is least invasive.

### `src/transcriptParser.ts` (if needed for Fix C)

- If you choose to do title extraction during JSONL line processing (rather than at agent creation), add a one-time-per-agent check inside the Claude branch of the parser that, when it sees the first user text record, calls back to update `agent.agentName` and post `agentMetadata`. Don't repeat after the first match.

### `src/types.ts` (if needed)

- Likely no new fields. If you need a flag like `claudeTitleResolved?: boolean` to avoid repeating the extraction, add it; surface in your report.

## Tests

- **Build / lint**: `npm run build` must remain green.
- **Existing tests**: `npm test` (currently 150 passing on W1-B branch) must remain green.
- **New tests** (focused, minimal):
  - Unit test for Fix A: simulate a `restoreAgents` call with a persisted Codex agent whose `sessionId` no longer exists in SQLite; after restore + one poll tick, the agent's `sessionId` should be updated to the latest live thread in its cwd (or, if no live thread, the agent should enter the "clean idle" disconnected state — not be removed).
  - Unit test for Fix B: spawning a Claude agent via `launchNewTerminal` and then invoking the external scanner on the same JSONL should NOT create a second agent for that JSONL.
  - Unit test for Fix C: given a Claude JSONL fixture with a first user message "do something specific", the agent's `agentName` should resolve to a prefix of that text (not stay as `'Claude'`).
- New test count: ≥3 added. Total must be ≥153.

## Guardrails (verbatim from cleanup-framework.md §1)

- **G-1 Polymorphic, never replace**: Fix B and C touch Claude paths only; do NOT touch the Codex paths. Fix A touches Codex restore only; do NOT touch Claude restore. Helper extraction in Fix A is the only allowed "structural" change — extract, don't redesign.
- **G-2 One package = one commit on branch `cleanup/w1-c-wave1-corrections`**. The branch is based on `cleanup/w1-b-codex-thread-followon` (not main). Commit body must explicitly describe all three fixes and any cross-cutting helper extraction.
- **G-3 Scope frozen**: if Fix B's investigation reveals a deeper architectural issue (e.g. all four Claude adopters race in more cases than reported), STOP and report — do not silently broaden. The deeper fix is a future package.
- **G-4 Build green + tests green + user runtime verification**.
- **G-5 Provider symmetry**: Fix A applies a pattern to Codex; consider whether the same restore-time issue could affect Claude after a hypothetical future change — for now, Claude doesn't have the same follow-on logic, so no symmetric fix needed. Document this asymmetry in the commit body.
- **G-6 No roadmap status edits unless explicitly in this package's scope** — not in scope here.
- **G-7 Preserve known-good list**: do NOT touch codex.ts or lifecycleStatus.ts.

### Cross-creation-path checklist (supervisor's lesson from this regression)

Before declaring done, verify ALL of these paths handle Codex agents correctly for the new follow-on poll:

- [ ] `launchNewTerminal` (Codex branch) — covered in W1-B
- [ ] `restoreAgents` — Fix A in this package
- [ ] `adoptExternalSession` — should never create a Codex agent (Codex no longer auto-adopts after W1-B). Confirm.
- [ ] `adoptExternalSessionFromHook` — Codex doesn't use hooks. Confirm no Codex path.

State the result of this checklist in your final report.

## Acceptance criteria

After build + repackage + reinstall on top of a window that previously had W1-B installed:

1. After reloading the window, previously-persisted Codex agents that have a live terminal in VS Code remain visible in Agent Center (no mass-disappear).
2. A previously-persisted Codex agent whose original thread was archived now follows the latest thread in its cwd within one poll tick of restore; its `sessionId`, `jsonlFile`, and live status all reflect the new thread.
3. A previously-persisted Codex agent whose cwd has no live thread enters "clean idle" disconnected state (no `removeAgent`).
4. Spawning a single Claude agent via + Agent and waiting 10s shows exactly ONE Claude agent in Agent Center (not two).
5. Externally starting Claude via `claude --session-id <uuid>` in a separate terminal, where pixel-agents adopts it, results in exactly ONE agent for that JSONL (no race-duplicate against existing user-spawned).
6. A Claude Code (not cowork) agent, after sending its first prompt, displays a meaningful title in Agent Center derived from that first user prompt — not the placeholder `'Claude'`.
7. Cowork Claude sessions still display their `metadata.threadName` (no regression on the cowork title path).
8. `npm run build` and `npm test` green; new tests cover the three fixes.

## Verification protocol (user runs after handback)

1. `git checkout cleanup/w1-c-wave1-corrections`
2. `npm run build` — green.
3. `npm test` — confirm ≥153 passing.
4. `rm -f pixel-agents-1.3.0*.vsix pixel-agents-W1*.vsix` to clean old artifacts.
5. `npx @vscode/vsce package -o pixel-agents-W1C.vsix`
6. `code --install-extension /Users/raychen/Documents/pixel-agents/pixel-agents-W1C.vsix --force`
7. **Cmd+Shift+P → Developer: Reload Window**.

Then exercise:

**Test A (regression repair)**

- Pre-condition: have at least one Codex agent in Agent Center.
- Reload the window.
- Confirm the Codex agent does NOT disappear (assuming its terminal is still alive). If its bound thread was archived since last time, it should be reassigned to a new thread in its cwd within ~5s.

**Test B (no duplicate Claude)**

- Open + Agent → select Claude → Start.
- After ~10 seconds (allow scanner ticks), check Agent Center: exactly one Claude agent for this session.
- Repeat: this time, in a separate terminal outside pixel-agents, run `claude --session-id $(uuidgen)`. Wait for pixel-agents to detect.
- Confirm exactly one Claude agent for that external session (not two from racing adopters).

**Test C (Claude title extraction)**

- Spawn a Claude agent via + Agent.
- In the terminal, type a clear first prompt like: `please list the files in this directory`.
- Wait ~5 seconds.
- Confirm Agent Center's row for this Claude agent shows a title derived from the prompt text, not the placeholder `Claude`.

Record PASS / FAIL for each of the 8 acceptance criteria.

## Reporting back

Use this structure in your final reply (the user will paste it back to the supervisor):

```
# W1-C Execution Report

A. Branch + commit SHA
B. git diff --stat cleanup/w1-c-wave1-corrections...cleanup/w1-b-codex-thread-followon
   (note: diff vs W1-B base, since this branch is built on top of W1-B)
C. Per-file change narrative (for each modified/created file, one paragraph)
D. Fix A — restore-time cwd polling for Codex
   - Helper extraction strategy (did you extract pollCodexCwdForFollowOn?)
   - How is restoreAgents wired to it?
E. Fix B — Claude duplicate dedup
   - Which adopters were the source of duplicates (confirm or refine the supervisor's hypothesis)
   - What invariant did you encode and where
F. Fix C — Claude title extraction
   - Where does the title extraction happen (at adoption / in JSONL parser / elsewhere)
   - What's the extracted source (first user message text / something else)
G. Cross-creation-path checklist results (the four bullets above)
H. Final summary lines of `npm run build` and `npm test`
I. Acceptance criteria check (8 items, PASS/FAIL/one line)
J. Out-of-scope findings (file:line + one-line, or "none")
K. Deviations from spec, with reason
L. Items for supervisor to double-check
```
