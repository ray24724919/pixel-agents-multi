# W10-B - Handoff Artifact Library Report

## Summary

W10-B adds a repo-centered Handoff Artifact Library for the existing Timeline / Handoff flow. The extension now scans the current workspace repo's `docs/agent-handoffs/` directory for recent Markdown handoff files, exposes a bounded newest-first list to the webview, and lets the user open validated handoff artifacts from the Timeline surface.

The existing W10-A write flow now refreshes the Recent Handoffs list and emits a retained Timeline event when a handoff draft is generated. Opening a recent handoff emits a retained Timeline event as well.

## Files Changed

- `src/constants.ts`
- `src/handoffArtifacts.ts`
- `src/PixelAgentsViewProvider.ts`
- `src/timelineEvents.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/src/components/timelinePageModel.ts`
- `webview-ui/src/hooks/timelineRetention.ts`
- `server/__tests__/handoffArtifacts.test.ts`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- `webview-ui/test/timeline-page-model.test.ts`
- `webview-ui/test/timeline-retention.test.ts`

## Final Behavior

- The extension loads recent handoff artifacts on webview startup and on explicit refresh.
- The library scans only `docs/agent-handoffs/` in the current workspace repo.
- The recent list is bounded to 25 Markdown files, newest first.
- Each item exposes only safe metadata: repo-relative path, filename, modified time, size, and first Markdown heading when available.
- The Timeline page shows a compact `Recent Handoffs` section with Refresh and Open actions.
- Empty and unavailable states are visible.
- After a W10-A `Write to Repo` succeeds, the library refreshes automatically.

## Privacy And Path Safety

- The webview cannot choose arbitrary filesystem paths.
- Open requests use only repo-relative paths and are validated in the extension host.
- Open validation rejects traversal, absolute paths, drive-letter paths, backslashes, non-Markdown files, files outside `docs/agent-handoffs/`, and nested subdirectories.
- The library does not scan arbitrary folders and does not read raw transcripts.
- The title extractor reads only a small heading scan window and redacts obvious absolute local paths, raw prompt/tool output/transcript/credential-style headings, and OpenAI-style secret tokens.
- Timeline events include only safe repo-relative path / filename metadata and do not include Markdown bodies.

## Timeline Events

- `handoff.generated` is posted after a handoff draft is successfully written to the repo.
- `handoff.opened` is posted after a recent handoff artifact is successfully opened.
- Handoff events are retained after agent removal, searchable in Timeline, and displayed with a `Handoff` history pill.

## Validation

- `npm run build`: passed.
- `npm run test:webview`: passed, 114 tests.
- `npm run test:server`: passed, 246 tests.
- `git diff --check`: passed.
- `git status --short --branch`: branch `product/w10-b-handoff-artifact-library` with only intended W10-B changes before commit.

## Skipped Steps

No desktop/manual VS Code QA was performed. This package was validated through build, webview tests, server tests, and diff checks.
