import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  FALLBACK_FLOOR_COLOR,
  PROJECT_ROOM_DEFAULT_HEIGHT,
  PROJECT_ROOM_DEFAULT_WIDTH,
  PROJECT_ROOM_GENERATED_FLOOR_COLOR,
  PROJECT_ROOM_GENERATED_FLOOR_TILE,
  PROJECT_ROOM_GENERATED_WALL_COLOR,
  PROJECT_ROOM_LOBBY_LOUNGE_REV,
  PROJECT_ROOM_TEMPLATE,
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
import {
  ensureProjectRoomsForAgents,
  openProjectRoomFronts,
  roomDoorwayKeepClearTiles,
} from '../src/office/projectRoomGeneration.ts';
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

  assert.deepEqual(room.bounds, {
    col: 0,
    row: 0,
    width: PROJECT_ROOM_DEFAULT_WIDTH,
    height: PROJECT_ROOM_DEFAULT_HEIGHT,
  });
  assert.ok(seats.some((seat) => seat.seatKind === 'work' && seat.zoneSource === 'workstation'));
  assert.ok(seats.some((seat) => seat.seatKind === 'rest'));
  assert.equal(
    result.layout.furniture.some((item) => item.uid === `${room.id}-rest-seat`),
    true,
  );
  assertGeneratedFurnitureInsetFromRoomWalls(result.layout, room);
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

test('an existing public lobby and project room are kept in place (frozen) and given lounge furniture', () => {
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
  // Stale GENERATED lobby WORK furniture (project-room-lobby-* desk/pc/chair) is cleaned up by the
  // lounge pass; hand-placed furniture (f-* uids) is never destroyed.
  layout.furniture = [
    { uid: 'project-room-lobby-stale-desk', type: 'DESK', col: 1, row: 1 },
    { uid: 'project-room-lobby-stale-pc', type: 'PC', col: 2, row: 1 },
    { uid: 'project-room-lobby-stale-chair', type: 'CHAIR_UP', col: 2, row: 3 },
    { uid: 'f-hand-keepsake', type: 'PLANT', col: 8, row: 5 },
  ];

  const result = ensureProjectRoomsForAgents(layout, [{ folderName: 'Alpha', isSubagent: false }]);
  const furnitureByUid = new Map(result.layout.furniture.map((item) => [item.uid, item.type]));

  // FROZEN: an existing lobby + project room are NOT relocated/resized on provision (ray approved
  // reversing the old relocate-to-row-11 reflow in favour of in-place stability).
  assert.deepEqual(publicRooms(result.layout)[0]?.bounds, { col: 0, row: 0, width: 10, height: 8 });
  assert.deepEqual(projectRooms(result.layout)[0]?.bounds, {
    col: 10,
    row: 0,
    width: 9,
    height: 7,
  });
  assert.equal(result.layout.cols, 19);
  assert.equal(result.layout.rows, 8);
  // Generated lobby work furniture removed; hand furniture preserved.
  assert.equal(furnitureByUid.has('project-room-lobby-stale-desk'), false);
  assert.equal(furnitureByUid.has('project-room-lobby-stale-pc'), false);
  assert.equal(furnitureByUid.has('project-room-lobby-stale-chair'), false);
  assert.equal(furnitureByUid.get('f-hand-keepsake'), 'PLANT');
  // Lounge furniture is still provided in place.
  assert.ok(result.loungeFurnitureAddedCount >= 3);
  assert.ok(
    seatsInRoom(result.layout, publicRooms(result.layout)[0]!).some(
      (seat) => seat.seatKind === 'rest',
    ),
  );
});

