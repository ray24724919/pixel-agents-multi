# W11-B Handoff Work Package Queue Report

## Summary

W11-B turns repo-backed handoff artifacts into trackable executor work packages. Recent Handoffs can now create a repo-local work-package Markdown file, open it, copy an executor prompt for it, and update local dispatch status in the handoff metadata sidecar.

## Final Behavior

- Recent Handoffs shows **Create work package** when a handoff has valid `.handoff.json` metadata but no dispatch package yet.
- Work packages are written under:
  `docs/roadmap/supervision/work-packages/handoffs/<safe-slug>-work-package.md`
- Work-package Markdown references the source handoff path and includes cwd, branch name, report path, test expectations, blocked-flow rules, and the required DO NOT operations.
- Work-package prompt copy references the work-package file and source handoff file; it does not embed the handoff Markdown body.
- Existing package-backed handoffs show **Open work package**, **Copy work-package prompt**, and dispatch status controls.

## Metadata And Status Semantics

The handoff sidecar schema remains version 1 and is backwards-compatible. Existing W10/W11-A metadata without dispatch fields still parses.

W11-B adds optional metadata:

```json
"dispatchPackage": {
  "packageRelativePath": "docs/roadmap/supervision/work-packages/handoffs/example-work-package.md",
  "branchName": "product/handoff-example",
  "reportRelativePath": "docs/roadmap/supervision/reports/example-executor-report.md",
  "status": "draft",
  "createdAt": "2026-06-04T08:30:00.000Z",
  "updatedAt": "2026-06-04T08:30:00.000Z"
}
```

Allowed dispatch statuses are `draft`, `ready`, `dispatched`, `completed`, and `blocked`. Status changes update only the JSON sidecar, preserving both the handoff Markdown and the generated work-package Markdown.

## Privacy And Path Safety

- Webview requests send only `requestId`, repo-relative handoff path, and requested status.
- Extension host derives repo root, package path, branch name, report path, and prompt content.
- Helpers reject traversal, absolute paths, Windows drive paths, non-Markdown work-package targets, malformed sidecars, mismatched metadata, and invalid statuses.
- Timeline events and UI messages include repo-relative paths and metadata only.
- No raw transcript, tool output, credentials, handoff body, or absolute artifact paths are included in prompts, sidecars, timeline events, or webview requests.

## Timeline Events

W11-B adds safe persisted timeline events:

- `handoff.dispatch_package_created`
- `handoff.dispatch_package_opened`
- `handoff.dispatch_status_changed`

The persisted event allowlist now includes `dispatchStatus`, `packageRelativePath`, and `reportRelativePath`.

## Files Changed

- `src/constants.ts`
- `src/handoffArtifacts.ts`
- `src/PixelAgentsViewProvider.ts`
- `src/timelineEvents.ts`
- `src/timelineStore.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/src/components/timelinePageModel.ts`
- `webview-ui/src/hooks/timelineHistoryMessages.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `server/__tests__/handoffArtifacts.test.ts`
- `server/__tests__/timelineStore.test.ts`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- `webview-ui/test/timeline-page-model.test.ts`

## Validation

- `npm run build` passed.
- `npm run test:webview` passed: 129 tests.
- `npm run test:server` passed: 262 tests.
- `git diff --check` passed.

## Skipped Or Deferred

- No Team/Lab server, cloud sync, git staging, git commits, push, PR creation, delete, rename, or publish workflow was added.
- No broad Agent Center redesign was done.
