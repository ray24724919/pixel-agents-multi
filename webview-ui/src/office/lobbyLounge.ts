import {
  PROJECT_ROOM_LOBBY_LOUNGE_EDGE_PADDING_TILES,
  PROJECT_ROOM_LOBBY_LOUNGE_MAX_DECOR,
  PROJECT_ROOM_LOBBY_LOUNGE_MAX_PODS,
  PROJECT_ROOM_LOBBY_LOUNGE_MIN_DECOR,
  PROJECT_ROOM_LOBBY_LOUNGE_MIN_PODS,
  PROJECT_ROOM_LOBBY_LOUNGE_REV,
  PROJECT_ROOM_LOBBY_LOUNGE_TILES_PER_DECOR,
  PROJECT_ROOM_LOBBY_LOUNGE_TILES_PER_POD,
  PROJECT_ROOM_WORK_CORRIDOR_HEIGHT,
  PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_LEFT_TABLE_COL_OFFSET,
  PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_RIGHT_TABLE_MARGIN,
  PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_TABLE_ROW_OFFSET,
  PROJECT_ROOM_WORK_CORRIDOR_MIN_WIDTH,
} from '../constants.js';
import {
  canPlaceSuiteFurniture,
  clampInt,
  isGeneratedFurnitureUid,
  isLoungeTableFurniture,
  isSideOrientation,
  pickPreferredEntry,
  placedFurnitureBounds,
  roomHasFurniture,
  roomSeats,
  type RoomTemplateAssets,
} from './generationShared.js';
import { rectsOverlap } from './geometry.js';
import { getAllCatalogEntries } from './layout/furnitureCatalog.js';
import { normalizeProjectRooms } from './projectRooms.js';
import type { FurnitureCatalogEntry, OfficeLayout, PlacedFurniture, ProjectRoom } from './types.js';
import { ProjectRoomKind } from './types.js';

/**
 * The public lobby's lounge: planted exactly once per lobby (then stamped via
 * ProjectRoom.loungeRev) so the user's manual lobby edits survive every later provision.
 * Carved out of projectRoomGeneration.ts verbatim — behavior-preserving split.
 */

