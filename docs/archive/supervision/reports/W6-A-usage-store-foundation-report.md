# W6-A Usage Store Foundation Report

Date: 2026-06-02
Branch: `product/w6-a-usage-store-foundation`

## Summary

Added a local-first normalized Usage Store foundation without wiring it into runtime ingestion. The
new module defines the `UsageRecordV1` shape from the Usage Intelligence spec, append-only JSONL
helpers, export-safe path hashing/redaction helpers, and factory helpers for provider usage deltas,
artifact estimates, and rate-limit snapshots.

No `webview-ui/**`, `AgentCenter.tsx`, `transcriptParser`, `agentManager`, or
`PixelAgentsViewProvider` runtime wiring was changed.

## Files Changed

- `src/constants.ts`
- `src/usageStore.ts`
- `server/__tests__/usageStore.test.ts`
- `docs/roadmap/supervision/reports/W6-A-usage-store-foundation-report.md`

## Data Model Decisions

- Usage records are append-only JSONL under `~/.pixel-agents/usage/usage-v1.jsonl`.
- `UsageRecordV1` supports `usage_delta`, `artifact_estimate`, `rate_limit_snapshot`, and
  `session_summary` record kinds.
- Usage delta records store provider tokens only. Artifact tokens are forced to zero in the usage
  delta factory.
- Artifact estimate records store artifact tokens only and do not create API proxy estimates.
- Provider totals remain `input + cache read + cache write` and `output + reasoning output`.
- `displayTotal` excludes artifact estimates by default, matching the spec.
- API proxy estimates include `API proxy estimate only` and `Not actual subscription billing`
  wording fields.
- Project and transcript paths are redacted by default into stable `sha256:` hashes; raw paths are
  included only when a caller explicitly opts in.
- The store reader skips malformed JSONL lines and invalid record shapes so one bad line does not
  hide valid history.

## Tests Added

Added `server/__tests__/usageStore.test.ts` covering:

- Directory creation under the expected local-first path.
- Append/read JSONL roundtrip.
- Malformed-line tolerance.
- Stable redacted path hashing.
- Artifact estimate separation from provider and API proxy totals.
- Rate-limit snapshot record shape.

## Validation

Commands run:

```powershell
npm run check-types
npm run build
npm run test:webview
npm run test:server
git diff --check
```

Results:

- `npm run check-types`: passed.
- `npm run build`: passed.
- `npm run test:webview`: 32 passed.
- `npm run test:server`: 210 passed.
- Combined test count: 242.
- `git diff --check`: passed.

## Notes

Validation was run from a clean W6-A git worktree because the original checkout received unrelated
W5-D webview changes while this package was in progress. Those W5-D files were left untouched.
