# W14-F Claude Handoff Launch Stuck Report

## Summary

W14-F diagnosed the W14-E live finding where Launch Claude wrote correct handoff sidecar execution metadata, but the launched Claude executor appeared stuck. The best-supported root cause was a false-positive launch success path: `launchHandoffExecutorFromWebview()` marked the sidecar as dispatched/active immediately after `launchNewTerminal()` returned an in-memory Claude agent, even though Claude agents are created before their JSONL/session transcript exists.

That meant a Claude terminal could be open but blocked on auth, permission, or input while Pixel Agents had already written `dispatchPackage.execution.status = "active"`.

## Diagnosis

- Webview click path:
  - Recent Handoffs / Handoff Queue sends `launchHandoffExecutor` with only `requestId`, repo-relative `relativePath`, and provider id.
  - `src/PixelAgentsViewProvider.ts` builds the work-package prompt and calls `launchNewTerminal(..., providerId, repoRoot, false, prompt.prompt)`.
- Claude launch path:
  - `src/agentManager.ts` resolves the configured Claude CLI and creates a terminal with the work-package prompt as a CLI argument.
  - The Claude `AgentState` is created immediately with an expected `~/.claude/projects/.../<sessionId>.jsonl` path.
  - JSONL discovery happens later through polling / hook evidence.
- Codex comparison:
  - Codex package launch behavior is preserved. Codex handoff launch already worked in W14-E and remains terminal-agent based.
- W14-E evidence:
  - Claude sidecar metadata recorded provider `claude`, execution `active`, and session `6f3976eb-88d4-4681-98eb-2cd09c3fe844`.
  - A shell search did not find `6f3976eb-88d4-4681-98eb-2cd09c3fe844.jsonl` under `~/.claude/projects`, so the W14-E metadata was not backed by transcript evidence.
  - `claude --version` succeeds locally: `2.1.156 (Claude Code)`.
  - `where.exe claude` finds the local Node shim paths, including `C:\Users\User\.local\node-v22\claude.cmd`.
- Source note:
  - The requested `server/src/providers/file/claude/claude.ts` path does not exist in this repo; Claude provider code is under `server/src/providers/hook/claude/`.

## Fix

Added a small handoff launch evidence gate:

- New helper: `src/handoffLaunchEvidence.ts`
  - Codex launch confirmation remains immediate through the terminal-agent path.
  - Claude launch confirmation requires at least one of:
    - `agent.hookDelivered === true`
    - `agent.linesProcessed > 0`
    - a nonempty expected Claude JSONL transcript file
- New constants:
  - `HANDOFF_CLAUDE_LAUNCH_EVIDENCE_TIMEOUT_MS = 12000`
  - `HANDOFF_CLAUDE_LAUNCH_EVIDENCE_POLL_MS = 500`
- Updated `src/PixelAgentsViewProvider.ts`:
  - waits for Claude launch evidence before calling `markHandoffExecutorLaunched()`.
  - if no evidence appears, posts `handoffExecutorLaunchFailed`, shows/logs a clear error, and does not mark the handoff sidecar active.
  - leaves the terminal/agent visible so the user can inspect auth, permission, or input blockers.

## Operator Summary And Checklist Labels

- Operator summary source/model path was verified in `webview-ui/src/components/handoffArtifactLibraryModel.ts` and `webview-ui/src/components/AgentCenter.tsx`.
- The summary points to the correct queue group through `operatorSummary.targetGroup`, and the UI button calls `setQueueGroup(operatorSummary.targetGroup)`.
- Checklist copy labels are state-specific through `buildHandoffChecklistCopyModel()`:
  - ready to inspect: `Copy merge checklist`
  - needs review: `Copy review checklist`
  - blocked: `Copy blocker checklist`
  - active / needs report / unknown: `Copy status checklist`
  - merged: `Copy closeout checklist`
- Existing webview tests covering these model paths passed.

## Files Changed

- `src/constants.ts`
- `src/handoffLaunchEvidence.ts`
- `src/PixelAgentsViewProvider.ts`
- `server/__tests__/handoffLaunchEvidence.test.ts`
- `docs/roadmap/supervision/reports/W14-F-claude-handoff-launch-stuck-report.md`

## Tests Added

Added focused server tests for:

- Codex launch confirmation via terminal-agent path.
- Claude launch confirmation via hook, processed transcript lines, and nonempty JSONL transcript.
- Claude launch rejection for missing or empty transcript evidence.

## Installed VSIX / Live QA Status

- W14-F did not use desktop automation or Computer Use.
- The W14-E live pass was user-assisted and produced the stuck-Claude finding.
- W14-F rebuilt, packaged, installed, and verified the local VSIX after the runtime fix.
- Installed identity after reinstall: `raychen.pixel-agents-multi@1.3.0`.
- Follow-up user-assisted installed-VSIX QA was completed on 2026-06-08:
  - Created two disposable package-backed handoffs:
    - `W14-F Smoke Codex Launch`
    - `W14-F Smoke Claude Launch`
  - Initial smoke sidecars were generated with a UTF-8 BOM by the shell helper and appeared as `MARKDOWN ONLY`; rewriting the disposable sidecars as no-BOM JSON fixed the smoke setup. This was a QA artifact setup issue, not a product bug.
  - Handoff Queue operator summary and state-specific checklist copy labels were visible after refreshing the handoff library.
  - `Launch Codex` opened a Codex executor and wrote sidecar metadata:
    - `dispatchPackage.status = "dispatched"`
    - `dispatchPackage.execution.status = "active"`
    - `dispatchPackage.execution.providerId = "codex"`
    - `dispatchPackage.execution.sessionId = "10bf863c-f020-4a84-8f12-9c138ef51bd3"`
  - `Launch Claude` opened a Claude executor and wrote sidecar metadata after session evidence appeared:
    - `dispatchPackage.status = "dispatched"`
    - `dispatchPackage.execution.status = "active"`
    - `dispatchPackage.execution.providerId = "claude"`
    - `dispatchPackage.execution.sessionId = "69a02bac-14f1-402e-8c4b-4add62f71469"`
  - Claude JSONL evidence was present for session `69a02bac-14f1-402e-8c4b-4add62f71469` under the local Claude projects directory.
  - Claude appeared stuck because the executor reached an interactive approval prompt for `git checkout main`; the user also noted RAM pressure. This was not a Pixel Agents launch failure.
  - Disposable W14-F smoke handoff, sidecar, work-package, and smoke executor report artifacts were removed before closing the QA pass.
  - The user closed the QA-launched Codex and Claude terminals/agents.

## Validation

- `git diff --check` - passed.
- `npm run test:webview` - passed, 154 tests.
- `npm run test:server` - passed, 284 tests.
- `npm run build` - passed.
- `npm run release:local` - passed.
  - `verify:identity` passed.
  - `verify:vsix` passed, 184 packaged files checked.
  - `package:vsix` produced `pixel-agents-multi-1.3.0.vsix`.
  - `install:local` installed the VSIX.
  - `verify:installed` passed.
- `npm run verify:installed` - passed, installed `raychen.pixel-agents-multi@1.3.0`.

## Remaining Manual QA Gaps

- None for W14-F launch verification.
- No remaining source-level blocker is known.
- Follow-up report-only update did not rerun full build/tests because source code was unchanged after commit `d26f421`; `git diff --check` and clean worktree checks were used for the report update.
