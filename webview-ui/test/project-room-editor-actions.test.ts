import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FALLBACK_FLOOR_COLOR } from '../src/constants.ts';
import {
  deleteProjectRoom,
  findProjectRoomAtTile,
  updateProjectRoom,
} from '../src/office/editor/roomEditorActions.ts';
import { OfficeState } from '../src/office/engine/officeState.ts';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.ts';
import { deserializeLayout, serializeLayout } from '../src/office/layout/layoutSerializer.ts';
import type {
  FurnitureCatalogEntry,
  OfficeLayout,
  PlacedFurniture,
  ProjectRoom,
} from '../src/office/types.ts';
import { TILE_SIZE, TileType } from '../src/office/types.ts';

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
  ];

  buildDynamicCatalog({
    catalog: assets,
    sprites: Object.fromEntries(assets.map((asset) => [asset.id, sprite])),
  });
});

function workstationFurniture(chairUid: string, offset = 0): PlacedFurniture[] {
  return [
    { uid: `desk-${chairUid}`, type: 'DESK', col: 2 + offset, row: 1 },
    { uid: `pc-${chairUid}`, type: 'PC', col: 3 + offset, row: 1 },
    { uid: chairUid, type: 'CHAIR_UP', col: 3 + offset, row: 3 },
  ];
}

function projectRoom(id: string, key: string, col: number): ProjectRoom {
  return {
    id,
    kind: 'project',
    bounds: { col, row: 0, width: 6, height: 8 },
    project: { key, displayName: key, source: 'folderName' },
  };
}

function makeLayout(
  furniture: PlacedFurniture[] = [],
  projectRooms: ProjectRoom[] = [projectRoom('room-alpha', 'alpha', 0)],
): OfficeLayout {
  return {
    version: 1,
    cols: 14,
    rows: 8,
    tiles: Array.from({ length: 14 * 8 }, () => TileType.FLOOR_1),
    furniture,
    projectRooms,
  };
}

test('finding a room in room mode returns room metadata even when furniture is underneath', () => {
  const layout = makeLayout([{ uid: 'desk', type: 'DESK', col: 2, row: 1 }]);

  const hit = findProjectRoomAtTile(layout, 2, 1);

  assert.equal(hit?.id, 'room-alpha');
});

test('renaming updates only room metadata', () => {
  const layout = makeLayout([{ uid: 'desk', type: 'DESK', col: 2, row: 1 }]);

  const updated = updateProjectRoom(layout, 'room-alpha', { label: 'New Alpha' });

  assert.equal(updated.projectRooms?.[0]?.label, 'New Alpha');
  assert.deepEqual(updated.furniture, layout.furniture);
});

test('assigning a project key normalizes safe metadata', () => {
  const layout = makeLayout(
    [],
    [{ id: 'room', kind: 'unassigned', bounds: { col: 0, row: 0, width: 6, height: 8 } }],
  );

  const updated = updateProjectRoom(layout, 'room', {
    kind: 'project',
    projectKey: 'C:\\Users\\User\\Repo',
    projectDisplayName: 'C:\\Users\\User\\Repo',
  });

  assert.equal(updated.projectRooms?.[0]?.project?.key, 'c:/users/user/repo');
  assert.equal(updated.projectRooms?.[0]?.project?.displayName, 'Repo');
});

test('moving and resizing clamps invalid bounds inside the layout', () => {
  const layout = makeLayout();

  const updated = updateProjectRoom(layout, 'room-alpha', {
    col: -10,
    row: 99,
    width: 99,
    height: -1,
  });

  assert.deepEqual(updated.projectRooms?.[0]?.bounds, { col: 0, row: 5, width: 14, height: 3 });
});

test('deleting room metadata preserves furniture', () => {
  const layout = makeLayout([{ uid: 'desk', type: 'DESK', col: 2, row: 1 }]);

  const updated = deleteProjectRoom(layout, 'room-alpha');

  assert.equal(updated.projectRooms?.length, 0);
  assert.deepEqual(updated.furniture, layout.furniture);
});

test('export and import round-trip projectRooms while malformed records are dropped', () => {
  const layout = makeLayout([], [
    projectRoom('room-alpha', 'alpha', 0),
    { id: 'bad', kind: 'invalid', bounds: { col: 0, row: 0, width: 4, height: 4 } },
  ] as ProjectRoom[]);

  const imported = deserializeLayout(serializeLayout(layout));

  assert.equal(imported?.projectRooms?.length, 1);
  assert.equal(imported?.projectRooms?.[0]?.id, 'room-alpha');
});

test('changing room kind affects seating after repair', () => {
  const layout = makeLayout(
    [...workstationFurniture('alpha-chair', 0), ...workstationFurniture('unassigned-chair', 6)],
    [
      projectRoom('room-alpha', 'alpha', 0),
      { id: 'unassigned', kind: 'unassigned', bounds: { col: 6, row: 0, width: 8, height: 8 } },
    ],
  );
  const state = new OfficeState(layout);
  state.addAgent(1, undefined, undefined, undefined, true, 'Alpha', true);
  assert.equal(state.characters.get(1)?.seatId, 'alpha-chair');

  const updated = updateProjectRoom(layout, 'room-alpha', { kind: 'rest' });
  state.rebuildFromLayout(updated);

  assert.equal(state.characters.get(1)?.seatId, 'unassigned-chair');
});
