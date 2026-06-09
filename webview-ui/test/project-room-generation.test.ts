import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  FALLBACK_FLOOR_COLOR,
  PROJECT_ROOM_GENERATED_FLOOR_COLOR,
  PROJECT_ROOM_GENERATED_FLOOR_TILE,
  PROJECT_ROOM_GENERATED_WALL_COLOR,
} from '../src/constants.ts';
import { buildDynamicCatalog, getCatalogEntry } from '../src/office/layout/furnitureCatalog.ts';
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
    {
      id: 'CUSHIONED_BENCH',
      label: 'Cushioned Bench',
      category: 'chairs',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
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
      isDesk: false,
    },
    {
      id: 'PLANT',
      label: 'Plant',
      category: 'decor',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      backgroundTiles: 1,
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
  if (item.type === 'COFFEE_TABLE') return { col: item.col, row: item.row, width: 2, height: 2 };
  return { col: item.col, row: item.row, width: 1, height: 1 };
}

function tileAt(layout: OfficeLayout, col: number, row: number): TileTypeVal {
  return layout.tiles[row * layout.cols + col]!;
}

function roomsByKind(layout: OfficeLayout, kind: ProjectRoomKind): ProjectRoom[] {
  return (layout.projectRooms ?? []).filter((room) => room.kind === kind);
}

function projectRooms(layout: OfficeLayout): ProjectRoom[] {
  return roomsByKind(layout, ProjectRoomKind.PROJECT);
}

function publicRooms(layout: OfficeLayout): ProjectRoom[] {
  return roomsByKind(layout, ProjectRoomKind.PUBLIC);
}

function colorAt(layout: OfficeLayout, col: number, row: number) {
  return layout.tileColors?.[row * layout.cols + col] ?? null;
}

function assertFurnitureOnWalkableRoomTiles(layout: OfficeLayout, room: ProjectRoom): void {
  const generatedFurniture = layout.furniture.filter((item) => item.uid.startsWith(`${room.id}-`));
  for (const item of generatedFurniture) {
    const entry = getCatalogEntry(item.type);
    assert.ok(entry, `missing catalog entry for ${item.type}`);
    for (let row = item.row; row < item.row + entry.footprintH; row++) {
      for (let col = item.col; col < item.col + entry.footprintW; col++) {
        assert.notEqual(
          tileAt(layout, col, row),
          TileType.WALL,
          `${item.uid} overlaps generated wall at ${col},${row}`,
        );
        assert.notEqual(
          tileAt(layout, col, row),
          TileType.VOID,
          `${item.uid} overlaps generated void at ${col},${row}`,
        );
      }
    }
  }
}

function assertGeneratedFurnitureInsetFromRoomWalls(layout: OfficeLayout, room: ProjectRoom): void {
  const generatedFurniture = layout.furniture.filter((item) => item.uid.startsWith(`${room.id}-`));
  for (const item of generatedFurniture) {
    const entry = getCatalogEntry(item.type);
    assert.ok(entry, `missing catalog entry for ${item.type}`);
    const bounds = furnitureBounds(item);
    assert.ok(bounds.col > room.bounds.col, `${item.uid} touches the left room wall`);
    assert.ok(bounds.row > room.bounds.row, `${item.uid} touches the top room wall`);
    assert.ok(
      bounds.col + entry.footprintW < room.bounds.col + room.bounds.width,
      `${item.uid} touches the right room wall`,
    );
    assert.ok(
      bounds.row + entry.footprintH < room.bounds.row + room.bounds.height,
      `${item.uid} touches the bottom room wall`,
    );
  }
}

function seatsInRoom(layout: OfficeLayout, room: ProjectRoom) {
  return [...layoutToSeats(layout).values()].filter(
    (seat) =>
      seat.seatCol >= room.bounds.col &&
      seat.seatCol < room.bounds.col + room.bounds.width &&
      seat.seatRow >= room.bounds.row &&
      seat.seatRow < room.bounds.row + room.bounds.height,
  );
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
  assert.equal(projectRooms(result.layout).length, 1);
  assert.equal(publicRooms(result.layout).length, 1);
  assert.equal(projectRooms(result.layout)[0]?.project?.key, 'alpha project');
  assert.equal(result.createdLobbyRoom?.label, 'Lobby');
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
  assert.equal(projectRooms(result.layout).length, 1);
  assert.equal(publicRooms(result.layout).length, 1);
});

