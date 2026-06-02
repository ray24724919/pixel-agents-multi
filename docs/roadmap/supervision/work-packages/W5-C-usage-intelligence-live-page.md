# Work Package W5-C - Usage Intelligence Live Page

## Context

W5-A added Agent Center 2.0 page navigation. W5-B deepened the Agents page into a searchable,
sortable management surface. The Usage page still needs to move beyond a simple token summary toward
the Usage Intelligence direction described in:

```text
docs/roadmap/product/usage-intelligence-spec.md
```

This package implements a live-session Usage Intelligence MVP using data already available in the
webview. It does not add durable usage storage, transcript backfill, provider API calls, export, or
threshold settings.

## Goal

Make the Usage page more useful for supervising current live agents:

- Aggregate visible live agents by provider, project, and agent.
- Keep provider token totals separate from artifact estimates.
- Show input/output/cache/reasoning/artifact categories with clear wording.
- Distinguish exact provider-reported usage, estimated usage, mixed usage, and no usage.
- Surface local live signals such as estimated-only data, usage concentration, reasoning-heavy
  output, artifact-heavy views, and Codex quota snapshots.
- Keep the existing `TokenCostSummary` proxy estimate wording and avoid billing language.
- Keep this package frontend-only except docs/tests.

## Non-Goals

Do not:

- create `~/.pixel-agents/usage/usage-v1.jsonl`,
- implement normalized usage record ingestion,
- parse new provider metadata,
- backfill transcripts,
- add export,
- add configurable thresholds,
- call provider APIs,
- change Hide/Archive/Kill, discovery, hooks, or terminal launch behavior.

## Implementation Guidance

Prefer a pure helper model:

```text
webview-ui/src/components/usageIntelligenceModel.ts
```

The model should accept live agent summaries and produce:

- totals,
- provider summaries,
- project summaries,
- ledger rows,
- category summaries,
- live insights.

Keep the React page focused on rendering. Add tests for aggregation, sorting, accuracy labeling, and
insight generation.

## Validation

Run:

```powershell
npm run check-types
npm run build
npm run test:webview
npm run test:server
git diff --check
```

W5-B baseline:

- webview tests: 28
- server tests: 204
- combined: 232

Expected W5-C count should be greater than 232 if model tests are added.

## Report

Write:

```text
docs/roadmap/supervision/reports/W5-C-usage-intelligence-live-page-report.md
```

Include summary, files changed, model behavior, UI behavior, validation commands and test counts,
manual/visual QA notes, and follow-up work.
