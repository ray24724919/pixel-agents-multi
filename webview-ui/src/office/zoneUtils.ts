import { pointInBounds } from './geometry.js';
import { getAllCatalogEntries } from './layout/furnitureCatalog.js';
import { getVisibleRoomBounds } from './layout/visibleRoomBounds.js';
import type { Character, FurnitureCatalogEntry, OfficeLayout, Seat, ZoneType } from './types.js';
import { ProjectRoomKind } from './types.js';

export type AgentZone = ZoneType;
export type AgentZoneSource =
  | 'seat-computer'
  | 'seat-paint'
  | 'seat-zone'
  | 'zone-paint'
  | 'active-state'
  | 'room-kind'
  | 'furniture'
  | 'default-split';

export interface AgentZoneInfo {
  zone: AgentZone;
  source: AgentZoneSource;
}

/** Furniture-derived zone tile sets for one layout. Cached by layout identity — layouts are
 *  replaced wholesale on every change (rebuildFromLayout), never mutated in place. */
interface FurnitureZoneSets {
  work: Set<string>;
  rest: Set<string>;
}

const furnitureZoneCache = new WeakMap<OfficeLayout, FurnitureZoneSets>();

// NOTE: kept local (not imported from generationShared) to avoid an import cycle:
// generationShared → layoutSerializer → zoneUtils.
function isRestSeatEntry(entry: FurnitureCatalogEntry): boolean {
  const text = `${entry.type} ${entry.label}`;
  return (
    entry.category === 'chairs' && (entry.footprintW >= 2 || /sofa|bench|couch|cushion/i.test(text))
  );
}

function addFootprintWithHalo(
  tiles: Set<string>,
  col: number,
  row: number,
  footprintW: number,
  footprintH: number,
): void {
  for (let r = row - 1; r < row + footprintH + 1; r++) {
    for (let c = col - 1; c < col + footprintW + 1; c++) {
      tiles.add(`${c},${r}`);
    }
  }
}

/**
 * Work area = the vicinity of real WORKSTATIONS (a desk with electronics on or beside it — a bare
 * decorative desk or a coffee table does not make a work area). Rest area = the vicinity of rest
 * seating (sofas, benches, couches). Both expanded by one tile so the chair/standing spots beside
 * the furniture classify with it.
 */
function getFurnitureZoneSets(layout: OfficeLayout): FurnitureZoneSets {
  const cached = furnitureZoneCache.get(layout);
  if (cached) return cached;

  const entries = getAllCatalogEntries();
  const entryByType = new Map(entries.map((entry) => [entry.type, entry]));

  // Electronics tiles (with halo) mark which desks count as workstations.
  const electronicsTiles = new Set<string>();
  for (const item of layout.furniture) {
    const entry = entryByType.get(item.type);
    if (!entry || entry.category !== 'electronics') continue;
    addFootprintWithHalo(electronicsTiles, item.col, item.row, entry.footprintW, entry.footprintH);
  }

  const work = new Set<string>();
  const rest = new Set<string>();
  for (const item of layout.furniture) {
    const entry = entryByType.get(item.type);
    if (!entry) continue;
    if (entry.isDesk) {
      let isWorkstation = false;
      for (let r = item.row; r < item.row + entry.footprintH && !isWorkstation; r++) {
        for (let c = item.col; c < item.col + entry.footprintW; c++) {
          if (electronicsTiles.has(`${c},${r}`)) {
            isWorkstation = true;
            break;
          }
        }
      }
      if (isWorkstation) {
        addFootprintWithHalo(work, item.col, item.row, entry.footprintW, entry.footprintH);
      }
    } else if (isRestSeatEntry(entry)) {
      addFootprintWithHalo(rest, item.col, item.row, entry.footprintW, entry.footprintH);
    }
  }

  const sets = { work, rest };
  furnitureZoneCache.set(layout, sets);
  return sets;
}

export function inferTileZone(layout: OfficeLayout, col: number, row?: number): AgentZoneInfo {
  if (row !== undefined) {
    const idx = row * layout.cols + col;
    const paintedZone = layout.zones?.[idx];
    if (paintedZone) {
      return { zone: paintedZone, source: 'zone-paint' };
    }
  }

  // Room-based offices: zones derive from what is actually THERE — the room's purpose, then the
  // furniture — not from the legacy left/right office split (which classified the whole left half
  // as 'work' and starved left-side rooms of rest/idle space).
  if (layout.projectRooms && layout.projectRooms.length > 0 && row !== undefined) {
    for (const room of layout.projectRooms) {
      if (!pointInBounds(col, row, room.bounds)) continue;
      if (room.kind === ProjectRoomKind.MEETING) return { zone: 'meeting', source: 'room-kind' };
      if (room.kind === ProjectRoomKind.PUBLIC || room.kind === ProjectRoomKind.REST) {
        return { zone: 'rest', source: 'room-kind' };
      }
      break; // PROJECT / UNASSIGNED rooms classify by their furniture below
    }
    const sets = getFurnitureZoneSets(layout);
    const key = `${col},${row}`;
    if (sets.work.has(key)) return { zone: 'work', source: 'furniture' };
    if (sets.rest.has(key)) return { zone: 'rest', source: 'furniture' };
    return { zone: 'neutral', source: 'furniture' };
  }

  // Legacy room-less layouts keep the historical default split.
  const bounds = getVisibleRoomBounds(layout);
  const splitCol = Math.floor((bounds.minCol + bounds.maxCol + 1) / 2);
  return {
    zone: col > splitCol ? 'rest' : 'work',
    source: 'default-split',
  };
}

export function inferAgentZone(
  ch: Character,
  layout: OfficeLayout,
  seats: Map<string, Seat>,
): AgentZoneInfo {
  if (ch.seatId) {
    const seat = seats.get(ch.seatId);
    if (seat) {
      return {
        zone: seat.seatKind,
        source:
          seat.zoneSource === 'workstation' || seat.zoneSource === 'computer-adjacent'
            ? 'seat-computer'
            : seat.zoneSource === 'zone-paint'
              ? 'seat-paint'
              : 'seat-zone',
      };
    }
  }

  if (ch.isActive) {
    return { zone: 'work', source: 'active-state' };
  }

  return inferTileZone(layout, ch.tileCol, ch.tileRow);
}

export function zoneSourceLabel(source: AgentZoneSource): string {
  switch (source) {
    case 'zone-paint':
      return 'painted tile';
    case 'room-kind':
      return 'room purpose';
    case 'furniture':
      return 'nearby furniture';
    case 'default-split':
      return 'default split';
    case 'active-state':
      return 'active work state';
    case 'seat-computer':
      return 'workstation seat';
    case 'seat-paint':
      return 'painted seat';
    case 'seat-zone':
      return 'zone-derived seat';
    default:
      return source;
  }
}
