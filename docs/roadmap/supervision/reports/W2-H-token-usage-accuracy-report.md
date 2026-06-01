# W2-H Token Usage Accuracy Report

## Summary

Implemented a focused token-usage accuracy pass for Codex and Claude agents.

Claude usage now treats exact streamed assistant usage records as snapshots keyed by request/message identity, so repeated stream updates for the same assistant message keep the latest usage instead of double-counting. Codex `token_count` parsing now carries total usage, last-turn usage, token detail fields, and rate limit snapshots through the extension and into the Agent Center display.

## Token Model

Added a small internal token detail model with these fields:

- `input`
- `output`
- `reasoningOutput`
- `cacheRead`
- `cacheWrite`
- `artifactEstimate`
- `estimated`

The existing top-level `inputTokens`, `outputTokens`, and `artifactOutputTokens` fields remain the UI-compatible summary. Input totals include cache read/write tokens, and output totals include reasoning output tokens.

## Claude Accuracy

Claude exact usage records now derive a stable usage key from request id plus message id when available, with message id as a fallback. During transcript scans, keyed exact usage records are stored in a map and only the latest record for each key contributes to the total.

During live parsing, each keyed exact usage record is applied as a delta from the previous snapshot for the same key. This prevents streamed assistant usage updates from inflating the visible usage count.

## Codex Parsing

Codex `token_count` parsing now supports:

- `total_token_usage` for the current cumulative agent display.
- `last_token_usage` for future daily/monthly/project aggregation work.
- `rate_limits.primary` and `rate_limits.secondary` snapshots when present.
- Cache and reasoning detail fields without flattening them away.

Codex cached input is split out of `input_tokens` when `cached_input_tokens` is present, matching the dashboard collector's approach so cached input is visible without being double-counted.

The latest Codex rate limit snapshot is passed to the webview. The Agent Center and token summary can show quota percentage and reset countdown when the provider supplies those fields.

## Display

Agent Center token details now distinguish exact provider usage from estimated transcript-derived usage. Reasoning and cache token boxes appear when those fields are present. Codex quota usage/reset text appears when rate limit snapshots are available.

TokenCostSummary now labels provider totals as exact or estimated and includes reasoning/cache detail lines when present.

## Files Changed

- `src/tokenUsage.ts`
- `src/transcriptParser.ts`
- `src/types.ts`
- `src/agentManager.ts`
- `src/PixelAgentsViewProvider.ts`
- `server/src/providers/file/codex/codex.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/engine/characters.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/TokenCostSummary.tsx`
- `server/__tests__/claudeAdoption.test.ts`
- `server/__tests__/codex.test.ts`
- `server/__tests__/codexFollowon.test.ts`
- `server/__tests__/tokenUsage.test.ts`

## Tests Added

- Claude live streamed usage updates for the same request/message do not double-count.
- Transcript-level Claude streamed usage keeps only the latest usage snapshot.
- Claude cache and reasoning fields remain available in token details.
- Codex `token_count` details and rate limit snapshots are parsed.
- Codex cached input is split into cache details without inflating input totals.

## Validation

- `npm run check-types`: passed.
- `npm run lint`: passed.
- `npm test`: passed.
  - Webview tests: 17 passed.
  - Server tests: 199 passed.
  - Total tests: 216 passed.
- `npm run build`: passed.

Note: `npm test` initially failed in `claude-hook.js integration > reads stdin and POSTs to server` before the hook bundle was refreshed. Running `node esbuild.js` rebuilt `dist/hooks/claude-hook.js`; the final full `npm test` passed.

## Commit Status

Included in the W2-H commit after supervisor cleanup. Unrelated VS Code workspace settings and lockfile dependency churn were intentionally left unstaged.
