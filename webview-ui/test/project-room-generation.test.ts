import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FALLBACK_FLOOR_COLOR } from '../src/constants.ts';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.ts';
import {
  deserializeLayout,
  getBlockedTiles,
  layoutToSeats,
  layoutToTileMap,
  serializeLayout,
} from '../src/office/layout/layoutSerializer.ts';
import { findPath } from '../src/office/layout/tileMap.ts';
import { ensureProjectRoomsForAgents } from '../src/office/projectRoomGeneration.ts';
import type {
  FurnitureCatalogEntry,
  OfficeLayout,
  PlacedFurniture,
  ProjectRoom,
  TileType as TileTypeVal,
} from '../src/office/types.ts';
import { ProjectRoomKind, TILE_SIZE, TileType } from '../src/office/types.ts';

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

function makeVoidLayout(cols = 10, rows = 8): OfficeLayout {
  return makeLayout(
    cols,
    rows,
    Array.from({ length: cols * rows }, () => TileType.VOID),
  );
}

function projectRoom(id: string, key: string, col: number, row: number): ProjectRoom {
  return {
    id,
    kind: ProjectRoomKind.PROJECT,
    bounds: { col, row, width: 9, height: 7 },
    project: { key, displayName: key, source: 'folderName' },
  };
}

function rectsOverlap(a: ProjectRoom['bounds'], b: ProjectRoom['bounds']): boolean {
  return (
    a.col < b.col + b.width &&
    a.col + a.width > b.col &&
    a.row < b.row + b.height &&
    a.row + a.height > b.row
  );
}

function furnitureBounds(item: PlacedFurniture): ProjectRoom['bounds'] {
  if (item.type === 'DESK') return { col: item.col, row: item.row, width: 3, height: 2 };
  if (item.type === 'SOFA') return { col: item.col, row: item.row, width: 2, height: 1 };
  return { col: item.col, row: item.row, width: 1, height: 1 };
}

function hasWalkablePath(
  layout: OfficeLayout,
  start: { col: number; row: number },
  end: { col: number; row: number },
): boolean {
  return (
    findPath(
      start.col,
      start.row,
      end.col,
      end.row,
      layoutToTileMap(layout),
      getBlockedTiles(layout.furniture),
    ).length > 0
  );
}

test('a new visible project with no room creates exactly one project room', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha Project', isSubagent: false },
  ]);

  assert.equal(result.createdRooms.length, 1);
  assert.equal(result.layout.projectRooms?.length, 1);
  assert.equal(result.layout.projectRooms?.[0]?.project?.key, 'alpha project');
});

test('a new visible Codex projectDir creates one project room with safe provider metadata', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    {
      folderName: 'repo',
      projectDir: 'C:\\Users\\User\\Documents\\Repo',
      providerId: 'codex',
      isSubagent: false,
    },
  ]);

  const room = result.createdRooms[0]!;
  assert.equal(result.createdRooms.length, 1);
  assert.equal(room.project?.key, 'c:/users/user/documents/repo');
  assert.equal(room.project?.displayName, 'repo');
  assert.equal(room.project?.source, 'projectDir');
  assert.deepEqual(room.project?.providerIds, ['codex']);
});

test('a new visible Claude project creates one project room', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Claude Workspace', providerId: 'claude', isSubagent: false },
  ]);

  const room = result.createdRooms[0]!;
  assert.equal(result.createdRooms.length, 1);
  assert.equal(room.project?.key, 'claude workspace');
  assert.deepEqual(room.project?.providerIds, ['claude']);
});

test('an existing room for the project prevents automatic generation', () => {
  const layout = makeLayout();
  layout.projectRooms = [projectRoom('project-alpha', 'alpha', 0, 0)];

  const result = ensureProjectRoomsForAgents(layout, [{ folderName: 'Alpha', isSubagent: false }]);

  assert.equal(result.createdRooms.length, 0);
  assert.equal(result.layout.projectRooms?.length, 1);
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

test('generated rooms persist through layout serialization and normalization', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);

  const restored = deserializeLayout(serializeLayout(result.layout));

  assert.equal(restored?.projectRooms?.length, 1);
  assert.equal(restored?.projectRooms?.[0]?.project?.key, 'alpha');
});

test('provisioning order is deterministic by normalized project key', () => {
  const first = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Zeta', isSubagent: false },
    { folderName: 'Alpha', isSubagent: false },
    { folderName: 'Beta', isSubagent: false },
  ]);
  const second = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Beta', isSubagent: false },
    { folderName: 'Zeta', isSubagent: false },
    { folderName: 'Alpha', isSubagent: false },
  ]);

  assert.deepEqual(
    first.createdRooms.map((room) => room.id),
    ['project-alpha', 'project-beta', 'project-zeta'],
  );
  assert.deepEqual(
    second.createdRooms.map((room) => room.id),
    first.createdRooms.map((room) => room.id),
  );
});

