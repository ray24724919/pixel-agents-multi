import type { ProjectRoom } from './types.js';

/** Tile-grid rectangle: the shared bounds shape used by rooms, furniture footprints, and the campus. */
export type GridBounds = ProjectRoom['bounds'];

export function boundsEqual(a: GridBounds, b: GridBounds): boolean {
  return a.col === b.col && a.row === b.row && a.width === b.width && a.height === b.height;
}

export function rectsOverlap(a: GridBounds, b: GridBounds): boolean {
  return (
    a.col < b.col + b.width &&
    a.col + a.width > b.col &&
    a.row < b.row + b.height &&
    a.row + a.height > b.row
  );
}

/** True when `rect` lies fully within `bounds` (edges inclusive). */
export function rectInsideBounds(rect: GridBounds, bounds: GridBounds): boolean {
  return (
    rect.col >= bounds.col &&
    rect.row >= bounds.row &&
    rect.col + rect.width <= bounds.col + bounds.width &&
    rect.row + rect.height <= bounds.row + bounds.height
  );
}

export function pointInBounds(col: number, row: number, bounds: GridBounds): boolean {
  return (
    col >= bounds.col &&
    col < bounds.col + bounds.width &&
    row >= bounds.row &&
    row < bounds.row + bounds.height
  );
}

export function boundsFromPoints(points: Array<{ col: number; row: number }>): GridBounds {
  let minCol = Number.POSITIVE_INFINITY;
  let minRow = Number.POSITIVE_INFINITY;
  let maxCol = Number.NEGATIVE_INFINITY;
  let maxRow = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minCol = Math.min(minCol, point.col);
    minRow = Math.min(minRow, point.row);
    maxCol = Math.max(maxCol, point.col);
    maxRow = Math.max(maxRow, point.row);
  }
  return {
    col: minCol,
    row: minRow,
    width: maxCol - minCol + 1,
    height: maxRow - minRow + 1,
  };
}

export function unionBounds(bounds: GridBounds[]): GridBounds {
  const points = bounds.flatMap((bound) => [
    { col: bound.col, row: bound.row },
    { col: bound.col + bound.width - 1, row: bound.row + bound.height - 1 },
  ]);
  return boundsFromPoints(points);
}
