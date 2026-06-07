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
- W14-F did not create new disposable smoke handoffs or launch new QA agents.
- The W14-E live pass was user-assisted and produced the stuck-Claude finding.
- W14-F rebuilt, packaged, installed, and verified the local VSIX after the runtime fix.
- Installed identity after reinstall: `raychen.pixel-agents-multi@1.3.0`.

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

- A final user-assisted installed VS Code click-through should retry Launch Claude after reloading VS Code with the newly installed VSIX.
- Expected result after this fix:
  - If Claude starts a real session, sidecar metadata is marked dispatched/active after transcript or hook evidence appears.
  - If Claude blocks on auth, permission, or input and no session transcript appears within the evidence window, the handoff stays unmarked and the UI shows launch failed with an explicit blocker message.
- No remaining source-level blocker is known.
