import type { OfficeLayout } from '../types.js';
import { TileType } from '../types.js';

export interface VisibleRoomBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export function getVisibleRoomBounds(layout: OfficeLayout): VisibleRoomBounds {
  let minCol = layout.cols;
  let maxCol = -1;
  let minRow = layout.rows;
  let maxRow = -1;

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const tile = layout.tiles[row * layout.cols + col];
      if (tile === TileType.VOID) continue;
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
    }
  }

  if (maxCol < minCol || maxRow < minRow) {
    return { minCol: 0, maxCol: layout.cols - 1, minRow: 0, maxRow: layout.rows - 1 };
  }

  return { minCol, maxCol, minRow, maxRow };
}
