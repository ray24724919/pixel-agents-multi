# W10-C - Handoff Artifact Manifest Report

## Summary

W10-C adds a local machine-readable metadata sidecar for repo-centered handoff artifacts. Handoff Markdown files remain human-editable, while a compact JSON sidecar next to the Markdown gives future indexers a safe schema for filtering, status, identity, and Timeline correlation.

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
- `webview-ui/test/timeline-history-messages.test.ts`
- `webview-ui/test/timeline-page-model.test.ts`

## Metadata Format

Chosen format: JSON sidecar next to the Markdown handoff:

- Markdown: `docs/agent-handoffs/2026-06-04-1507-pixel-agents-multi-handoff.md`
- Metadata: `docs/agent-handoffs/2026-06-04-1507-pixel-agents-multi-handoff.handoff.json`

Example:

```json
{
  "schemaVersion": 1,
  "artifactId": "2026-06-04-1507-pixel-agents-multi-handoff",
  "artifactType": "handoff",
  "markdownRelativePath": "docs/agent-handoffs/2026-06-04-1507-pixel-agents-multi-handoff.md",
  "title": "Handoff Draft - Pixel Agents Multi",
  "status": "draft",
  "createdAt": "2026-06-04T07:07:00.000Z",
  "updatedAt": "2026-06-04T07:07:00.000Z",
  "providerId": "codex",
  "projectName": "Pixel Agents Multi",
  "agentName": "Codex Lead",
  "sessionId": "session-123",
  "runId": "W10-C"
}
```

Status values supported by the parser/model are `draft`, `published`, `reviewed`, and `stale`. W10-C writes new handoffs as `draft`.

## Final Behavior

- W10-A `Write to Repo` now writes both the Markdown handoff and the `.handoff.json` sidecar.
- The Recent Handoffs library reads sidecar metadata when present.
- Recent Handoffs shows sidecar status and updated time.
- New handoff write acknowledgements include `artifactId`, `metadataRelativePath`, and `status`.
- `handoff.generated` and `handoff.opened` Timeline events carry safe `artifactId` and `artifactStatus` fields and persist them through Timeline history.

## Fallback Behavior

Old W10-A/W10-B Markdown-only handoffs still work:

- If no sidecar exists, the library falls back to Markdown filename, first heading, file mtime, and file size.
- If a sidecar is malformed, wrong schema version, unsafe, or mismatched with the Markdown path/artifact id, the library ignores it and falls back to Markdown-only behavior.
- Markdown-only rows display `Markdown only` status.

## Privacy And Path Safety

- Metadata uses repo-relative paths only.
- Sidecar paths must stay directly under `docs/agent-handoffs/` and must end in `.handoff.json`.
- `markdownRelativePath` must point to a direct `.md` file under `docs/agent-handoffs/`.
- `artifactId` is derived from the Markdown filename and must match a safe lowercase repo-local identifier.
- Metadata rejects traversal, absolute paths, drive-letter paths, backslashes, nested sidecar paths, invalid statuses, invalid timestamps, and artifact id/path mismatches.
- Metadata does not include Markdown body, raw transcript text, raw tool output, arbitrary payloads, or absolute local paths.
- Metadata string fields are redacted for obvious local paths, raw prompt/tool output/transcript/credential headings, and secret-looking tokens.

## Validation

- `npm run build`: passed.
- `npm run test:webview`: passed, 115 tests.
- `npm run test:server`: passed, 251 tests.
- `git diff --check`: passed.
- `git status --short --branch`: branch `product/w10-c-handoff-artifact-manifest` with only intended W10-C changes before commit.

## Skipped Steps

No desktop/manual VS Code QA was performed. W10-C was validated with build, webview tests, server tests, and diff checks.
