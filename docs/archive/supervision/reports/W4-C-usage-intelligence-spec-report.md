# W4-C Usage Intelligence Spec Report

Date: 2026-06-02
Branch: `product/w4-c-usage-intelligence-spec`

## Summary

Produced a docs-only Usage Intelligence product and technical specification for future analytics
work. No analytics UI, token parser, provider, or storage implementation was changed.

The spec defines how Pixel Agents Multi should evolve from live token counters into a local-first
Usage page covering provider, model, project, agent, session, time window, exact/estimated usage,
cache/reasoning/artifact categories, API proxy estimates, thresholds, anomalies, and export.

## Key Data Model Decisions

- Usage should be stored as normalized local records, with JSONL proposed first:
  `~/.pixel-agents/usage/usage-v1.jsonl`.
- Records should represent deltas or standalone observations, not uncorrected cumulative provider
  snapshots.
- Codex `token_count` snapshots need snapshot-to-delta normalization before aggregation.
- Claude streamed usage needs keyed de-duplication before analytics storage.
- Artifact estimates should remain separate from provider token usage and API proxy totals.
- Aggregate labels should roll up to mixed exact/estimated whenever any record in scope is
  estimated.
- Project grouping should support both local paths and redacted stable path hashes.
- API proxy estimate fields should carry explicit non-billing semantics.

## Chart and Table Proposal

The proposed full Usage page includes:

- Top summary with visible scope, token totals, proxy estimate, and exact/estimated counts.
- Provider breakdown with cache/reasoning split and Codex quota reset when available.
- Project breakdown ranked by token total and recent activity.
- Agent ledger with provider, model, project, team, session, token categories, accuracy label, and
  transcript action.
- Trend chart over hour/day/week/month buckets.
- Anomaly and threshold area for spikes, cache regressions, reasoning spikes, estimated-data
  dominance, and Codex quota warnings.
- Export button for JSON and CSV with redacted paths by default.

## External Reference Notes

Inspected `iangithub/llm-usage-dashboard` as product inspiration only:
<https://github.com/iangithub/llm-usage-dashboard>.

Relevant ideas for Pixel Agents Multi:

- Local-first dashboard posture.
- Provider and project usage grouping.
- Daily token trend chart.
- Quota/reset display.
- Explicit estimated-cost wording for subscription products.

Not used:

- Electron app structure.
- Provider scanner implementation.
- Any code.

## Unresolved Questions

- Whether the first implementation should stay with append-only JSONL or move directly to SQLite.
- How reliably model id can be extracted across Codex, Claude, teammates, restored sessions, and
  future providers.
- Which outcome signals should be normalized first: commits, tests, completed work packages, user
  approvals, or lifecycle completion events.
- Whether threshold settings should live in `~/.pixel-agents/config.json` or a dedicated usage
  settings file.
- How much transcript evidence to expose in exports when redaction is disabled.

## Validation

Command run:

```powershell
git diff --check
git diff --cached --check
```

Result: both passed.

## Files Changed

- `docs/roadmap/product/usage-intelligence-spec.md`
- `docs/roadmap/supervision/reports/W4-C-usage-intelligence-spec-report.md`
