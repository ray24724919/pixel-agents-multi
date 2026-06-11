import type { ColorValue } from '../../components/ui/types.js';
import { AUTO_ON_FACING_DEPTH, AUTO_ON_SIDE_DEPTH } from '../../constants.js';
import { getColorizedSprite } from '../colorize.js';
import { normalizeProjectRoomsInLayout } from '../projectRooms.js';
import type {
  FurnitureInstance,
  OfficeLayout,
  PlacedFurniture,
  Seat,
  TileType as TileTypeVal,
  ZoneType,
} from '../types.js';
import { DEFAULT_COLS, DEFAULT_ROWS, Direction, TILE_SIZE, TileType } from '../types.js';
import { inferTileZone } from '../zoneUtils.js';
import { getCatalogEntry, getOrientationInGroup } from './furnitureCatalog.js';

interface WorkstationMatch {
  valid: boolean;
  deskUid?: string;
  electronicsUid?: string;
  reason: 'facing-computer-desk' | 'none';
}

interface WorkstationTile {
  uid: string;
  col: number;
  row: number;
}

/** Convert flat tile array from layout into 2D grid */
export function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][] {
  const map: TileTypeVal[][] = [];
  for (let r = 0; r < layout.rows; r++) {
    const row: TileTypeVal[] = [];
    for (let c = 0; c < layout.cols; c++) {
      row.push(layout.tiles[r * layout.cols + c]);
    }
    map.push(row);
  }
  return map;
}

/** Convert placed furniture into renderable FurnitureInstance[] */
export function layoutToFurnitureInstances(furniture: PlacedFurniture[]): FurnitureInstance[] {
  // Pre-compute desk zY per tile so surface items can sort in front of desks
  const deskZByTile = new Map<string, number>();
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry || !entry.isDesk) continue;
    const deskZY = item.row * TILE_SIZE + entry.sprite.length;
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`;
        const prev = deskZByTile.get(key);
        if (prev === undefined || deskZY > prev) deskZByTile.set(key, deskZY);
      }
    }
  }

  const instances: FurnitureInstance[] = [];
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry) continue;
    const x = item.col * TILE_SIZE;
    const y = item.row * TILE_SIZE;
    const spriteH = entry.sprite.length;
    let zY = y + spriteH;

    // Chair z-sorting: ensure characters sitting on chairs render correctly
    if (entry.category === 'chairs') {
      if (entry.orientation === 'back') {
        // Back-facing chairs render IN FRONT of the seated character
        // (the chair back visually occludes the character behind it).
        // Use the bottom footprint row so it sorts after the character
        // even when the chair has background tiles that push seats down.
        zY = (item.row + entry.footprintH) * TILE_SIZE + 1;
      } else {
        // All other chairs: cap zY to first row bottom so characters
        // at any seat tile render in front of the chair
        zY = (item.row + 1) * TILE_SIZE;
      }
    }

    // Surface items render in front of the desk they sit on
    if (entry.canPlaceOnSurfaces) {
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          const deskZ = deskZByTile.get(`${item.col + dc},${item.row + dr}`);
          if (deskZ !== undefined && deskZ + 0.5 > zY) zY = deskZ + 0.5;
        }
      }
    }

    // Colorize sprite if this furniture has a color override
    let sprite = entry.sprite;
    if (item.color) {
      const { h, s, b: bv, c: cv } = item.color;
      sprite = getColorizedSprite(
        `furn-${item.type}-${h}-${s}-${bv}-${cv}-${item.color.colorize ? 1 : 0}`,
        entry.sprite,
        item.color,
      );
    }

    // Determine if this instance should be mirrored (side asset used in "left" orientation)
    let mirrored = false;
    if (entry.mirrorSide) {
      const orientInGroup = getOrientationInGroup(item.type);
      if (orientInGroup === 'left') {
        mirrored = true;
      }
    }

    instances.push({ sprite, x, y, zY, ...(mirrored ? { mirrored: true } : {}) });
  }
  return instances;
}

/** Get all tiles blocked by furniture footprints, optionally excluding a set of tiles.
 *  Skips top backgroundTiles rows so characters can walk through them. */
export function getBlockedTiles(
  furniture: PlacedFurniture[],
  excludeTiles?: Set<string>,
): Set<string> {
  const tiles = new Set<string>();
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry) continue;
    const bgRows = entry.backgroundTiles || 0;
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue; // skip background rows — characters can walk through
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`;
        if (excludeTiles && excludeTiles.has(key)) continue;
        tiles.add(key);
      }
    }
  }
  return tiles;
}