test('generated room contains a valid workstation seat and a rest seat when space permits', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const room = result.createdRooms[0]!;
  const seats = seatsInRoom(result.layout, room);

  assert.ok(seats.some((seat) => seat.seatKind === 'work' && seat.zoneSource === 'workstation'));
  assert.ok(seats.some((seat) => seat.seatKind === 'rest'));
  assert.equal(
    result.layout.furniture.some((item) => item.uid === `${room.id}-rest-seat`),
    true,
  );
});

test('public lobby is provisioned as a lounge without duplicating project workstations', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const lobby = publicRooms(result.layout)[0]!;
  const seats = seatsInRoom(result.layout, lobby);
  const furnitureByUid = new Map(result.layout.furniture.map((item) => [item.uid, item.type]));

  assert.ok(result.loungeFurnitureAddedCount >= 3);
  assert.equal(furnitureByUid.get(`${lobby.id}-lounge-seat-a`), 'SOFA');
  assert.equal(furnitureByUid.get(`${lobby.id}-lounge-table-a`), 'COFFEE_TABLE');
  assert.equal(furnitureByUid.get(`${lobby.id}-lounge-table-b`), 'COFFEE_TABLE');
  assert.equal(furnitureByUid.get(`${lobby.id}-lounge-decor`), 'PLANT');
  assert.ok(seats.some((seat) => seat.seatKind === 'rest'));
  assert.equal(
    result.layout.furniture.some((item) => item.uid === `${lobby.id}-desk`),
    false,
  );
});

test('existing public lobby is rebuilt as a horizontal work corridor lounge', () => {
  const layout = makeLayout();
  layout.projectRooms = [
    {
      id: 'project-room-lobby',
      kind: ProjectRoomKind.PUBLIC,
      bounds: { col: 0, row: 0, width: 10, height: 8 },
      label: 'Lobby',
    },
    projectRoom('project-alpha', 'alpha', 0, 0),
  ];
  layout.projectRooms[1]!.bounds = { col: 10, row: 0, width: 9, height: 7 };
  layout.cols = 19;
  layout.tiles = Array.from({ length: layout.cols * layout.rows }, () => TileType.FLOOR_1);
  layout.furniture = [
    { uid: 'old-lobby-desk', type: 'DESK', col: 1, row: 1 },
    { uid: 'old-lobby-pc', type: 'PC', col: 2, row: 1 },
    { uid: 'old-lobby-chair', type: 'CHAIR_UP', col: 2, row: 3 },
    { uid: 'old-lobby-sofa', type: 'SOFA', col: 6, row: 2 },
    { uid: 'old-lobby-table', type: 'COFFEE_TABLE', col: 6, row: 3 },
    { uid: 'old-lobby-plant', type: 'PLANT', col: 8, row: 5 },
  ];

  const result = ensureProjectRoomsForAgents(layout, [{ folderName: 'Alpha', isSubagent: false }]);
  const furnitureByUid = new Map(result.layout.furniture.map((item) => [item.uid, item.type]));

  assert.ok(result.loungeFurnitureAddedCount >= 3);
  assert.equal(furnitureByUid.has('old-lobby-desk'), false);
  assert.equal(furnitureByUid.has('old-lobby-pc'), false);
  assert.equal(furnitureByUid.has('old-lobby-chair'), false);
  assert.equal(furnitureByUid.has('old-lobby-sofa'), false);
  assert.equal(furnitureByUid.has('old-lobby-table'), false);
  assert.equal(furnitureByUid.has('old-lobby-plant'), false);
  assert.deepEqual(publicRooms(result.layout)[0]?.bounds, { col: 0, row: 9, width: 21, height: 6 });
  assert.deepEqual(projectRooms(result.layout)[0]?.bounds, {
    col: 0,
    row: 0,
    width: 10,
    height: 8,
  });
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-a'), 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-table-a'), 'COFFEE_TABLE');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-table-b'), 'COFFEE_TABLE');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-a-back'), 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-a-left'), 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-a-right'), 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-b-back'), 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-b-left'), 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-b-right'), 'SOFA');
  assert.equal(
    result.layout.furniture.some((item) => item.uid.includes('-lounge-pod-')),
    false,
  );
});

