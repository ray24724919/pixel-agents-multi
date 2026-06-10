import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FALLBACK_FLOOR_COLOR } from '../src/constants.ts';
import { OfficeState } from '../src/office/engine/officeState.ts';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.ts';
import { layoutToSeats } from '../src/office/layout/layoutSerializer.ts';
import { ensureProjectRoomsForAgents } from '../src/office/projectRoomGeneration.ts';
import {
  type Character,
  CharacterState,
  Direction,
  type FurnitureCatalogEntry,
  type OfficeLayout,
  type PlacedFurniture,
  type ProjectRoom,
  type Seat,
  TILE_SIZE,
  TileType,
} from '../src/office/types.ts';

type TestCatalogAsset = Omit<FurnitureCatalogEntry, 'type' | 'sprite'> & {
  id: string;
  width: number;
  height: number;
  category: string;
};

const sprite = [[FALLBACK_FLOOR_COLOR]];

beforeEach(() => {
  const assets: TestCatalogAsset[] = [
    {
      id: 'DESK',
      label: 'Desk',
      category: 'desks',
      width: TILE_SIZE * 3,
      height: TILE_SIZE * 2,
      footprintW: 3,
      footprintH: 2,
      isDesk: true,
      backgroundTiles: 1,
    },
    {
      id: 'PC',
      label: 'PC',
      category: 'electronics',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
      canPlaceOnSurfaces: true,
    },
    {
      id: 'CHAIR_UP',
      label: 'Chair Up',
      category: 'chairs',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
      orientation: 'back',
    },
    {
      id: 'SOFA_FRONT',
      label: 'Sofa Front',
      category: 'chairs',
      width: TILE_SIZE * 2,
      height: TILE_SIZE,
      footprintW: 2,
      footprintH: 1,
      isDesk: false,
      orientation: 'front',
    },
    {
      id: 'COFFEE_TABLE',
      label: 'Coffee Table',
      category: 'desks',
      width: TILE_SIZE * 2,
      height: TILE_SIZE * 2,
      footprintW: 2,
      footprintH: 2,
      isDesk: true,
    },
  ];

  buildDynamicCatalog({
    catalog: assets,
    sprites: Object.fromEntries(assets.map((asset) => [asset.id, sprite])),
  });
});

function makeLayout(
  furniture: PlacedFurniture[],
  cols = 10,
  rows = 8,
  zones?: OfficeLayout['zones'],
): OfficeLayout {
  return {
    version: 1,
    cols,
    rows,
    tiles: Array.from({ length: cols * rows }, () => TileType.FLOOR_1),
    furniture,
    zones,
  };
}

function workstationFurniture(chairUid = 'work-chair', offset = 0): PlacedFurniture[] {
  return [
    { uid: `desk-${chairUid}`, type: 'DESK', col: 2 + offset, row: 1 },
    { uid: `pc-${chairUid}`, type: 'PC', col: 3 + offset, row: 1 },
    { uid: chairUid, type: 'CHAIR_UP', col: 3 + offset, row: 3 },
  ];
}

function loungeFurnitureAt(sofaUid = 'sofa', col = 3, row = 2): PlacedFurniture[] {
  return [
    { uid: sofaUid, type: 'SOFA_FRONT', col, row },
    { uid: `${sofaUid}-coffee-table`, type: 'COFFEE_TABLE', col, row: row + 1 },
  ];
}

function loungeFurniture(): PlacedFurniture[] {
  return loungeFurnitureAt('sofa', 3, 2);
}

function projectRoom(
  id: string,
  key: string,
  col: number,
  row: number,
  width: number,
  height: number,
): ProjectRoom {
  return {
    id,
    kind: 'project',
    bounds: { col, row, width, height },
    project: { key, displayName: key, source: 'folderName' },
  };
}

function room(
  kind: ProjectRoom['kind'],
  id: string,
  col: number,
  row: number,
  width: number,
  height: number,
): ProjectRoom {
  return {
    id,
    kind,
    bounds: { col, row, width, height },
  };
}

function addAgent(
  state: OfficeState,
  id: number,
  active = true,
  preferredSeatId?: string,
  folderName?: string,
  projectDir?: string,
  projectName?: string,
): void {
  state.addAgent(
    id,
    undefined,
    undefined,
    preferredSeatId,
    true,
    folderName,
    active,
    false,
    projectDir,
    projectName,
  );
}

