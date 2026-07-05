# W2-G Seating Invariants Report

## Summary

Implemented durable office seating invariants in the webview office engine. Top-level active agents now require a valid workstation seat before using the typing state, idle agents release work seats, stale/imported seat assignments are repaired, and duplicate seat ownership is resolved through a centralized repair pass.

## Final Invariants

- Top-level active agents only enter `TYPE` when assigned to a valid `work` seat.
- Top-level active agents with no valid/available workstation remain active logically but visually non-typing.
- Idle top-level agents release work seats and use rest seats when a valid one is available.
- Persisted `seatId`, `workSeatId`, and `restSeatId` values are treated as preferences and validated before use.
- Layout rebuild/import runs seating repair, clearing stale, wrong-kind, unreachable, or duplicate assignments.
- Sub-agents keep their near-parent, no-permanent-desk behavior.

## Workstation Detection Rule

`layoutToSeats()` now classifies a seat as `work` only when the seat faces a credible workstation: at least one desk/table tile and at least one electronics tile must both appear in the facing cone, and the electronics tile must be on or adjacent to the desk/table tile. Default room split and painted work zones no longer make seats into work seats by themselves. Sofa and coffee-table lounge seating remains `rest` unless it genuinely faces desk/table plus electronics.

## Files Changed

- `webview-ui/src/office/layout/layoutSerializer.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/engine/characters.ts`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/zoneUtils.ts`
- `webview-ui/tsconfig.node.json`
- `webview-ui/test/seating-invariants.test.ts`

## Tests Added

Added `webview-ui/test/seating-invariants.test.ts` covering:

- active agent uses a valid work seat at desk plus PC
- active agent never types in a rest seat
- no workstation means no top-level `TYPE` in place
- idle agent releases work seat and prefers rest
- layout import repairs stale seat assignment
- duplicate seat ownership is repaired
- sofa plus coffee table remains rest
- sub-agent behavior remains stable

## Validation

- `npm run build`: passed.
- `npm test`: passed.
- Webview tests: 16 passed.
- Server tests: 189 passed.
- Final total: 205 tests passed.

## Remaining Edge Cases

Layouts with zero valid workstation seats intentionally leave active top-level agents visible and active but non-typing/non-seated. That is the desired safe fallback for W2-G; users need to add a desk/table plus electronics workstation to get typing-at-desk animation.
