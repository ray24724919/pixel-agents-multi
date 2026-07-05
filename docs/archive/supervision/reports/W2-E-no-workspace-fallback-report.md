# W2-E No-Workspace Fallback Report

## Summary

Implemented the Codex-only default fallback in `getAdoptionCandidates` so a scan with no workspace folders and no user-spawned Codex agent cwds adopts the latest thread for each cwd. Explicit `pixel-agents.codex.discoverAllCwds` values still win.

## Implementation Choices

- `vscode.workspace.getConfiguration('pixel-agents').inspect('codex.discoverAllCwds')` is used alongside `get()`.
- The setting is treated as explicitly configured when any user/workspace override value is present: `globalValue`, `workspaceValue`, `workspaceFolderValue`, or their language-specific equivalents.
- If none of those inspect fields are present, `get(..., false)` is considered the default false value rather than an explicit opt-out.
- The fallback engages inside `getAdoptionCandidates`, so it is evaluated once per Codex scan tick, not only at session start.
- When fallback engages, it logs the requested one-line message for observability.
- The fallback may be somewhat aggressive for a no-folder VS Code window because default mode can adopt threads from every cwd in the recent Codex scan. Users who want zero-noise/no-adoption behavior can explicitly set `pixel-agents.codex.discoverAllCwds` to `false`; `inspect()` then reports the explicit false override and the fallback is skipped.
- Existing Codex agent cwds are still excluded before adoption, including fallback scans.

## Tests

Added coverage in `server/__tests__/codexFollowon.test.ts` for:

- No workspace folders, no existing agents, unset/default `discoverAllCwds`: adopts all cwds, one latest thread per cwd.
- No workspace folders, explicit `discoverAllCwds: false`: no adoption.
- Workspace folder present, unset/default setting: behavior remains workspace-scoped and fallback does not trigger.

The VS Code configuration mock now includes `inspect()` so tests can represent unset/default, explicit false, and explicit true.

## Verification

- `npm run build`: passed.
- `npm test`: passed.
- Webview tests: 6 passed.
- Server tests: 172 passed.
- Combined test count: 178 passed, meeting the `>= 164` requirement.
