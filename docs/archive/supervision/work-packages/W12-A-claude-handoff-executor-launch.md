# Work Package W12-A - Claude handoff executor launch

## Context (read first)

W11 completed the remaining handoff executor workflow:

- package-backed handoffs can launch Codex executors,
- launched executor metadata is linked into the `.handoff.json` sidecar,
- Handoff Queue can refresh local report/branch completion status,
- completion detection is read-only.

The main known limitation left by W11 is provider asymmetry: Claude sessions can be tracked and used
as handoff context, but package-backed handoffs cannot launch a Claude executor because the current
handoff launch path rejects `providerId === 'claude'`.

Local CLI preflight on 2026-06-05 showed that the installed Claude CLI supports a positional prompt:

```text
Usage: claude [options] [command] [prompt]
```

This package should enable Claude launch from package-backed handoffs by passing the generated
work-package prompt to the Claude CLI safely, while preserving the existing Codex launch path.

## In scope

- Allow Handoff Queue and Recent Handoffs launch actions to launch either Codex or Claude executors.
- Pass the generated handoff work-package prompt to Claude as the final positional CLI argument.
- Avoid raw shell-string prompt injection for Claude prompts.
- Keep Codex handoff executor launch behavior unchanged.
- Link launched Claude executor metadata into the handoff sidecar the same way Codex executor launch
  is linked.
- Update UI labels/actions so the user can intentionally choose Codex or Claude launch.
- Add focused automated tests for the launcher/model behavior touched in this package.
- Write the W12-A report and commit all W12-A changes as a single commit.

## Out of scope (do NOT touch)

- Do not change handoff Markdown generation.
- Do not change handoff work-package prompt content except where required by tests for provider
  launch.
- Do not change report/branch completion detection semantics.
- Do not add auto-merge, auto-push, auto-stage, auto-clean, auto-stash, or auto-rebase behavior.
- Do not redesign Agent Center, Usage, Timeline, Replay, Layout Editor, or pixel office movement.
- Do not change Codex command construction except to preserve existing tests if signatures need
  minor adjustment.
- Do not add provider API calls or cloud usage lookup.
- Do not edit README files in this package.

## Required changes

### `src/agentManager.ts`

- Extend the Claude launch path so `launchNewTerminal(..., providerId: 'claude', ..., prompt)`
  passes `prompt` to Claude as the final positional argument.
- Preserve existing Claude launch behavior when `prompt` is absent.
- For Claude launches with a prompt, prefer `TerminalOptions.shellPath` + `shellArgs` so the prompt is
  passed as an argument array, not concatenated into a shell command string.
- If you need to resolve a bare `claude` command for direct launch, make the resolver return a safe
  executable path or command value suitable for `shellPath`, and cover the behavior in tests.
- Keep `--session-id <uuid>` and permission flags before the prompt.
- Keep missing Claude CLI behavior: do not create/link an agent when the CLI cannot be resolved.

### `src/PixelAgentsViewProvider.ts`

- Remove the hard rejection for `message.providerId === 'claude'` in
  `launchHandoffExecutorFromWebview`.
- Accept only `codex` or `claude`; default to `codex` for invalid/missing provider values.
- Build the handoff work-package prompt exactly once and pass `prompt.prompt` into
  `launchNewTerminal`.
- If Claude launch fails or returns no agent, do not mark the sidecar as launched.
- Preserve the existing `handoffExecutorLaunched`, timeline event, library refresh, and toast
  behavior, with provider-specific linked-agent metadata.

### `webview-ui/src/components/handoffArtifactLibraryModel.ts`

- Change `LaunchHandoffExecutorMessage.providerId` from `'codex'` to `'codex' | 'claude'`.
- Make `buildLaunchHandoffExecutorMessage(item, requestId, providerId)` preserve valid `codex` and
  `claude` provider choices.
- Continue to default invalid/missing provider values to `codex`.
- Continue to send only safe fields: `type`, `requestId`, repo-relative `relativePath`, and
  `providerId`. Do not include prompt text or absolute paths.

### `webview-ui/src/components/AgentCenter.tsx`

- In both Recent Handoffs and Handoff Queue, replace the single ambiguous `Launch executor` action
  with provider-specific actions.
