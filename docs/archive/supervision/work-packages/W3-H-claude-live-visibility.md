# Work Package W3-H - Claude live visibility

## Context

Pixel Agents Multi should be installed locally as the user's private extension:

```text
raychen.pixel-agents-multi@1.3.0
```

The current Windows baseline previously showed:

- 3 active non-archived Codex top-level threads.
- 1 active Claude Desktop/Cowork `local-agent-mode-sessions` worker.
- Persisted Pixel Agents state containing 4 agents: Codex 3 + Claude 1.

W3-D fixed the Claude Cowork scanner path so **Refresh** scans Cowork/local-agent-mode sessions
globally, even when the selected Cowork folder is outside the current VS Code workspace.

The user still reports that the live UI does not show the Claude agent. This package determines
whether the remaining failure is in artifact eligibility, restore/adoption, persisted hidden/archive
state, webview delivery, provider filtering, or canvas/Agent Center rendering, then fixes the
smallest owning layer.

Run this package after W3-G if W3-G is in progress, because Usage blank-render debugging should not
be mixed with Claude visibility.

## Goal

When the local artifacts still contain the expected active Claude Cowork session, normal installed
VS Code should show it as a visible Claude agent:

- Provider filter **Claude** shows 1 Claude agent.
- Provider filter **All** shows Codex + Claude together.
- Agent Center **Agents** tab includes the Claude agent.
- Refresh does not duplicate, drop, hide, or permanently stack the Claude agent.

If the Claude artifact is no longer active/eligible, document the new artifact matrix and ensure the
UI matches that matrix.

## Files likely involved

- `src/PixelAgentsViewProvider.ts`
- `src/fileWatcher.ts`
- `src/agentManager.ts`
- `src/types.ts`
- `server/__tests__/claudeAdoption.test.ts`
- `webview-ui/src/App.tsx`
- `webview-ui/src/components/BottomToolbar.tsx`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/test/agent-center-hidden.test.ts`
- `webview-ui/test/seating-invariants.test.ts`
- `e2e/tests/agent-spawn.spec.ts` only if you add a UI smoke assertion.

Do not change unrelated usage dashboard layout. Do not change release identity.

## Non-goals

Do not:

- redesign Agent Center or Usage,
- change package name, publisher, command ids, view ids, or version,
- mutate/delete/archive user-local Codex or Claude provider sessions,
- change `pixel-agents-multi.claude.showChatSessions` semantics for chat-mode sessions,
- make Cowork adoption depend on the current VS Code workspace root,
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
git checkout -b cleanup/w3-h-claude-live-visibility
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"
```

Expected:

- `git log -1` shows `docs: add W3-G usage regression package` or later.
- Worktree is clean before branching.
- Installed extension list includes `raychen.pixel-agents-multi@1.3.0`.
- No upstream public Pixel Agents extension is installed. If one is installed, document it and stop
  before changing anything.

Begin by reading:

```text
docs/roadmap/supervision/reports/W3-D-claude-cowork-visibility-report.md
docs/roadmap/supervision/reports/W3-F-preflight-artifact-snapshot.md
docs/roadmap/supervision/work-packages/W3-F-live-vscode-smoke-qa.md
```

## Read-only artifact/state audit

Before changing code, derive the live expected matrix from local files. Do not mutate them.

Inspect:

- `%APPDATA%\Claude\local-agent-mode-sessions`
- `%USERPROFILE%\.claude\projects`
- `%USERPROFILE%\.codex\state_5.sqlite`
- `%APPDATA%\Code\User\workspaceStorage\**\state.vscdb`
- `%USERPROFILE%\.pixel-agents-multi`

Record:

- active Claude Cowork `local_*.json` metadata files,
- selected folder,
- matching `audit.jsonl` path and existence,
- whether the metadata is archived/inactive if such fields exist,
- persisted Pixel Agents agent records for that Claude `sessionId`,
- hidden/archived Pixel Agents state,
- current Codex count for comparison.

If the artifact matrix differs from W3-F's baseline, the report must use the new matrix.

## Live reproduction

Use normal installed VS Code, not Extension Development Host unless normal VS Code cannot be driven.

1. Open VS Code at `C:\Users\User\Documents\raychen\pixel-agents-multi`.
2. Run **Developer: Reload Window**.
3. Open **Pixel Agents Multi**. If hidden, run **Pixel Agents Multi: Show Panel**.
4. Wait 5 seconds.
5. Click **Refresh**.
6. Wait 5 seconds.
7. Set provider filter to **Claude** and count visible agents.
8. Set provider filter to **All** and count visible agents.
9. Open Agent Center > **Agents** and count Claude rows.
10. Click **Refresh** again and confirm the count stays stable and agents do not collapse into one
    stacked position.

Capture any available screenshot path, Pixel Agents output logs, and Developer Console errors. If
desktop automation is blocked, document that and use the strongest available state/log evidence, but
do not claim full live QA passed.

## Diagnosis checklist

Separate the failure layer before editing:

- **Artifact problem**: no active Claude Cowork metadata or no matching audit log.
- **Provider problem**: `scanClaudeCoworkSessions()` does not produce/post an agent for a valid
  artifact.
- **Restore problem**: persisted Claude state exists but is not restored into `this.agents`.
- **Hidden/archive problem**: valid Claude agent is in hidden/archived state unexpectedly.
- **Message problem**: extension posts `agentCreated`/`existingAgents`, but webview state does not
  contain the Claude id/provider.
- **Filter problem**: webview contains the agent but provider filter or hidden toggle excludes it.
- **Canvas/seat problem**: state contains the Claude agent but it is visually overlapped, stacked, or
  placed off-screen.
- **Agent Center problem**: canvas has Claude but Agent Center omits it.

Log only what is needed for diagnosis and remove noisy debug logging before commit unless the log is
useful long-term.

## Implementation guidance

Prefer the smallest fix that makes the expected live matrix true.

Likely fixes may involve:

- retaining Cowork agents during restore/refresh even when their project differs from the current
  VS Code workspace,
- correcting provider id defaults so Claude is not treated as hidden/mismatched,
- making Refresh re-send existing Claude agents to the webview after scanner updates,
- repairing webview state updates for `existingAgents` or `agentCreated`,
- adding a deterministic de-overlap/reseat pass when Refresh rebuilds visible agents,
- or fixing Agent Center filtering if only the modal omits Claude.

Add or update a focused regression test for the actual root cause. Good options:

- `server/__tests__/claudeAdoption.test.ts` for provider/restore/adoption behavior,
- `webview-ui/test/agent-center-hidden.test.ts` or a new webview test for provider filtering,
- `webview-ui/test/seating-invariants.test.ts` for refresh stacking/seat placement,
- E2E only if the bug is visible only through the webview integration.

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

After install, reload normal VS Code and re-run the live reproduction checklist. The report must say
whether the Claude agent is actually visible in normal VS Code.

## Report

Write:

```text
docs/roadmap/supervision/reports/W3-H-claude-live-visibility-report.md
```

Include:

- Summary verdict.
- Current commit and branch.
- Exact artifact/state matrix.
- Live reproduction result before the fix.
- Root cause and owning layer.
- Files changed.
- Regression test added/updated.
- Test/build/package/install results.
- VSIX file count/size.
- Installed extension identity evidence.
- Final live provider counts for **Codex**, **Claude**, and **All**.
- Agent Center Claude row result.
- Refresh/stacking result.
- Any remaining limitation or manual QA gap.

## Commit

Commit the report and fix on the same branch.

Suggested commit:

```text
fix: restore Claude live agent visibility
```

Do not push, merge, rebase, or amend.