test('lobby lounge is planted once (stamped): user edits to lounge furniture survive re-provision', () => {
  // First build: lounge planted + the lobby stamped with loungeRev.
  const first = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const lobby = publicRooms(first.layout)[0]!;
  assert.equal(lobby.loungeRev, PROJECT_ROOM_LOBBY_LOUNGE_REV);
  const seatA = first.layout.furniture.find((item) => item.uid === `${lobby.id}-lounge-seat-a`)!;
  assert.ok(seatA, 'first build must plant the lounge');

  // The user edits the lobby: moves one sofa, deletes one table. These must SURVIVE the next
  // provision — previously the corridor ensure recomputed the canonical lounge set and snapped
  // every deviation back (the "my lobby edits revert on reload" bug).
  const edited = {
    ...first.layout,
    furniture: first.layout.furniture
      .filter((item) => item.uid !== `${lobby.id}-lounge-table-a`)
      .map((item) => (item.uid === seatA.uid ? { ...item, col: item.col + 1 } : item)),
  };

  const second = ensureProjectRoomsForAgents(edited, [{ folderName: 'Alpha', isSubagent: false }]);
  const seatAfter = second.layout.furniture.find((item) => item.uid === seatA.uid);
  assert.equal(seatAfter?.col, seatA.col + 1, 'moved lounge sofa must stay where the user put it');
  assert.equal(
    second.layout.furniture.some((item) => item.uid === `${lobby.id}-lounge-table-a`),
    false,
    'deleted lounge table must stay deleted',
  );
  assert.equal(second.loungeFurnitureAddedCount, 0, 'stamped lobby must see zero lounge churn');
});

test('a pre-stamp lobby that already has lounge furniture is stamped as-is without reasserting', () => {
  // Migration path: lobbies provisioned before the stamp existed carry lounge furniture but no
  // loungeRev. The first provision after upgrade must stamp them WITHOUT moving anything.
  const first = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const lobby = publicRooms(first.layout)[0]!;
  const unstamped = {
    ...first.layout,
    projectRooms: (first.layout.projectRooms ?? []).map((room) => {
      const clone = { ...room };
      delete clone.loungeRev;
      return clone;
    }),
  };
  const moved = {
    ...unstamped,
    furniture: unstamped.furniture.map((item) =>
      item.uid === `${lobby.id}-lounge-seat-a` ? { ...item, col: item.col + 1 } : item,
    ),
  };
  const second = ensureProjectRoomsForAgents(moved, [{ folderName: 'Alpha', isSubagent: false }]);
  const seatAfter = second.layout.furniture.find(
    (item) => item.uid === `${lobby.id}-lounge-seat-a`,
  );
  const movedSeat = moved.furniture.find((item) => item.uid === `${lobby.id}-lounge-seat-a`)!;
  assert.equal(seatAfter?.col, movedSeat.col, 'migration stamp must not reassert lounge positions');
  assert.equal(publicRooms(second.layout)[0]?.loungeRev, PROJECT_ROOM_LOBBY_LOUNGE_REV);
});