export function ensureLobbyLoungeFurniture(
  layout: OfficeLayout,
  template: RoomTemplateAssets,
): { layout: OfficeLayout; addedCount: number } {
  let furniture = layout.furniture;
  let addedCount = 0;
  const stampedRoomIds = new Set<string>();
  for (const room of normalizeProjectRooms(layout).filter(
    (candidate) => candidate.kind === ProjectRoomKind.PUBLIC,
  )) {
    // One-time lounge: a stamped lobby is owned by the user — generation never reasserts its lounge
    // furniture, so manual edits (move/delete/add) survive every reload. Without this, the corridor
    // ensure recomputed the canonical lounge set each provision and snapped any deviation back.
    if (room.loungeRev === PROJECT_ROOM_LOBBY_LOUNGE_REV) continue;
    // Migration for lobbies provisioned before the stamp existed: lounge furniture already present →
    // stamp as-is WITHOUT reasserting, so any user edits made since are respected from now on.
    if (furniture.some((item) => isGeneratedLobbyLoungeFurniture(room, item))) {
      stampedRoomIds.add(room.id);
      continue;
    }
    stampedRoomIds.add(room.id);
    let roomAdded = 0;
    const cleanedFurniture = furniture.filter((item) => {
      if (!isGeneratedFurnitureUid(item.uid)) return true; // never remove hand-placed furniture
      const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
      if (!entry || !rectsOverlap(room.bounds, placedFurnitureBounds(item, entry))) return true;
      if (!isLobbyWorkFurniture(entry)) return true;
      roomAdded++;
      return false;
    });
    const layoutAfterCleanup = { ...layout, furniture: cleanedFurniture };
    const seats = roomSeats(layoutAfterCleanup, room);
    const hasRestSeat = seats.some((seat) => seat.seatKind === 'rest');
    const hasLoungeTable = roomHasFurniture(layoutAfterCleanup, room, isLoungeTableFurniture);
    const hasDecor = roomHasFurniture(layoutAfterCleanup, room, isLoungeDecorFurniture);
    const nextFurniture = [...cleanedFurniture];
    const isCorridorLobby = isWorkCorridorLobby(room);

    if (isCorridorLobby) {
      const corridorResult = ensureWorkCorridorLobbyLoungeFurniture(
        layout,
        room,
        nextFurniture,
        template,
      );
      const changedCount = roomAdded + corridorResult.changedCount;
      if (changedCount > 0) {
        furniture = corridorResult.furniture;
        addedCount += changedCount;
      }
      continue;
    }

    if (!hasRestSeat) {
      for (const item of findLobbyRestSeatPlacements(
        layout,
        room,
        template.restSeat,
        nextFurniture,
      )) {
        nextFurniture.push(item);
        roomAdded++;
      }
    }

    if (!hasLoungeTable && template.loungeTable) {
      const table = findLobbyFurniturePlacement(
        layout,
        room,
        template.loungeTable,
        `${room.id}-lounge-table`,
        nextFurniture,
        [
          {
            col:
              room.bounds.col +
              Math.max(1, Math.floor((room.bounds.width - template.loungeTable.footprintW) / 2)),
            row:
              room.bounds.row +
              Math.max(2, Math.floor((room.bounds.height - template.loungeTable.footprintH) / 2)),
          },
        ],
      );
      if (table) {
        nextFurniture.push(table);
        roomAdded++;
      }
    }

    if (!hasDecor && template.loungeDecor) {
      const decor = findLobbyFurniturePlacement(
        layout,
        room,
        template.loungeDecor,
        `${room.id}-lounge-decor`,
        nextFurniture,
        [
          {
            col: room.bounds.col + 1,
            row: room.bounds.row + room.bounds.height - template.loungeDecor.footprintH - 1,
          },
          {
            col: room.bounds.col + room.bounds.width - template.loungeDecor.footprintW - 1,
            row: room.bounds.row + 1,
          },
        ],
      );
      if (decor) {
        nextFurniture.push(decor);
        roomAdded++;
      }
    }

    roomAdded += appendLobbyLoungePods(layout, room, template, nextFurniture);
    if (template.loungeDecor) {
      roomAdded += appendLobbyLoungeDecor(layout, room, template.loungeDecor, nextFurniture);
    }

    if (roomAdded > 0) {
      furniture = nextFurniture;
      addedCount += roomAdded;
    }
  }
  if (stampedRoomIds.size > 0) {
    const projectRooms = normalizeProjectRooms(layout).map((room) =>
      stampedRoomIds.has(room.id) ? { ...room, loungeRev: PROJECT_ROOM_LOBBY_LOUNGE_REV } : room,
    );
    // Stamping must persist (count as a change) so an already-provisioned lobby is marked exactly
    // once and never touched again.
    return {
      layout: { ...layout, furniture, projectRooms },
      addedCount: addedCount + stampedRoomIds.size,
    };
  }
  return addedCount > 0 ? { layout: { ...layout, furniture }, addedCount } : { layout, addedCount };
}

/**
 * ③c append-only lounge widen. ensureLobbyLoungeFurniture's loungeRev short-circuit freezes the
 * lobby's lounge so manual edits survive — but when ③c right-anchored growth widens the lobby its new
 * span stays empty. This pass fills ONLY the grown span, append-only (uid-keyed; skips every piece that
 * already exists, so user moves/deletes elsewhere are untouched), tracking per-room `loungeSpanWidth`
 * so it runs exactly once per widen. It deliberately does NOT bump PROJECT_ROOM_LOBBY_LOUNGE_REV — a
 * blanket lounge rebuild would clobber the user's lobby edits (the bug the rev stamp prevents).
 *
 * `loungeSpanWidth === undefined` (a lobby stamped before this release, or freshly built this run which
 * already fills its current width) is baseline-stamped to the current width WITHOUT adding anything;
 * the stamp counts as a change so it PERSISTS, giving the next genuine widen a correct reference.
 */
