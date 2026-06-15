import type { ColorValue } from '../components/ui/types.js';
import {
  PROJECT_ROOM_CAMPUS_MAX_HORIZONTAL_SLOTS,
  PROJECT_ROOM_CAMPUS_MAX_VERTICAL_SLOTS,
  PROJECT_ROOM_DEFAULT_HEIGHT,
  PROJECT_ROOM_DEFAULT_WIDTH,
  PROJECT_ROOM_GENERATED_MARGIN,
  PROJECT_ROOM_WORK_CORRIDOR_HEIGHT,
  PROJECT_ROOM_WORK_CORRIDOR_MIN_WIDTH,
} from '../constants.js';
import { clampInt, isGeneratedFurnitureUid } from './generationShared.js';
import {
  boundsFromPoints,
  pointInBounds,
  rectInsideBounds,
  rectsOverlap,
  unionBounds,
} from './geometry.js';
import { getAllCatalogEntries } from './layout/furnitureCatalog.js';
import { normalizeProjectRooms } from './projectRooms.js';
import type { OfficeLayout, ProjectRoom, TileType as TileTypeVal, ZoneType } from './types.js';
import { MAX_COLS, MAX_ROWS, ProjectRoomKind, TileType } from './types.js';

/**
 * Campus geometry: where the work-corridor lobby anchors, which bay slots project rooms occupy,
 * and how the grid grows to fit them. Pure layout math — no furniture or floor painting here.
 */

export function allocateRoomBounds(
  layout: OfficeLayout,
  lobbyCore: ProjectRoom['bounds'],
): { layout: OfficeLayout; bounds: ProjectRoom['bounds'] } | null {
  const width = PROJECT_ROOM_DEFAULT_WIDTH;
  const height = PROJECT_ROOM_DEFAULT_HEIGHT;
  const candidates = buildRoomAllocationCandidates(lobbyCore, width, height);
  for (const bounds of candidates) {
    if (!boundsFitMax(bounds)) continue;
    const expanded = ensureLayoutSize(
      layout,
      bounds.col + bounds.width,
      bounds.row + bounds.height,
    );
    if (!canPlaceRoomBounds(expanded, bounds)) continue;
    return { layout: expanded, bounds };
  }
  return null;
}

