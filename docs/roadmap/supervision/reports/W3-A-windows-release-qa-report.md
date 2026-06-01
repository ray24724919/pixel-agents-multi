# W3-A Windows release QA and adoption matrix report

Date: 2026-06-01
Machine: `C:\Users\User\Documents\raychen\pixel-agents-multi`
Branch: `main`

## Summary verdict

Pass with caveats.

Packaging, installed-extension identity, webview bundle presence, and build/test gates passed on the
Windows machine. The installed VS Code extension is `raychen.pixel-agents-multi@1.3.0`, and no
upstream-looking `pixel-agents` extension folder was found beside it.

The live VS Code panel still needs a human/runtime pass for the exact visible agent matrix. This
report establishes the current Windows baseline and identifies the next package as W3-B because
local artifacts show the expected `codex 3 + claude 1` inputs, but runtime adoption/display was not
proven by this non-GUI QA pass.

## Preflight

Commands run:

```powershell
git status --short --branch
git log -5 --oneline
code --list-extensions --show-versions | rg "pixel-agents"
```

Key output:

```text
## main...origin/main [ahead 27]
1b7c12a chore: sync Windows dev environment files
raychen.pixel-agents-multi@1.3.0
```

The worktree was clean before the report was written.

## Build, package, install

Commands run:

```powershell
npm run check-types
npm run test:webview
npm run build
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
```

Results:

- `npm run check-types`: passed.
- `npm run test:webview`: passed, 17 tests.
- `npm run build`: passed.
- `npx vsce package`: passed.
- `code --install-extension pixel-agents-multi-1.3.0.vsix --force`: passed.
- Re-check after install: `raychen.pixel-agents-multi@1.3.0`.

Build/package key output:

```text
../dist/webview/assets/index-DP8bYYWj.css        25.12 kB
../dist/webview/assets/browserMock-CbTJwzR1.js    3.08 kB
../dist/webview/assets/index-CGnRdES9.js        362.82 kB
DONE  Packaged: C:\Users\User\Documents\raychen\pixel-agents-multi\pixel-agents-multi-1.3.0.vsix (248 files, 981.14KB)
Extension 'pixel-agents-multi-1.3.0.vsix' was successfully installed.
```

## Installed extension identity

Inspected:

```text
C:\Users\User\.vscode\extensions\raychen.pixel-agents-multi-1.3.0\package.json
```

Evidence:

```text
name        : pixel-agents-multi
displayName : Pixel Agents Multi
publisher   : raychen
version     : 1.3.0
main        : ./dist/extension.js
repository  : https://github.com/ray24724919/pixel-agents-multi
```

Installed folders matching `pixel-agents`:

```text
raychen.pixel-agents-multi-1.3.0
```

Installed webview assets were present under:

```text
C:\Users\User\.vscode\extensions\raychen.pixel-agents-multi-1.3.0\dist\webview
```

Observed installed asset files include:

```text
dist\webview\index.html
dist\webview\assets\index-CGnRdES9.js
dist\webview\assets\index-DP8bYYWj.css
dist\webview\assets\furniture-catalog.json
dist\webview\assets\characters\char_0.png
```

Installed webview JS contains the Agent Center and Usage fallback strings:

```text
File               : index-CGnRdES9.js
HasUsageEmptyState : True
HasUsageFallback   : True
HasTimelineTab     : True
HasAgentCenter     : True
```

## Provider/session artifact baseline

Read-only roots checked:

```text
FOUND C:\Users\User\.codex
FOUND C:\Users\User\.claude
FOUND C:\Users\User\AppData\Roaming\Claude
FOUND C:\Users\User\.pixel-agents
```

Codex session JSONL artifacts under `C:\Users\User\.codex\sessions`: 3.

