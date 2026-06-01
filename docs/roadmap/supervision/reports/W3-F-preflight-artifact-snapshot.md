# W3-F preflight artifact snapshot

Date: 2026-06-01
Branch: `main`
Baseline commit: `75f81ec Merge W3-F: align preflight commit note`

## Purpose

This is a read-only supervisor snapshot for the W3-F live VS Code smoke QA executor. It does not
replace live UI validation. It records the local provider and persisted Pixel Agents state before
the live smoke pass so that agent-count failures can be separated into "artifact changed" versus
"UI/adoption/rendering failed".

## Installed extension identity

Command:

```powershell
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"
```

Observed:

```text
raychen.pixel-agents-multi@1.3.0
```

No upstream public Pixel Agents extension was listed.

Installed manifest under `%USERPROFILE%\.vscode\extensions\raychen.pixel-agents-multi-1.3.0` was
previously verified to expose:

- command ids: `pixel-agents-multi.showPanel`, `pixel-agents-multi.exportDefaultLayout`
- view container: `pixel-agents-multi-panel`
- webview id: `pixel-agents-multi.panelView`
- runtime bundle: `dist/extension.js`
- webview bundle: `dist/webview/index.html` and `dist/webview/assets/**`

## Codex artifact matrix

Read-only source:

```text
%USERPROFILE%\.codex\state_5.sqlite
```

Query result: 3 active non-archived top-level Codex threads, all with existing rollout files.

| Thread id                              | Project cwd                                              | Rollout exists | Notes                               |
| -------------------------------------- | -------------------------------------------------------- | -------------- | ----------------------------------- |
| `019e714c-72fc-7123-bce0-9dbb270f236e` | `\\?\C:\Users\User\Documents\raychen\pixel-agents-multi` | yes            | Main Supervisor                     |
| `019e7192-a48d-7002-8d12-6000d8367da7` | `\\?\C:\Users\User\Documents\raychen\pixel-agents-multi` | yes            | W2-E no-workspace fallback executor |
| `019e71bd-435a-70e3-82c1-2de3db75dd2c` | `\\?\C:\Users\User\Documents\raychen\animfy_gs1`         | yes            | AnimfyGS1 onboarding executor       |

Expected W3-F live result for Codex, unless artifacts change: 3 visible Codex agents.

## Claude Cowork artifact matrix

Read-only source:

```text
%APPDATA%\Claude\local-agent-mode-sessions
```

Query result: 1 Claude Desktop/Cowork local-agent-mode metadata record with an existing audit log.

| Session id                                   | Selected folder                              | Audit exists |      Audit size | Title                         |
| -------------------------------------------- | -------------------------------------------- | ------------ | --------------: | ----------------------------- |
| `local_c0743c91-c6bd-4ace-93d2-0c2e1475312b` | `C:\Users\User\Documents\raychen\animfy_gs1` | yes          | 5,079,984 bytes | `AnimfyGS1 portal onboarding` |

Expected W3-F live result for Claude, unless artifacts change: 1 visible Claude Cowork agent.

## Persisted Pixel Agents state

Read-only source:

```text
%APPDATA%\Code\User\workspaceStorage\098af7fb0ef01421543cbb06b05bd18f\state.vscdb
```

Key:

```text
raychen.pixel-agents-multi
```

Observed persisted agents:

|  id | Provider | Session id                                   | Project              | Agent name                           | JSONL/audit exists |
| --: | -------- | -------------------------------------------- | -------------------- | ------------------------------------ | ------------------ |
|   1 | Codex    | `019e714c-72fc-7123-bce0-9dbb270f236e`       | `pixel-agents-multi` | `Main Supervisor`                    | yes                |
|   2 | Codex    | `019e7192-a48d-7002-8d12-6000d8367da7`       | `pixel-agents-multi` | `Add no-workspace adoption fallback` | yes                |
|   3 | Codex    | `019e71bd-435a-70e3-82c1-2de3db75dd2c`       | `animfy_gs1`         | `執行 ONBOARDING-EXECUTOR`           | yes                |
|   4 | Claude   | `local_c0743c91-c6bd-4ace-93d2-0c2e1475312b` | `animfy_gs1`         | `AnimfyGS1 portal onboarding`        | yes                |

Summary:

```text
persisted=4
codex=3
claude=1
archived=0
hidden=0
```

## Panel visibility note

VS Code workspace view state previously showed the Pixel Agents Multi panel container could be
hidden. W3-F should not treat "panel not visible in the current layout" as a product failure until
it has run **Pixel Agents Multi: Show Panel** from the Command Palette.

## Implication for W3-F

If live UI shows fewer than 4 agents while this artifact matrix still holds, the likely failure is
in one of these layers:

- extension restore/adoption runtime
- webview message delivery
- provider filter state
- Agent Center/canvas rendering
- refresh dedupe/randomized seating

If the artifact matrix changes before W3-F runs, the executor should document the new matrix and use
that as the expected live count.