export function ensureLobbyLoungeWidthFill(
  layout: OfficeLayout,
  template: RoomTemplateAssets,
): { layout: OfficeLayout; addedCount: number } {
  let furniture = layout.furniture;
  let addedCount = 0;
  const stampWidth = new Map<string, number>();
  for (const room of normalizeProjectRooms(layout).filter(isWorkCorridorLobby)) {
    const currentWidth = room.bounds.width;
    const prev = room.loungeSpanWidth;
    if (prev !== undefined && currentWidth <= prev) continue; // no growth → leave frozen
    if (prev !== undefined) {
      const nextFurniture = [...furniture];
      let roomAdded = appendLobbyLoungePods(layout, room, template, nextFurniture);
      if (template.loungeDecor) {
        roomAdded += appendLobbyLoungeDecor(layout, room, template.loungeDecor, nextFurniture);
      }
      if (roomAdded > 0) {
        furniture = nextFurniture;
        addedCount += roomAdded;
      }
    }
    stampWidth.set(room.id, currentWidth); // fill case restamps; undefined case baselines
  }
  if (stampWidth.size === 0) {
    return addedCount > 0
      ? { layout: { ...layout, furniture }, addedCount }
      : { layout, addedCount };
  }
  const projectRooms = normalizeProjectRooms(layout).map((room) =>
    stampWidth.has(room.id) ? { ...room, loungeSpanWidth: stampWidth.get(room.id) } : room,
  );
  // Stamping persists (counts as a change) so the baseline/restamp is written exactly once per width.
  return {
    layout: { ...layout, furniture, projectRooms },
    addedCount: addedCount + stampWidth.size,
  };
}

function isWorkCorridorLobby(room: ProjectRoom): boolean {
  return (
    room.kind === ProjectRoomKind.PUBLIC &&
    room.bounds.height >= PROJECT_ROOM_WORK_CORRIDOR_HEIGHT &&
    room.bounds.width >= PROJECT_ROOM_WORK_CORRIDOR_MIN_WIDTH
  );
}

function findLobbyRestSeatPlacements(
  layout: OfficeLayout,
  room: ProjectRoom,
  restSeat: FurnitureCatalogEntry,
  furniture: PlacedFurniture[],
): PlacedFurniture[] {
  const placements: PlacedFurniture[] = [];
  const preferred = [
    {
      uid: `${room.id}-lounge-seat-a`,
      col: room.bounds.col + 2,
      row: room.bounds.row + 2,
    },
    {
      uid: `${room.id}-lounge-seat-b`,
      col: room.bounds.col + room.bounds.width - restSeat.footprintW - 3,
      row: room.bounds.row + 2,
    },
  ];
  for (const candidate of preferred) {
    const placement = findLobbyFurniturePlacement(
      layout,
      room,
      restSeat,
      candidate.uid,
      [...furniture, ...placements],
      [{ col: candidate.col, row: candidate.row }],
    );
    if (placement) placements.push(placement);
  }
  return placements;
}

function ensureWorkCorridorLobbyLoungeFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  furniture: PlacedFurniture[],
  template: RoomTemplateAssets,
): { furniture: PlacedFurniture[]; changedCount: number } {
  const baseFurniture = furniture.filter((item) => !isGeneratedLobbyLoungeFurniture(room, item));
  const generatedFurniture = furniture.filter((item) =>
    isGeneratedLobbyLoungeFurniture(room, item),
  );
  const plannedFurniture = buildWorkCorridorLobbyLoungeFurniture(
    layout,
    room,
    template,
    baseFurniture,
  );
  if (sameFurnitureSet(generatedFurniture, plannedFurniture)) {
    return { furniture, changedCount: 0 };
  }
  return {
    furniture: [...baseFurniture, ...plannedFurniture],
    changedCount: generatedFurniture.length + plannedFurniture.length,
  };
}

function buildWorkCorridorLobbyLoungeFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  template: RoomTemplateAssets,
  baseFurniture: PlacedFurniture[],
): PlacedFurniture[] {
  const planned: PlacedFurniture[] = [];
  if (!template.loungeTable) return planned;

  const entries = getAllCatalogEntries();
  const frontSeat = pickDirectionalRestSeat(entries, template.restSeat, 'front');
  const backSeat = pickDirectionalRestSeat(entries, template.restSeat, 'back');
  const rightFacingSeat = pickDirectionalRestSeat(entries, template.restSeat, 'right');
  const leftFacingSeat = pickDirectionalRestSeat(entries, template.restSeat, 'left');
  const tableRow = clampInt(
    room.bounds.row + PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_TABLE_ROW_OFFSET,
    room.bounds.row + 1,
    room.bounds.row + room.bounds.height - template.loungeTable.footprintH - 1,
  );
  const tableCols = [
    room.bounds.col + PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_LEFT_TABLE_COL_OFFSET,
    room.bounds.col +
      room.bounds.width -
      template.loungeTable.footprintW -
      PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_RIGHT_TABLE_MARGIN,
  ];

  for (const [index, preferredCol] of tableCols.entries()) {
    const suffix = index === 0 ? 'a' : 'b';
    const table = tryPlanLobbyFurniture(
      layout,
      room,
      template.loungeTable,
      `${room.id}-lounge-table-${suffix}`,
      baseFurniture,
      planned,
      [{ col: preferredCol, row: tableRow }],
    );
    if (!table) continue;
    planned.push(table);
    for (const seat of buildCorridorSofaClusterSeats(
      room,
      table,
      template.loungeTable,
      frontSeat,
      backSeat,
      rightFacingSeat,
      leftFacingSeat,
      `${room.id}-lounge-seat-${suffix}`,
    )) {
      const placement = tryPlanLobbyFurniture(
        layout,
        room,
        seat.entry,
        seat.uid,
        baseFurniture,
        planned,
        [{ col: seat.col, row: seat.row }],
      );
      if (placement) planned.push(placement);
    }
  }

  const decorPalette =
    template.lobbyDecorVariety && template.lobbyDecorVariety.length > 0
      ? template.lobbyDecorVariety
      : template.loungeDecor
        ? [template.loungeDecor]
        : [];
  if (decorPalette.length > 0) {
    const targetDecor = targetLobbyLoungeDecorCount(room);
    for (let decorIndex = 0; decorIndex < targetDecor; decorIndex++) {
      const decorEntry = decorPalette[decorIndex % decorPalette.length]!;
      const uid =
        decorIndex === 0 ? `${room.id}-lounge-decor` : `${room.id}-lounge-decor-${decorIndex + 1}`;
      const decor = tryPlanLobbyFurniture(
        layout,
        room,
        decorEntry,
        uid,
        baseFurniture,
        planned,
        buildCorridorLobbyDecorPreferredPositions(room, decorEntry, decorIndex),
      );
      if (decor) planned.push(decor);
    }
  }

  return planned;
}

function pickDirectionalRestSeat(
  entries: FurnitureCatalogEntry[],
  fallback: FurnitureCatalogEntry,
  direction: 'front' | 'back' | 'left' | 'right',
): FurnitureCatalogEntry {
  return (
    pickPreferredEntry(
      entries,
      (entry) =>
        entry.category === 'chairs' &&
        isRestSeatFurniture(entry) &&
        directionalRestSeatMatches(entry, direction),
      (entry) => {
        const text = `${entry.type} ${entry.label}`;
        if (/sofa/i.test(text)) return 100;
        if (/couch/i.test(text)) return 90;
        if (/bench|cushion/i.test(text)) return 60;
        return 10;
      },
    ) ?? fallback
  );
}

function directionalRestSeatMatches(
  entry: FurnitureCatalogEntry,
  direction: 'front' | 'back' | 'left' | 'right',
): boolean {
  if (direction === 'front' || direction === 'back') return entry.orientation === direction;
  return isSideOrientation(entry.orientation, direction);
}

