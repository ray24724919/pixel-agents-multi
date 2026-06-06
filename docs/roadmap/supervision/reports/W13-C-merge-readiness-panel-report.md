# W13-C Merge Readiness Panel Report

## Summary

Added a read-only merge readiness decision surface for package-backed handoffs in Agent Center. W13-C builds on the W13-A completion review payload and W13-B review cues by deriving a compact merge-readiness status, showing branch/report/validation/warning cues, and offering a safe copy-only manual merge checklist.

## Files Changed

- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- `docs/roadmap/supervision/reports/W13-C-merge-readiness-panel-report.md`

## Final Behavior

- Package-backed handoffs now show a compact merge-readiness panel in both Recent Handoffs and Handoff Queue.
- Readiness states are derived from existing safe review/completion data:
  - already merged
  - ready to inspect
  - needs report
  - needs review
  - blocked
  - active
  - unknown
- The panel shows safe supervisor cues:
  - branch status
  - report availability
  - validation present/missing/unknown
  - warning count
  - recommended manual next step
- Added `Copy merge checklist`, which copies safe text only. It references repo-relative handoff/work-package/report paths and branch/status cues, but does not run git or include report bodies.
- Existing buttons and behavior remain intact: Open report, Refresh completion, Mark reviewed, Mark stale, Reset draft, Launch Codex, and Launch Claude.

## Safety / Guardrails

- No backend code changed.
- No child process, shell execution, or git mutation behavior was added.
- The webview cannot merge, push, rebase, reset, stash, clean, or checkout branches.
- Manual checklist text excludes raw report bodies, transcripts, tool output, credentials, and absolute local paths.
- Launch behavior for Codex and Claude was not changed.

## Tests Added

Added focused webview model tests for:

- merge readiness mapping for merged, ready-to-merge, needs-review, needs-report, active, blocked, and unknown states
- manual merge checklist safety, including repo-relative fields and redaction/no leakage of unsafe-looking absolute paths, raw prompt text, tool output, and report body text

## Validation

- `npm run build` - passed
- `npm run test:webview` - passed, 143 tests
- `npm run test:server` - passed, 281 tests

Combined test count: 424 tests.

## Known Limitations / Follow-Up

- W13-C is intentionally read-only and copy-only. It does not inspect branches directly from the webview and does not perform merges.
- The manual checklist is a lightweight decision aid; future packages can add richer branch comparison details as long as they remain read-only and safe.
