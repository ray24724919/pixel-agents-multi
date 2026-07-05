# W4-A Release Verification Scripts Report

## Summary

Added release verification tooling for the local Pixel Agents Multi VSIX release flow.

Changed files:

- `package.json`
- `.vscodeignore`
- `scripts/verify-release-identity.mjs`
- `scripts/verify-vsix-contents.mjs`
- `scripts/verify-installed-extension.mjs`
- `docs/roadmap/supervision/reports/W4-A-release-verification-scripts-report.md`

## Commands Added

- `npm run verify:identity`
- `npm run verify:vsix`
- `npm run verify:installed`
- `npm run verify:release`

## Checks Implemented

### Identity

`scripts/verify-release-identity.mjs` checks:

- `package.json` exact identity:
  - `name === "pixel-agents-multi"`
  - `displayName === "Pixel Agents Multi"`
  - `publisher === "raychen"`
  - `version === "1.3.0"`
- command ids start with `pixel-agents-multi.`
- command titles start with `Pixel Agents Multi:`
- activation events use the expected command/view ids
- view container includes `pixel-agents-multi-panel`
- webview id includes `pixel-agents-multi.panelView`
- settings keys start with `pixel-agents-multi.`
- `src/constants.ts`, `server/src/constants.ts`, `docs/release-identity.md`, `README.md`, and `CHANGELOG.md` contain the expected release identity references
- legacy/public `pixel-agents` references only appear in allowed legacy, migration, attribution, fork-history, or upstream-link contexts

Example failure modes:

- package publisher/version/name mismatch
- old command id such as `pixel-agents.showPanel`
- setting key under `pixel-agents.*`
- unexpected public/upstream identity in shipping metadata

### VSIX Contents

`scripts/verify-vsix-contents.mjs` runs `npx vsce ls` and checks required runtime/user-facing files are packaged:

- `dist/extension.js`
- `dist/hooks/claude-hook.js`
- `dist/webview/index.html`
- `docs/external-assets.md`
- `docs/release-identity.md`
- `package.json`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `SECURITY.md`
- `icon.png`

It also fails if dev-only or supervision paths appear:

- `.husky/`
- `server/`
- `docs/roadmap/`
- `e2e/`
- `eslint-rules/`
- `playwright-report/`
- `test-results/`
- `AGENTS.md`
- `CLAUDE.md`
- `*.jsonl`

`.vscodeignore` was updated to exclude `test-results/**`, because local E2E screenshots were otherwise included in `npx vsce ls`.

Example failure modes:

- build artifact missing from `dist/`
- roadmap or server source included in the VSIX
- JSONL transcript accidentally packaged
- local test screenshots included under `test-results/`

### Installed Extension

`scripts/verify-installed-extension.mjs` runs:

```powershell
code --list-extensions --show-versions
```

It passes only if:

- `raychen.pixel-agents-multi@1.3.0` is installed
- `pablodelucca.pixel-agents` is absent
- no other suspicious `pixel-agents` extension id is installed

If `code` is not available on PATH, the script fails with a Windows-oriented setup message.

## Validation Results

The current PowerShell environment blocks `npm.ps1`, so validation used `npm.cmd`, which is the same Windows npm entrypoint used by npm scripts.

Passed:

- `npm.cmd run verify:identity`
- `npm.cmd run build`
- `npm.cmd run verify:vsix`
  - `VSIX contents verified: 182 packaged files checked`
- `npx.cmd vsce package`
  - produced `pixel-agents-multi-1.3.0.vsix`
  - package summary: `184 files, 643.88KB`
- `code --install-extension pixel-agents-multi-1.3.0.vsix --force`
- `npm.cmd run verify:installed`
- `npm.cmd run verify:release`
- `npm.cmd run check-types`
- `npm.cmd run test:webview`
  - 22 tests passed
- `npm.cmd run test:server`
  - 203 tests passed

Total focused test count from webview plus server validation: 225.

The installed-extension verifier passed, so the upstream/public `pablodelucca.pixel-agents` extension was absent from the installed VS Code extension list.

## Caveats

- `verify:vsix` depends on `npx vsce ls`. If VSCE is not already available in npm cache, npm may need registry access to fetch it.
- `verify:installed` requires the VS Code `code` CLI on PATH and expects the target VSIX to have already been installed.
- In this sandboxed run, esbuild/Vitest commands needed to run outside the sandbox because the sandbox blocked parent-directory reads. The reruns passed without code changes.
