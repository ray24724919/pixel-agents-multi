# W3-I Final Windows Release Handoff Report

## Summary verdict

Pass with a small evidence caveat.

The current Windows build can be packaged and installed as the user's private VS Code extension:
`raychen.pixel-agents-multi@1.3.0`. The upstream public Pixel Agents extension was not present in
the installed extension list. Normal installed VS Code loaded the Pixel Agents Multi panel, rendered
the live office, showed the expected Agent Center count of 4 visible agents, rendered Agents,
Usage, and Timeline tabs, and stayed stable after Refresh.

Evidence caveat: normal VS Code was inspected through Windows UI Automation plus screenshots.
UI Automation exposes Agent Center counts and text, but not the React root diagnostic attributes
used by E2E for exact canvas filter counts. Provider filter screenshots were captured for All,
Codex, and Claude.

Marketplace and Open VSX publish were not performed.

## Branch and commit

- Branch: `cleanup/w3-i-final-windows-release-handoff`
- Starting commit: `f40bd5c`
- Base includes:
  - `7937151 Merge W3-G: usage tab render guard`
  - `b16ed31 Merge W3-H: Claude live visibility guard`

## W3-G and W3-H evidence

- W3-G report exists: `docs/roadmap/supervision/reports/W3-G-usage-blank-regression-report.md`
  - E2E opens Agent Center > Usage and verifies visible Usage content.
  - Validation in that package passed check-types, webview tests, server tests, build, E2E,
    package, install.
- W3-H report exists: `docs/roadmap/supervision/reports/W3-H-claude-live-visibility-report.md`
  - E2E seeds a Claude Cowork/local-agent-mode session.
  - E2E verifies adoption, `providerId=claude`, and Claude provider filtering.
  - Validation in that package passed check-types, webview tests, server tests, build, E2E,
    package, install.

## Static identity audit

`package.json`:

- `name`: `pixel-agents-multi`
- `displayName`: `Pixel Agents Multi`
- `publisher`: `raychen`
- `version`: `1.3.0`
- Commands:
  - `pixel-agents-multi.showPanel`
  - `pixel-agents-multi.exportDefaultLayout`
- Command titles:
  - `Pixel Agents Multi: Show Panel`
  - `Pixel Agents Multi: Export Layout as Default`
- View container: `pixel-agents-multi-panel`
- Webview id: `pixel-agents-multi.panelView`
- Settings:
  - `pixel-agents-multi.codex.discoverAllCwds`
  - `pixel-agents-multi.claude.showChatSessions`
  - `pixel-agents-multi.claude.commandPath`

Source constants:

- `src/constants.ts`
  - `EXTENSION_NAME = 'pixel-agents-multi'`
  - config section: `pixel-agents-multi`
  - legacy config fallback: `pixel-agents`
  - live layout/config directory: `.pixel-agents-multi`
  - legacy import directory: `.pixel-agents`
  - view/container/command ids derive from `pixel-agents-multi`
- `server/src/constants.ts`
  - server discovery directory: `.pixel-agents-multi`
  - server json name: `server.json`
  - hook script copy directory: `.pixel-agents-multi/hooks`

Docs:

- `docs/release-identity.md` states this fork is separate from
  `pablodelucca.pixel-agents` and lists `raychen.pixel-agents-multi`.
- `README.md` install instructions package and install
  `pixel-agents-multi-1.3.0.vsix`, then verify
  `raychen.pixel-agents-multi@1.3.0`.
- `CHANGELOG.md` states this fork is packaged as `raychen.pixel-agents-multi`
  with `pixel-agents-multi-<version>.vsix` files.

Remaining `pixel-agents` references are intentional upstream attribution, legacy migration/fallback,
or historical supervision docs.

## Live provider artifact matrix

Codex:

- DB: `%USERPROFILE%\.codex\state_5.sqlite`
- Active non-archived top-level threads: 3
- Each active row has an existing rollout file.
- Active IDs:
  - `019e714c-72fc-7123-bce0-9dbb270f236e`
    - cwd: `\\?\C:\Users\User\Documents\raychen\pixel-agents-multi`
  - `019e7192-a48d-7002-8d12-6000d8367da7`
    - cwd: `\\?\C:\Users\User\Documents\raychen\pixel-agents-multi`
  - `019e71bd-435a-70e3-82c1-2de3db75dd2c`
    - cwd: `\\?\C:\Users\User\Documents\raychen\animfy_gs1`

Claude Cowork/local-agent-mode:

- Active metadata files: 1
- Session: `local_c0743c91-c6bd-4ace-93d2-0c2e1475312b`
- Title: `AnimfyGS1 portal onboarding`
- Process name: `confident-zealous-babbage`
- Selected folder: `C:\Users\User\Documents\raychen\animfy_gs1`
- `isArchived=false`
- `isAgentCompleted=false`
- Audit log exists: yes
- Audit size: 5,079,984 bytes

Claude Code project transcripts:

- No `.jsonl` files were found under `%USERPROFILE%\.claude\projects` during this audit.

VS Code workspace state:

- DB:
  `%APPDATA%\Code\User\workspaceStorage\098af7fb0ef01421543cbb06b05bd18f\state.vscdb`
- Persisted Pixel Agents records: 4
- Provider split: Codex 3, Claude 1
- Persisted seat IDs are unique:
  - `f-1778579759266-7c83`
  - `f-1778578912786-wolk:1`
  - `f-1778579512083-anxc:1`
  - `f-1778578912786-wolk`
- Panel state exists and was marked hidden in storage, but normal VS Code showed the panel during
  live smoke.

