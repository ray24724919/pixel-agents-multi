# W3-D Claude Cowork visibility report

Date: 2026-06-01
Branch: `cleanup/w3-d-claude-cowork-visibility`

## Summary

Fixed the refresh/open path for Claude Cowork local-agent-mode sessions on Windows.

The local VS Code workspace state already contained the expected four-agent matrix:

- 3 Codex agents:
  - `019e714c-72fc-7123-bce0-9dbb270f236e`
  - `019e7192-a48d-7002-8d12-6000d8367da7`
  - `019e71bd-435a-70e3-82c1-2de3db75dd2c`
- 1 Claude Cowork/Desktop agent:
  - `local_c0743c91-c6bd-4ace-93d2-0c2e1475312b`
  - transcript: `%APPDATA%\Claude\local-agent-mode-sessions\...\audit.jsonl`
  - project: `C:\Users\User\Documents\raychen\animfy_gs1`

The weakness was that `scanClaudeWorkspaceThreads()` passed current VS Code workspace roots into
`scanClaudeCoworkSessions()`. That made the immediate open/Refresh path skip active Claude Cowork
sessions whose selected folder was outside the current VS Code workspace, even though the external
polling path later scanned Cowork globally. On the Windows baseline this meant a user could be in the
`pixel-agents-multi` workspace and expect `Codex 3 + Claude 1`, while the immediate refresh path
still treated the Claude Cowork session in `animfy_gs1` as out of scope.

## Files changed

- `src/PixelAgentsViewProvider.ts`
  - `scanClaudeWorkspaceThreads()` now scans Claude Cowork/local-agent-mode sessions globally by
    passing `[]` for `workspaceRoots`.
  - Added a comment documenting that Cowork sessions are desktop-app workers, not regular VS Code
    workspace transcripts, and should match Codex external-thread behavior.

- `server/__tests__/claudeAdoption.test.ts`
  - Added a regression test proving that workspace refresh adopts a Claude Cowork session outside
    the current VS Code root.

## Evidence

Local artifact audit:

```text
%APPDATA%\Claude\local-agent-mode-sessions contains one non-archived local_*.json metadata file.
Node JSON.parse succeeds for the metadata file.
The matching audit.jsonl exists.
userSelectedFolders points to C:\Users\User\Documents\raychen\animfy_gs1.
```

VS Code workspace state audit:

```text
pixel-agents-multi.agents contains 4 records:
3 providerId=codex
1 providerId=claude
```

Regression test added:

```text
workspace refresh discovers Claude Cowork sessions outside the current VS Code root
```

## Validation

Commands run:

```powershell
cd server; npx vitest run __tests__/claudeAdoption.test.ts
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
targeted claudeAdoption: passed, 12 tests
npm run check-types: passed
npm run test:server: passed, 203 tests
npm run test:webview: passed, 22 tests
npm run build: passed
npx vsce package: passed, pixel-agents-multi-1.3.0.vsix (251 files, 989.75KB)
code --install-extension --force: passed
code --list-extensions: raychen.pixel-agents-multi@1.3.0
```

## Manual QA still needed

After `Developer: Reload Window`, open Pixel Agents Multi with the provider filter set to `All` and
press `Refresh`. Expected visible baseline:

```text
Codex: 3
Claude: 1
Total: 4
```

If Claude still does not appear visually after reload, the next likely issue is webview filtering or
hidden state rather than scanner adoption, because current workspace state already proves the Claude
agent is persisted.
