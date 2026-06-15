import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cameraCampusBounds, computeCampusCenterPan } from '../src/office/camera.ts';
import type { OfficeLayout, ProjectRoom } from '../src/office/types.ts';
import { ProjectRoomKind, TILE_SIZE, TileType } from '../src/office/types.ts';

function emptyLayout(cols: number, rows: number): OfficeLayout {
  return {
    version: 1,
    cols,
    rows,
    tiles: Array.from({ length: cols * rows }, () => TileType.VOID),
    furniture: [],
  };
}

function room(
  id: string,
  kind: ProjectRoomKind,
  col: number,
  row: number,
  width: number,
  height: number,
): ProjectRoom {
  return { id, kind, bounds: { col, row, width, height } };
}

test('cameraCampusBounds unions every campus room (lobby + project rooms)', () => {
  const layout = emptyLayout(64, 64);
  layout.projectRooms = [
    room('lobby', ProjectRoomKind.PUBLIC, 0, 20, 38, 6),
    room('a', ProjectRoomKind.PROJECT, 0, 10, 12, 10),
    room('b', ProjectRoomKind.PROJECT, 26, 28, 12, 10),
  ];
  assert.deepEqual(cameraCampusBounds(layout), { col: 0, row: 10, width: 38, height: 28 });
});

test('cameraCampusBounds falls back to the non-VOID content bbox when there are no rooms', () => {
  const layout = emptyLayout(10, 10);
  layout.tiles[3 * 10 + 4] = TileType.FLOOR_1; // (col 4, row 3)
  layout.tiles[6 * 10 + 7] = TileType.FLOOR_1; // (col 7, row 6)
  assert.deepEqual(cameraCampusBounds(layout), { col: 4, row: 3, width: 4, height: 4 });
});

test('computeCampusCenterPan frames the campus centre at the viewport centre', () => {
  const layout = emptyLayout(64, 40);
  layout.projectRooms = [room('lobby', ProjectRoomKind.PUBLIC, 0, 20, 40, 6)];
  const zoom = 2;
  const viewportW = 800;
  const viewportH = 600;
  const pan = computeCampusCenterPan(layout, zoom);

  // Replicate the renderFrame transform: screen = (viewport - map)/2 + pan + worldPx*zoom.
  const bounds = cameraCampusBounds(layout);
  const centerXpx = (bounds.col + bounds.width / 2) * TILE_SIZE;
  const centerYpx = (bounds.row + bounds.height / 2) * TILE_SIZE;
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const screenX = (viewportW - mapW) / 2 + pan.x + centerXpx * zoom;
  const screenY = (viewportH - mapH) / 2 + pan.y + centerYpx * zoom;

  assert.equal(screenX, viewportW / 2);
  assert.equal(screenY, viewportH / 2);
});
