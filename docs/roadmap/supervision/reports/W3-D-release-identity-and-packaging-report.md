# W3-D Release identity and packaging report

Branch: `cleanup/w3-e-release-identity-packaging`
Date: 2026-06-01

## Summary

Pixel Agents Multi is ready to package locally as the user's own VS Code extension identity, separate from the upstream public Pixel Agents extension. This package did not publish to Marketplace or Open VSX.

## Identity matrix

| Surface               | Current value                                                                                                                     | Evidence                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Package name          | `pixel-agents-multi`                                                                                                              | `package.json`                             |
| Display name          | `Pixel Agents Multi`                                                                                                              | `package.json`                             |
| Publisher             | `raychen`                                                                                                                         | `package.json`                             |
| Extension id          | `raychen.pixel-agents-multi`                                                                                                      | `publisher` + `name`, install verification |
| VSIX filename         | `pixel-agents-multi-1.3.0.vsix`                                                                                                   | `npx vsce package`                         |
| Commands              | `pixel-agents-multi.showPanel`, `pixel-agents-multi.exportDefaultLayout`                                                          | `package.json`, `src/constants.ts`         |
| View container        | `pixel-agents-multi-panel`                                                                                                        | `package.json`, `src/constants.ts`         |
| Webview id            | `pixel-agents-multi.panelView`                                                                                                    | `package.json`, `src/constants.ts`         |
| Settings              | `pixel-agents-multi.codex.discoverAllCwds`, `pixel-agents-multi.claude.showChatSessions`, `pixel-agents-multi.claude.commandPath` | `package.json`                             |
| Workspace/global keys | `pixel-agents-multi.*`                                                                                                            | `src/constants.ts`                         |
| User data directory   | `~/.pixel-agents-multi`                                                                                                           | `src/constants.ts`                         |
| Hook discovery        | `~/.pixel-agents-multi/server.json`                                                                                               | `server/src/constants.ts`                  |
| Hook script copy      | `~/.pixel-agents-multi/hooks/claude-hook.js`                                                                                      | `server/src/constants.ts`                  |

## Changes made

- Tightened `.vscodeignore` so the VSIX no longer includes development-only folders and files such as `.husky/`, `e2e/`, `server/`, `docs/roadmap/`, `playwright-report/`, and local lint/test config files.
- Updated README packaging instructions to verify `raychen.pixel-agents-multi@1.3.0` after install.
- Added a Windows release checklist covering preflight, tests, package inspection, VSIX creation, install, reload, and panel smoke QA.
- Updated README provider behavior notes so Claude Desktop/Cowork local-agent-mode discovery matches the current global active-session behavior.
- Updated README token wording so usage cost is described as a proxy estimate rather than billing.
- Added a top CHANGELOG note that distinguishes this fork's extension id, VSIX filename, and Windows verification path from upstream.

## VSIX content inspection

`npx vsce ls` was run after the `.vscodeignore` changes.

Confirmed packaged content now includes the runtime/build assets and user-facing docs:

- `dist/extension.js`
- `dist/hooks/claude-hook.js`
- `dist/assets/**`
- `dist/webview/**`
- `docs/external-assets.md`
- `docs/release-identity.md`
- `package.json`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `SECURITY.md`
- `icon.png`

Confirmed the previous dev-only content is no longer listed:

- `.husky/**`
- `server/package.json`
- `server/package-lock.json`
- `server/tsconfig.test.json`
- `docs/roadmap/**`
- `e2e/**`
- `eslint-rules/**`
- `playwright-report/**`
- `AGENTS.md`

## Validation

Passed:

```powershell
npm run check-types
npm run test:webview
npm run test:server
npm run build
npx vsce ls
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
```

Observed results:

- Webview tests: 22 passed.
- Server tests: 203 passed.
- Build: passed.
- Package: `pixel-agents-multi-1.3.0.vsix` created with 183 files, 631.94KB.
- Install: `Extension 'pixel-agents-multi-1.3.0.vsix' was successfully installed.`
- Installed extension evidence: `raychen.pixel-agents-multi@1.3.0`.

## Remaining release steps

- Reload VS Code after installing the VSIX.
- Open the Pixel Agents Multi panel, click Refresh, set provider filter to All, and confirm the expected Codex and Claude agents are visible.
- Open Agents > Usage and confirm token totals or an empty state render instead of a blank panel.
- Before publishing publicly, decide whether to bump version beyond `1.3.0`.
- Marketplace publishing requires a Visual Studio Marketplace publisher named `raychen` and a valid PAT/token for `vsce publish`.
- Open VSX publishing requires the matching namespace/token and a deliberate `ovsx publish` path.
- Publishing was intentionally not performed in this package.

## Notes

Legacy references to `pixel-agents` remain where they are intentional: upstream attribution, legacy config/layout migration, and tests that ensure public Pixel Agents hook entries are not removed. No README or packaging command now instructs users to install the upstream extension id.