test('existing two-sofa work corridor lounge upgrades to old-lobby-style sofa clusters', () => {
  const layout = makeLayout(21, 15);
  layout.projectRooms = [
    {
      id: 'project-room-lobby',
      kind: ProjectRoomKind.PUBLIC,
      bounds: { col: 0, row: 9, width: 21, height: 6 },
      label: 'Lobby',
    },
    {
      id: 'project-alpha',
      kind: ProjectRoomKind.PROJECT,
      bounds: { col: 0, row: 0, width: 10, height: 8 },
      project: { key: 'alpha', displayName: 'alpha', source: 'folderName' },
    },
  ];
  layout.furniture = [
    { uid: 'project-room-lobby-lounge-seat-a', type: 'SOFA', col: 2, row: 11 },
    { uid: 'project-room-lobby-lounge-seat-b', type: 'SOFA', col: 16, row: 11 },
    { uid: 'project-room-lobby-lounge-table-a', type: 'COFFEE_TABLE', col: 2, row: 12 },
    { uid: 'project-room-lobby-lounge-table-b', type: 'COFFEE_TABLE', col: 16, row: 12 },
    { uid: 'project-room-lobby-lounge-decor', type: 'PLANT', col: 18, row: 10 },
  ];

  const result = ensureProjectRoomsForAgents(layout, [{ folderName: 'Alpha', isSubagent: false }]);
  const furnitureByUid = new Map(result.layout.furniture.map((item) => [item.uid, item]));

  assert.equal(furnitureByUid.get('project-room-lobby-lounge-table-a')?.col, 3);
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-table-a')?.row, 11);
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-table-b')?.col, 15);
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-table-b')?.row, 11);
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-a-back')?.type, 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-a-left')?.type, 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-a-right')?.type, 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-b-back')?.type, 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-b-left')?.type, 'SOFA');
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-b-right')?.type, 'SOFA');
  assert.equal(
    result.layout.furniture.some((item) => item.uid.includes('-lounge-pod-')),
    false,
  );
});

test('existing project rooms without suite furniture are repaired with work and rest seats', () => {
  const layout = makeLayout();
  layout.projectRooms = [projectRoom('project-alpha', 'alpha', 0, 0)];

  const result = ensureProjectRoomsForAgents(layout, [{ folderName: 'Alpha', isSubagent: false }]);
  const room = projectRooms(result.layout)[0]!;
  const seats = seatsInRoom(result.layout, room);
  const furnitureByUid = new Map(result.layout.furniture.map((item) => [item.uid, item.type]));

  assert.equal(result.createdRooms.length, 0);
  assert.ok(result.suiteFurnitureAddedCount >= 4);
  assert.equal(furnitureByUid.get('project-alpha-desk'), 'DESK');
  assert.equal(furnitureByUid.get('project-alpha-tech'), 'PC');
  assert.equal(furnitureByUid.get('project-alpha-work-chair'), 'CHAIR_UP');
  assert.equal(furnitureByUid.get('project-alpha-rest-seat'), 'SOFA');
  assert.ok(seats.some((seat) => seat.seatKind === 'work' && seat.zoneSource === 'workstation'));
  assert.ok(seats.some((seat) => seat.seatKind === 'rest'));
});

