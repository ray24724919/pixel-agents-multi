# W9-B Handoff Draft Model Report

## Summary

Implemented a browser-safe, model-only handoff draft foundation for future "Create Handoff" UI work. The model consumes normalized Timeline page events plus optional normalized Usage summary data and returns both a Markdown draft and structured metadata.

No UI, extension backend, server code, filesystem writes, sharing, sync, or Agent Center behavior was added.

## Model Behavior

- Added `webview-ui/src/components/handoffDraftModel.ts`.
- `buildHandoffDraft()` derives scope metadata from safe `TimelinePageItem` records:
  - title
  - project
  - provider
  - agent identity
  - session/run identity
  - time window
  - current/final status
  - important timeline events
- The Markdown draft includes:
  - scope
  - important timeline events
  - action/decision placeholders
  - validation/test placeholders
  - optional usage summary
  - follow-up checklist
  - privacy note
- Added `buildHandoffUsageSummaryFromHistoryModel()` so future UI can map the existing Usage History read model into a compact handoff usage summary.

## Privacy And Redaction

The model is intentionally local-first and accepts already-normalized UI/read-model data, not raw transcripts. It does not read files, call VS Code APIs, or persist handoff content.

`sanitizeHandoffText()` conservatively redacts:

- Windows absolute paths, including namespaced `\\?\C:\...` paths
- UNC-style paths
- common POSIX absolute local paths
- credential-like assignments such as API keys, tokens, passwords, secrets, and bearer auth
- unsafe-looking raw prompt, raw tool output, stdout/stderr, and transcript text fields

The draft privacy note explicitly states that raw prompts, raw tool output, transcript text, absolute local paths, credentials, and environment details are excluded.

## Files Changed

- `webview-ui/src/constants.ts`
  - Added `HANDOFF_DRAFT_MAX_IMPORTANT_EVENTS`.
- `webview-ui/src/components/handoffDraftModel.ts`
  - New pure handoff draft model and redaction helpers.
- `webview-ui/test/handoff-draft-model.test.ts`
  - New focused model tests.
- `docs/roadmap/supervision/reports/W9-B-handoff-draft-model-report.md`
  - This report.

## Tests Added

Added focused webview tests covering:

- normal handoff draft generation
- empty/minimal timeline input
- usage summary inclusion
- mapping Usage History model totals into a handoff usage summary
- absolute local path redaction
- raw prompt/tool output/credential redaction

## Validation

- `npm run build`: passed
- `npm run test:webview`: passed, 96 tests
- `npm run test:server`: passed, 239 tests
- `git diff --check`: passed

## Known Limitations / W9-C Follow-Up

- W9-B does not add UI, buttons, persistence, export, git integration, or sharing.
- The action/decision and validation/test sections are placeholders for human or future model-assisted completion.
- The redaction helper is intentionally conservative and should be kept in the model path when W9-C adds UI.
