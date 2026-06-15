import { unionBounds } from './geometry.js';
import { normalizeProjectRooms } from './projectRooms.js';
import type { OfficeLayout, ProjectRoom } from './types.js';
import { ProjectRoomKind, TILE_SIZE, TileType } from './types.js';

/**
 * Bounding box (in tiles) the camera should frame on entry: the union of every campus room (lobby +
 * project rooms). Falls back to the non-VOID content bbox, then the whole grid, so an empty/new layout
 * still centers sensibly. Pure — no canvas/DOM access.
 */
export function cameraCampusBounds(layout: OfficeLayout): ProjectRoom['bounds'] {
  const rooms = normalizeProjectRooms(layout).filter(
    (room) => room.kind === ProjectRoomKind.PUBLIC || room.kind === ProjectRoomKind.PROJECT,
  );
  if (rooms.length > 0) return unionBounds(rooms.map((room) => room.bounds));

  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      if (layout.tiles[row * layout.cols + col] === TileType.VOID) continue;
      if (col < minCol) minCol = col;
      if (row < minRow) minRow = row;
      if (col > maxCol) maxCol = col;
      if (row > maxRow) maxRow = row;
    }
  }
  if (maxCol < minCol) return { col: 0, row: 0, width: layout.cols, height: layout.rows };
  return { col: minCol, row: minRow, width: maxCol - minCol + 1, height: maxRow - minRow + 1 };
}

/**
 * Initial pan so the campus is centered in the viewport on entry. Mirrors the camera-follow transform
 * (renderFrame offset = (canvas - map)/2 + pan): `pan = mapHalf - campusCentrePx * zoom` maps the
 * campus centre to the viewport centre regardless of canvas size. ③c: a right-growing campus must not
 * open from its left edge.
 */
export function computeCampusCenterPan(
  layout: OfficeLayout,
  zoom: number,
): { x: number; y: number } {
  const bounds = cameraCampusBounds(layout);
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const centerXpx = (bounds.col + bounds.width / 2) * TILE_SIZE;
  const centerYpx = (bounds.row + bounds.height / 2) * TILE_SIZE;
  return { x: mapW / 2 - centerXpx * zoom, y: mapH / 2 - centerYpx * zoom };
}