test('generated room is connected back to the lobby core by walkable floor', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const room = result.createdRooms[0]!;
  const start = { col: Math.floor(room.bounds.col + room.bounds.width / 2), row: 1 };
  const end = { col: Math.floor(room.bounds.col + room.bounds.width / 2), row: room.bounds.row };

  assert.ok(hasWalkablePath(result.layout, start, end));
});

test('generated room does not overlap existing rooms or existing furniture', () => {
  const tiles = Array.from({ length: 10 * 16 }, (_, idx) =>
    Math.floor(idx / 10) < 8 ? TileType.FLOOR_1 : TileType.VOID,
  );
  const layout = makeLayout(10, 16, tiles);
  layout.projectRooms = [projectRoom('project-existing', 'existing', 0, 9)];
  layout.furniture = [{ uid: 'existing-desk', type: 'DESK', col: 9, row: 9 }];

  const result = ensureProjectRoomsForAgents(layout, [{ folderName: 'Alpha', isSubagent: false }]);
  const generated = result.createdRooms[0]!;

  assert.equal(
    result.layout.furniture.some((item) => item.uid === 'existing-desk'),
    true,
  );
  assert.equal(rectsOverlap(generated.bounds, layout.projectRooms[0]!.bounds), false);
  assert.equal(rectsOverlap(generated.bounds, furnitureBounds(layout.furniture[0]!)), false);
});

test('multiple new projects produce stable non-overlapping lobby-adjacent rooms', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(21, 8), [
    { folderName: 'Alpha', isSubagent: false },
    { folderName: 'Beta', isSubagent: false },
    { folderName: 'Gamma', isSubagent: false },
  ]);

  assert.equal(result.createdRooms.length, 3);
  for (let i = 0; i < result.createdRooms.length; i++) {
    for (let j = i + 1; j < result.createdRooms.length; j++) {
      assert.equal(
        rectsOverlap(result.createdRooms[i]!.bounds, result.createdRooms[j]!.bounds),
        false,
      );
    }
  }
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

test('generated room prefers the collaborative four-computer work table when available', () => {
  const assets: TestCatalogAsset[] = [
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
      id: 'TABLE_FRONT',
      label: 'Table',
      category: 'desks',
      width: TILE_SIZE * 3,
      height: TILE_SIZE * 4,
      footprintW: 3,
      footprintH: 4,
      isDesk: true,
      backgroundTiles: 1,
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
      id: 'PC_SIDE',
      label: 'PC Side',
      category: 'electronics',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      canPlaceOnSurfaces: true,
      orientation: 'side',
    },
    {
      id: 'PC_SIDE:left',
      label: 'PC Side Left',
      category: 'electronics',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      canPlaceOnSurfaces: true,
      orientation: 'left',
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
      id: 'WOODEN_CHAIR_SIDE',
      label: 'Wooden Chair Side',
      category: 'chairs',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      backgroundTiles: 1,
      orientation: 'side',
    },
    {
      id: 'WOODEN_CHAIR_SIDE:left',
      label: 'Wooden Chair Side Left',
      category: 'chairs',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      backgroundTiles: 1,
      orientation: 'left',
    },
    {
      id: 'CUSHIONED_BENCH',
      label: 'Cushioned Bench',
      category: 'chairs',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
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
  const room = result.createdRooms[0]!;
  const roomSeats = [...layoutToSeats(result.layout).values()].filter(
    (seat) =>
      seat.seatCol >= room.bounds.col &&
      seat.seatCol < room.bounds.col + room.bounds.width &&
      seat.seatRow >= room.bounds.row &&
      seat.seatRow < room.bounds.row + room.bounds.height,
  );

  assert.equal(furnitureByUid.get('project-alpha-team-table'), 'TABLE_FRONT');
  assert.equal(furnitureByUid.get('project-alpha-pc-right-2'), 'PC_SIDE');
  assert.equal(furnitureByUid.get('project-alpha-pc-left-2'), 'PC_SIDE:left');
  assert.equal(furnitureByUid.get('project-alpha-chair-right-2'), 'WOODEN_CHAIR_SIDE');
  assert.equal(furnitureByUid.get('project-alpha-chair-left-2'), 'WOODEN_CHAIR_SIDE:left');
  assert.equal(roomSeats.filter((seat) => seat.seatKind === 'work').length, 4);
  assert.ok(roomSeats.some((seat) => seat.seatKind === 'rest'));
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

test('weak unknown project identity does not create a fake project room', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Unknown project', isSubagent: false },
  ]);

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
  const result = ensureProjectRoomsForAgents(makeVoidLayout(10, 8), [
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