function buildCorridorSofaClusterSeats(
  room: ProjectRoom,
  table: PlacedFurniture,
  tableEntry: FurnitureCatalogEntry,
  frontSeat: FurnitureCatalogEntry,
  backSeat: FurnitureCatalogEntry,
  rightFacingSeat: FurnitureCatalogEntry,
  leftFacingSeat: FurnitureCatalogEntry,
  uidPrefix: string,
): Array<{ uid: string; entry: FurnitureCatalogEntry; col: number; row: number }> {
  const centerCol = table.col + Math.floor((tableEntry.footprintW - frontSeat.footprintW) / 2);
  const backCol = table.col + Math.floor((tableEntry.footprintW - backSeat.footprintW) / 2);
  return [
    {
      uid: uidPrefix,
      entry: frontSeat,
      col: clampInt(
        centerCol,
        room.bounds.col + 1,
        room.bounds.col + room.bounds.width - frontSeat.footprintW - 1,
      ),
      row: table.row - frontSeat.footprintH,
    },
    {
      uid: `${uidPrefix}-back`,
      entry: backSeat,
      col: clampInt(
        backCol,
        room.bounds.col + 1,
        room.bounds.col + room.bounds.width - backSeat.footprintW - 1,
      ),
      row: table.row + tableEntry.footprintH,
    },
    {
      uid: `${uidPrefix}-left`,
      entry: rightFacingSeat,
      col: table.col - rightFacingSeat.footprintW,
      row: table.row,
    },
    {
      uid: `${uidPrefix}-right`,
      entry: leftFacingSeat,
      col: table.col + tableEntry.footprintW,
      row: table.row,
    },
  ];
}

function tryPlanLobbyFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  entry: FurnitureCatalogEntry,
  uid: string,
  baseFurniture: PlacedFurniture[],
  plannedFurniture: PlacedFurniture[],
  preferred: Array<{ col: number; row: number }>,
): PlacedFurniture | null {
  return findLobbyFurniturePlacement(
    layout,
    room,
    entry,
    uid,
    [...baseFurniture, ...plannedFurniture],
    preferred,
  );
}

function isGeneratedLobbyLoungeFurniture(room: ProjectRoom, item: PlacedFurniture): boolean {
  return item.uid.startsWith(`${room.id}-lounge-`);
}

function buildCorridorLobbyDecorPreferredPositions(
  room: ProjectRoom,
  decor: FurnitureCatalogEntry,
  decorIndex: number,
): Array<{ col: number; row: number }> {
  const topRow = room.bounds.row + 1;
  const centerCol = room.bounds.col + Math.floor((room.bounds.width - decor.footprintW) / 2);
  const rightCol = room.bounds.col + room.bounds.width - decor.footprintW - 1;
  const leftAccentCol =
    room.bounds.col +
    PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_LEFT_TABLE_COL_OFFSET +
    decor.footprintW +
    1;
  const positions = [
    { col: centerCol, row: topRow },
    { col: rightCol, row: topRow },
    { col: leftAccentCol, row: topRow },
    ...buildLobbyDecorPreferredPositions(room, decor, decorIndex),
  ];
  return [positions[decorIndex % positions.length]!, ...positions];
}