function seatRoom(
  layout: OfficeLayout,
  seatId: string | null | undefined,
): ProjectRoom | undefined {
  if (!seatId) return undefined;
  const seat = layoutToSeats(layout).get(seatId);
  return layout.projectRooms?.find(
    (candidate) =>
      seat &&
      seat.seatCol >= candidate.bounds.col &&
      seat.seatCol < candidate.bounds.col + candidate.bounds.width &&
      seat.seatRow >= candidate.bounds.row &&
      seat.seatRow < candidate.bounds.row + candidate.bounds.height,
  );
}

function generatedRoomLayoutForProjects(...folderNames: string[]): OfficeLayout {
  return ensureProjectRoomsForAgents(
    makeLayout([], 12, 8),
    folderNames.map((folderName) => ({ folderName, isSubagent: false })),
  ).layout;
}

test('active agent uses a valid work seat at a desk and PC', () => {
  const state = new OfficeState(makeLayout(workstationFurniture()));

  addAgent(state, 1, true);

  const ch = state.characters.get(1)!;
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.equal(ch.isActive, true);
  assert.equal(ch.state, CharacterState.TYPE);
  assert.equal(seat?.seatKind, 'work');
  assert.equal(seat?.zoneSource, 'workstation');
  assert.equal(ch.dir, Direction.UP);
});

test('active agent never types in a rest seat', () => {
  const state = new OfficeState(makeLayout(loungeFurniture()));

  addAgent(state, 1, true);
  state.update(1);

  const ch = state.characters.get(1)!;
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.equal(ch.isActive, true);
  assert.notEqual(seat?.seatKind, 'work');
  assert.notEqual(ch.state, CharacterState.TYPE);
});

test('no work seat means no top-level TYPE in place', () => {
  const state = new OfficeState(makeLayout([]));

  addAgent(state, 1, true);
  state.update(1);

  const ch = state.characters.get(1)!;
  assert.equal(ch.isActive, true);
  assert.equal(ch.seatId, null);
  assert.notEqual(ch.state, CharacterState.TYPE);
});

test('idle agent releases a work seat and prefers a rest seat', () => {
  const state = new OfficeState(makeLayout([...workstationFurniture(), ...loungeFurniture()]));

  addAgent(state, 1, true);
  const workSeatId = state.characters.get(1)!.seatId!;

  state.setAgentActive(1, false);

  const ch = state.characters.get(1)!;
  const workSeat = state.seats.get(workSeatId)!;
  const currentSeat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.equal(workSeat.assigned, false);
  assert.notEqual(ch.seatId, workSeatId);
  assert.equal(currentSeat?.seatKind ?? 'rest', 'rest');
});

test('idle agent can rest in both its own project room and the public lobby lounge', () => {
  const projRoom = projectRoom('proj-alpha', 'alpha', 1, 1, 4, 4);
  const lobby = room('public', 'lobby', 6, 1, 4, 4);
  const layout = makeLayout(
    [...loungeFurnitureAt('proj-sofa', 2, 2), ...loungeFurnitureAt('lobby-sofa', 7, 2)],
    12,
    8,
  );
  layout.projectRooms = [projRoom, lobby];
  const state = new OfficeState(layout);

  // Idle agent belonging to project "alpha" (which owns proj-alpha room).
  addAgent(state, 1, false, undefined, 'alpha');
  const ch = state.characters.get(1)!;

  // getUpdateSeatsForCharacter governs which rest seats an idle agent may claim while wandering.
  const allowedSeats = (
    state as unknown as {
      getUpdateSeatsForCharacter(c: Character): Map<string, Seat>;
    }
  ).getUpdateSeatsForCharacter(ch);

  const allowedRoomIds = new Set([...allowedSeats.keys()].map((id) => seatRoom(layout, id)?.id));
  assert.ok(
    allowedRoomIds.has('proj-alpha'),
    'idle agent must be able to rest in its own project room',
  );
  assert.ok(
    allowedRoomIds.has('lobby'),
    'idle agent must also be able to rest in the public lobby lounge',
  );
});

