# Work Package W3-B - Provider adoption hardening

## Context

W3-B should only run after W3-A identifies an adoption discrepancy. Recent symptoms have included:

- expected `codex 3 + claude 1`, but fewer agents visible
- Claude not showing even after reload
- Refresh causing agents to overlap or appear duplicated
- provider metadata not matching the visible project/thread

The repo already contains W2 fixes for provider discovery, Claude chat filtering, no-workspace
fallback, and seating randomization. This package is for remaining provider/session correctness,
not UI redesign.

## Goal

Make provider adoption deterministic and observable on Windows:

1. Valid Codex threads in scope are adopted once.
2. Valid Claude code/cowork sessions in scope are adopted once.
3. Claude chat sessions remain hidden by default.
4. Refresh updates metadata without duplicating characters or collapsing seats.
5. Agent Center displays provider, project, transcript/thread metadata for each adopted agent.

## Scope

Primary files to inspect:

- `src/PixelAgentsViewProvider.ts`
- `src/fileWatcher.ts`
- `src/agentManager.ts`
- `src/config.ts` / `src/configPersistence.ts` if settings are involved
- `server/src/providers/file/codex/codex.ts`
- `src/tokenUsage.ts` only if token metadata affects adoption display
- relevant tests under `server/__tests__/`

Do not edit `webview-ui/src/components/AgentCenter.tsx` unless W3-A proves the bug is purely a
webview metadata render issue.

## Investigation requirements

Start by reading W3-A's report. Reproduce the exact failing matrix before coding.

For each missing or duplicate agent, document:

- provider (`codex` or `claude`)
- expected local artifact path
- inferred workspace/project root
- why it should or should not be in scope
- whether the scanner saw it
- whether a webview message was posted
- whether an existing agent suppressed adoption

## Implementation constraints

- Preserve one-agent-per-terminal/thread/session invariants.
- Do not broaden Claude chat adoption by default.
- Respect `pixel-agents-multi.codex.discoverAllCwds` and its explicit user setting.
- Respect the no-workspace fallback from W2-E.
- Do not reintroduce global all-cwd adoption when a workspace is open unless the setting is
  explicitly enabled.
- Refresh should be idempotent.
- If a fix changes seat assignment on refresh, keep the W2-G invariant: active top-level agents
  use valid work seats and idle top-level agents do not occupy work seats.

## Tests

Add focused tests for the specific bug found in W3-A.

Expected commands:

```powershell
npm run check-types
npm run test:server
npm run test:webview
npm run build
```

If a real VS Code install check is needed:

```powershell
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
```

## Report

Write:

```text
docs/roadmap/supervision/reports/W3-B-provider-adoption-hardening-report.md
```

Include:

- W3-A failure reproduced.
- Root cause.
- Files changed.
- Tests added/changed.
- Windows manual QA result.
- Residual risks.

## Commit

One commit on the current branch. Do not push, merge, rebase, or amend.

Suggested commit:

```text
fix: harden provider adoption on Windows
```
