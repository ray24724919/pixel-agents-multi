# W12-D User-Assisted Handoff Launch QA Report

## Summary

- Branch: `product/w12-d-user-assisted-handoff-launch-qa`
- Baseline commit: `1f4de24 Merge W12-C: handoff executor live click QA retry`
- Final package commit: created after this report is committed.
- QA mode: user-assisted manual VS Code QA. No Computer Use, desktop automation, screenshots, or Extension Host click automation were used.
- Installed extension identity: `raychen.pixel-agents-multi@1.3.0`.

## Preflight

- `git status --short --branch`: clean on branch creation.
- `code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pixel-agents"`: `raychen.pixel-agents-multi@1.3.0`.
- `where.exe claude`: Claude CLI was available at `C:\Users\User\.local\node-v22\claude` and `C:\Users\User\.local\node-v22\claude.cmd`.
- `where.exe codex`: Codex was available from the Codex desktop app install, including `C:\Program Files\WindowsApps\OpenAI.Codex_...\app\resources\codex.exe`.

## Manual QA Flow

The user manually opened VS Code, opened Pixel Agents Multi, used the Timeline/Handoff area, refreshed handoff artifacts, and launched disposable package-backed smoke handoffs.

Disposable handoffs were created from the shell using repo helper code:

- `W12-D Smoke Codex`
- `W12-D Smoke Claude`

No disposable smoke handoffs, work packages, or executor reports are committed.

## Results

### Codex Launch

Final sidecar metadata before cleanup:

- artifact: `2026-06-06-1500-w12-d-smoke-codex-handoff`
- `dispatchPackage.status`: `dispatched`
- `dispatchPackage.execution.status`: `active`
- `dispatchPackage.execution.providerId`: `codex`
- `dispatchPackage.execution.agentName`: `Codex`
- `dispatchPackage.execution.agentId`: `16`
- `dispatchPackage.execution.sessionId`: `85ac56cf-cf20-4fc2-bbd4-f0b3a5f2b68e`

### Claude Launch

Final sidecar metadata before cleanup:

- artifact: `2026-06-06-1501-w12-d-smoke-claude-handoff`
- `dispatchPackage.status`: `dispatched`
- `dispatchPackage.execution.status`: `active`
- `dispatchPackage.execution.providerId`: `claude`
- `dispatchPackage.execution.agentName`: `Claude`
- `dispatchPackage.execution.agentId`: `18`
- `dispatchPackage.execution.sessionId`: `fb87efa8-6d65-446b-9668-b400e6367d47`

### Nonblank Pages

- Timeline/Handoff: user confirmed the page rendered and the smoke handoff rows were visible after refresh.
- Handoff Queue/Recent Handoffs: user confirmed launch actions worked after fixes.
- Usage: no blank-page issue was reported during this user-assisted pass; not separately inspected with desktop automation by design.

## Bugs Found And Fixed

1. Codex handoff launch could fail with `Codex CLI was not found` inside VS Code even though Codex was available from the user shell.
   - Added `pixel-agents-multi.codex.commandPath`.
   - Resolved Codex handoff launches through `shellPath` + `shellArgs` instead of shell prompt concatenation.
   - Added Windows fallback discovery for `%LOCALAPPDATA%\OpenAI\Codex\bin\...\codex.exe` when PATH lookup misses.
   - Preserved existing regular Codex launch behavior when no handoff prompt is passed.

2. Handoff smoke rows could render with one character per line in Timeline/Handoff.
   - Fixed Recent Handoffs and Handoff Queue grid sizing so action buttons cannot collapse the text column.
   - Truncated long repo-relative paths instead of allowing them to force pathological wrapping.

3. Claude executor terminals displayed as `Codex #N`.
   - Added provider-specific terminal prefixes.
   - Codex terminals remain `Codex #N`.
   - Claude terminals now use `Claude #N`.

## Files Changed

- `package.json`
- `server/__tests__/agentManager.test.ts`
- `server/src/providers/file/codex/codex.ts`
- `src/agentManager.ts`
- `src/constants.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `docs/roadmap/supervision/reports/W12-D-user-assisted-handoff-launch-qa-report.md`

## Disposable Artifacts

Created and removed:

- `docs/agent-handoffs/2026-06-06-1500-w12-d-smoke-codex-handoff.md`
- `docs/agent-handoffs/2026-06-06-1500-w12-d-smoke-codex-handoff.handoff.json`
- `docs/roadmap/supervision/work-packages/handoffs/w12-d-smoke-codex-work-package.md`
- `docs/roadmap/supervision/reports/w12-d-smoke-codex-executor-report.md`
- `docs/agent-handoffs/2026-06-06-1501-w12-d-smoke-claude-handoff.md`
- `docs/agent-handoffs/2026-06-06-1501-w12-d-smoke-claude-handoff.handoff.json`
- `docs/roadmap/supervision/work-packages/handoffs/w12-d-smoke-claude-work-package.md`
- `docs/roadmap/supervision/reports/w12-d-smoke-claude-executor-report.md`

The user was asked to close or kill only QA-launched smoke agents/terminals if still running. No shell-only process cleanup was attempted because W12-D explicitly avoided desktop automation and destructive process actions.

## Validation

- `npm run build`: passed.
- `npm run test:webview`: passed, 137 tests.
- `npm run test:server`: passed, 272 tests.
- `npm run test:server -- agentManager`: passed, 10 tests.
- `npm run package:vsix`: passed, produced `pixel-agents-multi-1.3.0.vsix`.
- `npm run install:local`: passed.
- `npm run verify:installed`: passed, installed `raychen.pixel-agents-multi@1.3.0`.
- `git diff --check`: passed.

## Remaining Gaps

- No Computer Use or automated UI screenshots were performed, by package design.
- Usage page was not separately inspected with desktop automation; the user did not report a blank Usage page during this pass.
- Smoke agents/terminals were user-cleanup only; the report records the request to close them, not a shell-enforced process kill.
