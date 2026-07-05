# Work Package W2-G - Seating invariants and workstation routing

## Context

After importing the old Pixel Agents layout from `C:\Users\User\Downloads\.pixel-agents`,
the user confirmed the office decoration loaded, but the same class of visual bugs remains a
concern:

- active agents do not reliably sit at computer desks
- idle agents can stay in work areas instead of rest areas
- agents can appear to stand on chairs
- agents can type while facing empty air
- agents can sit in a rest area while showing the typing animation

The imported layout itself is not obviously broken. A local inspection of
`C:\Users\User\.pixel-agents\layout.json` showed:

- layout size: `21 x 22`
- furniture count: `57`
- seat count derived from chair furniture: `34`
- work seats currently classified by the engine: `8`
- all current work seats are `computer-adjacent`

This means the durable fix should live in the webview office engine, not in one specific
layout file. The engine needs enforceable seating invariants.

## Current root causes to investigate before coding

Read these files first:

- `webview-ui/src/office/layout/layoutSerializer.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/engine/characters.ts`
- `webview-ui/src/office/zoneUtils.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/src/office/components/OfficeCanvas.tsx`
- `webview-ui/src/office/engine/renderer.ts`

Observed weak points:

1. `layoutToSeats()` classifies seats as `work` when either:
   - the seat is near electronics, or
   - the tile zone is inferred as work.

   That is too broad. A real work seat should be a chair/bench seat that is associated with
   a reachable workstation: desk/table surface plus computer/electronics in the direction
   the character faces, or an explicitly painted work-seat override in a future feature.

2. `updateCharacter()` still permits active agents to enter `TYPE` with no seat:
   - `IDLE -> active`: "No seat assigned - type in place"
   - `WALK complete -> active`: "No seat - type in place"

   This is the direct source of "typing at empty air." A working agent should never use the
   typing animation unless it owns a valid work seat.

3. Stored seat assignments are persisted separately in `WORKSPACE_KEY_AGENT_SEATS`. After a
   layout import, those old `seatId` values may still be syntactically present but semantically
   wrong. The rebuild path tries to preserve them if the seat still exists and kind matches,
   but it does not validate whether the seat is still reachable and workstation-valid.

4. `setAgentActive(false)` currently randomly tries to seat idle agents at rest seats, but
   idle behavior can still fall back to wandering and later claim rest seats without a global
   repair pass. That is fine for wandering, but idle agents must not remain assigned to work
   seats.

5. Sub-agents are spawned onto nearby walkable tiles and are expected to work near the parent.
   This package should not over-constrain sub-agents into permanent desks; keep sub-agents
   visually near the parent unless a later package gives them explicit seating semantics.

## Goal

Introduce durable seating invariants so the office simulation has hard guarantees:

1. **Active top-level agents only type at valid workstations.**
2. **Idle top-level agents do not occupy work seats.**
3. **A seat assignment is repaired when the layout changes, the agent changes activity state,
   or the assigned seat becomes invalid/unreachable.**
4. **The engine never falls back to "TYPE in place" for top-level active agents.**
5. **Rest seats remain valid places to sit, but rest sitting must not imply work typing.**

## Non-goals

Do not:

- edit or normalize the user's imported `C:\Users\User\.pixel-agents\layout.json`
- redesign the layout editor UI
- add a visual zone-paint workflow
- change provider/session adoption logic
- change hidden/archive/kill behavior
- force sub-agents to use work seats
- build a full seating debugger UI

Small debug/test helpers are okay if they remain internal and unobtrusive.

## Proposed model

### Seat classification

Keep `Seat['seatKind'] = 'work' | 'rest'`, but make `work` stricter.

Add a derived workstation validator, for example:

```ts
interface WorkstationMatch {
  valid: boolean;
  deskUid?: string;
  electronicsUid?: string;
  reason: 'facing-computer-desk' | 'near-computer-desk' | 'zone-only' | 'none';
}
```

The exact type shape is flexible, but the behavior must be explicit.

A seat should be classified as `work` only when the engine can identify a credible workstation.
Preferred rule:

- starting from the seat tile and `facingDir`, scan a short cone/ray in front of the seat
  using the same broad idea as `findNearestFacedOnCapableFurniture()`
- require a desk/table surface or desk furniture in that direction
- require electronics either on that surface or adjacent to it
- side-facing chairs should work when the PC/desk is left/right as appropriate
- benches can be work seats if they are directly paired with a desk/computer

Fallback:

- If this is too invasive for one package, allow `computer-adjacent` as a temporary work
  classifier only when the seat also has an adjacent desk/table tile.
- Do not classify a seat as work from default split alone.
- Do not classify sofas/couches around coffee tables as work unless they face a real
  electronics workstation.

Rest seats are any valid chair/sofa/bench seats that are not workstation-valid.

### Seat validity

Add a single authority function in `OfficeState` or a small helper module:

```ts
isSeatValidForAgent(ch: Character, seat: Seat, mode: 'work' | 'rest'): boolean
```

It should check:

- seat exists
- seat kind matches requested mode
- seat tile is inside the layout
- the seat is not assigned to another character
- a path exists from the character to the seat, with the character's own current seat
  temporarily unblocked
