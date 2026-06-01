import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FALLBACK_FLOOR_COLOR } from '../src/constants.ts';
import { OfficeState } from '../src/office/engine/officeState.ts';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.ts';
import { layoutToSeats } from '../src/office/layout/layoutSerializer.ts';
import {
  CharacterState,
  Direction,
  type FurnitureCatalogEntry,
  type OfficeLayout,
  type PlacedFurniture,
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

function loungeFurniture(): PlacedFurniture[] {
  return [
    { uid: 'sofa', type: 'SOFA_FRONT', col: 3, row: 2 },
    { uid: 'coffee-table', type: 'COFFEE_TABLE', col: 3, row: 3 },
  ];
}

function addAgent(state: OfficeState, id: number, active = true, preferredSeatId?: string): void {
  state.addAgent(id, undefined, undefined, preferredSeatId, true, undefined, active);
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

test('sofa and coffee table seats remain rest even in the default work split', () => {
  const zones = Array.from({ length: 10 * 8 }, () => 'work' as const);
  const seats = layoutToSeats(makeLayout(loungeFurniture(), 10, 8, zones));

  assert.ok(seats.size > 0);
  assert.deepEqual(new Set([...seats.values()].map((seat) => seat.seatKind)), new Set(['rest']));
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
