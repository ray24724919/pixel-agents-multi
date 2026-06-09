# W18-U Project Room Template Lock Report

## Summary

W18-U turns the user-adjusted `pixel-agents-multi` project room into the default generated
`12x10` studio template. The generator now places the collaborative work table and rest corner in
the same visual structure as the tuned room, then adds optional studio accents only when the asset
pack supports them and collision checks pass.

## Product Decisions

- The default collaborative table is anchored on the right side of the room, matching the tuned
  `pixel-agents-multi` room.
- The rest area starts in the upper-left corner with a sofa/table cluster instead of being pushed
  to the bottom edge.
- Generated rooms can include richer studio accents: side sofas, plants, a bin, a desk-mounted
  drink, a secondary focus desk, and lower lounge seating.
- Accent furniture is best-effort. Missing exact assets or invalid placements are skipped rather
  than causing the generated room to fail.
- New rooms and reflowed generated rooms use the same validated furniture planner, so room moves do
  not revert to an older sparse template.

## Files Changed

- `webview-ui/src/constants.ts`
- `webview-ui/src/office/projectRoomGeneration.ts`
- `webview-ui/test/project-room-generation.test.ts`
- `docs/roadmap/product/project-rooms-roadmap.md`
- `docs/pixel-agents-development-timeline.html`
- `docs/roadmap/supervision/reports/W18-U-project-room-template-lock-report.md`

## Tests Added / Updated

- Updated collaborative-room expectations to the locked `pixel-agents-multi`-style offsets.
- Added coverage for exact studio accent assets, including side sofas, rest table, focus desk, PC,
  and focus chair.
- Kept existing coverage for generated room stability, non-overlap, valid work/rest seats, and
  furniture staying inside room walls.

## Validation

- `npm run check-types` - passed.
- `npm run lint` - passed.
- `cd webview-ui; node --import tsx/esm --test test/project-room-generation.test.ts` - passed,
  30 tests.
- `npm run build` - passed.
- `npm test` - passed.

## Follow-Up

- Live visual QA after packaging should confirm that newly generated rooms visually match the tuned
  `pixel-agents-multi` room at normal zoom.
- If the user wants exact manual decorations preserved as a reusable asset, the next step should be
  a real "save room as template" feature rather than continuing to encode one-off placements by
  hand.
