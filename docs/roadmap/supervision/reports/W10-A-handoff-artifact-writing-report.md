# W10-A Handoff Artifact Writing Report

## Summary

W10-A adds the first repo-centered handoff artifact writing flow. The existing redacted Handoff Draft preview in Agent Center / Timeline now has a user-triggered `Write to Repo` action that writes the current safe Markdown draft into the open workspace repository and opens the generated file for review.

## Final Behavior

- The Timeline Handoff Draft panel still supports `Create Handoff` and `Copy Markdown`.
- When a preview exists, `Write to Repo` sends only the draft Markdown and safe naming metadata to the extension.
- The extension chooses the destination path under the first open workspace folder:
  - `docs/agent-handoffs/YYYY-MM-DD-HHMM-<safe-project-or-agent>-handoff.md`
- On success:
  - the extension creates `docs/agent-handoffs/` if needed;
  - writes the Markdown file;
  - opens it in VS Code as an editable Markdown document;
  - sends a `handoffDraftWritten` acknowledgement with the repo-relative path;
  - the Handoff UI shows a visible success state.
- On failure:
  - the preview remains visible;
  - the Markdown is not lost;
  - the Handoff UI shows the failure reason from `handoffDraftWriteFailed`.

## Privacy And Safety Guardrails

- The webview does not send a target filesystem path. It sends no `targetPath` or `absolutePath`.
- The extension host chooses the repo path from `vscode.workspace.workspaceFolders[0]`.
- Filename generation strips or replaces path separators, drive letters, control characters, traversal-like `..` segments, and other suspicious filename characters.
- The generated target path is resolved and checked to stay inside the repository root.
- The extension writes the existing redacted Markdown draft unchanged; it does not read raw transcripts or add tool output.
- The flow does not stage, commit, push, open a PR, sync, or publish anything.

## Files Changed

- `src/constants.ts`
- `src/handoffArtifacts.ts`
- `src/PixelAgentsViewProvider.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/handoffDraftPageModel.ts`
- `webview-ui/test/handoff-draft-page-model.test.ts`
- `server/__tests__/handoffArtifacts.test.ts`
- `docs/roadmap/supervision/reports/W10-A-handoff-artifact-writing-report.md`

## Verification

- `npm run build` passed.
- `npm run test:webview` passed: 108 tests.
- `npm run test:server` passed: 243 tests.
- `git diff --check` passed.
- `git status --short --branch` showed only intended W10-A changes before staging.

## Skipped Steps

- No manual Extension Host write was performed. This package was validated through automated build/tests and focused path/message safety tests.
