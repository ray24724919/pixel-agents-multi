# Windows Agent Adoption Live QA Report

## Scope

Live QA was run from `C:\Users\User\Documents\raychen\pixel-agents-multi` on `main` at `16b3ec6 fix: discover Claude Cowork sessions on Windows`.

The pre-existing dirty files were left untouched: `.vscode/launch.json`, `.vscode/settings.json`, `.vscode/tasks.json`, `package-lock.json`, `server/package-lock.json`, and `AGENTS.md`.

## Repository State

Recent baseline commits inspected:

- `16b3ec6 fix: discover Claude Cowork sessions on Windows`
- `fe6a014 fix: restore agents with fresh seating`
- `5e69d57 Merge W2-G: seating invariants`
- `4162a23 fix: normalize Windows Codex paths`
- `cf50294 fix: improve provider discovery and codex thread adoption`

No agent discovery/adoption code changes were required.

## Claude Cowork Discovery

`getClaudeCoworkSessionsRoot()` resolves Windows Cowork sessions to `%APPDATA%\Claude\local-agent-mode-sessions`, which matched the live root:

`C:\Users\User\AppData\Roaming\Claude\local-agent-mode-sessions`

The live root exists and contained one `local_*.json` Cowork metadata file. Parsing with Node `JSON.parse`, matching extension behavior, succeeded. The session was non-archived, not completed, had an existing `audit.jsonl`, and had `userSelectedFolders` pointing at `C:\Users\User\Documents\raychen\animfy_gs1`.

`scanClaudeCoworkSessions()` should adopt this session because it:

- Walks the `%APPDATA%\Claude\local-agent-mode-sessions` tree up to depth 3.
- Accepts `local_*.json` metadata files.
- Skips only archived/completed sessions, missing audit files, duplicate known files, or sessions outside supplied workspace roots.
- Passes metadata override into `adoptExternalSession()`, so Cowork audit logs are not filtered out by the regular Claude chat-session filter.

`startExternalSessionScanning()` calls `scanClaudeCoworkSessions([])` on the external scan interval. That empty workspace root list means the live Cowork session is eligible even though its selected folder is outside the current `pixel-agents-multi` workspace. The initial workspace-only scan may skip it, but the external scanner should adopt it shortly after reload.

## Codex Discovery

Live Codex SQLite state contained three non-archived top-level rows:

- Two cwd values under `\\?\C:\Users\User\Documents\raychen\pixel-agents-multi`
- One cwd value under `\\?\C:\Users\User\Documents\raychen\animfy_gs1`

The current Codex path supports the expected three visible Codex agents:

- `findRecentCodexThreads(50)` returns non-archived top-level threads and filters subagent rows.
- `getAdoptionCandidates()` keeps multiple threads per cwd and de-duplicates by session id and rollout/transcript path.
- `codexPathKey()` normalizes Windows `\\?\` paths, so namespaced DB cwd values compare correctly with normal VS Code paths.
- With `pixel-agents.codex.discoverAllCwds = true`, workspace cwd filtering is disabled and the `animfy_gs1` cwd remains eligible.
- `adoptCodexExternalThread()` binds each external agent to its own thread id and rollout path.
- `startCodexCwdPoll()` is not used for external-adopted Codex agents, so multiple same-cwd external agents should not collapse onto the newest same-cwd thread.

The remaining intentional blocker is a Pixel-Agents-owned, non-external Codex agent for the same cwd: `getAdoptionCandidates()` still blocks external adoption for cwd values owned by spawned Codex agents to preserve follow-on behavior. I did not find evidence in the live data inspection that this should prevent the expected three external Codex rows from appearing after reload.

## Expected Agent Visibility

The current logic should allow the expected reload result:

- 3 Codex agents from the live Codex DB across 2 cwd values.
- 1 Claude Cowork/Desktop agent from `%APPDATA%\Claude\local-agent-mode-sessions`.

I did not find logic that would prevent all four expected agents from being shown after the scanner intervals run. The Cowork agent may appear after the external scan tick rather than the first workspace-only scan if its selected folder is outside the current workspace.

## Validation

- `npm run check-types`: passed.
- `npm test`: passed.
  - Webview tests: 17 passed.
  - Server tests: 191 passed.
  - Total tests: 208 passed.
- `npm run build`: passed.

## Follow-Up Notes

No VSIX packaging or reinstall was performed during this QA pass. The old `andrewbutson.vscode-openai` extension was not reinstalled.

If the live VS Code UI still shows fewer than four agents after reload, the next thing to inspect is runtime extension output around `Claude Cowork: detected session` and `Codex: adopted external thread`, plus persisted/archived Pixel Agents workspace state for dismissed or archived transcripts.
