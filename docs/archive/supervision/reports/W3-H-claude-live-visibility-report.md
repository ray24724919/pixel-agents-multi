# W3-H Claude Live Visibility Report

## Summary verdict

Pass for the automated regression scope: the E2E suite now seeds a Claude Cowork/local-agent-mode
session in isolated APPDATA, verifies that Pixel Agents adopts it, verifies it keeps
`providerId=claude`, and verifies the Claude provider filter shows exactly that agent. The local
installed VSIX was rebuilt and installed as `raychen.pixel-agents-multi@1.3.0`.

Normal installed VS Code click-through remains a manual QA gap from this Codex session. Current
disk evidence still says the expected real-user matrix is Codex 3 + Claude 1, and the new E2E guard
covers the previously untested Claude Cowork webview path.

## Branch and commit

- Branch: `cleanup/w3-h-claude-live-visibility`
- Base commit during audit: `7937151 Merge W3-G: usage tab render guard`

## Artifact/state matrix

Codex state DB:

- DB: `%USERPROFILE%\.codex\state_5.sqlite`
- Active non-archived top-level rows: 3
- Rows:
  - `019e714c-72fc-7123-bce0-9dbb270f236e`, cwd `\\?\C:\Users\User\Documents\raychen\pixel-agents-multi`, title `我剛從其他主機把這個專案搬過來，請查看一下這個專案`
  - `019e71bd-435a-70e3-82c1-2de3db75dd2c`, cwd `\\?\C:\Users\User\Documents\raychen\animfy_gs1`, title starts `我有一個 AnimfyGS1 portal SaaS 專案`
  - `019e7192-a48d-7002-8d12-6000d8367da7`, cwd `\\?\C:\Users\User\Documents\raychen\pixel-agents-multi`, title starts `你正在執行 pixel-agents repository 的 work-package W2-E`

Claude Cowork/local-agent-mode:

- Active metadata files: 1
- Session: `local_c0743c91-c6bd-4ace-93d2-0c2e1475312b`
- Title: `AnimfyGS1 portal onboarding`
- Process name: `confident-zealous-babbage`
- Selected folder: `C:\Users\User\Documents\raychen\animfy_gs1`
- Metadata archived/completed flags: `isArchived=false`, `isAgentCompleted=false`
- Audit log: `%APPDATA%\Claude\local-agent-mode-sessions\ec37b895-e20d-4600-a1c8-54ffacd57ea9\929dea93-c316-4b93-b241-4eb372ccc1d6\local_c0743c91-c6bd-4ace-93d2-0c2e1475312b\audit.jsonl`
- Audit log exists: yes
- Audit log size: 5,079,984 bytes

VS Code workspace state:

- DB: `%APPDATA%\Code\User\workspaceStorage\098af7fb0ef01421543cbb06b05bd18f\state.vscdb`
- Persisted Pixel Agents records: 4
- Provider split: Codex 3, Claude 1
- Persisted Claude record:
  - `id=4`
  - `providerId=claude`
  - `sessionId=local_c0743c91-c6bd-4ace-93d2-0c2e1475312b`
  - `agentName=AnimfyGS1 portal onboarding`
  - `projectDir=C:\Users\User\Documents\raychen\animfy_gs1`
  - `claudeTitleResolved=true`
- Panel state: `pixel-agents-multi.panelView` is present and marked `isHidden=true`; command-based panel show remains available.

Expected local matrix from current artifacts:

- Codex: 3
- Claude: 1
- All: 4

## Live reproduction before fix

The user-facing report before this package was that normal VS Code still did not visibly show the
Claude agent after reload. The read-only audit did not show an artifact, archive, or persisted-state
reason for Claude to be missing: one active Cowork artifact exists and the workspace state already
contains the matching Claude Pixel Agents record.

## Root cause and owning layer

No production artifact/provider/restore bug was reproduced in this package. The owning gap was the
integration coverage and observability layer: E2E did not previously cover Claude Cowork adoption or
provider filtering, and the webview root only exposed total agent names/counts. That made it hard to
separate "extension did not adopt Claude" from "webview/provider filter/canvas did not show Claude"
when normal VS Code appeared wrong.

The fix adds a focused E2E Claude Cowork seed and stable provider/visible-agent diagnostics on the
webview root.

## Files changed

- `e2e/helpers/launch.ts`
  - Exposes isolated `appDataDir` and `localAppDataDir` to E2E tests.
- `e2e/tests/agent-spawn.spec.ts`
  - Seeds an isolated Claude Cowork session.
  - Verifies the webview adopts the Cowork title.
  - Verifies the adopted session has `providerId=claude`.
  - Verifies the Claude provider filter shows exactly one visible agent with that title.
- `webview-ui/src/App.tsx`
  - Adds stable diagnostic root attributes:
    - `data-agent-providers`
    - `data-visible-agent-count`
    - `data-visible-agent-names`
    - `data-visible-agent-providers`

## Regression test

Updated:

- `e2e/tests/agent-spawn.spec.ts`

Coverage added:

- Seeded Claude Cowork metadata under isolated `%APPDATA%`.
- Matching `audit.jsonl` for the Cowork session.
- Adoption into Pixel Agents webview state.
- Provider identity retention as Claude.
- Claude-only provider filter count and visible title.
- Existing W3-G Usage tab visible-state assertion remains in the same end-to-end flow.

## Validation

Commands run:

- `npm run check-types`: passed
- `npm run test:webview`: passed, 22 tests
- `npm run test:server`: passed, 203 tests
- `npm run build`: passed
- `npm run e2e`: passed, 1 test
- `npx vsce package`: passed
- `code --install-extension pixel-agents-multi-1.3.0.vsix --force`: passed
- `code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"`:
  - `raychen.pixel-agents-multi@1.3.0`

VSIX:

- File: `pixel-agents-multi-1.3.0.vsix`
- Contents: 186 files
- Size: 839.41 KB

Installed bundle check:

- Installed extension path contains the new webview diagnostic attributes.
- No upstream public Pixel Agents extension appeared in the extension identity query.

## Final counts and QA gap

Automated E2E result:

- Claude filter: 1 seeded Claude Cowork agent, title `E2E Cowork Lead`
- All filter: contains the Codex parent, adopted Codex child teammate, and seeded Claude Cowork agent
- Agent Center > Usage: visible, not blank

Current real-user artifact expectation:

- Codex: 3
- Claude: 1
- All: 4

Not completed in this package:

- Direct visual click-through of normal installed VS Code after reload.
- Agent Center > Agents row count in normal installed VS Code.
- Refresh/stacking verification in normal installed VS Code.

Those should be handled by a follow-up W3-I installed-VSIX live smoke package, because this package
stopped short of claiming normal VS Code visual QA without direct desktop evidence.