```text
C:\Users\User\.codex\sessions\2026\05\29\rollout-2026-05-29T09-14-56-019e714c-72fc-7123-bce0-9dbb270f236e.jsonl
C:\Users\User\.codex\sessions\2026\05\29\rollout-2026-05-29T10-31-36-019e7192-a48d-7002-8d12-6000d8367da7.jsonl
C:\Users\User\.codex\sessions\2026\05\29\rollout-2026-05-29T11-18-09-019e71bd-435a-70e3-82c1-2de3db75dd2c.jsonl
```

Claude local-agent-mode JSONL artifacts under `%APPDATA%\Claude\local-agent-mode-sessions`: 1.

```text
C:\Users\User\AppData\Roaming\Claude\local-agent-mode-sessions\ec37b895-e20d-4600-a1c8-54ffacd57ea9\929dea93-c316-4b93-b241-4eb372ccc1d6\local_c0743c91-c6bd-4ace-93d2-0c2e1475312b\audit.jsonl
```

The Claude audit file includes a `system/init` record with a Claude Code version, `client_platform:
desktop_app`, and a cwd under that local-agent-mode session's `outputs` directory. This is a
plausible valid Claude code/cowork artifact for W3-B to reproduce against.

`C:\Users\User\.pixel-agents` currently contains:

```text
hooks
layout.backup-before-old-import-20260601-090426.json
layout.json
```

No provider database or layout/config files were modified during artifact inspection.

## Runtime agent-count matrix

This pass did not drive the normal VS Code UI, so the visible runtime matrix is not fully proven.

| Provider | Expected from local artifacts |            Shown in panel | Status                       |
| -------- | ----------------------------: | ------------------------: | ---------------------------- |
| Codex    |                             3 | Not verified in this pass | Needs live W3-B reproduction |
| Claude   |                             1 | Not verified in this pass | Needs live W3-B reproduction |

Important runtime checks still pending:

- Pixel Agents Multi panel renders after `Developer: Reload Window`.
- Pressing Refresh does not duplicate, stack, or drop visible agents.
- Claude code/cowork appears while Claude chat remains hidden by default.
- Agent Center tabs visually render: Agents, Usage, Timeline.
- Usage tab is visually confirmed as populated, empty-state, or fallback panel.
- Active top-level agents go to valid work seats and idle top-level agents avoid work seats in the
  live canvas.

## Seating observations

Automated webview tests covering W2-G seating invariants passed in this run:

```text
active agent uses a valid work seat at a desk and PC
active agent never types in a rest seat
no work seat means no top-level TYPE in place
idle agent releases a work seat and prefers a rest seat
layout import repairs a stale work seat that became rest
duplicate seat ownership is repaired deterministically
restore can randomize seating instead of reusing a persisted preference
sofa and coffee table seats remain rest even in the default work split
sub-agent behavior remains near parent and is not forced into a work seat
```

This proves the tested logic, not the current live VS Code canvas state.

## Usage observations

The installed bundle contains usage empty-state and fallback strings, and `npm run test:webview`
passed. The actual Usage tab still needs a normal VS Code panel check after reload because previous
manual reports included a blank Usage state before the guard was added.

## Error logs / anomalies

- No build, package, or install errors.
- A read-only recursive scan of `%APPDATA%\Claude\local-agent-mode-sessions` hit a transient missing
  child path in Claude's nested local-agent-mode output tree, but still identified the single
  `audit.jsonl` artifact. W3-B should use targeted paths or `-ErrorAction SilentlyContinue` for
  this tree.
- No Output/Developer Console errors were collected in this pass because normal VS Code panel GUI
  interaction was not performed.

## Recommendation

Run W3-B next.

Rationale:

- Packaging and install identity are clean enough to continue.
- Local artifacts match the user's expected baseline of `codex 3 + claude 1`.
- The unresolved risk is provider adoption/display correctness, especially Claude visibility and
  refresh idempotence/randomized seating after refresh.

W3-C should wait until W3-B proves the agent matrix is stable. W3-D should wait until the runtime
behavior is stable enough to lock down release identity and repeatable packaging.
