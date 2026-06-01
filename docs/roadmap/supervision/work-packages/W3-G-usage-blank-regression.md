# Work Package W3-G - Usage blank regression

## Context

Pixel Agents Multi has landed the Windows stabilization and packaging wave through W3-F. The current
installed extension identity should remain:

```text
raychen.pixel-agents-multi@1.3.0
```

W3-C added token display polish and a Usage-tab blank-render guard. After reverting the larger
dashboard experiment back toward the pixel-style Agent Center, the user reports that the **Usage**
tab is blank again.

This package fixes that regression only. Do not redesign the dashboard or add the future
Google-bookmark/GitHub-style large usage page in this package.

## Goal

Make Agent Center > **Usage** always render one of the intended visible states:

- populated usage data,
- `No usage to show yet`,
- or `Usage data unavailable` from the error boundary.

A visually empty panel is a failure, even if no exception is thrown.

## Files likely involved

- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/TokenCostSummary.tsx`
- `webview-ui/src/components/tokenCostSummaryModel.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/test/token-cost-summary.test.ts`
- Existing webview tests under `webview-ui/test/`
- `e2e/tests/agent-spawn.spec.ts` only if you add a focused smoke assertion for the Usage tab.

Do not change provider adoption logic unless investigation proves Usage is blank because no runtime
agent metadata is reaching the webview. If that happens, document the exact message/state break.

## Non-goals

Do not:

- redesign Agent Center,
- add the future separate usage dashboard page,
- change package identity, publisher, version, command ids, or view ids,
- mutate user-local Codex/Claude/session/layout files,
- fix Claude visibility or provider count issues except to document that they block live verification,
- push, merge, rebase, or amend.

## Required branch and preflight

Run from:

```text
C:\Users\User\Documents\raychen\pixel-agents-multi
```

Commands:

```powershell
git checkout main
git log -1 --oneline
git status --short --branch
git checkout -b cleanup/w3-g-usage-blank-regression
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"
```

Expected:

- `git log -1` shows `Merge W3-F: update e2e launch flow` or later.
- Worktree is clean before branching.
- Installed extension list includes `raychen.pixel-agents-multi@1.3.0`.
- No upstream public Pixel Agents extension is installed. If one is installed, document it and stop
  before changing anything.

Begin by reading:

```text
docs/roadmap/supervision/reports/W3-C-usage-token-polish-report.md
docs/roadmap/supervision/work-packages/W3-F-live-vscode-smoke-qa.md
```

## Investigation

First reproduce or disprove the blank state in normal installed VS Code:

1. Build/package/install the current branch if needed.
2. Open VS Code at `C:\Users\User\Documents\raychen\pixel-agents-multi`.
3. Run **Developer: Reload Window**.
4. Open **Pixel Agents Multi**.
5. Open **Agent Center**.
6. Switch to **Usage**.
7. Record whether the state is populated, empty-state, fallback-error, or blank.

If normal VS Code cannot be automated, document that and use extension-development-host E2E as a
secondary check, but do not claim live QA passed.

While debugging, inspect:

- whether `activeTab === 'usage'` is reached,
- whether `visibleSummaries` is empty or populated,
- whether `UsageDashboard` returns null/empty layout,
- whether CSS height/overflow/text color makes content invisible,
- whether `UsageErrorBoundary` is mounted but not catching an error,
- whether `agentTokenUsage` messages still update `officeState.setAgentTokens`.

## Implementation guidance

Prefer the smallest fix that restores the visible-state invariant.

Add or update a focused test that would have failed before the fix. Good options:

- a webview test for the usage model/empty-state decision,
- a component-level render test if the current test setup supports it,
- or an E2E assertion that opens Agent Center > Usage and verifies visible text or a non-empty
  usage container.

If adding E2E coverage, keep it isolated and compatible with the current Windows mock Codex flow.

## Validation gate

Run:

```powershell
npm run check-types
npm run test:webview
npm run test:server
npm run build
npm run e2e
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
```

Expected minimum counts:

- Webview: at least 22 passed.
- Server: at least 203 passed.
- E2E: at least 1 passed.

After install, reload VS Code and manually verify Agent Center > Usage is not blank. If desktop
automation cannot capture this, document the limitation and include the strongest available evidence.

## Report

Write:

```text
docs/roadmap/supervision/reports/W3-G-usage-blank-regression-report.md
```

Include:

- Summary verdict.
- Current commit and branch.
- Reproduction result before the fix.
- Root cause.
- Files changed.
- Test/build/package/install results.
- VSIX file count/size.
- Installed extension identity evidence.
- Final Usage tab state.
- Any remaining live-QA limitation.

## Commit

Commit the report and fix on the same branch.

Suggested commit:

```text
fix: restore usage tab visible state
```

Do not push, merge, rebase, or amend.