test('layout import repairs a stale work seat that became rest', () => {
  const state = new OfficeState(makeLayout(workstationFurniture('old-chair')));
  addAgent(state, 1, true, 'old-chair');

  const imported = makeLayout([
    { uid: 'old-chair', type: 'CHAIR_UP', col: 3, row: 3 },
    ...workstationFurniture('new-chair', 3),
  ]);
  state.rebuildFromLayout(imported);

  const ch = state.characters.get(1)!;
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.notEqual(ch.seatId, 'old-chair');
  assert.equal(seat?.seatKind, 'work');
  assert.equal(ch.state, CharacterState.TYPE);
});

test('duplicate seat ownership is repaired deterministically', () => {
  const state = new OfficeState(makeLayout(workstationFurniture('shared-chair')));
  addAgent(state, 1, true, 'shared-chair');
  addAgent(state, 2, true, 'shared-chair');

  const second = state.characters.get(2)!;
  second.seatId = 'shared-chair';
  second.workSeatId = 'shared-chair';
  state.repairSeatingAssignments('manual');

  const owners = [...state.characters.values()].filter((ch) => ch.seatId === 'shared-chair');
  assert.equal(owners.length, 1);
});

test('restore can randomize seating instead of reusing a persisted preference', () => {
  const state = new OfficeState(makeLayout(loungeFurniture()));
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    state.addAgent(1, 0, 0, 'sofa', true, undefined, false, true);
  } finally {
    Math.random = originalRandom;
  }

  const ch = state.characters.get(1)!;
  assert.notEqual(ch.seatId, 'sofa');
  assert.equal(ch.seatId, 'sofa:1');
});

test('active restore starts at a workstation instead of an idle rest seat', () => {
  const state = new OfficeState(makeLayout([...workstationFurniture(), ...loungeFurniture()]));

  state.addAgent(1, 0, 0, 'sofa', true, undefined, true, true);

  const ch = state.characters.get(1)!;
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.equal(ch.isActive, true);
  assert.equal(ch.state, CharacterState.TYPE);
  assert.equal(seat?.seatKind, 'work');
  assert.equal(seat?.zoneSource, 'workstation');
});

test('refresh randomizes top-level seats without stacking active or idle agents', () => {
  const state = new OfficeState(
    makeLayout(
      [
        ...workstationFurniture('work-chair-a'),
        ...workstationFurniture('work-chair-b', 4),
        { uid: 'refresh-sofa', type: 'SOFA_FRONT', col: 10, row: 2 },
        { uid: 'refresh-coffee-table', type: 'COFFEE_TABLE', col: 10, row: 3 },
      ],
      14,
      8,
    ),
  );

  addAgent(state, 1, true);
  addAgent(state, 2, true);
  addAgent(state, 3, false);
  state.randomizeTopLevelSeats();

  const activeSeatIds = [1, 2].map((id) => state.characters.get(id)?.seatId);
  const idleSeat = state.characters.get(3)?.seatId;
  assert.equal(new Set(activeSeatIds).size, 2);
  for (const seatId of activeSeatIds) {
    assert.equal(state.seats.get(seatId!)?.seatKind, 'work');
    assert.equal(state.seats.get(seatId!)?.zoneSource, 'workstation');
  }
  assert.equal(state.seats.get(idleSeat!)?.seatKind, 'rest');
  assert.equal(state.characters.get(3)?.state, CharacterState.IDLE);
});

test('active agents use valid work seats inside their own project room first', () => {
  const layout = makeLayout(
    [...workstationFurniture('a-beta-chair', 0), ...workstationFurniture('z-alpha-chair', 6)],
    14,
    8,
  );
  layout.projectRooms = [
    projectRoom('room-beta', 'beta', 0, 0, 6, 8),
    projectRoom('room-alpha', 'alpha', 6, 0, 8, 8),
  ];
  const state = new OfficeState(layout);

  addAgent(state, 1, true, undefined, 'Alpha');

  const ch = state.characters.get(1)!;
  assert.equal(ch.seatId, 'z-alpha-chair');
  assert.equal(seatRoom(layout, ch.seatId)?.id, 'room-alpha');
});

