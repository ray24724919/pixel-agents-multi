# W7-C Office Delegation Visuals Report

## Summary

Implemented the code-only office/canvas visual phase for delegation. Supervisors with active delegated workers now keep a provider-agnostic delegation marker in office state, remain in working/supervising behavior while active delegates exist, and render a compact canvas marker plus overlay text.

No desktop automation, VS Code Extension Host QA, installed VSIX QA, screenshots, or manual visual QA were performed in this phase.

## Visual Change

- Added a compact pixel-style marker near the supervisor character.
- The marker displays a safe count such as `2w`.
- The marker includes a small status dot:
  - active workers: blue
  - completed workers: green
  - failed workers: red
- Hover/selected overlays show safe text such as `Supervising / 2 workers`.
- The visual is provider-agnostic and uses the same path for Codex and Claude delegation.

## Office Behavior

- Added `DelegationVisualState` on top-level office characters.
- Active delegation promotes an otherwise idle supervisor to active/work behavior.
- If active delegates exist, `setAgentActive(false)` does not send the supervisor back to rest.
- With a valid workstation, delegating supervisors acquire or preserve a valid work seat.
- With zero valid workstation seats, a delegating supervisor stays logically active but does not enter `TYPE` in place.
- Completed/error marker states can remain visible without forcing an idle supervisor into work behavior unless active delegates still exist.
- Internal/subagent delegates remain subagents and are not converted into full top-level office agents.

## Files Changed

- `webview-ui/src/constants.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/src/office/delegationVisual.ts`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/engine/characters.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/engine/renderer.ts`
- `webview-ui/src/office/components/ToolOverlay.tsx`
- `webview-ui/test/office-delegation-visuals.test.ts`

## Tests Added

- Delegation marker data is derived from `DelegationSummary` and does not include raw delegate labels.
- Active delegation moves an idle supervisor to valid work behavior instead of rest behavior.
- Active delegation prevents `setAgentActive(false)` from returning the supervisor to rest while delegates remain active.
- No-workstation layouts keep delegating supervisors non-typing instead of typing in place.
- Completed delegation markers do not promote idle supervisors to active.
- Delegation visuals do not convert subagents into top-level office agents.

## Validation

- `npm run build`: passed.
- `npm run test:webview`: passed, 72 tests.
- `git diff --check`: passed.

## Manual QA Steps For Supervisor

1. Install or run the extension in VS Code after this branch is available.
2. Open Pixel Agents on the Office page with at least one Codex or Claude supervisor that starts a delegated Task/Agent/subagent flow.
3. Confirm the supervisor remains at a valid workstation while active delegated workers exist.
4. Confirm the supervisor shows a compact marker such as `2w` near the character.
5. Hover or select the supervisor and confirm the overlay shows `Supervising / N workers`.
6. Confirm internal/subagent delegates do not appear as full independent top-level office agents seated at normal desks.
7. Let delegated work complete/fail/cancel and confirm the marker/status updates or clears without blanking the office.
8. Confirm no prompt text, tool output, transcript text, or raw paths appear in the marker or overlay.

READY_FOR_VISUAL_QA
