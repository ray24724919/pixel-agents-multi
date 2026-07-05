# W3-B provider adoption hardening report

Date: 2026-06-01
Branch: `cleanup/w3-b-provider-adoption-hardening`

## Summary

Implemented provider adoption hardening for the Windows `codex 3 + claude 1` baseline from W3-A.

The main fix is that Codex adoption no longer suppresses every external thread in a cwd just
because that cwd has a user-spawned Codex agent. It now reserves only the newest matching thread for
an unbound just-launched agent, while allowing other same-cwd threads to be adopted once. This keeps
one-agent-per-thread/session behavior without hiding valid parallel Codex threads.

Refresh now also asks the webview to randomize top-level agent seats, so pressing Refresh does not
keep reusing stale stacked seating.

## W3-A baseline reproduced

W3-A established this Windows artifact baseline:

- Installed identity: `raychen.pixel-agents-multi@1.3.0`
- Codex local artifacts: 3 JSONL sessions under `C:\Users\User\.codex\sessions`
- Claude local-agent-mode artifact: 1 `audit.jsonl` under `%APPDATA%\Claude\local-agent-mode-sessions`
- Remaining risk: runtime panel could show fewer than expected agents, especially `codex 3 + claude
1`, and Refresh could leave agents visually stacked.

During this package, the local Codex SQLite state was inspected read-only and showed three active
non-archived top-level threads:

```text
019e714c-72fc-7123-bce0-9dbb270f236e  C:\Users\User\Documents\raychen\pixel-agents-multi
019e7192-a48d-7002-8d12-6000d8367da7  C:\Users\User\Documents\raychen\pixel-agents-multi
019e71bd-435a-70e3-82c1-2de3db75dd2c  C:\Users\User\Documents\raychen\animfy_gs1
```

That exact shape exposed the Codex same-cwd suppression problem: two valid Codex threads can belong
to `pixel-agents-multi`, and both should be visible if both are in scope.

## Root cause

`PixelAgentsViewProvider.getAdoptionCandidates()` kept a `spawnedAgentCwds` set. If any non-external
Codex agent existed in a cwd, all external Codex threads in that same cwd were skipped.

That was too broad for the current model. It protected newly launched Codex terminals from duplicate
adoption, but it also hid valid parallel same-cwd Codex threads. On Windows this matched the symptom
where local artifacts had three Codex sessions but the room could show fewer.

There was a paired follow-on risk in `startCodexCwdPoll()`: a user-spawned Codex terminal could bind
to the latest same-cwd thread even if another agent already tracked that thread. That could create a
duplicate binding after same-cwd adoption was relaxed.

Refresh stacking was a webview lifecycle issue. Existing agents are not rebuilt when an
`existingAgents` message repeats for IDs already on the canvas, so ignoring persisted `seatId` only
helped cold restore. Pressing Refresh did not actively reshuffle already-present characters.

## Files changed

- `src/PixelAgentsViewProvider.ts`
  - Replaced cwd-wide Codex suppression with per-cwd reservation counts for unbound spawned agents.
  - Sends `agentSeatsRefresh` after Refresh completes adoption/status sync.

- `src/agentManager.ts`
  - Prevents `startCodexCwdPoll()` from rebinding a spawned Codex agent to a thread already tracked
    by another Codex agent.

- `webview-ui/src/hooks/useExtensionMessages.ts`
  - Handles `agentSeatsRefresh` and persists the refreshed seat assignment.

- `webview-ui/src/office/engine/officeState.ts`
  - Adds `randomizeTopLevelSeats()`.
  - Fixes snapped idle/rest seating so idle agents remain idle instead of entering TYPE state.

- `server/__tests__/codexFollowon.test.ts`
  - Updates same-cwd Codex expectations.
  - Adds coverage for unbound-agent reservation and no-rebind behavior.

- `webview-ui/test/seating-invariants.test.ts`
  - Adds Refresh seat randomization coverage.

## Tests

Targeted tests:

```powershell
cd server; npx vitest run __tests__/codexFollowon.test.ts __tests__/claudeAdoption.test.ts
npm run test:webview
```

Results:

```text
2 passed files, 27 passed tests
webview tests: 18 passed
```

Full gates:

```powershell
npm run check-types
npm run test:server
npm run test:webview
npm run build
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "pixel-agents"
```

Results:

```text
npm run check-types: passed
npm run test:server: passed, 202 tests
npm run test:webview: passed, 18 tests
npm run build: passed
npx vsce package: passed, pixel-agents-multi-1.3.0.vsix (250 files, 987.32KB)
code --install-extension --force: passed
code --list-extensions: raychen.pixel-agents-multi@1.3.0
```

Installed webview bundle after package/install:

```text
C:\Users\User\.vscode\extensions\raychen.pixel-agents-multi-1.3.0\dist\webview\assets\index-iN8fVY0p.js
```

## Windows manual QA

Package/install identity was verified on Windows. Normal VS Code panel clicking was not automated in
this run, so the user should still do one live reload pass:

1. `Developer: Reload Window`
2. Open Pixel Agents Multi
3. Press Refresh
4. Confirm expected visible matrix: Codex 3, Claude 1
5. Confirm Refresh does not leave agents stacked
6. Confirm Claude chat sessions remain hidden by default

## Residual risks

- Claude local-agent-mode adoption appears covered by existing tests and current scanner paths, but
  the actual visible Claude count still needs the live VS Code panel check above.
- Codex same-cwd adoption now permits valid parallel threads. If Codex SQLite omits an older still
  running thread from the latest 50 rows, the scanner cannot adopt it; no such case was observed in
  the current Windows baseline.
- Seat randomization is intentionally triggered by Refresh. Cold restore still uses the existing
  restore path that ignores persisted seat IDs for newly added characters.
