# Work Package W4-A - Release Verification Scripts

## Context

W3-I proved that Pixel Agents Multi can be packaged and installed on Windows as the user's private
VS Code extension:

```text
raychen.pixel-agents-multi@1.3.0
```

The verification is currently documented in reports and manual commands. This package turns the
repeatable parts of that release handoff into scripts/npm commands so future local VSIX releases
can be checked without re-reading the W3-I report.

## Goal

Add release verification commands that validate:

- extension identity is still `raychen.pixel-agents-multi`,
- commands/view ids/settings/user-data identifiers use `pixel-agents-multi`,
- legacy `pixel-agents` references are only allowed in known migration/attribution/test contexts,
- `npx vsce ls` includes runtime/user-facing files,
- `npx vsce ls` excludes dev-only/supervision files,
- installed VS Code extension list contains `raychen.pixel-agents-multi@1.3.0`,
- upstream/public Pixel Agents extension is not installed.

This package should not publish anything.

## Required branch and preflight

Run from:

```text
C:\Users\User\Documents\raychen\pixel-agents-multi
```

Commands:

```powershell
git checkout main
git log -3 --oneline
git status --short --branch
git checkout -b product/w4-a-release-verification-scripts
```

Expected:

- `main` includes `Merge W3-I: final Windows release handoff` or later.
- Worktree is clean before branching.

Begin by reading:

```text
docs/roadmap/supervision/reports/W3-I-final-windows-release-handoff-report.md
docs/release-identity.md
README.md
CHANGELOG.md
package.json
.vscodeignore
```

## Implementation guidance

Prefer small Node scripts under `scripts/` and npm commands in `package.json`.

Suggested scripts:

- `scripts/verify-release-identity.mjs`
- `scripts/verify-vsix-contents.mjs`
- `scripts/verify-installed-extension.mjs`

Suggested npm commands:

```json
{
  "verify:identity": "node scripts/verify-release-identity.mjs",
  "verify:vsix": "node scripts/verify-vsix-contents.mjs",
  "verify:installed": "node scripts/verify-installed-extension.mjs",
  "verify:release": "npm run verify:identity && npm run verify:vsix && npm run verify:installed"
}
```

If you choose different names, keep them clear and document them in the report.

## Verification details

### Identity verifier

Check `package.json` exactly:

- `name === "pixel-agents-multi"`
- `displayName === "Pixel Agents Multi"`
- `publisher === "raychen"`
- `version === "1.3.0"`
- command ids start with `pixel-agents-multi.`
- command titles start with `Pixel Agents Multi:`
- view container id is `pixel-agents-multi-panel`
- webview id is `pixel-agents-multi.panelView`
- settings keys start with `pixel-agents-multi.`

Also inspect:

- `src/constants.ts`
- `server/src/constants.ts`
- `docs/release-identity.md`
- `README.md`
- `CHANGELOG.md`

The verifier should fail with a clear message if it finds an unexpected public/upstream identity in
shipping metadata.

### VSIX contents verifier

Run `npx vsce ls` from Node and assert includes/excludes.

Required includes:

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

Required excludes:

- `.husky/`
- `server/`
- `docs/roadmap/`
- `e2e/`
- `eslint-rules/`
- `playwright-report/`
- `AGENTS.md`
- `CLAUDE.md`
- `*.jsonl`

### Installed extension verifier

Run:

```powershell
code --list-extensions --show-versions
```

Pass only if:

- output includes `raychen.pixel-agents-multi@1.3.0`,
- output does not include `pablodelucca.pixel-agents`,
- no other suspicious `pixel-agents` id appears besides `raychen.pixel-agents-multi`.

If `code` is not on PATH, fail with a clear Windows setup message.

## Non-goals

Do not:

- publish to Marketplace or Open VSX,
- bump version,
- change extension identity,
- change product behavior,
- mutate local provider sessions,
- add network dependencies,
- depend on PowerShell-only parsing unless the npm command remains cross-shell enough for Windows npm.

## Validation

Run:

```powershell
npm run verify:identity
npm run build
npm run verify:vsix
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
npm run verify:installed
npm run verify:release
npm run check-types
npm run test:webview
npm run test:server
```

If the scripts require a build artifact, document that in the script output and report.

## Report

Write:

```text
docs/roadmap/supervision/reports/W4-A-release-verification-scripts-report.md
```

Include:

- commands added,
- exact checks implemented,
- failure mode examples,
- validation results,
- whether upstream extension was absent,
- any caveats.

## Commit

Commit on the same branch.

Suggested commit:

```text
chore: add release verification scripts
```

Do not push, merge, rebase, or amend.
