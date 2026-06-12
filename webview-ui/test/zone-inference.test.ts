import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { FALLBACK_FLOOR_COLOR } from '../src/constants.ts';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.ts';
import {
  type FurnitureCatalogEntry,
  type OfficeLayout,
  type PlacedFurniture,
  TILE_SIZE,
  TileType,
} from '../src/office/types.ts';
import { inferTileZone } from '../src/office/zoneUtils.ts';

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
      id: 'COFFEE_TABLE',
      label: 'Coffee Table',
      category: 'desks',
      width: TILE_SIZE * 2,
      height: TILE_SIZE * 2,
      footprintW: 2,
      footprintH: 2,
      isDesk: true,
    },
  ];
  buildDynamicCatalog({
    catalog: assets,
    sprites: Object.fromEntries(assets.map((asset) => [asset.id, sprite])),
  });
});

function makeLayout(furniture: PlacedFurniture[], cols = 20, rows = 12): OfficeLayout {
  return {
    version: 1,
    cols,
    rows,
    tiles: Array.from({ length: cols * rows }, () => TileType.FLOOR_1),
    furniture,
  };
}

function roomed(layout: OfficeLayout): OfficeLayout {
  layout.projectRooms = [
    {
      id: 'project-alpha',
      kind: 'project',
      bounds: { col: 0, row: 0, width: 10, height: 12 },
      project: { key: 'alpha', displayName: 'alpha', source: 'folderName' },
    },
    { id: 'project-room-lobby', kind: 'public', bounds: { col: 12, row: 0, width: 8, height: 6 } },
    { id: 'meet', kind: 'meeting', bounds: { col: 12, row: 7, width: 8, height: 5 } },
  ];
  return layout;
}

test('room-based offices derive zones from furniture, not the legacy left/right split', () => {
  // Workstation (desk+PC) on the LEFT, sofa corner also on the LEFT, empty floor in between.
  const layout = roomed(
    makeLayout([
      { uid: 'project-alpha-desk', type: 'DESK', col: 1, row: 1 },
      { uid: 'project-alpha-pc', type: 'PC', col: 2, row: 1 },
      { uid: 'project-alpha-sofa', type: 'SOFA_FRONT', col: 1, row: 9 },
    ]),
  );

  // Desk vicinity = work (furniture-derived, not "left half of the office").
  assert.deepEqual(inferTileZone(layout, 2, 3), { zone: 'work', source: 'furniture' });
  // Sofa corner in the SAME left-side room = rest — the legacy split called this 'work'.
  assert.deepEqual(inferTileZone(layout, 2, 9), { zone: 'rest', source: 'furniture' });
  // Open floor in the project room = neutral (idle agents may stand/wander here).
  assert.deepEqual(inferTileZone(layout, 5, 6), { zone: 'neutral', source: 'furniture' });
});

test('public and meeting rooms classify by room purpose', () => {
  const layout = roomed(makeLayout([]));
  assert.deepEqual(inferTileZone(layout, 14, 2), { zone: 'rest', source: 'room-kind' });
  assert.deepEqual(inferTileZone(layout, 14, 9), { zone: 'meeting', source: 'room-kind' });
});

test('a bare desk or coffee table is not a workstation (no electronics nearby)', () => {
  const layout = roomed(
    makeLayout([
      { uid: 'f-decor-desk', type: 'DESK', col: 1, row: 1 },
      { uid: 'f-coffee', type: 'COFFEE_TABLE', col: 6, row: 9 },
    ]),
  );
  assert.equal(inferTileZone(layout, 2, 2).zone, 'neutral');
  assert.equal(inferTileZone(layout, 6, 9).zone, 'neutral');
});

test('painted zones always win', () => {
  const layout = roomed(
    makeLayout([{ uid: 'project-alpha-sofa', type: 'SOFA_FRONT', col: 1, row: 9 }]),
  );
  layout.zones = new Array(layout.cols * layout.rows).fill(null);
  layout.zones[9 * layout.cols + 1] = 'meeting';
  assert.deepEqual(inferTileZone(layout, 1, 9), { zone: 'meeting', source: 'zone-paint' });
});

test('room-less legacy layouts keep the historical default split', () => {
  const layout = makeLayout([]);
  assert.equal(inferTileZone(layout, 2, 5).source, 'default-split');
  assert.equal(inferTileZone(layout, 2, 5).zone, 'work');
  assert.equal(inferTileZone(layout, 18, 5).zone, 'rest');
});