/** Get tiles blocked for placement purposes — skips top backgroundTiles rows per item */
export function getPlacementBlockedTiles(
  furniture: PlacedFurniture[],
  excludeUid?: string,
): Set<string> {
  const tiles = new Set<string>();
  for (const item of furniture) {
    if (item.uid === excludeUid) continue;
    const entry = getCatalogEntry(item.type);
    if (!entry) continue;
    const bgRows = entry.backgroundTiles || 0;
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue; // skip background rows
      for (let dc = 0; dc < entry.footprintW; dc++) {
        tiles.add(`${item.col + dc},${item.row + dr}`);
      }
    }
  }
  return tiles;
}

/** Map chair orientation to character facing direction */
function orientationToFacing(orientation: string): Direction {
  switch (orientation) {
    case 'front':
      return Direction.DOWN;
    case 'back':
      return Direction.UP;
    case 'left':
      return Direction.LEFT;
    case 'right':
    case 'side':
      return Direction.RIGHT;
    default:
      return Direction.DOWN;
  }
}

/** Generate seats from chair furniture.
 *  Facing priority: 1) chair orientation, 2) adjacent desk, 3) forward (DOWN). */
export function layoutToSeats(layout: OfficeLayout): Map<string, Seat> {
  const seats = new Map<string, Seat>();
  const { furniture } = layout;

  // Build sets of desk and electronics tiles. Work seats require both in the faced cone.
  const deskTiles = new Set<string>();
  const deskTileRecords: WorkstationTile[] = [];
  const electronicsTileRecords: WorkstationTile[] = [];
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry) continue;
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`;
        if (entry.isDesk) {
          deskTiles.add(key);
          deskTileRecords.push({ uid: item.uid, col: item.col + dc, row: item.row + dr });
        }
        if (entry.category === 'electronics') {
          electronicsTileRecords.push({ uid: item.uid, col: item.col + dc, row: item.row + dr });
        }
      }
    }
  }

  const dirs: Array<{ dc: number; dr: number; facing: Direction }> = [
    { dc: 0, dr: -1, facing: Direction.UP }, // desk is above chair → face UP
    { dc: 0, dr: 1, facing: Direction.DOWN }, // desk is below chair → face DOWN
    { dc: -1, dr: 0, facing: Direction.LEFT }, // desk is left of chair → face LEFT
    { dc: 1, dr: 0, facing: Direction.RIGHT }, // desk is right of chair → face RIGHT
  ];

  // For each chair, every footprint tile becomes a seat.
  // Multi-tile chairs (e.g. 2-tile couches) produce multiple seats.
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry || entry.category !== 'chairs') continue;

    let seatCount = 0;
    const bgRows = entry.backgroundTiles ?? 0;
    for (let dr = bgRows; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const tileCol = item.col + dc;
        const tileRow = item.row + dr;

        // Determine facing direction:
        // 1) Chair orientation takes priority
        // 2) Adjacent desk direction
        // 3) Default forward (DOWN)
        let facingDir: Direction = Direction.DOWN;
        if (entry.orientation) {
          facingDir = orientationToFacing(entry.orientation);
        } else {
          for (const d of dirs) {
            if (deskTiles.has(`${tileCol + d.dc},${tileRow + d.dr}`)) {
              facingDir = d.facing;
              break;
            }
          }
        }

        // First seat uses chair uid (backward compat), subsequent use uid:N
        const seatUid = seatCount === 0 ? item.uid : `${item.uid}:${seatCount}`;
        const workstation = findWorkstationMatch(
          tileCol,
          tileRow,
          facingDir,
          deskTileRecords,
          electronicsTileRecords,
        );
        const inferredZone = inferTileZone(layout, tileCol, tileRow);
        const zone: Seat['seatKind'] = workstation.valid ? 'work' : 'rest';
        const zoneSource = workstation.valid
          ? 'workstation'
          : inferredZone.source === 'zone-paint'
            ? 'zone-paint'
            : 'default-split';
        seats.set(seatUid, {
          uid: seatUid,
          seatCol: tileCol,
          seatRow: tileRow,
          facingDir,
          seatKind: zone,
          zoneSource,
          assigned: false,
        });
        seatCount++;
      }
    }
  }

  return seats;
}

function findWorkstationMatch(
  seatCol: number,
  seatRow: number,
  facingDir: Direction,
  deskTiles: WorkstationTile[],
  electronicsTiles: WorkstationTile[],
): WorkstationMatch {
  const facedTiles = getFacedTileScores(seatCol, seatRow, facingDir);
  const facedDeskTiles = deskTiles.filter((tile) => facedTiles.has(`${tile.col},${tile.row}`));
  if (facedDeskTiles.length === 0) return { valid: false, reason: 'none' };

  const facedElectronicsTiles = electronicsTiles.filter((tile) =>
    facedTiles.has(`${tile.col},${tile.row}`),
  );
  for (const deskTile of facedDeskTiles) {
    for (const electronicsTile of facedElectronicsTiles) {
      if (!areAdjacentOrSame(deskTile, electronicsTile)) continue;
      return {
        valid: true,
        deskUid: deskTile.uid,
        electronicsUid: electronicsTile.uid,
        reason: 'facing-computer-desk',
      };
    }
  }
  return { valid: false, reason: 'none' };
}

function areAdjacentOrSame(a: WorkstationTile, b: WorkstationTile): boolean {
  return Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;
}

function getFacedTileScores(
  seatCol: number,
  seatRow: number,
  facingDir: Direction,
): Map<string, number> {
  const scores = new Map<string, number>();
  const dCol = facingDir === Direction.RIGHT ? 1 : facingDir === Direction.LEFT ? -1 : 0;
  const dRow = facingDir === Direction.DOWN ? 1 : facingDir === Direction.UP ? -1 : 0;
  const lateralCol = dRow !== 0 ? 1 : 0;
  const lateralRow = dCol !== 0 ? 1 : 0;

  for (let forward = 1; forward <= AUTO_ON_FACING_DEPTH; forward++) {
    for (let lateral = -AUTO_ON_SIDE_DEPTH; lateral <= AUTO_ON_SIDE_DEPTH; lateral++) {
      const col = seatCol + dCol * forward + lateralCol * lateral;
      const row = seatRow + dRow * forward + lateralRow * lateral;
      const score = forward * 10 + Math.abs(lateral);
      const key = `${col},${row}`;
      const previous = scores.get(key);
      if (previous === undefined || score < previous) {
        scores.set(key, score);
      }
    }
  }

  return scores;
}

/** Get the set of tiles occupied by seats (so they can be excluded from blocked tiles)
 * @internal */
export function getSeatTiles(seats: Map<string, Seat>): Set<string> {
  const tiles = new Set<string>();
  for (const seat of seats.values()) {
    tiles.add(`${seat.seatCol},${seat.seatRow}`);
  }
  return tiles;
}

/** Default floor colors for the two rooms */
const DEFAULT_LEFT_ROOM_COLOR: ColorValue = { h: 35, s: 30, b: 15, c: 0 }; // warm beige
const DEFAULT_RIGHT_ROOM_COLOR: ColorValue = { h: 25, s: 45, b: 5, c: 10 }; // warm brown

/** Create a minimal fallback layout (used only when no default-layout.json exists) */
export function createDefaultLayout(): OfficeLayout {
  const W = TileType.WALL;
  const F1 = TileType.FLOOR_1;
  const F2 = TileType.FLOOR_2;

  const tiles: TileTypeVal[] = [];
  const tileColors: Array<ColorValue | null> = [];
  const zones: Array<ZoneType | null> = [];

  for (let r = 0; r < DEFAULT_ROWS; r++) {
    for (let c = 0; c < DEFAULT_COLS; c++) {
      if (r === 0 || r === DEFAULT_ROWS - 1 || c === 0 || c === DEFAULT_COLS - 1) {
        tiles.push(W);
        tileColors.push(null);
        zones.push(null);
      } else if (c < 10) {
        tiles.push(F1);
        tileColors.push(DEFAULT_LEFT_ROOM_COLOR);
        zones.push(null);
      } else {
        tiles.push(F2);
        tileColors.push(DEFAULT_RIGHT_ROOM_COLOR);
        zones.push(null);
      }
    }
  }

  // Minimal fallback with no furniture — the default-layout.json provides the real default
  return {
    version: 1,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    tiles,
    tileColors,
    zones,
    furniture: [],
  };
}

/** Serialize layout to JSON string
 * @internal */
export function serializeLayout(layout: OfficeLayout): string {
  return JSON.stringify(layout);
}

// ── Furniture type migration ────────────────────────────────────

/** Map old hardcoded FurnitureType values to new manifest-based IDs */
const LEGACY_TYPE_MAP: Record<string, string | null> = {
  desk: 'DESK_FRONT',
  chair: 'WOODEN_CHAIR_FRONT',
  bookshelf: 'BOOKSHELF',
  plant: 'PLANT',
  cooler: null, // no equivalent in new assets — remove
  whiteboard: 'WHITEBOARD',
  pc: 'PC_FRONT_OFF',
  lamp: null, // no equivalent in new assets — remove
};

/** Migrate old furniture type strings to new manifest IDs */
function migrateFurnitureTypes(furniture: PlacedFurniture[]): PlacedFurniture[] {
  const migrated: PlacedFurniture[] = [];
  for (const item of furniture) {
    const newType = LEGACY_TYPE_MAP[item.type];
    if (newType === undefined) {
      // Not a legacy type — keep as-is
      migrated.push(item);
    } else if (newType !== null) {
      // Migrate to new type
      migrated.push({ ...item, type: newType });
    }
    // newType === null → remove the item (no equivalent)
  }
  return migrated;
}

/** Deserialize layout from JSON string, migrating old tile types if needed
 * @internal */
export function deserializeLayout(json: string): OfficeLayout | null {
  try {
    const obj = JSON.parse(json);
    if (obj && obj.version === 1 && Array.isArray(obj.tiles) && Array.isArray(obj.furniture)) {
      return migrateLayout(obj as OfficeLayout);
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

/**
 * Ensure layout has tileColors. If missing, generate defaults based on tile types.
 * Exported for use by message handlers that receive layouts over the wire.
 */
export function migrateLayoutColors(layout: OfficeLayout): OfficeLayout {
  return migrateLayout(layout);
}

/**
 * Migrate old layouts that use legacy tile types (TILE_FLOOR=1, WOOD_FLOOR=2, CARPET=3, DOORWAY=4)
 * to the new pattern-based system. Also migrates old furniture type strings and old VOID value.
 */
function migrateLayout(layout: OfficeLayout): OfficeLayout {
  // Migrate furniture types
  layout = { ...layout, furniture: migrateFurnitureTypes(layout.furniture) };

  // Migrate old VOID value (was 8, now 255) — only for legacy layouts since FLOOR_8 reuses value 8
  const OLD_VOID = 8;
  if (!layout.layoutRevision && layout.tiles.includes(OLD_VOID as TileTypeVal)) {
    layout = {
      ...layout,
      tiles: layout.tiles.map((t) => (t === OLD_VOID ? (TileType.VOID as TileTypeVal) : t)),
    };
  }

  if (layout.tileColors && layout.tileColors.length === layout.tiles.length) {
    return normalizeLayoutZones(layout);
  }

  // Check if any tiles use old values (1-4) — these map directly to FLOOR_1-4
  // but need color assignments
  const tileColors: Array<ColorValue | null> = [];
  for (const tile of layout.tiles) {
    switch (tile) {
      case 0: // WALL
        tileColors.push(null);
        break;
      case 1: // was TILE_FLOOR → FLOOR_1 beige
        tileColors.push(DEFAULT_LEFT_ROOM_COLOR);
        break;
      case 2: // was WOOD_FLOOR → FLOOR_2 brown
        tileColors.push(DEFAULT_RIGHT_ROOM_COLOR);
        break;
      case 3: // was CARPET → FLOOR_3 purple
        tileColors.push({ h: 280, s: 40, b: -5, c: 0 });
        break;
      case 4: // was DOORWAY → FLOOR_4 tan
        tileColors.push({ h: 35, s: 25, b: 10, c: 0 });
        break;
      default:
        // Floor tile types without colors — use neutral gray
        tileColors.push(tile > 0 && tile !== TileType.VOID ? { h: 0, s: 0, b: 0, c: 0 } : null);
    }
  }

  return normalizeLayoutZones({ ...layout, tileColors });
}

function normalizeLayoutZones(layout: OfficeLayout): OfficeLayout {
  if (layout.zones && layout.zones.length === layout.tiles.length) {
    return normalizeProjectRoomsInLayout(layout);
  }
  return normalizeProjectRoomsInLayout({
    ...layout,
    zones: new Array(layout.tiles.length).fill(null),
  });
}
