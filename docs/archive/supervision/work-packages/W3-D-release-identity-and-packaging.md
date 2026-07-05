# Work Package W3-D - Release identity and packaging readiness

## Context

The user wants to publish/install this fork as their own VS Code extension without confusion with
the upstream public Pixel Agents extension.

Current package identity should be treated as the starting point, not assumed correct:

- package name: `pixel-agents-multi`
- display name: `Pixel Agents Multi`
- publisher: `raychen`
- repository: `ray24724919/pixel-agents-multi`
- extension id expected after install: `raychen.pixel-agents-multi`

W3-D should make the release path explicit, repeatable, and safe on Windows.

## Goal

Prepare a release-readiness report and any minimal metadata/docs fixes needed so the user can
package and later publish their own extension confidently.

Requirements:

1. Extension identity is separate from upstream:
   - `name`
   - `displayName`
   - `publisher`
   - command ids
   - view ids
   - configuration keys
   - data/config directory names if applicable
2. VSIX filename and install command are unambiguous.
3. README installation instructions match the current package.
4. No stale references instruct users to install the upstream extension id.
5. Windows build/package/install instructions are correct.
6. Release checklist includes preflight, tests, package, install, reload, and smoke QA.

## Files to inspect

- `package.json`
- `README.md`
- `CHANGELOG.md` if present
- `src/constants.ts`
- `server/src/constants.ts`
- `.vscodeignore`
- `esbuild.js`
- generated VSIX metadata via `npx vsce ls` or `npx vsce package`

## Non-goals

Do not publish to Marketplace or Open VSX in this package.

Do not:

- change runtime provider logic
- redesign UI
- bump version unless the report explicitly recommends it and the supervisor approves
- modify user-local `.pixel-agents` config/layout files
- push, merge, rebase, or amend

## Validation

Run:

```powershell
npm run check-types
npm run test:webview
npm run test:server
npm run build
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
```

Also inspect packaged contents:

```powershell
npx vsce ls
```

## Report

Write:

```text
docs/roadmap/supervision/reports/W3-D-release-identity-and-packaging-report.md
```

Include:

- Identity matrix.
- Any metadata/docs changes made.
- Exact package/install commands.
- Installed extension evidence.
- Remaining release steps for Marketplace/Open VSX.
- Risks or items requiring user credentials/tokens.

## Commit

One commit on the current branch. Do not push, merge, rebase, or amend.

Suggested commit:

```text
docs: document Pixel Agents Multi release packaging
```
