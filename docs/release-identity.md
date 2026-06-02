# Release Identity

This fork is published as a separate VS Code extension from the public
`pablodelucca.pixel-agents` package.

| Surface                 | Pixel Agents Multi                           |
| ----------------------- | -------------------------------------------- |
| Extension id            | `raychen.pixel-agents-multi`                 |
| VSIX name               | `pixel-agents-multi-<version>.vsix`          |
| Commands                | `pixel-agents-multi.*`                       |
| View container          | `pixel-agents-multi-panel`                   |
| Webview id              | `pixel-agents-multi.panelView`               |
| Settings                | `pixel-agents-multi.*`                       |
| User data               | `~/.pixel-agents-multi`                      |
| Usage history           | `~/.pixel-agents-multi/usage/usage-v1.jsonl` |
| Claude hook discovery   | `~/.pixel-agents-multi/server.json`          |
| Claude hook script copy | `~/.pixel-agents-multi/hooks/claude-hook.js` |

On first run, `layout.json`, `config.json`, and usage history are imported from
the legacy `~/.pixel-agents` directory when the matching
`~/.pixel-agents-multi` files do not exist yet. This keeps existing office
layouts, external asset directories, and local usage records available while
preventing ongoing writes from colliding with the public extension.

The extension still accepts legacy VS Code settings under `pixel-agents.*` as a
fallback when the matching `pixel-agents-multi.*` setting has not been explicitly
configured. New installs should use the `pixel-agents-multi.*` settings.