test('active agents match generated project rooms by projectDir before display names', () => {
  const pixelProjectDir = 'C:\\Users\\User\\Documents\\raychen\\pixel-agents-multi';
  const otherProjectDir = 'C:\\Users\\User\\Documents\\raychen\\animfy_gs1';
  const layout = makeLayout(
    [...workstationFurniture('a-other-chair', 0), ...workstationFurniture('z-pixel-chair', 6)],
    14,
    8,
  );
  layout.projectRooms = [
    projectRoom('room-other', otherProjectDir, 0, 0, 6, 8),
    projectRoom('room-pixel', pixelProjectDir, 6, 0, 8, 8),
  ];
  const state = new OfficeState(layout);

  addAgent(state, 1, true, undefined, 'pixel-agents-multi', pixelProjectDir, 'pixel-agents-multi');

  const ch = state.characters.get(1)!;
  assert.equal(ch.seatId, 'z-pixel-chair');
  assert.equal(seatRoom(layout, ch.seatId)?.id, 'room-pixel');
});

test('late projectDir metadata repair moves an active agent into its project room', () => {
  const pixelProjectDir = 'C:\\Users\\User\\Documents\\raychen\\pixel-agents-multi';
  const otherProjectDir = 'C:\\Users\\User\\Documents\\raychen\\animfy_gs1';
  const layout = makeLayout(
    [...workstationFurniture('a-other-chair', 0), ...workstationFurniture('z-pixel-chair', 6)],
    14,
    8,
  );
  layout.projectRooms = [
    projectRoom('room-other', otherProjectDir, 0, 0, 6, 8),
    projectRoom('room-pixel', pixelProjectDir, 6, 0, 8, 8),
  ];
  const state = new OfficeState(layout);

  addAgent(state, 1, true, 'a-other-chair');
  const ch = state.characters.get(1)!;
  ch.projectDir = pixelProjectDir;
  ch.projectName = 'pixel-agents-multi';
  state.repairSeatingAssignments('active');

  assert.equal(ch.seatId, 'z-pixel-chair');
  assert.equal(seatRoom(layout, ch.seatId)?.id, 'room-pixel');
});

test('two projects with capacity do not claim each other room-local work seats', () => {
  const layout = makeLayout(
    [...workstationFurniture('a-beta-chair', 0), ...workstationFurniture('z-alpha-chair', 6)],
    14,
    8,
  );
  layout.projectRooms = [
    projectRoom('room-beta', 'beta', 0, 0, 6, 8),
    projectRoom('room-alpha', 'alpha', 6, 0, 8, 8),
  ];
  const state = new OfficeState(layout);

  addAgent(state, 1, true, undefined, 'Alpha');
  addAgent(state, 2, true, undefined, 'Beta');

  assert.equal(state.characters.get(1)?.seatId, 'z-alpha-chair');
  assert.equal(state.characters.get(2)?.seatId, 'a-beta-chair');
});

test('a layout repair walks an idle agent to its rest seat instead of teleporting it', () => {
  const state = new OfficeState(makeLayout(loungeFurnitureAt('sofa', 7, 4), 12, 8));
  addAgent(state, 1, false);
  const ch = state.characters.get(1)!;
  // Park the idle agent far from any rest seat, then force a layout-reason repair (the snap path).
  ch.seatId = null;
  ch.restSeatId = null;
  ch.tileCol = 1;
  ch.tileRow = 1;
  ch.x = 1 * TILE_SIZE + TILE_SIZE / 2;
  ch.y = 1 * TILE_SIZE + TILE_SIZE / 2;
  state.repairSeatingAssignments('layout');
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.ok(seat, 'idle agent is assigned a rest seat');
  assert.equal(seat?.seatKind, 'rest');
  // It must NOT have been snapped onto the seat — it walks there, so it stays put for now.
  assert.equal(
    ch.tileCol === seat?.seatCol && ch.tileRow === seat?.seatRow,
    false,
    'idle agent must walk to the rest seat, not teleport (flash) onto it',
  );
});