Expected visible matrix from current artifacts:

- Codex: 3
- Claude: 1
- All: 4

## Build, test, package, install

Commands run:

- `npm run check-types`: passed
- `npm run test:webview`: passed, 22 tests
- `npm run test:server`: passed, 203 tests
- `npm run build`: passed
- `npm run e2e`: passed, 1 test
- `npx vsce ls`: passed
- `npx vsce package`: passed
- `code --install-extension pixel-agents-multi-1.3.0.vsix --force`: passed
- `code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"`:
  - `raychen.pixel-agents-multi@1.3.0`

VSIX:

- File: `pixel-agents-multi-1.3.0.vsix`
- `vsce` package result: 186 files, 839.52 KB
- Filesystem size: 859,665 bytes

Installed manifest:

- `name`: `pixel-agents-multi`
- `displayName`: `Pixel Agents Multi`
- `publisher`: `raychen`
- `version`: `1.3.0`

## VSIX content audit

`npx vsce ls` listed 224 package entries.

Included runtime/user-facing files:

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

Excluded dev-only/supervision files:

- `server/package.json`
- `docs/roadmap/supervision/work-packages/W3-I-final-windows-release-handoff.md`
- `e2e/tests/agent-spawn.spec.ts`
- `AGENTS.md`
- `.husky/pre-commit`
- `playwright-report/index.html`

The full `vsce ls` output was saved locally at:

```text
%TEMP%\pixel-agents-vsce-ls.txt
```

## Normal VS Code live smoke

Normal installed VS Code was opened at:

```text
C:\Users\User\Documents\raychen\pixel-agents-multi
```

UI Automation found:

- Window: `Welcome - pixel-agents-multi - Visual Studio Code`
- Panel tab: `Pixel Agents Multi`
- Webview document: `Pixel Agents Multi`
- Toolbar buttons:
  - `+ Agent`
  - `Refresh`
  - `All`
  - `Codex`
  - `Claude`
  - `Layout`
  - `Agents`
  - `Settings`
- Version text: `v1.3`

Screenshots captured under ignored local test output:

- `test-results/w3-i-live-smoke/normal-vscode-after-refresh-all.png`
- `test-results/w3-i-live-smoke/normal-vscode-canvas-All.png`
- `test-results/w3-i-live-smoke/normal-vscode-canvas-Codex.png`
- `test-results/w3-i-live-smoke/normal-vscode-canvas-Claude.png`
- `test-results/w3-i-live-smoke/normal-vscode-agent-center-agents.png`
- `test-results/w3-i-live-smoke/normal-vscode-agent-center-usage.png`
- `test-results/w3-i-live-smoke/normal-vscode-agent-center-timeline.png`

Provider/canvas filter smoke:

- All filter screenshot captured.
- Codex filter screenshot captured with Codex filter selected.
- Claude filter screenshot captured with Claude filter selected and one visible Claude character.
- Agent Center remains an all-agent management view, so its `Agents 4 VISIBLE` count does not
  change with the bottom toolbar provider filter. This matches the current component wiring.

Agent Center > Agents:

- Rendered successfully.
- UI Automation text included:
  - `Agent Center`
  - `Agents 4 VISIBLE`
  - `ALL PROJECTS 4 agents`
  - `pixel-agents-multi 2 agents`
  - `animfy_gs1 2 agents`
  - `CODEX ... #3 animfy_gs1 WAITING_USER`
  - `CLAUDE AnimfyGS1 portal onboarding #4 animfy_gs1 IDLE`

Agent Center > Usage:

- Rendered successfully and was not blank.
- UI Automation text included:
  - `Usage 581.3M TOKENS`
  - `4 visible agents tracked in this view`
  - `CODEX GPT-5.5 API PROXY`
  - `CLAUDE OPUS 4.7 API PROXY`
  - `PROVIDER USAGE`
  - `AGENT USAGE LEDGER`
  - `Main Supervisor`
  - `AnimfyGS1 portal onboarding`
  - `Add no-workspace adoption fallback`

Agent Center > Timeline:

- Rendered successfully and was not blank.
- UI Automation text included:
  - `Timeline 150 EVENTS`
  - `GLOBAL TIMELINE`
  - recent Codex tool/lifecycle events
  - Claude idle event for `AnimfyGS1 portal onboarding`

Refresh/idempotence:

- Bottom toolbar Refresh was clicked and the panel waited 5 seconds.
- Agent Center Refresh was clicked and the panel waited 5 seconds.
- After the second refresh, UI Automation still reported:
  - `Agents 4 VISIBLE`
  - `Usage 583.0M TOKENS`
  - `Timeline 150 EVENTS`
- No duplicate rows appeared in the Agent Center count.
- Screenshots after refresh did not show all agents collapsed into one permanent stack.

Seating observations:

- Canvas screenshots show the active Codex character at a computer desk.
- Idle/waiting characters are in the lounge/rest side of the office.
- Persisted seat IDs for the four agents are unique, including two distinct slots on the same
  multi-seat rest furniture (`...wolk` and `...wolk:1`), so the saved seating state is not a
  duplicate-seat stack.
- Webview tests also passed the seating invariants, including refresh randomization without
  stacking active or idle agents.

## Bugs fixed in this package

No product code changes were needed. This package is report-only.

## Remaining blockers

No Windows release handoff blockers found in this run.

Before a public Marketplace/Open VSX release, the user still needs to make the separate product
decision of whether to bump beyond version `1.3.0` and provide the relevant publisher tokens. No
publish was attempted here.
