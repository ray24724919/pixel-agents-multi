# W14-A Release QA After W13 Report

## Summary

Ran W14-A release QA from latest `main` after the W13 handoff supervisor workflow handoff. The installed local VSIX release path passed end to end, the combined automated test count met the 429-test requirement, and no release blocker was found.

No runtime source, package identity, release script, or VSIX packaging rule changed in this package.

## Preflight

- `git checkout main`: passed; branch was already up to date with `origin/main`.
- `git pull --ff-only origin main`: passed; already up to date.
- `git status --short --branch`: clean before creating the work branch.
- `git checkout -b product/w14-a-release-qa-after-w13`: passed.

## Release Scripts Reviewed

- `package.json` release scripts:
  - `release:local`: build, release identity verify, VSIX contents verify, package VSIX, install local VSIX, verify installed extension.
  - `verify:release`: release identity verify, VSIX contents verify, installed extension verify.
  - `verify:identity`, `verify:vsix`, `verify:installed`: focused verification entrypoints.
- `scripts/package-local-vsix.mjs`: removes any existing `pixel-agents-multi-1.3.0.vsix`, runs `npx vsce package --out pixel-agents-multi-1.3.0.vsix`, and fails if the VSIX is not produced.
- `scripts/install-local-vsix.mjs`: installs `pixel-agents-multi-1.3.0.vsix` through `code --install-extension --force`.
- `scripts/verify-release-identity.mjs`: verifies private fork identity across package metadata, commands, views, settings, constants, docs, README, and changelog.
- `scripts/verify-vsix-contents.mjs`: verifies required packaged files and blocks dev-only paths, roadmap reports, JSONL transcripts, and public handoff files from the VSIX.
- `scripts/verify-installed-extension.mjs`: verifies `raychen.pixel-agents-multi@1.3.0` is installed and rejects public or suspicious `pixel-agents` extension ids.
- `docs/release-identity.md`: confirms the private release identity and legacy data migration boundary.
- `docs/pixel-agents-development-timeline.html`: W14 next-step section was still pointing at installed VSIX release QA as a recommended next package.

## Validation Results

- `npm run test:webview`
  - Passed: 148 tests.
- `npm run test:server`
  - Passed: 281 tests.
- Combined automated test count
  - 429 tests.
  - Meets the W14-A requirement of at least 429.
- `npm run release:local`
  - Passed.
  - Ran build with TypeScript checks, lint, extension build, hook build, asset copy, and webview production build.
  - `verify:identity`: `Release identity verified: raychen.pixel-agents-multi@1.3.0`.
  - `verify:vsix`: `VSIX contents verified: 184 packaged files checked`.
  - `package:vsix`: produced `pixel-agents-multi-1.3.0.vsix`.
  - VSCE package summary: `186 files, 714.15KB`.
  - Local file size: 731,285 bytes.
  - `install:local`: installed `raychen.pixel-agents-multi@1.3.0` from `pixel-agents-multi-1.3.0.vsix`.
  - `verify:installed`: `Installed extension verified: raychen.pixel-agents-multi@1.3.0`.
- `npm run verify:release`
  - Passed.
  - Reconfirmed identity, VSIX contents, and installed extension after the local install.
- `git diff --check`
  - Passed.

## Files Changed

- `docs/pixel-agents-development-timeline.html`
- `docs/roadmap/supervision/reports/W14-A-release-qa-after-w13-report.md`

## Release Blockers

None found.

No minimal release fix was needed because the automated tests, local release package/install flow, release identity verification, VSIX contents verification, and installed extension verification all passed.

## Remaining W14 Follow-up

- Installed VSIX release QA is now complete for W14-A.
- The remaining W14 work is product polish and live workflow validation after W13: real handoff workflow validation, dense queue ergonomics, select wording, manual merge checklist details, and launch/completion/review operator flow polish.
