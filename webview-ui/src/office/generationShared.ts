import { rectInsideBounds, rectsOverlap } from './geometry.js';
import { getAllCatalogEntries } from './layout/furnitureCatalog.js';
import { layoutToSeats } from './layout/layoutSerializer.js';
import type { FurnitureCatalogEntry, OfficeLayout, PlacedFurniture, ProjectRoom } from './types.js';
import { TileType } from './types.js';

/**
 * Helpers shared across the room-generation modules (projectRoomGeneration, campusBounds,
 * lobbyLounge). Kept separate so the modules never need to import each other's internals.
 */

/** The furniture archetypes the generator places: one set drives all room/lounge templates. */
export interface RoomTemplateAssets {
  desk: FurnitureCatalogEntry;
  electronics: FurnitureCatalogEntry;
  workChair: FurnitureCatalogEntry;
  restSeat: FurnitureCatalogEntry;
  loungeTable?: FurnitureCatalogEntry;
  loungeDecor?: FurnitureCatalogEntry;
  /** Distinct floor greenery for the public lobby lounge, so it reads as a varied lounge rather
   *  than a row of identical plants. Index 0 stays the primary plant for placement stability. */
  lobbyDecorVariety?: FurnitureCatalogEntry[];
  collaboration?: CollaborationTemplateAssets;
}

export interface CollaborationTemplateAssets {
  table: FurnitureCatalogEntry;
  rightElectronics: FurnitureCatalogEntry;
  leftElectronics: FurnitureCatalogEntry;
  rightChair: FurnitureCatalogEntry;
  leftChair: FurnitureCatalogEntry;
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * A furniture item is "generated" if the room generator created it — its uid is prefixed with a
 * room id, and every generated room id starts with `project-` (lobby = `project-room-lobby`,
 * projects = `project-<slug>`). Anything else is the user's own content (the editor places hand
 * furniture with `f-<timestamp>` uids) and must never be deleted or overlapped by generation.
 */
export function isGeneratedFurnitureUid(uid: string): boolean {
  return uid.startsWith('project-');
}

export function placedFurnitureBounds(
  item: PlacedFurniture,
  entry: Pick<FurnitureCatalogEntry, 'footprintW' | 'footprintH'>,
): ProjectRoom['bounds'] {
  return {
    col: item.col,
    row: item.row,
    width: entry.footprintW,
    height: entry.footprintH,
  };
}

export function isSideOrientation(
  orientation: string | undefined,
  side: 'left' | 'right',
): boolean {
  if (side === 'left') return orientation === 'left';
  return orientation === 'side' || orientation === 'right';
}

export function pickEntry(
  entries: FurnitureCatalogEntry[],
  predicate: (entry: FurnitureCatalogEntry) => boolean,
): FurnitureCatalogEntry | undefined {
  return entries.filter(predicate).sort((a, b) => a.type.localeCompare(b.type))[0];
}

export function pickPreferredEntry(
  entries: FurnitureCatalogEntry[],
  predicate: (entry: FurnitureCatalogEntry) => boolean,
  score: (entry: FurnitureCatalogEntry) => number,
): FurnitureCatalogEntry | undefined {
  return entries.filter(predicate).sort((a, b) => {
    const scoreDelta = score(b) - score(a);
    return scoreDelta === 0 ? a.type.localeCompare(b.type) : scoreDelta;
  })[0];
}

export function isCoffeeFurniture(entry: FurnitureCatalogEntry): boolean {
  return /coffee/i.test(`${entry.type} ${entry.label}`);
}

export function isLoungeTableFurniture(entry: FurnitureCatalogEntry): boolean {
  return isCoffeeFurniture(entry) || /small.*table/i.test(`${entry.type} ${entry.label}`);
}

export function roomHasFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  predicate: (entry: FurnitureCatalogEntry) => boolean,
): boolean {
  return layout.furniture.some((item) => {
    const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
    if (!entry || !predicate(entry)) return false;
    return rectsOverlap(room.bounds, placedFurnitureBounds(item, entry));
  });
}

export function roomSeats(layout: OfficeLayout, room: ProjectRoom) {
  return [...layoutToSeats(layout).values()].filter(
    (seat) =>
      seat.seatCol >= room.bounds.col &&
      seat.seatCol < room.bounds.col + room.bounds.width &&
      seat.seatRow >= room.bounds.row &&
      seat.seatRow < room.bounds.row + room.bounds.height,
  );
}

export function roomDoorwayKeepClearTiles(layout: OfficeLayout, room: ProjectRoom): Set<string> {
  const clear = new Set<string>();
  const { col, row, width, height } = room.bounds;
  const within = (c: number, r: number): boolean =>
    c >= col && c < col + width && r >= row && r < row + height;
  const markGap = (c: number, r: number, insideC: number, insideR: number): void => {
    if (c < 0 || c >= layout.cols || r < 0 || r >= layout.rows) return;
    const tile = layout.tiles[r * layout.cols + c];
    if (tile === TileType.WALL || tile === TileType.VOID || tile === undefined) return;
    clear.add(`${c},${r}`);
    if (within(insideC, insideR)) clear.add(`${insideC},${insideR}`);
  };
  for (let c = col; c < col + width; c++) markGap(c, row, c, row + 1);
  for (let r = row + 1; r < row + height - 1; r++) {
    markGap(col, r, col + 1, r);
    markGap(col + width - 1, r, col + width - 2, r);
  }
  return clear;
}

export function canPlaceSuiteFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  item: PlacedFurniture,
  furniture: PlacedFurniture[],
): boolean {
  if (furniture.some((existing) => existing.uid === item.uid)) return false;
  const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
  if (!entry) return false;
  const bounds = placedFurnitureBounds(item, entry);
  if (!rectInsideBounds(bounds, room.bounds)) return false;
  for (let row = bounds.row; row < bounds.row + bounds.height; row++) {
    for (let col = bounds.col; col < bounds.col + bounds.width; col++) {
      const tile = layout.tiles[row * layout.cols + col];
      if (tile === TileType.WALL || tile === TileType.VOID || tile === undefined) return false;
    }
  }
  const keepClear = roomDoorwayKeepClearTiles(layout, room);
  if (keepClear.size > 0) {
    for (let row = bounds.row; row < bounds.row + bounds.height; row++) {
      for (let col = bounds.col; col < bounds.col + bounds.width; col++) {
        if (keepClear.has(`${col},${row}`)) return false;
      }
    }
  }
  for (const existing of furniture) {
    const existingEntry = getAllCatalogEntries().find(
      (candidate) => candidate.type === existing.type,
    );
    if (!existingEntry) continue;
    if (!rectsOverlap(bounds, placedFurnitureBounds(existing, existingEntry))) continue;
    if (canFurnitureOverlap(entry, existingEntry)) continue;
    return false;
  }
  return true;
}

export function canFurnitureOverlap(
  entry: FurnitureCatalogEntry,
  existingEntry: FurnitureCatalogEntry,
): boolean {
  return (
    (entry.canPlaceOnSurfaces === true && existingEntry.isDesk) ||
    (existingEntry.canPlaceOnSurfaces === true && entry.isDesk)
  );
}
