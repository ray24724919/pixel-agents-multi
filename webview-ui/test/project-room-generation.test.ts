import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FALLBACK_FLOOR_COLOR } from '../src/constants.ts';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.ts';
import { layoutToSeats } from '../src/office/layout/layoutSerializer.ts';
import { ensureProjectRoomsForAgents } from '../src/office/projectRoomGeneration.ts';
import type {
  FurnitureCatalogEntry,
  OfficeLayout,
  TileType as TileTypeVal,
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
    {
      id: 'SOFA',
      label: 'Sofa',
      category: 'chairs',
      width: TILE_SIZE * 2,
      height: TILE_SIZE,
      footprintW: 2,
      footprintH: 1,
      isDesk: false,
      orientation: 'front',
    },
  ];

  buildDynamicCatalog({
    catalog: assets,
    sprites: Object.fromEntries(assets.map((asset) => [asset.id, sprite])),
  });
});

function makeLayout(cols = 10, rows = 8, tiles?: TileTypeVal[]): OfficeLayout {
  return {
    version: 1,
    cols,
    rows,
    tiles: tiles ?? Array.from({ length: cols * rows }, () => TileType.FLOOR_1),
    furniture: [],
  };
}

test('a new visible project with no room creates exactly one project room', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha Project', isSubagent: false },
  ]);

  assert.equal(result.createdRooms.length, 1);
  assert.equal(result.layout.projectRooms?.length, 1);
  assert.equal(result.layout.projectRooms?.[0]?.project?.key, 'alpha project');
});

test('generated room contains a valid workstation seat and a rest seat when space permits', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const room = result.createdRooms[0]!;
  const seats = [...layoutToSeats(result.layout).values()].filter(
    (seat) =>
      seat.seatCol >= room.bounds.col &&
      seat.seatCol < room.bounds.col + room.bounds.width &&
      seat.seatRow >= room.bounds.row &&
      seat.seatRow < room.bounds.row + room.bounds.height,
  );

  assert.ok(seats.some((seat) => seat.seatKind === 'work' && seat.zoneSource === 'workstation'));
  assert.ok(seats.some((seat) => seat.seatKind === 'rest'));
});

test('generated workstation prefers a front desk with matching front electronics', () => {
  const assets: TestCatalogAsset[] = [
    {
      id: 'COFFEE_TABLE',
      label: 'Coffee Table',
      category: 'desks',
      width: TILE_SIZE * 3,
      height: TILE_SIZE * 2,
      footprintW: 3,
      footprintH: 2,
      isDesk: true,
      backgroundTiles: 1,
    },
    {
      id: 'DESK_FRONT',
      label: 'Desk Front',
      category: 'desks',
      width: TILE_SIZE * 3,
      height: TILE_SIZE * 2,
      footprintW: 3,
      footprintH: 2,
      isDesk: true,
      backgroundTiles: 1,
      orientation: 'front',
    },
    {
      id: 'PC_BACK',
      label: 'PC Back',
      category: 'electronics',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
      canPlaceOnSurfaces: true,
      orientation: 'back',
    },
    {
      id: 'PC_FRONT_OFF',
      label: 'PC Front Off',
      category: 'electronics',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
      canPlaceOnSurfaces: true,
      orientation: 'front',
    },
    {
      id: 'PC_FRONT_ON_1',
      label: 'PC Front On',
      category: 'electronics',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
      canPlaceOnSurfaces: true,
      orientation: 'front',
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

  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const furnitureByUid = new Map(result.layout.furniture.map((item) => [item.uid, item.type]));

  assert.equal(furnitureByUid.get('project-alpha-desk'), 'DESK_FRONT');
  assert.equal(furnitureByUid.get('project-alpha-tech'), 'PC_FRONT_OFF');
  assert.notEqual(furnitureByUid.get('project-alpha-desk'), 'COFFEE_TABLE');
  assert.notEqual(furnitureByUid.get('project-alpha-tech'), 'PC_BACK');
});

test('repeated generation does not duplicate rooms and keeps stable ids', () => {
  const first = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const second = ensureProjectRoomsForAgents(first.layout, [
    { folderName: 'Alpha', isSubagent: false },
  ]);

  assert.equal(first.createdRooms[0]?.id, 'project-alpha');
  assert.equal(second.createdRooms.length, 0);
  assert.equal(second.layout.projectRooms?.length, 1);
});

test('multiple sessions with the same cwd/project key produce one room', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'C:\\Users\\User\\repo', isSubagent: false },
    { folderName: '\\\\?\\C:\\Users\\User\\repo', isSubagent: false },
  ]);

  assert.equal(result.createdRooms.length, 1);
});

test('hidden archived killed agents and subagents do not trigger generation', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Hidden', isSubagent: false, hidden: true },
    { folderName: 'Archived', isSubagent: false, archived: true },
    { folderName: 'Killed', isSubagent: false, killed: true },
    { folderName: 'Sub', isSubagent: true },
  ]);

  assert.equal(result.createdRooms.length, 0);
  assert.equal(result.layout.projectRooms?.length ?? 0, 0);
});

test('unknown identity uses fallback instead of a fake project room', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [{ isSubagent: false }]);

  assert.equal(result.createdRooms.length, 0);
  assert.equal(result.skippedUnknownCount, 1);
});

test('layout expansion respects max bounds and overflow does not crash', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(64, 64), [
    { folderName: 'Overflow', isSubagent: false },
  ]);

  assert.equal(result.createdRooms.length, 0);
  assert.equal(result.overflowCount, 1);
  assert.equal(result.layout.cols, 64);
  assert.equal(result.layout.rows, 64);
});

test('generated room paints usable floor tiles in expanded space', () => {
  const voidTiles = Array.from({ length: 10 * 8 }, () => TileType.VOID);
  const result = ensureProjectRoomsForAgents(makeLayout(10, 8, voidTiles), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const room = result.createdRooms[0]!;
  const roomTiles = result.layout.tiles.filter((_, idx) => {
    const col = idx % result.layout.cols;
    const row = Math.floor(idx / result.layout.cols);
    return (
      col >= room.bounds.col &&
      col < room.bounds.col + room.bounds.width &&
      row >= room.bounds.row &&
      row < room.bounds.row + room.bounds.height
    );
  });

  assert.ok(roomTiles.every((tile) => tile !== TileType.VOID));
});
