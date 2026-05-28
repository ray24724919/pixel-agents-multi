<h1 align="center">
    <a href="https://github.com/ray24724919/pixel-agents-multi/discussions">
        <img src="webview-ui/public/banner.png" alt="Pixel Agents">
    </a>
</h1>

<h2 align="center" style="padding-bottom: 20px;">
  The game interface where AI agents build real things
</h2>

<div align="center" style="margin-top: 25px;">

[![stars](https://img.shields.io/github/stars/ray24724919/pixel-agents-multi?logo=github&color=0183ff&style=flat)](https://github.com/ray24724919/pixel-agents-multi/stargazers)
[![license](https://img.shields.io/github/license/ray24724919/pixel-agents-multi?color=0183ff&style=flat)](https://github.com/ray24724919/pixel-agents-multi/blob/main/LICENSE)
[![good first issues](https://img.shields.io/github/issues/ray24724919/pixel-agents-multi/good%20first%20issue?color=7057ff&label=good%20first%20issues)](https://github.com/ray24724919/pixel-agents-multi/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22)

</div>

<div align="center">
<a href="https://github.com/ray24724919/pixel-agents-multi/releases">📦 Releases</a> • <a href="https://github.com/ray24724919/pixel-agents-multi/discussions">💬 Discussions</a> • <a href="https://github.com/ray24724919/pixel-agents-multi/issues">🐛 Issues</a> • <a href="CONTRIBUTING.md">🤝 Contributing</a> • <a href="CHANGELOG.md">📋 Changelog</a>
</div>

<br/>

Pixel Agents turns AI coding sessions into something you can actually see and manage. Each Claude or Codex session becomes a character in a pixel art office. Agents walk around when idle, return to computer desks when working, show their current tool activity, and can be filtered, refreshed, inspected, or closed from the UI.

This fork extends the original Claude Code-focused project into a Claude + Codex visual agent dashboard for VS Code. The goal is to make multi-project, multi-thread AI work feel observable: you can see which provider an agent came from, which project/thread it belongs to, whether it is active or waiting, and how much tracked token usage it has accumulated.

This repository is derived from [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents) (the original Claude-Code-focused project) and is intended for local source installation while the Codex integration is being developed.

![Pixel Agents screenshot](webview-ui/public/Screenshot.jpg)

## Features

- **Claude + Codex providers** — watches Claude Code, Claude Desktop/Cowork local sessions, and Codex CLI threads
- **One agent, one character** — every tracked session/thread gets its own animated character
- **Project and thread labels** — shows provider, project folder, and known agent/thread names in overlays and Agent Center
- **Live activity tracking** — characters animate based on what the agent is actually doing (writing, reading, running commands)
- **Work vs idle behavior** — active agents use computer desks; inactive agents leave desks and wander instead of occupying work seats
- **Agent Center** — inspect agents, filter by All/Codex/Claude, refresh sessions, focus an agent, close/kill tracked agents, and view token totals
- **Token meter** — Codex token totals are tracked when available; Claude token totals are displayed without applying OpenAI pricing
- **Close confirmation** — closing an agent asks for confirmation before killing/archiving/removing the linked session
- **Office layout editor** — design your office with floors, walls, and furniture using a built-in editor
- **Speech bubbles** — visual indicators when an agent is waiting for input or needs permission
- **Sound notifications** — optional chime when an agent finishes its turn
- **Sub-agent visualization** — Task tool sub-agents spawn as separate characters linked to their parent
- **Persistent layouts** — your office design is saved and shared across VS Code windows
- **External asset directories** — load custom or third-party furniture packs from any folder on your machine
- **Diverse characters** — 6 diverse characters. These are based on the amazing work of [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

<p align="center">
  <img src="webview-ui/public/characters.png" alt="Pixel Agents characters" width="320" height="72" style="image-rendering: pixelated;">
</p>

## Requirements

- VS Code 1.105.0 or later
- Node.js/npm for source development
- Optional: [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- Optional: OpenAI Codex CLI installed and authenticated
- **Platform**: Windows, Linux, and macOS are supported

## Getting Started

This fork is currently meant to be installed from source or packaged locally.

### Install from source

```bash
git clone git@github.com:ray24724919/pixel-agents.git
cd pixel-agents
npm install
cd webview-ui && npm install && cd ..
npm run build
```

Then press **F5** in VS Code to launch the Extension Development Host.

### Install as a VS Code extension package

If you want to use the built extension in normal VS Code windows:

```bash
npm run build
npx vsce package
code --install-extension pixel-agents-1.3.0.vsix --force
```

Reload VS Code after installing. If the extension does not appear in a folder, open the Command Palette and run **Developer: Reload Window**.

### Usage

1. Open the **Pixel Agents** panel (it appears in the bottom panel area alongside your terminal)
2. Click **+ Agent** to start a new Codex agent in a selected project and optionally provide an initial task
3. Use **Refresh** to rescan Claude/Codex sessions and remove stale visual state
4. Use the **All / Codex / Claude** filter to focus the canvas on one provider
5. Open **Agents** to inspect the Agent Center: provider, project, status, token count, and close actions
6. Click a character to select it, then click a seat to reassign it
7. Click **Layout** to open the office editor and customize your space

### Claude and Codex behavior

- **Codex** sessions are discovered from Codex's local thread database/transcripts. Active turns are inferred from `task_started`, tool events, and `task_complete`/abort/error events. Codex token totals are read when available.
- **Claude Code** sessions are discovered from Claude JSONL project transcripts and hook events.
- **Claude Desktop/Cowork** local-agent-mode sessions are discovered from Claude's `local-agent-mode-sessions` metadata when they belong to the current workspace.
- **Working agents** are assigned to computer-adjacent work seats.
- **Idle agents** leave work seats and roam, so they do not block active agents from using desks.

## Layout Editor

The built-in editor lets you design your office:

- **Floor** — Full HSB color control
- **Walls** — Auto-tiling walls with color customization
- **Tools** — Select, paint, erase, place, eyedropper, pick
- **Undo/Redo** — 50 levels with Ctrl+Z / Ctrl+Y
- **Export/Import** — Share layouts as JSON files via the Settings modal

The grid is expandable up to 64×64 tiles. Click the ghost border outside the current grid to grow it.

### Office Assets

All office assets (furniture, floors, walls) are now **fully open-source** and included in this repository under `webview-ui/public/assets/`. No external purchases or imports are needed — everything works out of the box.

Each furniture item lives in its own folder under `assets/furniture/` with a `manifest.json` that declares its sprites, rotation groups, state groups (on/off), and animation frames. Floor tiles are individual PNGs in `assets/floors/`, and wall tile sets are in `assets/walls/`. This modular structure makes it easy to add, remove, or modify assets without touching any code.

To add a new furniture item, create a folder in `webview-ui/public/assets/furniture/` with your PNG sprite(s) and a `manifest.json`, then rebuild. The asset manager (`scripts/asset-manager.html`) provides a visual editor for creating and editing manifests.

To use furniture from an external directory, open Settings → **Add Asset Directory**. See [docs/external-assets.md](docs/external-assets.md) for the full manifest format and how to use third-party asset packs.

Characters are based on the amazing work of [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

## How It Works

Pixel Agents watches local transcript/session files to track what each agent is doing. Claude sessions are observed through JSONL transcript files and hooks. Codex sessions are observed through Codex local thread metadata and rollout/transcript events. When an agent uses a tool, starts a turn, finishes a turn, or waits for approval, the extension posts messages into the webview and updates the character state.

The webview runs a lightweight game loop with canvas rendering, BFS pathfinding, and a character state machine (idle → walk → type/read). Everything is pixel-perfect at integer zoom levels.

The current provider bridge is intentionally local-first: it does not call Claude or OpenAI APIs. It reads local CLI/session state and visualizes it.

## Tech Stack

- **Extension**: TypeScript, VS Code Webview API, esbuild
- **Webview**: React 19, TypeScript, Vite, Canvas 2D
- **Providers**: Claude transcript/hook watcher, Codex thread/transcript watcher

## Known Limitations

- **Session sync is heuristic** — Claude and Codex do not expose one shared live-agent API, so the extension infers activity from local files and events.
- **Claude Cowork status is still approximate** — local-agent-mode sessions have a different audit format than Claude Code JSONL, so some active/waiting transitions may need more refinement.
- **Token cost is a proxy** — Codex token totals may not split input/output. Claude token totals are shown as counts, not converted to OpenAI pricing.
- **Work seats are finite** — if more agents are actively working than there are computer desks, some agents may wait for a free work seat.
- **Linux/macOS tip** — if you launch VS Code without a folder open (e.g. bare `code` command), agents will start in your home directory. This is fully supported; just be aware your Claude sessions will be tracked under `~/.claude/projects/` using your home directory as the project root.

## Troubleshooting

If your agent appears stuck on idle or doesn't spawn:

1. **Refresh** — Click **Refresh** in the toolbar or Agent Center to rescan current Claude/Codex sessions.
2. **Debug View** — In the Pixel Agents panel, click the gear icon (Settings), then toggle **Debug View**. This shows connection diagnostics per agent: JSONL file status, lines parsed, last data timestamp, runtime state, seat state, and recent webview events. If you see "JSONL not found", the extension can't locate the session file.
3. **Debug Console** — If you're running from source (Extension Development Host via F5), open VS Code's **View > Debug Console**. Search for `[Pixel Agents]` to see detailed logs: project directory resolution, JSONL polling status, path encoding mismatches, Codex scan results, and unrecognized transcript record types.

## Where This Is Going

The long-term vision is an interface where managing AI agents feels like playing the Sims, but the results are real things built.

- **Agents as characters** you can see, assign, monitor, and redirect, each with visible roles (designer, coder, writer, reviewer), stats, context usage, and tools.
- **Desks as directories** — drag an agent to a desk to assign it to a project or working directory.
- **An office as a project** — with a Kanban board on the wall where idle agents can pick up tasks autonomously.
- **Deep inspection** — click any agent to see its model, branch, system prompt, and full work history. Interrupt it, chat with it, or redirect it.
- **Token health bars** — rate limits and context windows visualized as in-game stats.
- **Fully customizable** — upload your own character sprites, themes, and office assets. Eventually maybe even move beyond pixel art into 3D or VR.

For this to work, the architecture needs to be modular at every level:

- **Platform-agnostic**: VS Code extension today, Electron app, web app, or any other host environment tomorrow.
- **Agent-agnostic**: Claude Code today, but built to support Codex, OpenCode, Gemini, Cursor, Copilot, and others through composable adapters.
- **Theme-agnostic**: community-created assets, skins, and themes from any contributor.

We're actively working on the core module and adapter architecture that makes this possible. If you're interested to talk about this further, please visit our [Discussions Section](https://github.com/ray24724919/pixel-agents-multi/discussions).

## Community & Contributing

Use **[Issues](https://github.com/ray24724919/pixel-agents-multi/issues)** to report bugs or request features. Join **[Discussions](https://github.com/ray24724919/pixel-agents-multi/discussions)** for questions and conversations.

See [CONTRIBUTING.md](CONTRIBUTING.md) for instructions on how to contribute.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ray24724919/pixel-agents-multi&type=Date)](https://www.star-history.com/?repos=ray24724919%2Fpixel-agents-multi&type=date&legend=bottom-right)

## License

This project is licensed under the [MIT License](LICENSE).
