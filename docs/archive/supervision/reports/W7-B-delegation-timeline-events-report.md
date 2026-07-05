# W7-B Delegation Timeline Events Report

## Summary

Implemented automatic, provider-agnostic delegation timeline event emission from existing webview state transitions. W7-A made delegation visible in Agent Center and retained `delegation.*` events; W7-B now generates those events from subagent/team worker state instead of requiring backend/provider-specific messages.

No backend provider logic, terminal launch behavior, canvas/office mini-worker visuals, or desktop/manual QA paths were changed.

## Event Model

Added `webview-ui/src/components/delegationTimelineModel.ts`, a pure transition helper that compares previous and current `DelegationSummary` snapshots and returns timeline event intents for:

- `delegation.started`
- `delegation.progress`
- `delegation.completed`
- `delegation.failed`
- `delegation.cancelled`

Duplicate/spam prevention:

- `started` only emits when a supervisor moves from no delegates to one or more delegates.
- `progress` only emits when meaningful status/count/source/team signature changes.
- `completed`, `failed`, and `cancelled` emit only on terminal transitions.
- Removing a summary after it already reached `waiting_for_delegate` or `delegate_error` does not emit another terminal event.

## Webview Integration

Updated `webview-ui/src/hooks/useExtensionMessages.ts` to:

- Build provider-agnostic delegation summaries from `agents`, `subagentCharacters`, `subagentTools`, parent `agentTools`, team metadata, and lifecycle status.
- Compare each new snapshot against the previous snapshot.
- Append generated events into the existing `agentTimelineEvents` array using the same retained timeline path as backend-posted events.
- Preserve safe display metadata for removed supervisors so terminal events still show provider/project/name after close/archive.
- Use transition hints:
  - `subagentClear` means completed unless the previous state was already terminal.
  - `agentToolsClear`, `agentClosed`, and `agentArchived` mean cancelled unless the previous state was already terminal.

## Privacy

Generated event summaries and payloads only include safe metadata:

- provider
- project display name
- supervisor agent id/name
- worker counts
- delegate source
- team name
- session id basename when already available
- run id when already available

They do not include raw prompts, raw tool output, raw transcript text, delegate labels, or raw absolute transcript paths.

## Files Changed

- `webview-ui/src/components/delegationTimelineModel.ts`
- `webview-ui/src/components/delegationModel.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/test/delegation-timeline-model.test.ts`
- `webview-ui/test/delegation-model.test.ts`

## Tests Added

- Started transition.
- Progress transition.
- Completed transition.
- Failed transition and no duplicate failed event after removal.
- Cancelled transition.
- Completion hint for `subagentClear`.
- Parent Task/Agent tool completion feeding `DelegationSummary`.
- Privacy guard that timeline summaries/payloads do not include raw delegate labels.

## Validation

- `npm run build`: passed.
- `npm run test:webview`: passed, 67 tests.
- `git diff --check`: passed.

## Remaining Work

- No Windows desktop automation, Extension Host manual QA, browser QA, or screenshots were performed because W7-B was constrained to code plus automated tests while the user may be using the desktop.
- Office/canvas mini-worker visuals remain intentionally out of scope for W7-B and should be handled by W7-C.
