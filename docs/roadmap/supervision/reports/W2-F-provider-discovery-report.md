# W2-F Provider Discovery Report

## Summary

Implemented Claude CLI diagnostics before launch and changed external Codex adoption from cwd-level visibility to thread-level visibility. Pixel Agents now warns instead of creating a fake Claude agent when the Claude Code CLI is unavailable, and it can show multiple external Codex top-level threads for the same cwd without collapsing them onto the newest thread.

## Environment Findings

- Initial `Get-Command claude -ErrorAction SilentlyContinue`: no command found.
- Initial `%USERPROFILE%\.claude\projects` check: missing.
- Installed the official Claude Code CLI with `npm install -g @anthropic-ai/claude-code`.
- Post-install `Get-Command claude`: `C:\Users\User\.local\node-v22\claude.ps1`.
- Post-install `claude --version`: `2.1.156 (Claude Code)`.
- Post-install `%USERPROFILE%\.claude\projects` check: still missing, which is expected until Claude is logged in and creates project transcripts.

## Implementation Choices

- Added `pixel-agents.claude.commandPath` in `package.json`, defaulting to `claude`.
- `src/agentManager.ts` now resolves the configured Claude command before creating a terminal. If the command is missing, it shows the requested warning and does not create a terminal or agent.
- Bare Claude commands keep the existing `terminal.sendText("claude --session-id ...")` behavior.
- Configured path-like Claude commands, including Windows paths with spaces, are launched through VS Code terminal `shellPath` and `shellArgs` so command/path quoting does not depend on shell parsing.
- Codex external adoption in `src/PixelAgentsViewProvider.ts` is now keyed by thread id and rollout/jsonl path, not cwd.
- External Codex agents no longer start `startCodexCwdPoll`, so they remain bound to their adopted thread instead of switching to the newest same-cwd thread.
- Restored external Codex agents also skip cwd follow-on polling. User-spawned Codex terminal agents still use cwd polling, preserving follow-on behavior.
- A user-spawned Codex terminal cwd still blocks external adoption for that cwd to avoid reintroducing follow-on ghost agents.

## Codex Root Cause

The previous scanner grouped recent Codex threads by cwd and retained only the latest thread per cwd. `adoptCodexExternalThread` also rejected adoption when any Codex agent already had the same cwd, and adopted external agents were wired into cwd polling. Together, those choices made three threads across two projects appear as only two visible agents and could collapse same-cwd external agents onto the latest thread.

## Files Changed

- `package.json`
- `src/agentManager.ts`
- `src/PixelAgentsViewProvider.ts`
- `server/__tests__/agentManager.test.ts`
- `server/__tests__/codexFollowon.test.ts`

## Tests

- Added Claude launch tests for missing CLI behavior and configured paths with spaces.
- Updated Codex follow-on tests for multiple external same-cwd threads, repeated scans without duplicates, and external agents staying bound to their own threads.
- `npm run build`: passed.
- `npm test`: passed.
- Webview tests: 8 passed.
- Server tests: 184 passed.
- Combined test count: 192 passed, meeting the `>= 190` requirement.

## Manual Follow-Up

Claude Code may still require user login before `%USERPROFILE%\.claude\projects` is created and Claude transcript discovery works. No credentials or login flow were performed during W2-F.