test('an agent with its own project room never sits in another project room', () => {
  // Only BETA has a workstation; ALPHA's agent has its own (work-seatless) room.
  const layout = makeLayout(workstationFurniture('beta-chair', 6), 14, 8);
  layout.projectRooms = [
    projectRoom('room-alpha', 'alpha', 0, 0, 6, 8),
    projectRoom('room-beta', 'beta', 6, 0, 8, 8),
  ];
  const state = new OfficeState(layout);
  addAgent(state, 1, true, undefined, 'Alpha');
  const ch = state.characters.get(1)!;
  // ALPHA has its own room (with no work seat) — it must stay seatless rather than borrow BETA's seat.
  assert.notEqual(seatRoom(layout, ch.seatId)?.id, 'room-beta');
});

test('idle agents prefer rest seats inside their own project room', () => {
  const layout = makeLayout(
    [...loungeFurnitureAt('a-beta-sofa', 2, 5), ...loungeFurnitureAt('z-alpha-sofa', 8, 5)],
    14,
    9,
  );
  layout.projectRooms = [
    projectRoom('room-beta', 'beta', 0, 0, 6, 9),
    projectRoom('room-alpha', 'alpha', 6, 0, 8, 9),
  ];
  const state = new OfficeState(layout);

  addAgent(state, 1, false, undefined, 'Alpha');

  const ch = state.characters.get(1)!;
  assert.equal(ch.seatId, 'z-alpha-sofa');
  assert.equal(state.seats.get(ch.seatId!)?.seatKind, 'rest');
  assert.equal(seatRoom(layout, ch.seatId)?.id, 'room-alpha');
});

test('idle agents fall back to public rest seats when their room lacks rest seats', () => {
  const layout = makeLayout(
    [...workstationFurniture('alpha-work-chair', 6), ...loungeFurnitureAt('public-sofa', 2, 5)],
    14,
    9,
  );
  layout.projectRooms = [
    room('public', 'public-lounge', 0, 0, 6, 9),
    projectRoom('room-alpha', 'alpha', 6, 0, 8, 9),
  ];
  const state = new OfficeState(layout);

  addAgent(state, 1, false, undefined, 'Alpha');

  const ch = state.characters.get(1)!;
  assert.equal(ch.seatId, 'public-sofa');
  assert.equal(seatRoom(layout, ch.seatId)?.id, 'public-lounge');
});

test('unknown project agents use an unassigned room fallback', () => {
  const layout = makeLayout(
    [
      ...workstationFurniture('a-project-chair', 0),
      ...workstationFurniture('z-unassigned-chair', 6),
    ],
    14,
    8,
  );
  layout.projectRooms = [
    projectRoom('room-alpha', 'alpha', 0, 0, 6, 8),
    room('unassigned', 'unassigned-room', 6, 0, 8, 8),
  ];
  const state = new OfficeState(layout);

  addAgent(state, 1, true);

  const ch = state.characters.get(1)!;
  assert.equal(ch.seatId, 'z-unassigned-chair');
  assert.equal(seatRoom(layout, ch.seatId)?.id, 'unassigned-room');
});

test('restored persisted seat outside the agent project room is repaired', () => {
  const layout = makeLayout(
    [...workstationFurniture('a-beta-chair', 0), ...workstationFurniture('z-alpha-chair', 6)],
    14,
    8,
  );
  layout.projectRooms = [
    projectRoom('room-beta', 'beta', 0, 0, 6, 8),
    projectRoom('room-alpha', 'alpha', 6, 0, 8, 8),
  ];
  const state = new OfficeState(layout);

  addAgent(state, 1, true, 'a-beta-chair', 'Alpha');

  const ch = state.characters.get(1)!;
  assert.notEqual(ch.seatId, 'a-beta-chair');
  assert.equal(ch.seatId, 'z-alpha-chair');
});

test('duplicate seat ownership across rooms is repaired deterministically', () => {
  const layout = makeLayout(
    [...workstationFurniture('a-beta-chair', 0), ...workstationFurniture('z-alpha-chair', 6)],
    14,
    8,
  );
  layout.projectRooms = [
    projectRoom('room-beta', 'beta', 0, 0, 6, 8),
    projectRoom('room-alpha', 'alpha', 6, 0, 8, 8),
  ];
  const state = new OfficeState(layout);
  addAgent(state, 1, true, undefined, 'Alpha');
  addAgent(state, 2, true, undefined, 'Beta');
  const beta = state.characters.get(2)!;
  beta.seatId = 'z-alpha-chair';
  beta.workSeatId = 'z-alpha-chair';

  state.repairSeatingAssignments('manual');

  assert.equal(state.characters.get(1)?.seatId, 'z-alpha-chair');
  assert.equal(state.characters.get(2)?.seatId, 'a-beta-chair');
  assert.equal(
    [...state.characters.values()].filter((ch) => ch.seatId === 'z-alpha-chair').length,
    1,
  );
});