test('existing generated project room furniture is reflowed away from room walls', () => {
  const layout = makeLayout(21, 15);
  layout.projectRooms = [
    {
      id: 'project-room-lobby',
      kind: ProjectRoomKind.PUBLIC,
      bounds: { col: 0, row: 9, width: 21, height: 6 },
      label: 'Lobby',
    },
    {
      id: 'project-alpha',
      kind: ProjectRoomKind.PROJECT,
      bounds: { col: 0, row: 0, width: 10, height: 8 },
      project: { key: 'alpha', displayName: 'alpha', source: 'folderName' },
    },
  ];
  layout.furniture = [
    { uid: 'project-alpha-desk', type: 'DESK', col: 2, row: 1 },
    { uid: 'project-alpha-tech', type: 'PC', col: 3, row: 1 },
    { uid: 'project-alpha-work-chair', type: 'CHAIR_UP', col: 3, row: 3 },
    { uid: 'project-alpha-rest-seat', type: 'SOFA', col: 7, row: 4 },
    { uid: 'project-alpha-rest-table', type: 'COFFEE_TABLE', col: 7, row: 5 },
  ];

  const result = ensureProjectRoomsForAgents(layout, [{ folderName: 'Alpha', isSubagent: false }]);
  const room = projectRooms(result.layout)[0]!;
  const furnitureByUid = new Map(result.layout.furniture.map((item) => [item.uid, item]));

  assert.equal(furnitureByUid.get('project-alpha-desk')?.row, 2);
  assert.equal(furnitureByUid.get('project-alpha-tech')?.row, 2);
  assert.equal(furnitureByUid.get('project-alpha-work-chair')?.row, 4);
  assert.equal(furnitureByUid.get('project-alpha-rest-seat')?.row, 5);
  assert.equal(furnitureByUid.get('project-alpha-rest-table')?.row, 3);
  assertGeneratedFurnitureInsetFromRoomWalls(result.layout, room);
});

test('existing project room rest corner upgrades from a small bench to sofa and table', () => {
  const layout = makeLayout();
  layout.projectRooms = [projectRoom('project-alpha', 'alpha', 0, 0)];
  layout.furniture = [
    { uid: 'project-alpha-desk', type: 'DESK', col: 2, row: 1 },
    { uid: 'project-alpha-tech', type: 'PC', col: 3, row: 1 },
    { uid: 'project-alpha-work-chair', type: 'CHAIR_UP', col: 3, row: 3 },
    { uid: 'project-alpha-rest-seat', type: 'CUSHIONED_BENCH', col: 1, row: 5 },
  ];

  const result = ensureProjectRoomsForAgents(layout, [{ folderName: 'Alpha', isSubagent: false }]);
  const furnitureByUid = new Map(result.layout.furniture.map((item) => [item.uid, item.type]));

  assert.ok(result.suiteFurnitureAddedCount >= 2);
  assert.equal(furnitureByUid.get('project-alpha-rest-seat'), 'SOFA');
  assert.equal(furnitureByUid.get('project-alpha-rest-table'), 'COFFEE_TABLE');
});

test('project suite rest seats fall back to a chair when sofa-like assets are unavailable', () => {
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

  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const room = result.createdRooms[0]!;
  const seats = seatsInRoom(result.layout, room);
  const restSeat = result.layout.furniture.find((item) => item.uid === `${room.id}-rest-seat`);

  assert.equal(restSeat?.type, 'CHAIR_UP');
  assert.ok(seats.some((seat) => seat.seatKind === 'rest'));
});

test('generated rooms persist through layout serialization and normalization', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);

  const restored = deserializeLayout(serializeLayout(result.layout));

  assert.equal(projectRooms(restored!).length, 1);
  assert.equal(publicRooms(restored!).length, 1);
  assert.equal(projectRooms(restored!)[0]?.project?.key, 'alpha');
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
  const lobby = publicRooms(result.layout)[0]!;
  const col = Math.floor(room.bounds.col + room.bounds.width / 2);
  const roomAboveLobby = room.bounds.row + room.bounds.height <= lobby.bounds.row;
  const start = {
    col,
    row: roomAboveLobby ? room.bounds.row + 1 : room.bounds.row + room.bounds.height - 2,
  };
  const end = {
    col,
    row: roomAboveLobby ? lobby.bounds.row : lobby.bounds.row + lobby.bounds.height - 1,
  };

  assert.ok(hasWalkablePath(result.layout, start, end));
});

