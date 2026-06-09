# W18-S Project Room Default And Growth Plan Report

## Summary

W18-S fixes the generated project-room default style so furniture no longer reads as clipped against
room edges. The generated room baseline is now a larger `12x10` studio, and the collaborative table,
PCs, chairs, sofa, and coffee table are placed with visible interior breathing room.

The package also makes project-room campus growth explicit and test-covered. The public lobby is a
horizontal work corridor made of stable room bays. The first four project rooms use the first two
bays, and additional projects append new bays to the right instead of reshuffling or overlapping
existing rooms.

## Product Decisions

- Default generated project rooms are `12x10`.
- The work corridor minimum width is `25` tiles: two `12`-tile rooms plus one tile of bay margin.
- Collaborative room furniture now uses deeper row offsets and centered column offsets.
- Generated furniture is expected to stay inset from the room shell.
- Existing generated rooms can be migrated to the new studio template because generated furniture
  uses room-scoped uid prefixes.
- Corridor growth is bay-based:
  - first two bays remain stable;
  - project rooms 1-4 occupy top/bottom slots around those bays;
  - project rooms 5-6 append a third bay to the right;
  - further rooms continue appending right-side bays until layout bounds are exhausted.

## Files Changed

- `webview-ui/src/constants.ts`
- `webview-ui/src/office/projectRoomGeneration.ts`
- `webview-ui/test/project-room-generation.test.ts`
- `docs/roadmap/product/project-rooms-roadmap.md`
- `docs/pixel-agents-development-timeline.html`
- `docs/roadmap/supervision/reports/W18-S-project-room-default-and-growth-plan-report.md`

## Tests Added / Updated

- Updated generated-room expectations from `10x8` to `12x10`.
- Added coverage that newly generated project-room furniture is inset from room walls.
- Updated collaborative room coverage for the new centered `12x10` furniture layout.
- Updated campus layout expectations for `25`-tile and `38`-tile work corridors.
- Added refresh stability coverage for five projects so corridor growth does not create overlaps or
  move existing bay assignments after a refresh.

## Validation

- `npm run check-types` - passed.
- `cd webview-ui; node --import tsx/esm --test test/project-room-generation.test.ts` - passed,
  30 tests.
- Simulated the current user layout with the real bundled furniture catalog; `pixel-agents-multi`
  reflows to a `12x10` room with inset collaborative furniture.
- `npm run build` - passed.
- `npm test` - passed.

## Remaining Follow-Up

- Live VS Code visual QA should confirm the larger rooms feel less clipped at normal zoom.
- If the room count grows beyond a comfortable horizontal corridor, the next product iteration
  should introduce a second corridor/wing or navigation affordance rather than shrinking rooms.
