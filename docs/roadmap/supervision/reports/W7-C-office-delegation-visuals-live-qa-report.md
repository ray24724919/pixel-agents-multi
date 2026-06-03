# W7-C Office Delegation Visuals Live QA Report

## Summary

Live QA was performed with a VS Code Extension Development Host. The first manual pass found a real Codex delegation visibility bug: current Codex `multi_agent_v1.spawn_agent` transcript records created a delegated worker, but Pixel Agents treated the successful `function_call_output` as an ordinary tool completion and never created the inline delegation visual state. The Office remained nonblank, but the supervisor did not show the expected `1w` marker, Agent Center showed `Delegating 0`, and Timeline showed no delegation events for that worker.

A minimal fix was added so current Codex worker spawns feed the same provider-agnostic inline delegation path used by W7-C visuals.

## Commands Run

- `git checkout main`
- `git log -1 --oneline`
- `git checkout -b qa/w7-c-office-delegation-visuals-live-qa`
- `git status --short --branch`
- `npm run build`
- `code --new-window --extensionDevelopmentPath="C:\Users\User\Documents\raychen\pixel-agents-multi" "C:\Users\User\Documents\raychen\pixel-agents-multi"`
- `code --new-window --user-data-dir %TEMP%\pixel-agents-w7c-vscode-qa\user-data --extensions-dir %TEMP%\pixel-agents-w7c-vscode-qa\extensions --extensionDevelopmentPath="C:\Users\User\Documents\raychen\pixel-agents-multi" "C:\Users\User\Documents\raychen\pixel-agents-multi"`
- `npm run test:webview`
- `npm run test:server -- codex.test.ts`
- `npm run build`
- `npm run test:webview`
- `npm run test:server`
- `git diff --check`

## Environment / Host

- QA used VS Code Extension Development Host, not an installed VSIX.
- Claude Code CLI was available, but the live Claude attempt reached an interactive login/theme flow; no credentials or login flow were entered.
- The default VS Code terminal could not resolve `codex`. A second isolated Extension Host was launched with the local Codex executable directory prepended to `PATH`, and Codex then launched successfully.

## Manual QA Findings

- Pixel Agents panel opened and the Office page rendered nonblank.
- A live Codex supervisor was created from the New Agent modal with permission prompts skipped.
- The supervisor successfully spawned a delegated Codex worker named `Ampere`.
- The worker appeared in Codex local state and the parent transcript as current `multi_agent_v1.spawn_agent` records.
- Before the fix, Pixel Agents did not show a compact delegation marker near the supervisor.
- Before the fix, Agent Center Agents showed `Delegating 0`.
- Before the fix, Timeline showed no `delegation.*` events for the live worker.
- Usage page was not observed blank during the manual pass.

## Root Cause

Pixel Agents recognized older Codex `collab_agent_spawn_end` transcript events, but current Codex emits delegation through `response_item` records:

- `function_call` with `name: "spawn_agent"` and `namespace: "multi_agent_v1"`
- successful `function_call_output` containing an `agent_id`

The parser normalized that successful output to `toolEnd`, which made the spawn look finished immediately and prevented the W7-C inline subagent/delegation model from staying active.

## Fix

- `server/src/providers/file/codex/codex.ts`
  - Formats Codex `spawn_agent` as a safe `Subtask: worker` status without exposing raw prompt text, tool output, transcript text, or paths.
  - Detects successful `spawn_agent` outputs containing an `agent_id` and does not convert that output into an immediate `toolEnd`, keeping the worker marker active until the parent turn clears.
- `webview-ui/src/hooks/useExtensionMessages.ts`
  - Adds `shouldCreateInlineSubagentCharacter(...)`.
  - Treats Codex `spawn_agent` as an inline delegation tool alongside `Task` and `Agent`, while still skipping hook-synthetic ids and background teammate launches.
- Tests were added in:
  - `server/__tests__/codex.test.ts`
  - `webview-ui/test/office-delegation-visuals.test.ts`

## Validation

- `npm run build`: passed.
- `npm run test:webview`: passed, 73 tests.
- `npm run test:server`: passed, 227 tests.
- `git diff --check`: passed.

## Remaining Manual Verification

The pre-fix live QA reproduced the actual bug and the patch now has focused automated coverage for that transcript shape. A second post-fix desktop click-through was not completed in this pass because the desktop automation tool was unavailable after the resumed tool context. Recommended follow-up manual check:

1. Reload the Extension Development Host from this branch.
2. Open Pixel Agents on the Office page.
3. Start a Codex supervisor that uses `spawn_agent`.
4. Confirm the supervisor shows a blue `1w` marker while the worker is active.
5. Confirm the hover/select overlay says `Supervising / 1 worker`.
6. Confirm Agent Center shows the supervisor as delegating and Timeline receives `delegation.*` history.
7. Confirm no raw prompt, tool output, transcript text, or raw paths appear in the marker or overlay.
