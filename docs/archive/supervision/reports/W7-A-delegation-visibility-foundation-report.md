# W7-A Delegation Visibility Foundation Report

## Summary

Implemented the provider-agnostic delegation visibility foundation for Agent Center 2.0. The patch adds a normalized delegation model, derives supervisor/worker state from existing webview data, surfaces delegation on the Agents page, and retains/searches delegation timeline history.

No backend provider behavior, terminal handling, token parsing, or office/canvas mini-worker visuals were changed.

## Invariants Implemented

- Delegation is represented by a normalized `DelegationSummary` with provider-neutral statuses:
  - `none`
  - `delegating`
  - `waiting_for_delegate`
  - `delegate_error`
- Delegation can be derived from existing webview state:
  - `subagentCharacters`
  - `subagentTools`
  - team lead/member metadata
- Codex and Claude use the same model path.
- Supervisors with workers are shown as supervising/delegating on the Agents page.
- Worker counts are visible as compact labels such as `2 workers`.
- Agent search/filter/sort is delegation-aware.
- `delegation.*` timeline events are retained like action history and remain searchable/filterable.

## Files Changed

- `webview-ui/src/components/delegationModel.ts`
  - New pure delegation read model.
  - Builds `DelegationSummary` values from subagent and team metadata.
- `webview-ui/src/components/agentCenterListModel.ts`
  - Adds delegation-aware status grouping, search text, and sort priority.
- `webview-ui/src/components/AgentCenter.tsx`
  - Threads subagent data into Agent Center.
  - Shows delegation badges, supervisor status, worker counts, and detail-panel worker summaries.
- `webview-ui/src/App.tsx`
  - Passes subagent webview state to Agent Center.
- `webview-ui/src/components/timelinePageModel.ts`
  - Treats `delegation.*` events as retained action-like history.
  - Adds delegation-aware timeline search metadata.
- `webview-ui/src/hooks/timelineRetention.ts`
  - Keeps delegation events after agent removal.
- `webview-ui/test/delegation-model.test.ts`
  - New focused delegation model coverage.
- `webview-ui/test/agent-center-list-model.test.ts`
  - Delegation-aware search/filter/sort coverage.
- `webview-ui/test/timeline-page-model.test.ts`
  - Delegation retention and search/filter coverage.
- `webview-ui/test/timeline-retention.test.ts`
  - Delegation event retention coverage.

## Tests Added

- Provider-agnostic subagent delegation summaries for Codex and Claude.
- Team lead/member terminal-backed delegation summary.
- Delegation-aware Agents page search and filter behavior.
- Delegating supervisors sort ahead of waiting/active agents while still behind urgent/error states.
- Missing-agent `delegation.*` timeline events remain visible.
- Delegation timeline events are searchable and filterable through existing timeline model controls.
- Delegation retention survives agent close/archive removal paths.

## Validation

- `npm run build`: passed.
- `npm run test:webview`: passed, 60 tests.
- `git diff --check`: passed.

## Remaining Work

- No Windows desktop, Extension Host, browser, screenshot, or manual QA was performed because W7-A was explicitly constrained to code plus automated tests while the user is actively using the desktop.
- Canvas/office mini-worker visuals remain intentionally out of scope for W7-A and should be handled by W7-B.
