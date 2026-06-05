# W12-A Claude Handoff Executor Launch Report

## Summary

W12-A enables package-backed handoff executor launch for Claude while preserving the existing Codex launch path. Recent Handoffs and the Handoff Queue now expose provider-specific launch actions for Codex and Claude.

Claude handoff prompts are passed as terminal argv, not by shell command string concatenation. For prompt launches, the extension creates the terminal with `shellPath` set to the resolved Claude command and appends the generated work-package prompt as the final `shellArgs` element after Claude options.

Branch: `product/w12-a-claude-handoff-executor-launch`

Commit: pending until this report is included in the single W12-A commit; final commit hash is reported in the completion response.

## Files Changed

- `src/agentManager.ts`
  - Extended Claude argument building to accept an optional prompt.
  - Launches Claude prompt-backed terminals directly through `TerminalOptions.shellPath` and `shellArgs`.
  - Preserves no-prompt bare `claude` behavior through the existing `sendText('claude --session-id ...')` path.
  - Preserves configured Claude command paths with spaces through direct terminal options.
  - Leaves Codex behavior on `buildCodexLaunchCommand(cwd, bypassPermissions, prompt)`.

- `src/PixelAgentsViewProvider.ts`
  - Allows `launchHandoffExecutor` requests for `providerId: 'claude'`.
  - Defaults invalid or missing provider values to Codex.
  - Builds the handoff work-package prompt once and passes it into `launchNewTerminal`.
  - Continues to mark/link the handoff sidecar only after `launchNewTerminal` returns an agent.

- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
  - Restored `LaunchHandoffExecutorMessage.providerId` to `codex | claude`.
  - Preserves valid Claude launch requests and defaults invalid provider input to Codex.

- `webview-ui/src/components/AgentCenter.tsx`
  - Replaced the single `Launch executor` action with `Launch Codex` and `Launch Claude`.
  - Updated both Recent Handoffs and Handoff Queue action rows.

- `server/__tests__/agentManager.test.ts`
  - Added focused Claude prompt argv tests.
  - Confirmed no-prompt Claude launch behavior is unchanged.
  - Confirmed configured Claude paths with spaces receive prompt as final argv.
  - Confirmed missing Claude CLI creates no terminal/agent.
  - Confirmed Codex still uses the Codex launch command builder with prompts.

- `webview-ui/test/handoff-artifact-library-model.test.ts`
  - Confirmed Claude provider messages are preserved.
  - Existing invalid-provider fallback and safe-message checks remain covered.

## Implementation Choices

- Claude handoff prompts use `shellArgs`, with the prompt appended after `--session-id` and permission flags.
- Prompt-backed Claude launches do not call `terminal.sendText`, avoiding unsafe shell concatenation and quoting ambiguity.
- No-prompt bare `claude` launches keep their existing behavior to avoid changing normal Claude startup semantics.
- If Claude CLI resolution fails, `launchNewTerminal` returns without creating an agent; the handoff sidecar is therefore not marked launched.
- Codex launch behavior remains provider-specific and unchanged.

## Acceptance Criteria

- Package-backed Claude launch enabled: satisfied.
- Codex launch behavior preserved: satisfied.
- Claude prompt passed as CLI argument, not shell string concatenation: satisfied.
- Provider-specific UI actions for Codex and Claude: satisfied.
- Missing Claude CLI / no returned agent does not mark the sidecar launched: satisfied.
- Invalid provider defaults to Codex: satisfied.

## Validation

- `npm run build`
  - Passed.
  - Includes `check-types`, lint, extension build, hook build, asset copy, and webview Vite build.

- `npm run test:webview`
  - Passed: 137 tests.

- `npm run test:server`
  - Passed: 269 tests.

- Combined test count
  - 406 tests.
  - Meets the W12-A requirement of at least 404.

- `git diff --check`
  - Passed with no whitespace errors.

## Manual QA

Manual VS Code / Extension Host launch QA was not run in this package. The covered behavior is automated at the launcher and webview message-model levels.

## Out Of Scope

- No VSIX packaging or install verification.
- No changes to handoff markdown or sidecar schema.
- No changes to Codex terminal command construction beyond test coverage confirming it is preserved.