test('generated room shell leaves a walkable doorway and corridor to the lobby', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const room = result.createdRooms[0]!;
  const lobby = publicRooms(result.layout)[0]!;
  const roomAboveLobby = room.bounds.row + room.bounds.height <= lobby.bounds.row;
  const doorway = {
    col: Math.floor(room.bounds.col + room.bounds.width / 2),
    row: roomAboveLobby ? room.bounds.row + room.bounds.height - 1 : room.bounds.row,
  };
  const outsideDoor = { col: doorway.col, row: doorway.row + (roomAboveLobby ? 1 : -1) };
  const interiorStart = {
    col: doorway.col,
    row: roomAboveLobby ? room.bounds.row + 1 : room.bounds.row + room.bounds.height - 2,
  };

  assert.equal(tileAt(result.layout, room.bounds.col, room.bounds.row), TileType.WALL);
  assert.deepEqual(
    colorAt(result.layout, room.bounds.col, room.bounds.row),
    PROJECT_ROOM_GENERATED_WALL_COLOR,
  );
  assert.equal(
    tileAt(result.layout, room.bounds.col + room.bounds.width - 1, room.bounds.row),
    TileType.WALL,
  );
  assert.equal(tileAt(result.layout, doorway.col, doorway.row), PROJECT_ROOM_GENERATED_FLOOR_TILE);
  assert.deepEqual(
    colorAt(result.layout, doorway.col, doorway.row),
    PROJECT_ROOM_GENERATED_FLOOR_COLOR,
  );
  assert.equal(
    tileAt(result.layout, outsideDoor.col, outsideDoor.row),
    PROJECT_ROOM_GENERATED_FLOOR_TILE,
  );
  assert.ok(hasWalkablePath(result.layout, interiorStart, doorway));
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

test('campus allocation fills four corner rooms around the work corridor first', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
    { folderName: 'Beta', isSubagent: false },
    { folderName: 'Delta', isSubagent: false },
    { folderName: 'Epsilon', isSubagent: false },
    { folderName: 'Gamma', isSubagent: false },
  ]);
  const rooms = result.createdRooms;

  assert.equal(rooms.length, 5);
  assert.deepEqual(
    rooms.slice(0, 4).map((room) => room.bounds.row),
    [0, 0, 16, 16],
  );
  assert.deepEqual(
    rooms.slice(0, 4).map((room) => room.bounds.col),
    [0, 11, 0, 11],
  );
  assert.deepEqual(rooms[4]!.bounds, { col: 22, row: 16, width: 10, height: 8 });
  assert.equal(result.layout.cols >= 32, true);
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
  const furnitureByOffset = new Map(
    result.layout.furniture.map((item) => [
      `${item.col - result.createdRooms[0]!.bounds.col},${item.row - result.createdRooms[0]!.bounds.row}`,
      item.type,
    ]),
  );
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
  assert.equal(furnitureByOffset.get('4,2'), 'PC_SIDE');
  assert.equal(furnitureByOffset.get('6,2'), 'PC_SIDE:left');
  assert.equal(furnitureByOffset.get('3,2'), 'WOODEN_CHAIR_SIDE');
  assert.equal(furnitureByOffset.get('7,2'), 'WOODEN_CHAIR_SIDE:left');
  assert.equal(roomSeats.filter((seat) => seat.seatKind === 'work').length, 4);
  assert.ok(roomSeats.some((seat) => seat.seatKind === 'rest'));
  assertFurnitureOnWalkableRoomTiles(result.layout, room);
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
  assert.ok(first.loungeFurnitureAddedCount > 0);
  assert.equal(second.loungeFurnitureAddedCount, 0);
  assert.equal(projectRooms(second.layout).length, 1);
  assert.equal(publicRooms(second.layout).length, 1);
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

test('auto-created lobby repairs void floor so lounge seats can be placed', () => {
  const result = ensureProjectRoomsForAgents(makeVoidLayout(10, 8), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const lobby = publicRooms(result.layout)[0]!;
  const lobbyTiles = result.layout.tiles.filter((_, idx) => {
    const col = idx % result.layout.cols;
    const row = Math.floor(idx / result.layout.cols);
    return (
      col >= lobby.bounds.col &&
      col < lobby.bounds.col + lobby.bounds.width &&
      row >= lobby.bounds.row &&
      row < lobby.bounds.row + lobby.bounds.height
    );
  });

  assert.ok(lobbyTiles.every((tile) => tile !== TileType.VOID));
  assert.ok(seatsInRoom(result.layout, lobby).some((seat) => seat.seatKind === 'rest'));
});