function sameFurnitureSet(actual: PlacedFurniture[], expected: PlacedFurniture[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualByUid = new Map(actual.map((item) => [item.uid, item]));
  return expected.every((item) => {
    const actualItem = actualByUid.get(item.uid);
    return (
      actualItem?.type === item.type && actualItem.col === item.col && actualItem.row === item.row
    );
  });
}

function appendLobbyLoungePods(
  layout: OfficeLayout,
  room: ProjectRoom,
  template: RoomTemplateAssets,
  furniture: PlacedFurniture[],
): number {
  const target = targetLobbyLoungePodCount(room);
  const generatedLegacySeats = furniture.filter(
    (item) => item.uid === `${room.id}-lounge-seat-a` || item.uid === `${room.id}-lounge-seat-b`,
  ).length;
  let added = 0;
  for (let podIndex = generatedLegacySeats; podIndex < target; podIndex++) {
    const podNumber = podIndex + 1;
    const seatUid = `${room.id}-lounge-pod-${podNumber}-seat`;
    const tableUid = `${room.id}-lounge-pod-${podNumber}-table`;
    const seatExists = furniture.some((item) => item.uid === seatUid);
    const tableExists = !template.loungeTable || furniture.some((item) => item.uid === tableUid);
    if (seatExists && tableExists) continue;

    if (seatExists) {
      const seat = furniture.find((item) => item.uid === seatUid);
      if (seat && template.loungeTable && !tableExists) {
        const table = findTableNearLobbySeat(
          layout,
          room,
          seat,
          template.restSeat,
          template.loungeTable,
          tableUid,
          furniture,
        );
        if (table) {
          furniture.push(table);
          added++;
        }
      }
      continue;
    }

    const pod = findLobbyLoungePodPlacement(
      layout,
      room,
      template.restSeat,
      template.loungeTable,
      seatUid,
      tableUid,
      podIndex,
      furniture,
    );
    if (pod) {
      furniture.push(pod.seat);
      added++;
      if (pod.table) {
        furniture.push(pod.table);
        added++;
      }
    }
  }
  return added;
}

function appendLobbyLoungeDecor(
  layout: OfficeLayout,
  room: ProjectRoom,
  decor: FurnitureCatalogEntry,
  furniture: PlacedFurniture[],
): number {
  const target = targetLobbyLoungeDecorCount(room);
  const legacyDecorCount = furniture.some((item) => item.uid === `${room.id}-lounge-decor`) ? 1 : 0;
  let added = 0;
  for (let decorIndex = legacyDecorCount; decorIndex < target; decorIndex++) {
    const uid = `${room.id}-lounge-decor-${decorIndex + 1}`;
    if (furniture.some((item) => item.uid === uid)) continue;
    const placement = findLobbyFurniturePlacement(
      layout,
      room,
      decor,
      uid,
      furniture,
      buildLobbyDecorPreferredPositions(room, decor, decorIndex),
    );
    if (placement) {
      furniture.push(placement);
      added++;
    }
  }
  return added;
}

function targetLobbyLoungePodCount(room: ProjectRoom): number {
  return clampInt(
    Math.floor((room.bounds.width * room.bounds.height) / PROJECT_ROOM_LOBBY_LOUNGE_TILES_PER_POD),
    PROJECT_ROOM_LOBBY_LOUNGE_MIN_PODS,
    PROJECT_ROOM_LOBBY_LOUNGE_MAX_PODS,
  );
}

function targetLobbyLoungeDecorCount(room: ProjectRoom): number {
  return clampInt(
    Math.floor(
      (room.bounds.width * room.bounds.height) / PROJECT_ROOM_LOBBY_LOUNGE_TILES_PER_DECOR,
    ),
    PROJECT_ROOM_LOBBY_LOUNGE_MIN_DECOR,
    PROJECT_ROOM_LOBBY_LOUNGE_MAX_DECOR,
  );
}

function findLobbyLoungePodPlacement(
  layout: OfficeLayout,
  room: ProjectRoom,
  restSeat: FurnitureCatalogEntry,
  loungeTable: FurnitureCatalogEntry | undefined,
  seatUid: string,
  tableUid: string,
  podIndex: number,
  furniture: PlacedFurniture[],
): { seat: PlacedFurniture; table?: PlacedFurniture } | null {
  const candidates = buildLobbyPodSeatCandidates(room, restSeat, loungeTable, seatUid, podIndex);
  const seen = new Set<string>();
  for (const seat of candidates) {
    const key = `${seat.col},${seat.row},${seat.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!canPlaceSuiteFurniture(layout, room, seat, furniture)) continue;
    if (!loungeTable) return { seat };
    const table = findTableNearLobbySeat(layout, room, seat, restSeat, loungeTable, tableUid, [
      ...furniture,
      seat,
    ]);
    if (table) return { seat, table };
  }
  return null;
}

function buildLobbyPodSeatCandidates(
  room: ProjectRoom,
  restSeat: FurnitureCatalogEntry,
  loungeTable: FurnitureCatalogEntry | undefined,
  uid: string,
  podIndex: number,
): PlacedFurniture[] {
  const pad = PROJECT_ROOM_LOBBY_LOUNGE_EDGE_PADDING_TILES;
  const maxCol = room.bounds.col + room.bounds.width - restSeat.footprintW - pad;
  const maxRow =
    room.bounds.row +
    room.bounds.height -
    restSeat.footprintH -
    (loungeTable?.footprintH ?? 0) -
    pad;
  const minCol = room.bounds.col + pad;
  const minRow = room.bounds.row + pad;
  const centerCol = room.bounds.col + Math.floor((room.bounds.width - restSeat.footprintW) / 2);
  const centerRow =
    room.bounds.row +
    Math.floor((room.bounds.height - restSeat.footprintH - (loungeTable?.footprintH ?? 0)) / 2);
  const primary = [
    { col: minCol, row: minRow },
    { col: maxCol, row: minRow },
    { col: minCol, row: maxRow },
    { col: maxCol, row: maxRow },
    { col: centerCol, row: centerRow },
    { col: minCol, row: centerRow },
  ];
  return [
    primary[podIndex % primary.length]!,
    ...primary,
    ...buildFallbackLobbyFurnitureCandidates(room, restSeat, uid),
  ].map((position) => ({ uid, type: restSeat.type, col: position.col, row: position.row }));
}

function findTableNearLobbySeat(
  layout: OfficeLayout,
  room: ProjectRoom,
  seat: PlacedFurniture,
  restSeat: FurnitureCatalogEntry,
  loungeTable: FurnitureCatalogEntry,
  tableUid: string,
  furniture: PlacedFurniture[],
): PlacedFurniture | null {
  const preferred = [
    { col: seat.col, row: seat.row + restSeat.footprintH },
    { col: seat.col, row: seat.row - loungeTable.footprintH },
    { col: seat.col + restSeat.footprintW + 1, row: seat.row },
    { col: seat.col - loungeTable.footprintW - 1, row: seat.row },
  ];
  return findLobbyFurniturePlacement(layout, room, loungeTable, tableUid, furniture, preferred);
}

function buildLobbyDecorPreferredPositions(
  room: ProjectRoom,
  decor: FurnitureCatalogEntry,
  decorIndex: number,
): Array<{ col: number; row: number }> {
  const pad = PROJECT_ROOM_LOBBY_LOUNGE_EDGE_PADDING_TILES;
  const maxCol = room.bounds.col + room.bounds.width - decor.footprintW - pad;
  const maxRow = room.bounds.row + room.bounds.height - decor.footprintH - pad;
  const minCol = room.bounds.col + pad;
  const minRow = room.bounds.row + pad;
  const centerCol = room.bounds.col + Math.floor((room.bounds.width - decor.footprintW) / 2);
  const centerRow = room.bounds.row + Math.floor((room.bounds.height - decor.footprintH) / 2);
  const positions = [
    { col: minCol, row: maxRow },
    { col: maxCol, row: maxRow },
    { col: minCol, row: minRow },
    { col: maxCol, row: minRow },
    { col: centerCol, row: centerRow },
  ];
  return [positions[decorIndex % positions.length]!, ...positions];
}

export function findLobbyFurniturePlacement(
  layout: OfficeLayout,
  room: ProjectRoom,
  entry: FurnitureCatalogEntry,
  uid: string,
  furniture: PlacedFurniture[],
  preferred: Array<{ col: number; row: number }>,
): PlacedFurniture | null {
  const candidates = [
    ...preferred.map((position) => ({ uid, type: entry.type, ...position })),
    ...buildFallbackLobbyFurnitureCandidates(room, entry, uid),
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.col},${candidate.row},${candidate.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (canPlaceSuiteFurniture(layout, room, candidate, furniture)) return candidate;
  }
  return null;
}

function buildFallbackLobbyFurnitureCandidates(
  room: ProjectRoom,
  entry: FurnitureCatalogEntry,
  uid: string,
): PlacedFurniture[] {
  const candidates: PlacedFurniture[] = [];
  const minCol = room.bounds.col + 1;
  const maxCol = room.bounds.col + room.bounds.width - entry.footprintW - 1;
  const minRow = room.bounds.row + 1;
  const maxRow = room.bounds.row + room.bounds.height - entry.footprintH - 1;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      candidates.push({ uid, type: entry.type, col, row });
    }
  }
  return candidates;
}

function isLoungeDecorFurniture(entry: FurnitureCatalogEntry): boolean {
  return entry.category === 'decor' && /plant|cactus|pot/i.test(`${entry.type} ${entry.label}`);
}

function isLobbyWorkFurniture(entry: FurnitureCatalogEntry): boolean {
  if (entry.category === 'electronics') return true;
  if (entry.isDesk && !isLoungeTableFurniture(entry)) return true;
  if (entry.category === 'chairs' && !isRestSeatFurniture(entry)) return true;
  return false;
}

function isRestSeatFurniture(entry: FurnitureCatalogEntry): boolean {
  const text = `${entry.type} ${entry.label}`;
  return (
    entry.category === 'chairs' && (entry.footprintW >= 2 || /sofa|bench|couch|cushion/i.test(text))
  );
}