test('room-scoped refresh randomize avoids stacking', () => {
  const layout = makeLayout(
    [...workstationFurniture('a-beta-chair', 0), ...workstationFurniture('z-alpha-chair', 6)],
    14,
    8,
  );
  layout.projectRooms = [
    projectRoom('room-beta', 'beta', 0, 0, 6, 8),
    projectRoom('room-alpha', 'alpha', 6, 0, 8, 8),
  ];
  const state = new OfficeState(layout);
  addAgent(state, 1, true, undefined, 'Alpha');
  addAgent(state, 2, true, undefined, 'Beta');

  state.randomizeTopLevelSeats();

  const seatIds = [state.characters.get(1)?.seatId, state.characters.get(2)?.seatId];
  assert.equal(new Set(seatIds).size, 2);
  assert.equal(state.characters.get(1)?.seatId, 'z-alpha-chair');
  assert.equal(state.characters.get(2)?.seatId, 'a-beta-chair');
});

test('no room-local or fallback work seat means no top-level TYPE in place', () => {
  const layout = makeLayout(loungeFurnitureAt('alpha-sofa', 3, 2), 10, 8);
  layout.projectRooms = [projectRoom('room-alpha', 'alpha', 0, 0, 10, 8)];
  const state = new OfficeState(layout);

  addAgent(state, 1, true, undefined, 'Alpha');
  state.update(1);

  const ch = state.characters.get(1)!;
  assert.equal(ch.seatId, null);
  assert.notEqual(ch.state, CharacterState.TYPE);
});

test('sub-agents stay near their parent and do not claim normal room seats', () => {
  const layout = makeLayout(workstationFurniture('alpha-chair'), 10, 8);
  layout.projectRooms = [projectRoom('room-alpha', 'alpha', 0, 0, 10, 8)];
  const state = new OfficeState(layout);
  addAgent(state, 1, true, undefined, 'Alpha');
  const parent = state.characters.get(1)!;

  const subId = state.addSubagent(1, 'room-task');
  state.setAgentActive(subId, true);
  const sub = state.characters.get(subId)!;
  const distance = Math.abs(sub.tileCol - parent.tileCol) + Math.abs(sub.tileRow - parent.tileRow);

  assert.equal(sub.isSubagent, true);
  assert.equal(sub.seatId, null);
  assert.ok(distance <= 3);
  assert.equal(sub.state, CharacterState.TYPE);
});

test('delegation-driven supervisors use valid project-room work seats', () => {
  const layout = makeLayout(
    [...workstationFurniture('alpha-chair', 0), ...loungeFurnitureAt('alpha-sofa', 6, 5)],
    12,
    9,
  );
  layout.projectRooms = [projectRoom('room-alpha', 'alpha', 0, 0, 12, 9)];
  const state = new OfficeState(layout);
  addAgent(state, 1, false, undefined, 'Alpha');

  state.setAgentDelegation(1, {
    status: 'delegating',
    activeDelegateCount: 1,
    completedDelegateCount: 0,
    failedDelegateCount: 0,
    totalDelegateCount: 1,
    delegateSource: 'hook',
    isActive: true,
  });

  const ch = state.characters.get(1)!;
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.equal(ch.isActive, true);
  assert.equal(ch.seatId, 'alpha-chair');
  assert.equal(seat?.seatKind, 'work');
  assert.equal(seat?.zoneSource, 'workstation');
});

test('layouts without projectRooms preserve global seating behavior', () => {
  const state = new OfficeState(
    makeLayout(
      [...workstationFurniture('a-global-chair', 0), ...workstationFurniture('z-global-chair', 6)],
      14,
      8,
    ),
  );

  addAgent(state, 1, true, undefined, 'Alpha');

  const ch = state.characters.get(1)!;
  assert.equal(ch.seatId, 'a-global-chair');
  assert.equal(state.seats.get(ch.seatId!)?.seatKind, 'work');
});

