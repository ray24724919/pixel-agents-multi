# Work Package W1-A — Restore Claude launcher with provider selection

## Context (read first)

This package counters **BLK-1** in [deviation-map.md](../deviation-map.md#severity-ranked-deviation-list-for-cleanup-framework) and addresses symptom **S-T1-01** in [symptoms-log.md](../symptoms-log.md#s-t1-01--agent-button-cannot-launch-claude-only-codex).

**The problem in one sentence**: when the executor added Codex support in commit `e61b405`, the main supervisor thread directly replaced the Claude launch command in `src/agentManager.ts:launchNewTerminal` with a hardcoded Codex command, instead of generalizing the launcher with a provider parameter. The +Agent button now exclusively spawns Codex agents; Claude can no longer be launched from the UI.

**The original Claude launch flow** (recoverable from `git show e61b405^:src/agentManager.ts`):

- Command: `claude --session-id <uuid>` (or `... --dangerously-skip-permissions` when bypass requested)
- `projectDir` derived via `getProjectDirPath(cwd)` → `~/.claude/projects/<hash>`
- `jsonlFile` pre-predicted as `<projectDir>/<sessionId>.jsonl`
- `ensureProjectScan(projectDir, …)` started for /clear adoption
- Polling waited for the predicted JSONL file to appear, then `startFileWatching`

**The current Codex flow** (in `src/agentManager.ts:64-214`):

- Command: `buildCodexLaunchCommand(cwd, bypassPermissions ?? false, prompt)`
- `projectDir = cwd` (no transform)
- `jsonlFile = ''` (discovered later via SQLite)
- `agentName = 'Codex'`, `providerId = 'codex'`
- Polling queries `findLatestCodexThread(cwd, launchedAt - 1000)` until a thread appears

Both flows must coexist after this package, dispatched by a `providerId` parameter.

## In scope

1. Add `providerId: 'claude' | 'codex'` parameter to `launchNewTerminal()` in `src/agentManager.ts`. Default = `'claude'` (matches pre-fork behavior).
2. Inside `launchNewTerminal`, dispatch the entire post-terminal-creation flow on `providerId`:
   - `'claude'`: re-introduce the original Claude command + `getProjectDirPath` + predicted-JSONL + `ensureProjectScan` + JSONL-existence poll. Recover the implementation from `git show e61b405^:src/agentManager.ts` (lines ~83-156). Do not invent a new design.
   - `'codex'`: keep the current Codex flow (SQLite polling, `agent.agentName = 'Codex'`, `providerId: 'codex'`, etc.) unchanged in behavior.
3. Thread `providerId` through the call chain:
   - `webview-ui/src/components/BottomToolbar.tsx` `handleSubmit` posts `providerId` in the `openAgent` message.
   - `src/PixelAgentsViewProvider.ts:803-822` reads `message.providerId` and passes it into `launchNewTerminal`. If absent, default to `'claude'`.
4. Add a Provider picker to the +Agent modal in `BottomToolbar.tsx:131-211`:
   - Position: between Project and Task fields.
   - UI shape: two radio buttons or a small segmented control labeled "Claude" / "Codex".
   - Default: Claude (matches original behavior).
   - State persists for the modal session only — no need to remember across opens; next open defaults to Claude again.
5. The `agentCreated` postMessage that goes to the webview must always include `providerId` (the Codex path already does this; the Claude path currently omits it — add it).
6. Persist `providerId` in `PersistedAgent` for restore (`src/types.ts` may need touching for the type). Codex path already does this; Claude path didn't because it was the implicit default — make it explicit so reload-after-cleanup behaves identically for both.

## Out of scope (do NOT touch)

- Codex thread same-cwd follow-on (that's W1-B).
- AgentCenter rendering, lifecycle pipelines, timeline events.
- `claudeProvider` hook installation logic in `PixelAgentsViewProvider.ts:155` — only the launcher dispatch is in scope, not the hook setup.
- Whether `prompt` (the initial task text from the modal) is forwarded to `claude` at launch. The original code ignored it. Preserve that: Claude path ignores `prompt`. Codex path keeps using it. If you think prompt-forwarding for Claude is valuable, flag it as an out-of-scope finding for a future package — do NOT add it here.
- e2e test fixtures (`mock-claude` recovery is W3-B).
- The `openClaude` / `openAgent` message alias at `PixelAgentsViewProvider.ts:803` (W3-D handles whether to keep or deprecate).
- `removeStaleCodexAgents` cwd-scoping (W1-B / W3-A).

## Required changes (end-state described, not steps)

### `src/agentManager.ts`

- Add `providerId: 'claude' | 'codex'` to the parameter list of `launchNewTerminal`. Place it as a required parameter (so callers can't accidentally forget), but the message handler defaults to `'claude'` when the field is missing — see PixelAgentsViewProvider change below.
- After `terminal.show()` and `const sessionId = crypto.randomUUID()`, branch on `providerId`. The branch is the entire body from "build launch command" through "start polling" — both branches construct the `agent` object, call `agents.set`, post `agentCreated`, and kick off appropriate polling.
- Don't refactor common pieces into a shared helper in this package. Two parallel branches is fine and easier to review. Helper extraction is a future package if anyone wants it.
- `agentCreated` message from the Claude branch must include `providerId: 'claude'`, `projectDir`, and `transcriptPath: agent.jsonlFile` (which is the predicted path).

### `src/PixelAgentsViewProvider.ts`

- `onDidReceiveMessage` handler at line 802: when handling `'openAgent' || 'openClaude'`, read `message.providerId as 'claude' | 'codex' | undefined`, defaulting to `'claude'` if absent. Pass into `launchNewTerminal` as the new parameter.
- No other change here — hook registration loop at line 824 already iterates all newly-created agents regardless of provider.

### `src/types.ts`

- Confirm `PersistedAgent` and `AgentState` types accept `providerId: 'claude' | 'codex'`. They already do, per current code. No type change expected; if you find one needed, surface it.

### `webview-ui/src/components/BottomToolbar.tsx`

- Add `provider` state in the modal component (default `'claude'`).
- Render the Provider picker between the Project select (line 138-153) and the Task textarea (line 167-176). Match existing modal styling — use the same Tailwind classes the Project select uses; don't introduce a new design language.
- `handleSubmit` (line 68-84) adds `providerId: provider` to the `openAgent` postMessage payload.
- Reset `provider` to `'claude'` on modal close (alongside the existing prompt/bypass resets at lines 82-83).

### Webview message types

- If there's a TypeScript message type union, add `providerId?: 'claude' | 'codex'` to the `openAgent` message variant. If no central union exists, just send the field — the extension reads it untyped.

## Tests

- **Build / lint**: `npm run build` must remain green.
- **Existing tests**: `npm test` (147 tests today) must remain green.
- **New tests** (focused, minimal):
  - Unit test for `launchNewTerminal` with `providerId='claude'` — assert it sends the `claude --session-id …` command to a mock terminal and creates an agent with `providerId: 'claude'`. If the existing test harness mocks `vscode.window.createTerminal`, reuse that pattern; if not, the test can be light (just verify the command string and agent creation).
  - Unit test for `providerId='codex'` parity — same agent created, command goes through `buildCodexLaunchCommand`.
  - Unit test for default — calling without explicit `providerId` (or with `undefined`) yields a Claude agent.
- New test count: ≥3 tests added. Total `npm test` count must be ≥150.

## Guardrails (verbatim from cleanup-framework.md §1)

- **G-1 Polymorphic, never replace**: both Claude and Codex branches must exist after this package; do NOT delete the current Codex code or replace it. Both are first-class.
- **G-2 One package = one commit on branch `cleanup/w1-a-restore-claude-launcher`**.
- **G-3 Scope frozen**: if implementation reveals out-of-scope friction (e.g. lifecycle pipeline reacts weirdly to Claude agents because of how it was wired), STOP and report — do not silently broaden.
- **G-4 npm run build green + npm test green + user runtime verification (see Verification section)**.
- **G-5 Provider symmetry**: every Codex-side construct in `launchNewTerminal` and the `agentCreated` message must have a Claude-side equivalent (or an explicit "intentionally asymmetric because …" reason in the commit body).
- **G-6 No roadmap status edits unless explicitly in this package's scope**. (Not in scope here.)
- **G-7 Preserve known-good list**: do not touch `server/src/providers/file/codex/codex.ts` or the lifecycle status helpers in `src/lifecycleStatus.ts`. Codex parser is fine; lifecycle contract is fine.

## Acceptance criteria

1. Rebuild + repackage + reinstall .vsix. Click + Agent. The modal shows a Provider field with Claude and Codex options; Claude is preselected.
2. Selecting Claude + clicking Start Agent spawns a terminal that runs `claude --session-id <uuid>` (or with `--dangerously-skip-permissions` when the Bypass checkbox was ticked).
3. Selecting Codex + clicking Start Agent spawns a terminal that runs the existing Codex command (no regression).
4. The resulting Claude agent appears in Agent Center with `providerId: 'claude'` (visible via the existing provider filter "All / Codex / Claude" — Claude filter shows it; Codex filter hides it).
5. The Claude agent's transcript file is created at `~/.claude/projects/<hash>/<sessionId>.jsonl` and the agent's status/tools update normally for the first turn (existing JSONL polling path).
6. The Codex agent flow is unchanged from baseline: still uses SQLite discovery, still binds via `findLatestCodexThread`.
7. Reloading the window restores both Claude and Codex agents to their previous terminals if those terminals are still alive (the `restoreAgents` path already handles `providerId` per `agentManager.ts:267`).
8. `npm run build` and `npm test` both green; new tests cover at minimum: Claude launch command string, Codex launch command string, default-to-Claude when providerId omitted.

## Verification protocol (user runs after handback)

1. Pull the branch: `git checkout cleanup/w1-a-restore-claude-launcher`.
2. `npm run build` — confirm green. Run `npm test` — confirm ≥150 tests pass.
3. Build .vsix: use the project's existing package script (check `package.json` for the actual command; common shapes are `vsce package` or `npm run package`). If no such script exists, surface it as a question — don't invent one in this package.
4. Uninstall existing Pixel Agents extension from main VS Code → install the new .vsix → reload window.
5. Open `pixel-agents` folder (or any folder).
6. Click + Agent. Confirm the modal has a Provider field. Pick Claude. Click Start Agent.
7. In the new terminal, observe the actual command sent — should be `claude --session-id <some-uuid>`. If you tick Bypass beforehand, command becomes `claude --session-id <uuid> --dangerously-skip-permissions`.
8. Type `say hi` in the Claude terminal. Confirm the agent character animates (thinking → text response → idle).
9. Click + Agent again, pick Codex, Start Agent. Confirm Codex agent spawns and runs as before.
10. Reload window. Confirm both agents restore.
11. Record results in [symptoms-log.md](../symptoms-log.md) under S-T1-01 → "Resolved by W1-A" with the commit SHA.

## Reporting back to supervisor

1. Branch name + commit SHA.
2. `git diff --stat cleanup/w1-a-restore-claude-launcher...main` output.
3. Final summary lines of `npm run build` and `npm test`.
4. Any deviations from "Required changes" with reason. Especially if you found the message-type union or test harness shape required something I didn't anticipate.
5. Out-of-scope findings — anything you noticed while in `agentManager.ts` / `BottomToolbar.tsx` / `PixelAgentsViewProvider.ts` that looked off but wasn't in scope to fix. Don't fix them; just list with file:line.