test('an existing work-corridor lounge is kept in place, not reflowed', () => {
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

  // FROZEN: rooms stay put and the existing lounge seats/tables are not relocated or rebuilt.
  assert.deepEqual(publicRooms(result.layout)[0]?.bounds, { col: 0, row: 9, width: 21, height: 6 });
  assert.deepEqual(projectRooms(result.layout)[0]?.bounds, {
    col: 0,
    row: 0,
    width: 10,
    height: 8,
  });
  assert.equal(result.layout.cols, 21);
  assert.equal(result.layout.rows, 15);
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-a')?.col, 2);
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-a')?.row, 11);
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-table-a')?.col, 2);
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-table-a')?.row, 12);
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-seat-b')?.col, 16);
  assert.equal(furnitureByUid.get('project-room-lobby-lounge-table-b')?.col, 16);
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

test('existing generated project room furniture is kept in place (frozen), not reflowed or resized', () => {
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

  // FROZEN: the existing room keeps its own bounds (not resized to the default) and none of its
  // furniture is reflowed inward — provision is additive only on an existing campus.
  assert.deepEqual(room.bounds, { col: 0, row: 0, width: 10, height: 8 });
  assert.equal(furnitureByUid.get('project-alpha-desk')?.row, 1);
  assert.equal(furnitureByUid.get('project-alpha-tech')?.row, 1);
  assert.equal(furnitureByUid.get('project-alpha-work-chair')?.row, 3);
  assert.equal(furnitureByUid.get('project-alpha-rest-seat')?.row, 4);
  assert.equal(furnitureByUid.get('project-alpha-rest-table')?.row, 5);
});

test('an existing multi-room campus is frozen: re-provision relocates no room and grows no grid', () => {
  // Build a campus from scratch, then re-provision with no new projects (exactly what happens on
  // every webview load). Room bounds + grid size must be a complete no-op — this is the regression
  // guard for the campus auto-reorg that teleported seated agents and ratcheted the grid to MAX_ROWS.
  const built = ensureProjectRoomsForAgents(makeLayout(40, 40), [
    { folderName: 'alpha', isSubagent: false },
    { folderName: 'bravo', isSubagent: false },
    { folderName: 'charlie', isSubagent: false },
  ]).layout;
  const boundsBefore = new Map(
    (built.projectRooms ?? []).map((room) => [room.id, { ...room.bounds }]),
  );

  const reprovision = ensureProjectRoomsForAgents(built, []);

  assert.equal(reprovision.createdRooms.length, 0);
  assert.equal(reprovision.layout.cols, built.cols);
  assert.equal(reprovision.layout.rows, built.rows);
  for (const room of reprovision.layout.projectRooms ?? []) {
    assert.deepEqual(room.bounds, boundsBefore.get(room.id), `${room.id} bounds were moved`);
  }
  assert.equal((reprovision.layout.projectRooms ?? []).length, boundsBefore.size);
});

test('no-lobby recovery anchors the campus below the hand-design without ratcheting the row down', () => {
  // The de-ratchet guard: when project rooms exist with no lobby (older orphaned layout), the
  // recovery reflow must anchor the recreated lobby just below the user's hand-design and land at the
  // SAME row every time. The old protectedDesignMaxRow counted the generator's own corridor tiles, so
  // each recovery pass pushed the lobby lower until placement failed.
  const base = makeLayout(40, 40);
  base.furniture = [{ uid: 'f-hand-desk', type: 'DESK', col: 2, row: 1 }];
  const agents = [
    { folderName: 'alpha', isSubagent: false },
    { folderName: 'bravo', isSubagent: false },
    { folderName: 'charlie', isSubagent: false },
  ];

  let layout = ensureProjectRoomsForAgents(base, agents).layout;
  const firstLobbyRow = publicRooms(layout)[0]!.bounds.row;
  assert.ok(firstLobbyRow > 0, 'campus should anchor below the hand-design');

  for (let pass = 0; pass < 3; pass++) {
    const orphaned = {
      ...layout,
      projectRooms: (layout.projectRooms ?? []).filter(
        (room) => room.kind !== ProjectRoomKind.PUBLIC,
      ),
    };
    layout = ensureProjectRoomsForAgents(orphaned, agents).layout;
    assert.equal(
      publicRooms(layout)[0]?.bounds.row,
      firstLobbyRow,
      `recovery pass ${pass} ratcheted the lobby row`,
    );
  }
});

test('de-ratchet protects hand furniture in the gap between scattered rooms (not just inside rooms)', () => {
  // protectedDesignMaxRow excludes the campus footprint bbox for TILES (to drop generated corridor
  // tiles), but hand furniture must be tested per-room, NOT per-bbox: an f- item in the gap between
  // two scattered rooms is real design and must still anchor the campus clear of it. Recovery (no
  // lobby) is the only path that consults protectedDesignMaxRow.
  const layout = makeLayout(40, 40);
  layout.tiles = Array.from({ length: layout.cols * layout.rows }, () => TileType.VOID);
  layout.projectRooms = [
    {
      id: 'project-alpha',
      kind: ProjectRoomKind.PROJECT,
      bounds: { col: 0, row: 2, width: 10, height: 8 },
      project: { key: 'alpha', displayName: 'alpha', source: 'folderName' },
    },
    {
      id: 'project-bravo',
      kind: ProjectRoomKind.PROJECT,
      bounds: { col: 26, row: 2, width: 10, height: 8 },
      project: { key: 'bravo', displayName: 'bravo', source: 'folderName' },
    },
  ];
  // Hand furniture in the gap (col 17) — inside the union bbox (cols 0-35) but outside any room.
  layout.furniture = [{ uid: 'f-gap-keepsake', type: 'PLANT', col: 17, row: 2 }];

  const result = ensureProjectRoomsForAgents(layout, [
    { folderName: 'alpha', isSubagent: false },
    { folderName: 'bravo', isSubagent: false },
  ]);

  const keepsake = result.layout.furniture.find((item) => item.uid === 'f-gap-keepsake');
  assert.ok(keepsake, 'hand furniture in the gap was destroyed by recovery');
  const { col: keepCol, row: keepRow } = keepsake;
  for (const room of result.layout.projectRooms ?? []) {
    const inside: boolean =
      keepCol >= room.bounds.col &&
      keepCol < room.bounds.col + room.bounds.width &&
      keepRow >= room.bounds.row &&
      keepRow < room.bounds.row + room.bounds.height;
    assert.equal(inside, false, `${room.id} was anchored on top of the gap hand furniture`);
  }
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

test('generated room front (south) wall is always open, including bottom-row rooms', () => {
  const result = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
    { folderName: 'Beta', isSubagent: false },
    { folderName: 'Delta', isSubagent: false },
    { folderName: 'Epsilon', isSubagent: false },
  ]);
  const lobby = publicRooms(result.layout)[0]!;
  assert.ok(result.createdRooms.length >= 4);

  let sawBottomRow = false;
  for (const room of result.createdRooms) {
    const southRow = room.bounds.row + room.bounds.height - 1;
    // The whole front (south) edge must be open — never wall, never void — so the camera sees in.
    for (let col = room.bounds.col; col < room.bounds.col + room.bounds.width; col++) {
      const tile = tileAt(result.layout, col, southRow);
      assert.notEqual(tile, TileType.WALL, `front wall tile at ${col},${southRow} must be open`);
      assert.notEqual(tile, TileType.VOID, `front tile at ${col},${southRow} must be walkable`);
    }
    // The back (north) wall corners stay solid, proving we only opened the front, not the room.
    assert.equal(tileAt(result.layout, room.bounds.col, room.bounds.row), TileType.WALL);
    assert.equal(
      tileAt(result.layout, room.bounds.col + room.bounds.width - 1, room.bounds.row),
      TileType.WALL,
    );
    if (room.bounds.row >= lobby.bounds.row + lobby.bounds.height) sawBottomRow = true;
  }
  // A bottom-row room keeps its furniture fixed with the entrance on the (north) corridor side,
  // and its front (south) wall still open — the case the user called out.
  assert.ok(sawBottomRow, 'expected at least one bottom-row room');
});

test('roomDoorwayKeepClearTiles protects a north-wall doorway gap, not solid walls', () => {
  const cols = 12;
  const rows = 12;
  const layout = makeLayout(cols, rows);
  const room = projectRoom('proj-a', 'alpha', 1, 1); // 9x7 room at (1,1)
  const { col, row, width, height } = room.bounds;
  // Wall the north + east + west perimeter (south stays open), with a 1-tile north doorway gap.
  for (let c = col; c < col + width; c++) layout.tiles[row * cols + c] = TileType.WALL;
  for (let r = row + 1; r < row + height - 1; r++) {
    layout.tiles[r * cols + col] = TileType.WALL;
    layout.tiles[r * cols + (col + width - 1)] = TileType.WALL;
  }
  const gapCol = col + Math.floor(width / 2);
  layout.tiles[row * cols + gapCol] = TileType.FLOOR_1;

  const clear = roomDoorwayKeepClearTiles(layout, room);
  assert.ok(clear.has(`${gapCol},${row}`), 'the doorway gap tile must be kept clear');
  assert.ok(
    clear.has(`${gapCol},${row + 1}`),
    'the tile just inside the doorway must be kept clear',
  );
  assert.ok(!clear.has(`${col + 1},${row}`), 'solid wall tiles are not doorways');

  // Sealing the gap leaves nothing to protect (e.g. a top-row room with a solid back wall).
  layout.tiles[row * cols + gapCol] = TileType.WALL;
  assert.equal(roomDoorwayKeepClearTiles(layout, room).size, 0);
});

test('openProjectRoomFronts retrofits an existing room south wall to open floor', () => {
  const cols = 12;
  const rows = 12;
  const layout = makeLayout(cols, rows);
  const room = projectRoom('proj-a', 'alpha', 1, 1); // 9x7 room at (1,1)
  layout.projectRooms = [room];
  // Simulate a pre-open-front room: paint its south (front) perimeter row as wall.
  const southRow = room.bounds.row + room.bounds.height - 1;
  for (let col = room.bounds.col; col < room.bounds.col + room.bounds.width; col++) {
    layout.tiles[southRow * cols + col] = TileType.WALL;
  }
  assert.equal(tileAt(layout, room.bounds.col, southRow), TileType.WALL);

  const result = openProjectRoomFronts(layout);

  assert.equal(result.changedCount, room.bounds.width);
  for (let col = room.bounds.col; col < room.bounds.col + room.bounds.width; col++) {
    assert.notEqual(tileAt(result.layout, col, southRow), TileType.WALL);
  }
  // Idempotent: a room that is already open is left untouched.
  assert.equal(openProjectRoomFronts(result.layout).changedCount, 0);
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
    [0, 0, 18, 18],
  );
  assert.deepEqual(
    rooms.slice(0, 4).map((room) => room.bounds.col),
    [0, 13, 0, 13],
  );
  assert.deepEqual(rooms[4]!.bounds, {
    col: 26,
    row: 0,
    width: PROJECT_ROOM_DEFAULT_WIDTH,
    height: PROJECT_ROOM_DEFAULT_HEIGHT,
  });
  assert.equal(result.layout.cols >= 38, true);
});

test('work corridor growth appends a new bay without overlapping rooms after refresh', () => {
  const agents = [
    { folderName: 'Alpha', isSubagent: false },
    { folderName: 'Beta', isSubagent: false },
    { folderName: 'Delta', isSubagent: false },
    { folderName: 'Epsilon', isSubagent: false },
    { folderName: 'Gamma', isSubagent: false },
  ];
  const first = ensureProjectRoomsForAgents(makeLayout(), agents);
  const second = ensureProjectRoomsForAgents(first.layout, agents);
  const firstBounds = new Map(first.createdRooms.map((room) => [room.id, room.bounds]));
  const refreshedRooms = projectRooms(second.layout);

  assert.equal(second.createdRooms.length, 0);
  assert.deepEqual(publicRooms(second.layout)[0]?.bounds, {
    col: 0,
    row: 11,
    width: 38,
    height: 6,
  });
  for (const room of refreshedRooms) {
    assert.deepEqual(room.bounds, firstBounds.get(room.id));
  }
  for (let i = 0; i < refreshedRooms.length; i++) {
    for (let j = i + 1; j < refreshedRooms.length; j++) {
      assert.equal(rectsOverlap(refreshedRooms[i]!.bounds, refreshedRooms[j]!.bounds), false);
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
      id: 'SOFA_SIDE',
      label: 'Sofa Side',
      category: 'chairs',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      orientation: 'side',
    },
    {
      id: 'SOFA_SIDE:left',
      label: 'Sofa Side Left',
      category: 'chairs',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      orientation: 'left',
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
      id: 'PLANT_2',
      label: 'Plant 2',
      category: 'decor',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      backgroundTiles: 1,
    },
    {
      id: 'BIN',
      label: 'Bin',
      category: 'misc',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
    },
    {
      id: 'COFFEE',
      label: 'Coffee',
      category: 'misc',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
      canPlaceOnSurfaces: true,
    },
    {
      id: 'POT',
      label: 'Pot',
      category: 'decor',
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
  assert.equal(furnitureByUid.get('project-alpha-pc-right-1'), 'PC_SIDE');
  assert.equal(furnitureByUid.get('project-alpha-pc-left-1'), 'PC_SIDE:left');
  assert.equal(furnitureByUid.get('project-alpha-chair-right-1'), 'WOODEN_CHAIR_SIDE');
  assert.equal(furnitureByUid.get('project-alpha-chair-left-1'), 'WOODEN_CHAIR_SIDE:left');
  assert.equal(furnitureByOffset.get('9,1'), 'PC_SIDE:left');
  assert.equal(furnitureByOffset.get('6,1'), 'WOODEN_CHAIR_SIDE');
  assert.equal(furnitureByOffset.get('10,1'), 'WOODEN_CHAIR_SIDE:left');
  assert.equal(furnitureByOffset.get('7,3'), 'PC_SIDE');
  assert.equal(furnitureByOffset.get('9,3'), 'PC_SIDE:left');
  assert.equal(furnitureByUid.get('project-alpha-rest-seat'), 'SOFA_FRONT');
  assert.equal(furnitureByUid.get('project-alpha-rest-table'), 'COFFEE_TABLE');
  assert.equal(furnitureByOffset.get('2,1'), 'SOFA_FRONT');
  assert.equal(furnitureByOffset.get('2,2'), 'COFFEE_TABLE');
  assert.equal(furnitureByUid.get('project-alpha-rest-seat-side-left'), 'SOFA_SIDE');
  assert.equal(furnitureByUid.get('project-alpha-rest-seat-side-right'), 'SOFA_SIDE:left');
  assert.equal(furnitureByUid.get('project-alpha-focus-desk'), 'DESK_FRONT');
  assert.equal(furnitureByUid.get('project-alpha-focus-pc'), 'PC_FRONT_OFF');
  assert.equal(furnitureByUid.get('project-alpha-focus-chair'), 'CUSHIONED_BENCH');
  assert.equal(roomSeats.filter((seat) => seat.seatKind === 'work').length >= 4, true);
  assert.ok(roomSeats.some((seat) => seat.seatKind === 'rest'));
  assertFurnitureOnWalkableRoomTiles(result.layout, room);
  assertGeneratedFurnitureInsetFromRoomWalls(result.layout, room);
});

test('new project rooms are stamped verbatim from the user template', () => {
  // Full catalog containing every PROJECT_ROOM_TEMPLATE type, so the generator stamps the template.
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
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
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
      id: 'SOFA_SIDE',
      label: 'Sofa Side',
      category: 'chairs',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      orientation: 'side',
    },
    {
      id: 'SOFA_SIDE:left',
      label: 'Sofa Side Left',
      category: 'chairs',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      orientation: 'left',
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
      id: 'PLANT_2',
      label: 'Plant 2',
      category: 'decor',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      backgroundTiles: 1,
    },
    {
      id: 'BIN',
      label: 'Bin',
      category: 'misc',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
    },
    {
      id: 'COFFEE',
      label: 'Coffee',
      category: 'misc',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
      canPlaceOnSurfaces: true,
    },
    {
      id: 'POT',
      label: 'Pot',
      category: 'decor',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
    },
    // Back-wall decor.
    {
      id: 'DOUBLE_BOOKSHELF',
      label: 'Bookshelf',
      category: 'wall',
      width: TILE_SIZE * 2,
      height: TILE_SIZE * 2,
      footprintW: 2,
      footprintH: 2,
      isDesk: false,
      canPlaceOnWalls: true,
    },
    {
      id: 'SMALL_PAINTING',
      label: 'Painting',
      category: 'wall',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      canPlaceOnWalls: true,
    },
    {
      id: 'SMALL_PAINTING_2',
      label: 'Painting 2',
      category: 'wall',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      canPlaceOnWalls: true,
    },
    {
      id: 'CLOCK',
      label: 'Clock',
      category: 'wall',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      canPlaceOnWalls: true,
    },
    {
      id: 'HANGING_PLANT',
      label: 'Hanging Plant',
      category: 'wall',
      width: TILE_SIZE,
      height: TILE_SIZE * 2,
      footprintW: 1,
      footprintH: 2,
      isDesk: false,
      canPlaceOnWalls: true,
      canPlaceOnSurfaces: true,
    },
  ];
  buildDynamicCatalog({
    catalog: assets,
    sprites: Object.fromEntries(assets.map((asset) => [asset.id, sprite])),
  });

  // A new project room is a verbatim stamp of the user-authored template.
  const fresh = ensureProjectRoomsForAgents(makeLayout(), [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  const room = fresh.createdRooms[0]!;
  const stamped = fresh.layout.furniture.filter((item) => item.uid.startsWith(`${room.id}-tpl-`));
  assert.equal(
    stamped.length,
    PROJECT_ROOM_TEMPLATE.furniture.length,
    'every template piece is stamped',
  );
  for (const item of PROJECT_ROOM_TEMPLATE.furniture) {
    const present = stamped.some(
      (f) =>
        f.type === item.type &&
        f.col === room.bounds.col + item.colOffset &&
        f.row === room.bounds.row + item.rowOffset,
    );
    assert.ok(present, `template ${item.type} at ${item.colOffset},${item.rowOffset} is stamped`);
  }

  // The stamp IS the complete interior — no heuristic accents or wall decor are added alongside it.
  const nonTemplateRoomFurniture = fresh.layout.furniture.filter(
    (f) => f.uid.startsWith(`${room.id}-`) && !f.uid.startsWith(`${room.id}-tpl-`),
  );
  assert.equal(
    nonTemplateRoomFurniture.length,
    0,
    'a stamped room gets no heuristic furniture added on top',
  );

  // Re-provisioning the same project is idempotent — no new room, no duplicate furniture.
  const again = ensureProjectRoomsForAgents(fresh.layout, [
    { folderName: 'Alpha', isSubagent: false },
  ]);
  assert.equal(again.createdRooms.length, 0, 'no new room for the existing project');
  assert.equal(
    again.layout.furniture.length,
    fresh.layout.furniture.length,
    'no duplicate furniture on re-provision',
  );
});

test('auto-generation never destroys the user hand-designed layout', () => {
  // A hand-designed studio: editor furniture uses f-<timestamp> uids. The room generator must add
  // project rooms WITHOUT deleting any hand-placed furniture, overlapping it, or voiding its floor.
  const layout = makeLayout(14, 10);
  layout.furniture = [
    { uid: 'f-1000-a', type: 'DESK', col: 1, row: 1 },
    { uid: 'f-1000-b', type: 'PC', col: 2, row: 1 },
    { uid: 'f-1000-c', type: 'CHAIR_UP', col: 2, row: 3 },
    { uid: 'f-1000-d', type: 'SOFA', col: 6, row: 2 },
    { uid: 'f-1000-e', type: 'COFFEE_TABLE', col: 6, row: 4 },
    { uid: 'f-1000-f', type: 'PLANT', col: 10, row: 6 },
    { uid: 'f-1000-g', type: 'CUSHIONED_BENCH', col: 11, row: 7 },
  ];
  const before = new Map(layout.furniture.map((item) => [item.uid, { ...item }]));

  const result = ensureProjectRoomsForAgents(layout, [
    { folderName: 'Alpha', isSubagent: false },
    { folderName: 'Beta', isSubagent: false },
  ]);

  const isHand = (uid: string) => uid.startsWith('f-');
  const after = new Map(result.layout.furniture.map((item) => [item.uid, item]));

  // 1. Every hand-placed item survives, unmoved.
  assert.equal(result.createdRooms.length, 2, 'rooms were generated');
  for (const [uid, original] of before) {
    const survivor = after.get(uid);
    assert.ok(survivor, `hand-placed ${uid} must survive generation`);
    assert.equal(survivor.col, original.col, `${uid} must not move (col)`);
    assert.equal(survivor.row, original.row, `${uid} must not move (row)`);
  }

  // 2. No generated room overlaps any hand-placed furniture footprint.
  const fpBounds = (item: PlacedFurniture) => {
    const entry = getCatalogEntry(item.type);
    return {
      col: item.col,
      row: item.row,
      width: entry?.footprintW ?? 1,
      height: entry?.footprintH ?? 1,
    };
  };
  for (const room of result.layout.projectRooms ?? []) {
    for (const item of result.layout.furniture) {
      if (!isHand(item.uid)) continue;
      assert.equal(
        rectsOverlap(room.bounds, fpBounds(item)),
        false,
        `room ${room.id} must not overlap hand-placed ${item.uid}`,
      );
    }
  }

  // 3. No hand-placed furniture tile is voided by generation.
  for (const item of result.layout.furniture) {
    if (!isHand(item.uid)) continue;
    const b = fpBounds(item);
    for (let row = b.row; row < b.row + b.height; row++) {
      for (let col = b.col; col < b.col + b.width; col++) {
        assert.notEqual(
          tileAt(result.layout, col, row),
          TileType.VOID,
          `hand-placed ${item.uid} must not sit on a voided tile at ${col},${row}`,
        );
      }
    }
  }
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
