<h1 align="center">
    <a href="https://github.com/ray24724919/pixel-agents-multi/discussions">
        <img src="webview-ui/public/banner.png" alt="Pixel Agents Multi">
    </a>
</h1>

<h2 align="center" style="padding-bottom: 20px;">
  A local-first pixel control room for Claude and Codex agents
</h2>

<div align="center" style="margin-top: 25px;">

[![stars](https://img.shields.io/github/stars/ray24724919/pixel-agents-multi?logo=github&color=0183ff&style=flat)](https://github.com/ray24724919/pixel-agents-multi/stargazers)
[![license](https://img.shields.io/github/license/ray24724919/pixel-agents-multi?color=0183ff&style=flat)](https://github.com/ray24724919/pixel-agents-multi/blob/main/LICENSE)
[![good first issues](https://img.shields.io/github/issues/ray24724919/pixel-agents-multi/good%20first%20issue?color=7057ff&label=good%20first%20issues)](https://github.com/ray24724919/pixel-agents-multi/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22)

</div>

<div align="center">
<a href="README.md">English</a> |
<a href="README.zh-TW.md">繁體中文</a>
</div>

<div align="center">
<a href="https://github.com/ray24724919/pixel-agents-multi/releases">Releases</a> |
<a href="https://github.com/ray24724919/pixel-agents-multi/discussions">Discussions</a> |
<a href="https://github.com/ray24724919/pixel-agents-multi/issues">Issues</a> |
<a href="CONTRIBUTING.md">Contributing</a> |
<a href="CHANGELOG.md">Changelog</a>
</div>

<br/>

Pixel Agents Multi turns local AI coding sessions into an observable, playful, and practical VS Code control room. Claude and Codex sessions become animated characters in a pixel office, where working agents move to computer desks, idle agents wander or rest, and each character reflects real tool activity, waiting state, project, provider, thread name, and tracked usage.

This fork extends the original Claude Code-focused project into a multi-provider agent dashboard, timeline, usage intelligence surface, and handoff/executor workflow for serious local development. It is designed for one person supervising many local agents today, with a longer path toward team/lab coordination later.

This repository is derived from [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents). This fork publishes as `raychen.pixel-agents-multi`, with separate VS Code commands, settings, views, hook discovery, and user data so it can be installed beside the public extension without identity confusion.

![Pixel Agents screenshot](webview-ui/public/Screenshot.jpg)

## What It Does

- **Visualizes local agents**: Claude Code, Claude Desktop/Cowork local-agent-mode sessions, and Codex CLI threads appear as characters.
- **Keeps work visible**: active agents use computer desks, idle agents leave work seats, and refresh reassigns positions to reduce stacking.
- **Shows live status**: characters animate for writing, reading, shell commands, task delegation, permission prompts, and waiting-for-input states.
- **Tracks providers and projects**: overlays and Agent Center show project, provider, thread/session name, and status in a compact scan-friendly format.
- **Surfaces usage intelligence**: token totals, exact/estimated labels, provider/project/session grouping, and proxy cost context live outside the canvas.
- **Records timeline history**: local event history captures agent turns, tool events, handoff actions, executor launches, report opens, and completion refreshes.
- **Turns history into handoffs**: create reviewed handoff artifacts from timeline/replay context, then dispatch them as executor-ready work packages.
- **Runs a handoff queue**: track draft, reviewed, stale, dispatched, active, blocked, report-ready, and completed work package states.
- **Supports local VSIX releases**: package and install this fork with its own extension id, name, commands, settings, and verification scripts.
- **Lets you design the office**: edit floors, walls, furniture, desks, chairs, colors, assets, and layout JSON without touching code.

<p align="center">
  <img src="webview-ui/public/characters.png" alt="Pixel Agents characters" width="320" height="72" style="image-rendering: pixelated;">
</p>

## Core Features

### Pixel Office

- One visible character per adopted local session/thread.
- Working agents pathfind to available computer-adjacent seats.
- Idle agents leave work seats and wander or rest so they do not block active agents.
- Sub-agents spawned by task delegation appear as linked child characters near the parent.
- Waiting and permission states show speech bubbles and optional sound notifications.
- Characters are assigned diverse palettes and hue shifts to make crowded rooms easier to read.
- Seat assignment, refresh behavior, and character placement are designed to avoid common visual bugs such as agents typing in empty space, standing on chairs, or stacking after refresh.

### Agent Center

The Agent Center is the larger inspection surface for the project. It is intentionally separate from the canvas so the office can stay readable.

- Filter by All, Codex, or Claude.
- Inspect agent name, provider, project, status, and tracked usage.
- Focus a character or linked terminal/session.
- Refresh session discovery and stale visual state.
- Close, archive, hide, or kill tracked agents through guarded actions.
- Open Usage, Timeline, Handoff, and Handoff Queue views without crowding the main office.

### Usage Intelligence

Usage data is presented as operational telemetry, not billing truth.

- Codex and Claude token totals are shown when local metadata exposes them.
- Exact and estimated values are labelled separately.
- Provider, project, session, and time-based summaries help identify heavy or stale work.
- Cache, reasoning, and artifact usage can be estimated where enough local data exists.
- Cost display is a proxy estimate only. It is not OpenAI, Anthropic, or subscription billing.

### Timeline And Replay

Pixel Agents Multi stores a local, privacy-aware timeline of important agent events.

- Tool start/done, turn completion, waiting state, handoff actions, executor launch, completion refresh, and report-open events.
- Replay-oriented views for understanding what happened before creating a handoff.
- Search/filter support for narrowing by agent, provider, project, event type, or time.
- Safe persistence: raw prompts, raw transcript body, credentials, and absolute transcript paths are not stored in timeline events.

### Handoff And Executor Workflow

The handoff workflow is built for supervising downstream executors without losing context.

1. Review timeline/replay context from an agent or project.
2. Draft a handoff artifact in `docs/agent-handoffs/`.
3. Store structured metadata in a sidecar `.handoff.json` file.
4. Mark handoffs as draft, reviewed, stale, dispatched, active, blocked, or completed.
5. Generate an executor-ready work package under `docs/roadmap/supervision/work-packages/handoffs/`.
6. Copy a dispatch prompt or launch a Codex executor directly from a package-backed handoff.
7. Link launched executor metadata back to the handoff sidecar.
8. Detect local completion signals from the expected report file and local branch state.
9. Use Handoff Queue to inspect work package status, open reports, refresh completion, and continue supervision.

Codex is currently the supported package-launch provider. Claude sessions can be tracked and used in handoff context, but direct Claude work-package prompt injection remains a follow-up until the Claude launcher path supports it safely.

### Layout Editor And Assets

- Paint floors and walls with pixel-art tools.
- Place, move, rotate, recolor, and remove furniture.
- Use desk/chair metadata to create valid work seats.
- Undo/redo up to 50 editor actions.
- Export/import layout JSON from the Settings modal.
- Share a user-level layout across VS Code windows through `~/.pixel-agents/layout.json`.
- Load external asset directories from `~/.pixel-agents/config.json`.
- Edit modular furniture manifests under `webview-ui/public/assets/`.

## Requirements

- VS Code 1.105.0 or later
- Node.js/npm for source development and packaging
- Git for branch/report completion detection
- Optional: [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- Optional: OpenAI Codex CLI installed and authenticated
- Supported platforms: Windows, Linux, and macOS

## Install From Source

```bash
git clone git@github.com:ray24724919/pixel-agents-multi.git
cd pixel-agents-multi
npm install
cd webview-ui && npm install && cd ..
cd server && npm install && cd ..
npm run build
```

Then press **F5** in VS Code to launch the Extension Development Host.

## Install As A Local VSIX

Use this path when you want the built extension in normal VS Code windows:

```bash
npm run release:local
```

Or run the steps manually:

```bash
npm run build
npm run verify:identity
npm run verify:vsix
npm run package:vsix
npm run install:local
npm run verify:installed
```

Confirm that VS Code installed this fork, not the upstream public extension:

```bash
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
```

Expected output includes `raychen.pixel-agents-multi@1.3.0`.

Reload VS Code after installing. If the panel does not appear, run **Developer: Reload Window** from the Command Palette.

## Quick Start

1. Open the **Pixel Agents Multi** panel in the VS Code panel area.
2. Click **Refresh** to adopt existing Claude/Codex sessions.
3. Click **+ Agent** to start a new Codex agent in a selected project.
4. Open **Agents** to inspect active agents, usage, timeline, and handoffs.
5. Click a character to focus it, then click a valid seat to reassign it.
6. Use **Layout** to customize the office.
7. Use the Timeline or Handoff view when an agent's work should become a reviewed downstream work package.

## Provider Behavior

### Codex

- Discovers local Codex threads and project metadata.
- Reads transcript/rollout events to infer active, waiting, complete, abort, and error states.
- Supports direct executor launch from package-backed handoffs.
- Links launched executor metadata back to the handoff sidecar.
- Reads local branch/report state for completion display without mutating git state.

### Claude

- Discovers Claude Code JSONL project transcripts.
- Uses hook events when available for faster and more reliable state changes.
- Discovers Claude Desktop/Cowork local-agent-mode metadata when active.
- Can appear in Agent Center, Usage, Timeline, Replay, and Handoff context.
- Direct package-backed Claude executor launch is intentionally deferred until prompt injection can be handled by the Claude launcher safely.

## Data And Privacy

Pixel Agents Multi is local-first. It does not call Claude or OpenAI APIs to observe sessions. It reads local CLI/session metadata and visualizes it inside VS Code.

Main local data locations:

- `~/.pixel-agents/layout.json`: shared user-level office layout
- `~/.pixel-agents/config.json`: extension config such as external asset directories
- `~/.pixel-agents/server.json`: local hook server discovery
- `docs/agent-handoffs/`: Markdown handoffs and `.handoff.json` sidecars
- `docs/roadmap/supervision/work-packages/`: executor work-package specs
- `docs/roadmap/supervision/reports/`: executor completion reports

The extension does not stage, commit, push, merge, reset, stash, clean, delete branches, or rebase when checking handoff completion. Completion detection is read-only.

## Development

```bash
npm run build
npm run test:webview
npm run test:server
npm test
```

Other useful commands:

```bash
npm run check-types
npm run lint
npm run package:vsix
npm run verify:release
```

The extension backend lives in `src/`, the standalone hook/server code lives in `server/`, and the React/canvas webview lives in `webview-ui/`.

## Windows Release Checklist

Before sharing a VSIX from this repository, run the release path from a clean worktree:

```powershell
git status --short --branch
npm run check-types
npm run test:webview
npm run test:server
npm run build
npm run verify:identity
npm run verify:vsix
npm run package:vsix
npm run install:local
npm run verify:installed
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
```

Then reload VS Code and smoke-test:

1. Open the Pixel Agents Multi panel and click **Refresh**.
2. Set the provider filter to **All**.
3. Confirm active Codex and Claude agents are visible with correct project labels.
4. Open **Agents** and confirm the Usage tab renders totals or an empty state.
5. Confirm the VSIX filename is `pixel-agents-multi-1.3.0.vsix` and the installed id is `raychen.pixel-agents-multi`.

## Known Limitations

- Session sync is still adapter-based because Claude and Codex do not expose one shared live-agent API.
- Claude Desktop/Cowork status can be less precise than Claude Code hook events.
- Usage/cost displays are operational estimates, not provider billing records.
- Codex is the supported direct handoff executor launch path today; Claude launch is planned.
- If more agents are working than there are valid work seats, some agents may wait for a desk.
- Manual desktop QA is still useful after UI-heavy changes because VS Code webviews, terminals, and local CLIs vary by platform.

## Troubleshooting

If agents do not appear or look stale:

1. Click **Refresh** in the toolbar or Agent Center.
2. Confirm the provider filter is set to **All**.
3. Open Settings and enable **Debug View** to inspect JSONL/session paths, timestamps, runtime state, seat state, and recent webview events.
4. In an Extension Development Host, open **View > Debug Console** and search for `[Pixel Agents]`.
5. On Windows, confirm VS Code was reloaded after installing the local VSIX.
6. For Codex, confirm the Codex CLI is authenticated and has local threads under the expected project.
7. For Claude, confirm the Claude Code CLI path setting is correct if launching Claude from the extension.

## Roadmap

The near-term direction is to make local individual supervision excellent:

- More reliable Claude launch and package dispatch.
- Better usage intelligence, context health, and stale-work detection.
- Stronger timeline replay and report-ready workflows.
- Cleaner separation between pixel office visualization and large inspection pages.
- Safer multi-agent queue operations and completion status review.

The longer-term product direction is a team/lab model: several people sharing a platform where agent work, repo handoffs, communication, status, and usage can be observed across projects. That comes after the local single-user control room is stable.

## Community & Contributing

Use [Issues](https://github.com/ray24724919/pixel-agents-multi/issues) to report bugs or request features. Join [Discussions](https://github.com/ray24724919/pixel-agents-multi/discussions) for questions and conversations.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution instructions, and read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before participating.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ray24724919/pixel-agents-multi&type=Date)](https://www.star-history.com/?repos=ray24724919%2Fpixel-agents-multi&type=date&legend=bottom-right)

## License

This project is licensed under the [MIT License](LICENSE).