- for work mode: workstation match is valid
- for rest mode: seat is not a work seat

Do not scatter these checks across multiple call sites.

### Repair pass

Add a deterministic repair pass, for example:

```ts
repairSeatingAssignments(reason: 'layout' | 'active' | 'idle' | 'tick'): void
```

It should:

1. Clear impossible or semantically wrong assignments.
2. Ensure no two top-level characters own the same seat.
3. For active top-level agents:
   - preserve current work seat if still valid
   - otherwise use `workSeatId` if valid
   - otherwise pick a reachable free work seat
   - if none exists, keep the character non-typing and in a safe walkable/idle state
4. For idle top-level agents:
   - release work seats
   - preserve/use rest seats when valid
   - otherwise wander in non-work walkable tiles
5. Leave sub-agents alone except for bounds/walkability repair.

Call this repair pass from:

- `rebuildFromLayout()`
- `addAgent()`
- `setAgentActive()`
- `reassignSeat()`
- after imported `layoutLoaded`

It does not need to run every animation tick if the above call sites are sufficient.

### State transitions

Remove top-level `TYPE in place` fallbacks.

When a top-level active agent has no valid work seat:

- do not set `CharacterState.TYPE`
- try to assign and path to a work seat
- if no work seat is available, keep the character idle/walking on a non-seat walkable tile
  and optionally keep `isActive=true` so Agent Center still reflects work state
- the character can show active status text/bubble, but must not use the seated typing
  animation

When an idle top-level agent finishes a turn:

- if it was at a work seat, release that seat
- prefer rest seats
- otherwise wander using `idleWalkableTiles`
- never sit at a work seat just because the old `seatId` still points there

### Walking and blocked tiles

Keep the existing "own seat unblocked" logic, but centralize it in the validator/repair
functions. Avoid creating a new pathfinding special case at every call site.

If a seat tile is blocked for everyone except its owner, a candidate owner must be allowed to
path to it during assignment validation.

### Persisted seat assignments

Persisted `seatId` values should be treated as preferences, not truth.

On `existingAgents` + `layoutLoaded`:

- add characters with the preferred seat
- immediately validate the preferred seat against current activity mode
- repair if invalid
- after repair, call the existing `saveAgentSeats()` so workspaceState converges to valid data

This is especially important after importing an old layout.

## Tests

Add focused tests. Prefer pure Node/Vitest tests around office engine functions if practical.
If current webview tests use Node's built-in runner, follow the existing pattern.

Required coverage:

1. **Active agent uses work seat**
   - layout with one desk + PC + chair
   - add active agent
   - assert `seatKind === 'work'`, state can become `TYPE`, direction faces workstation

2. **Active agent never types in rest seat**
   - layout with only sofa/rest seats
   - add/set active agent
   - assert character is not in `TYPE` with a rest seat

3. **No work seat means no TYPE in place**
   - layout with no valid workstation
   - set agent active
   - assert `ch.isActive === true` may remain true, but `ch.state !== CharacterState.TYPE`
     unless a valid work seat exists

4. **Idle releases work seat**
   - active agent at work seat
   - call `setAgentActive(false)`
   - assert its work seat is no longer assigned to that agent
   - assert it either owns a rest seat or has `seatId === null`

5. **Layout import repairs stale seat**
   - create agent with persisted seat id that used to be work
   - rebuild layout where that seat is rest/unreachable
   - assert the agent is reassigned to a valid work seat or does not type

6. **Duplicate seat ownership is repaired**
   - two agents with same preferred seat
   - after repair, at most one owns it

7. **Rest seats around coffee tables remain rest**
   - sofa + coffee table, no electronics
   - assert seats are rest even if default split would otherwise call the tile work

8. **Sub-agent behavior remains stable**
   - parent active at work seat
   - create sub-agent
   - assert sub-agent still spawns near parent and is not forced into a permanent work seat

## Acceptance criteria

After implementation, build, package, install, and reload:

1. Active top-level agents move to computer desks before typing.
2. No top-level active agent types while seated in the lounge/rest area.
3. No top-level active agent types while standing on a random floor tile.
4. Idle top-level agents do not keep occupying computer-desk work seats.
5. Agents no longer stand on chair tiles except as part of valid seated rendering.
6. Importing an old layout does not preserve invalid old seat assignments.
7. If all work seats are occupied, extra active agents do not type at empty air.
8. Existing sub-agent visual behavior is not broken.
9. `npm run build` passes.
10. `npm test` passes, with new tests documented in the report.

## Suggested executor branch

`cleanup/w2-g-seating-invariants`

## Report

Write:

`docs/roadmap/supervision/reports/W2-G-seating-invariants-report.md`

The report must include:

- final invariants implemented
- chosen workstation detection rule
- files changed
- test cases added
- build/test results and final test count
- any remaining edge cases, especially if a layout has zero valid workstations

## Verification notes

The user's current imported layout at `C:\Users\User\.pixel-agents\layout.json` is a useful
runtime verification fixture:

- 8 work seats should be detected at the left computer desks
- lounge sofas around coffee tables should remain rest seats
- multiple active Codex/Claude agents should occupy the computer desk seats first
- idle agents should prefer lounge/rest seating or non-work walking space

Do not commit or overwrite that user-level layout file.