function buildRoomAllocationCandidates(
  core: ProjectRoom['bounds'],
  width: number,
  height: number,
): ProjectRoom['bounds'][] {
  const margin = PROJECT_ROOM_GENERATED_MARGIN;
  const candidates: ProjectRoom['bounds'][] = [...buildWorkCorridorRoomSlots(core, width, height)];
  const seen = new Set<string>();
  const horizontalSlots = Math.max(
    1,
    Math.min(
      PROJECT_ROOM_CAMPUS_MAX_HORIZONTAL_SLOTS,
      Math.floor((MAX_COLS - core.col + margin) / (width + margin)),
    ),
  );
  const verticalSlots = Math.max(
    1,
    Math.min(
      PROJECT_ROOM_CAMPUS_MAX_VERTICAL_SLOTS,
      Math.floor((MAX_ROWS - core.row + margin) / (height + margin)),
    ),
  );
  const maxRings = Math.ceil(Math.max(MAX_COLS, MAX_ROWS) / Math.min(width, height));
  const push = (col: number, row: number) => {
    const bounds = { col, row, width, height };
    if (col < 0 || row < 0) return;
    const key = `${col},${row},${width},${height}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(bounds);
  };

  for (const bounds of candidates) {
    seen.add(`${bounds.col},${bounds.row},${bounds.width},${bounds.height}`);
  }

  for (let ring = 0; ring <= maxRings; ring++) {
    const belowRow = core.row + core.height + margin + ring * (height + margin);
    for (let slot = 0; slot < horizontalSlots; slot++) {
      push(core.col + slot * (width + margin), belowRow);
    }

    const rightCol = core.col + core.width + margin + ring * (width + margin);
    for (let slot = 0; slot < verticalSlots; slot++) {
      push(rightCol, core.row + slot * (height + margin));
    }

    const leftCol = core.col - width - margin - ring * (width + margin);
    for (let slot = 0; slot < verticalSlots; slot++) {
      push(leftCol, core.row + slot * (height + margin));
    }

    const aboveRow = core.row - height - margin - ring * (height + margin);
    for (let slot = 0; slot < horizontalSlots; slot++) {
      push(core.col + slot * (width + margin), aboveRow);
    }
  }

  return candidates;
}

export function buildWorkCorridorRoomSlots(
  core: ProjectRoom['bounds'],
  width: number,
  height: number,
): ProjectRoom['bounds'][] {
  const margin = PROJECT_ROOM_GENERATED_MARGIN;
  // Center-out growth: the first project docks in the bay nearest the corridor centre, then the campus
  // grows right, then left, staying balanced around the lobby instead of leaning to one side. Each bay
  // is filled top-then-bottom before stepping outward so a project's room sits close to centre.
  const bayCols = orderBayColsCenterOut(buildWorkCorridorBayCols(core, width), core, width);
  const topRow = core.row - height - margin;
  const bottomRow = core.row + core.height + margin;
  return bayCols
    .flatMap((col) => [
      { col, row: topRow, width, height },
      { col, row: bottomRow, width, height },
    ])
    .filter((bounds) => bounds.col >= 0 && bounds.row >= 0 && boundsFitMax(bounds));
}

/**
 * Reorder bay columns by distance from the corridor centre (nearest first); ties resolve to the
 * right-of-centre bay first so growth proceeds centre → right → left. `cols` is ascending.
 */
function orderBayColsCenterOut(
  cols: number[],
  core: ProjectRoom['bounds'],
  width: number,
): number[] {
  const corridorCenter = core.col + core.width / 2;
  const centerOf = (col: number) => col + width / 2;
  return [...cols].sort((a, b) => {
    const da = Math.abs(centerOf(a) - corridorCenter);
    const db = Math.abs(centerOf(b) - corridorCenter);
    if (da !== db) return da - db;
    return b - a; // equidistant → right (larger col) first
  });
}

function buildWorkCorridorBayCols(core: ProjectRoom['bounds'], roomWidth: number): number[] {
  const margin = PROJECT_ROOM_GENERATED_MARGIN;
  const step = roomWidth + margin;
  const cols: number[] = [];
  for (let col = core.col; col + roomWidth <= core.col + core.width; col += step) {
    cols.push(col);
  }
  const rightCol = core.col + core.width - roomWidth;
  if (rightCol >= core.col && !cols.includes(rightCol)) {
    cols.push(rightCol);
  }
  return cols.sort((a, b) => a - b);
}

export function boundsFitMax(bounds: ProjectRoom['bounds']): boolean {
  return (
    bounds.col >= 0 &&
    bounds.row >= 0 &&
    bounds.col + bounds.width <= MAX_COLS &&
    bounds.row + bounds.height <= MAX_ROWS
  );
}

/** True when the bounds lie fully within the layout's current grid (not just the MAX_* ceiling). */
export function roomBoundsFitGrid(layout: OfficeLayout, bounds: ProjectRoom['bounds']): boolean {
  return (
    bounds.col >= 0 &&
    bounds.row >= 0 &&
    bounds.col + bounds.width <= layout.cols &&
    bounds.row + bounds.height <= layout.rows
  );
}

export function canPlaceRoomBounds(layout: OfficeLayout, bounds: ProjectRoom['bounds']): boolean {
  if (!boundsFitMax(bounds)) return false;
  if (bounds.col + bounds.width > layout.cols || bounds.row + bounds.height > layout.rows) {
    return false;
  }
  for (const room of normalizeProjectRooms(layout)) {
    if (rectsOverlap(bounds, room.bounds)) return false;
  }
  for (const item of layout.furniture) {
    const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
    const footprint = {
      col: item.col,
      row: item.row,
      width: entry?.footprintW ?? 1,
      height: entry?.footprintH ?? 1,
    };
    if (rectsOverlap(bounds, footprint)) return false;
  }
  for (let row = bounds.row; row < bounds.row + bounds.height; row++) {
    for (let col = bounds.col; col < bounds.col + bounds.width; col++) {
      const tile = layout.tiles[row * layout.cols + col];
      if (tile !== TileType.VOID) return false;
    }
  }
  return true;
}

export function ensureLayoutSize(layout: OfficeLayout, cols: number, rows: number): OfficeLayout {
  const nextCols = Math.min(MAX_COLS, Math.max(layout.cols, cols));
  const nextRows = Math.min(MAX_ROWS, Math.max(layout.rows, rows));
  if (nextCols === layout.cols && nextRows === layout.rows) return layout;
  const tiles: TileTypeVal[] = new Array(nextCols * nextRows).fill(TileType.VOID);
  const tileColors: Array<ColorValue | null> = new Array(nextCols * nextRows).fill(null);
  const zones: Array<ZoneType | null> = new Array(nextCols * nextRows).fill(null);
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const oldIdx = r * layout.cols + c;
      const newIdx = r * nextCols + c;
      tiles[newIdx] = layout.tiles[oldIdx] ?? TileType.VOID;
      tileColors[newIdx] = layout.tileColors?.[oldIdx] ?? null;
      zones[newIdx] = layout.zones?.[oldIdx] ?? null;
    }
  }
  return { ...layout, cols: nextCols, rows: nextRows, tiles, tileColors, zones };
}

function protectedDesignMaxRow(layout: OfficeLayout): number {
  const handFurniture = layout.furniture.filter((item) => !isGeneratedFurnitureUid(item.uid));
  if (handFurniture.length === 0) return -1;
  const rooms = normalizeProjectRooms(layout);
  const campusRooms = rooms.filter(
    (room) => room.kind === ProjectRoomKind.PUBLIC || room.kind === ProjectRoomKind.PROJECT,
  );
  // The campus footprint is the bounding box of every generated room (lobby + project rooms). The
  // generator paints corridor tiles WITHIN this box (between room doorways and the lobby) that fall
  // outside any single room rect. The old code counted those generated tiles, so the anchor row
  // ratcheted downward every provision — pushing the campus lower and growing the grid to MAX_ROWS.
  const footprint =
    campusRooms.length > 0 ? unionBounds(campusRooms.map((room) => room.bounds)) : null;

  let maxRow = -1;
  for (const item of handFurniture) {
    const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
    const footprintW = entry?.footprintW ?? 1;
    const footprintH = entry?.footprintH ?? 1;
    const rect = { col: item.col, row: item.row, width: footprintW, height: footprintH };
    // Skip hand furniture that sits fully inside an existing ROOM (the room already contains it, so
    // it must not push the campus below its own contents). Crucially we test individual rooms, NOT
    // the footprint bbox: a hand item in the gap BETWEEN scattered rooms is real design and must
    // still extend the protected row.
    if (campusRooms.some((room) => rectInsideBounds(rect, room.bounds))) continue;
    maxRow = Math.max(maxRow, item.row + footprintH - 1);
  }
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const tile = layout.tiles[row * layout.cols + col];
      if (tile === TileType.VOID) continue;
      // Skip tiles inside the campus footprint — this is what excludes the generator's own corridor
      // tiles (untagged floor between rooms) and stops the ratchet. Hand-painted floor outside the
      // campus is still counted; hand-painted floor wedged inside the bbox is rare and additionally
      // guarded at allocation time by canPlaceRoomBounds / clearCampusTiles.
      if (footprint !== null && pointInBounds(col, row, footprint)) continue;
      maxRow = Math.max(maxRow, row);
    }
  }
  return maxRow;
}

export function deriveWorkCorridorBounds(
  layout: OfficeLayout,
  projectRoomCount = normalizeProjectRooms(layout).filter(
    (room) => room.kind === ProjectRoomKind.PROJECT,
  ).length,
): ProjectRoom['bounds'] {
  const base = deriveLobbyCoreBounds(layout);
  const bayCount = targetWorkCorridorBayCount(projectRoomCount);
  const bayWidth =
    bayCount * PROJECT_ROOM_DEFAULT_WIDTH + (bayCount - 1) * PROJECT_ROOM_GENERATED_MARGIN;
  const width = Math.min(
    MAX_COLS,
    Math.max(PROJECT_ROOM_WORK_CORRIDOR_MIN_WIDTH, bayWidth, base.width),
  );
  const col = clampInt(base.col, 0, MAX_COLS - width);
  const minRow = PROJECT_ROOM_DEFAULT_HEIGHT + PROJECT_ROOM_GENERATED_MARGIN;
  // Anchor the whole corridor (and the row of rooms above it) below the user's hand-design so
  // generation never overlaps it. The rooms above the lobby sit at lobby.row - DEFAULT_HEIGHT -
  // MARGIN, so the lobby must clear the design by that much plus one more margin.
  const designMaxRow = protectedDesignMaxRow(layout);
  const designFloorRow =
    designMaxRow >= 0
      ? designMaxRow +
        1 +
        PROJECT_ROOM_GENERATED_MARGIN +
        PROJECT_ROOM_DEFAULT_HEIGHT +
        PROJECT_ROOM_GENERATED_MARGIN
      : -1;
  const preferredRow = Math.max(base.row > 0 ? base.row : minRow, designFloorRow);
  const maxRow =
    MAX_ROWS -
    PROJECT_ROOM_DEFAULT_HEIGHT -
    PROJECT_ROOM_GENERATED_MARGIN -
    PROJECT_ROOM_WORK_CORRIDOR_HEIGHT;
  return {
    col,
    row: clampInt(preferredRow, minRow, maxRow),
    width,
    height: PROJECT_ROOM_WORK_CORRIDOR_HEIGHT,
  };
}

function targetWorkCorridorBayCount(projectRoomCount: number): number {
  return Math.max(2, Math.ceil(Math.max(0, projectRoomCount) / 2));
}

function deriveLobbyCoreBounds(layout: OfficeLayout): ProjectRoom['bounds'] {
  const rooms = normalizeProjectRooms(layout);
  const publicRooms = rooms.filter((room) => room.kind === ProjectRoomKind.PUBLIC);
  if (publicRooms.length > 0) return unionBounds(publicRooms.map((room) => room.bounds));

  const projectRooms = rooms.filter((room) => room.kind === ProjectRoomKind.PROJECT);
  const points: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const tile = layout.tiles[row * layout.cols + col];
      if (tile === TileType.VOID) continue;
      if (projectRooms.some((room) => pointInBounds(col, row, room.bounds))) continue;
      points.push({ col, row });
    }
  }
  for (const item of layout.furniture) {
    const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
    const width = entry?.footprintW ?? 1;
    const height = entry?.footprintH ?? 1;
    if (
      projectRooms.some((room) =>
        rectsOverlap({ col: item.col, row: item.row, width, height }, room.bounds),
      )
    ) {
      continue;
    }
    points.push({ col: item.col, row: item.row });
    points.push({ col: item.col + width - 1, row: item.row + height - 1 });
  }

  if (points.length > 0) return boundsFromPoints(points);
  return {
    col: 0,
    row: 0,
    width: Math.max(1, layout.cols),
    height: Math.max(1, layout.rows),
  };
}