test('active project agent uses generated project-local workstation after room provisioning', () => {
  const layout = generatedRoomLayoutForProjects('Alpha');
  const state = new OfficeState(layout);

  addAgent(state, 1, true, undefined, 'Alpha');

  const ch = state.characters.get(1)!;
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.equal(ch.state, CharacterState.TYPE);
  assert.equal(seat?.seatKind, 'work');
  assert.equal(seat?.zoneSource, 'workstation');
  assert.equal(seatRoom(layout, ch.seatId)?.id, 'project-alpha');
});

test('active project agent does not type in generated rest seat', () => {
  const layout = generatedRoomLayoutForProjects('Alpha');
  const state = new OfficeState(layout);

  addAgent(state, 1, true, 'project-alpha-rest-seat', 'Alpha');

  const ch = state.characters.get(1)!;
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.notEqual(ch.seatId, 'project-alpha-rest-seat');
  assert.equal(ch.state, CharacterState.TYPE);
  assert.equal(seat?.seatKind, 'work');
});

test('idle project agent can use generated project-local rest seat', () => {
  const layout = generatedRoomLayoutForProjects('Alpha');
  const state = new OfficeState(layout);

  addAgent(state, 1, false, undefined, 'Alpha');

  const ch = state.characters.get(1)!;
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.equal(seat?.seatKind, 'rest');
  assert.equal(seatRoom(layout, ch.seatId)?.id, 'project-alpha');
});

test('refresh randomize remains duplicate-safe across generated project rooms', () => {
  const layout = generatedRoomLayoutForProjects('Alpha', 'Beta');
  const state = new OfficeState(layout);
  addAgent(state, 1, true, undefined, 'Alpha');
  addAgent(state, 2, true, undefined, 'Beta');

  state.randomizeTopLevelSeats();

  const alphaSeat = state.characters.get(1)?.seatId;
  const betaSeat = state.characters.get(2)?.seatId;
  assert.equal(new Set([alphaSeat, betaSeat]).size, 2);
  assert.equal(seatRoom(layout, alphaSeat)?.id, 'project-alpha');
  assert.equal(seatRoom(layout, betaSeat)?.id, 'project-beta');
});

test('sofa and coffee table seats remain rest even in the default work split', () => {
  const zones = Array.from({ length: 10 * 8 }, () => 'work' as const);
  const seats = layoutToSeats(makeLayout(loungeFurniture(), 10, 8, zones));

  assert.ok(seats.size > 0);
  assert.deepEqual(new Set([...seats.values()].map((seat) => seat.seatKind)), new Set(['rest']));
});

test('forced relocation nudges a character to the nearest walkable tile, not across the office', () => {
  // A lone chair tile is blocked; everything else is floor. A character forced
  // off the blocked tile must step onto an adjacent floor tile — never flash
  // across the office to a random global tile (the sofa→lobby teleport bug).
  const state = new OfficeState(
    makeLayout([{ uid: 'corner-chair', type: 'CHAIR_UP', col: 1, row: 1 }], 14, 10),
  );
  addAgent(state, 1, false);
  const ch = state.characters.get(1)!;
  ch.seatId = null;
  ch.tileCol = 1;
  ch.tileRow = 1;

  (
    state as unknown as { relocateCharacterToWalkable(c: Character): void }
  ).relocateCharacterToWalkable(ch);

  const distance = Math.abs(ch.tileCol - 1) + Math.abs(ch.tileRow - 1);
  assert.equal(distance, 1, 'relocation must land on a tile adjacent to the origin');
});

test('sub-agent behavior remains near parent and is not forced into a work seat', () => {
  const state = new OfficeState(makeLayout(workstationFurniture()));
  addAgent(state, 1, true);
  const parent = state.characters.get(1)!;

  const subId = state.addSubagent(1, 'tool-1');
  state.setAgentActive(subId, true);
  const sub = state.characters.get(subId)!;
  const distance = Math.abs(sub.tileCol - parent.tileCol) + Math.abs(sub.tileRow - parent.tileRow);

  assert.equal(sub.isSubagent, true);
  assert.equal(sub.seatId, null);
  assert.ok(distance <= 3);
  assert.equal(sub.state, CharacterState.TYPE);
});