- Recommended labels:
  - `Launch Codex`
  - `Launch Claude`
- Both actions should use the same package eligibility checks as the existing launch action.
- Keep busy/failed/launched feedback clear enough to distinguish `Codex executor` from
  `Claude executor`.
- Do not introduce a large UI redesign.

## Tests

Add or update focused tests. At minimum:

- `server/__tests__/agentManager.test.ts`
  - Claude launch without prompt preserves existing no-prompt behavior.
  - Claude launch with a prompt passes the prompt as the final CLI argument and does not send a raw
    prompt-bearing shell command string.
  - Configured Claude path with spaces still launches through `shellPath`/`shellArgs` and includes
    the prompt when provided.
  - Missing Claude CLI still creates no terminal/agent and does not link execution metadata.
  - Codex launch still calls `buildCodexLaunchCommand(cwd, bypassPermissions, prompt)`.
- `webview-ui/test/handoff-artifact-library-model.test.ts`
  - `buildLaunchHandoffExecutorMessage(..., 'claude')` sends `providerId: 'claude'`.
  - invalid provider still defaults to `codex`.
  - message still excludes prompt text and absolute paths.
- Add additional tests if your implementation touches other pure models or helpers.

Required validation:

```powershell
npm run build
npm run test:webview
npm run test:server
git diff --check
```

Combined test count must be at least 404 unless the test runner output format changes; report the
actual counts.

## Guardrails

- Branch from current `main`.
- Use branch name: `product/w12-a-claude-handoff-executor-launch`.
- One package = one commit on this branch.
- Do not push, merge, rebase, amend, reset, clean, delete branches, or stash.
- If the preflight worktree is dirty, stop and report the exact `git status --short --branch` output.
- Scope is frozen. If this appears to require redesigning the handoff queue or changing provider
  discovery, stop and report it as a follow-up.
- Provider symmetry applies only to the launch path touched here: do not break Codex while enabling
  Claude.

## Acceptance criteria

1. From a package-backed handoff, the UI can send `launchHandoffExecutor` with
   `providerId: 'codex'`.
2. From the same package-backed handoff, the UI can send `launchHandoffExecutor` with
   `providerId: 'claude'`.
3. The backend no longer rejects Claude handoff executor launch solely because the provider is
   Claude.
4. Claude receives the generated work-package prompt as a CLI argument, not through unsafe shell
   prompt concatenation.
5. A successful Claude launch marks the handoff sidecar execution metadata as active/dispatched with
   `providerId: 'claude'`.
6. A failed/missing Claude CLI launch does not mark the handoff sidecar as launched.
7. Existing Codex handoff executor launch behavior and tests still pass.
8. `npm run build`, `npm run test:webview`, `npm run test:server`, and `git diff --check` pass.

## Verification protocol (manual after handback)

Manual VS Code smoke QA is recommended after the code package is reviewed:

1. Build and reinstall the local VSIX:

   ```powershell
   npm run build
   npm run package:vsix
   npm run install:local
   ```

2. Reload VS Code.
3. Open Pixel Agents Multi.
4. Open Agent Center -> Timeline/Handoff.
5. Pick or create a handoff that already has a work package.
6. Click `Launch Codex` and confirm a Codex executor still launches and links metadata.
7. Click `Launch Claude` on another package-backed handoff and confirm a Claude executor launches
   with the package prompt.
8. Confirm Handoff Queue shows the linked provider/name/status and no blank Usage/Timeline panels
   regress.

## Reporting back

Write your final report to:

```text
docs/roadmap/supervision/reports/W12-A-claude-handoff-executor-launch-report.md
```

Commit the report as part of the same W12-A commit.

The report must contain:

1. Branch name + commit SHA
2. Files touched
3. Per-file change narrative
4. Implementation choices made, especially how Claude prompt passing is handled safely
5. Final summary lines of `npm run build`, `npm run test:webview`, `npm run test:server`, and
   `git diff --check`
6. Actual combined test count
7. Acceptance criteria check
8. Out-of-scope findings or "none"
9. Deviations from spec or "none"
10. Manual VS Code QA status, even if not run
