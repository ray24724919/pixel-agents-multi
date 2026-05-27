import { useEffect, useState } from 'react';

import type { OfficeState } from '../engine/officeState.js';
import { inferTileZone, zoneSourceLabel } from '../zoneUtils.js';

interface RoomZoneStatusProps {
  officeState: OfficeState;
}

export function RoomZoneStatus({ officeState }: RoomZoneStatusProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const tile = officeState.hoveredTile;
  if (!tile) return null;

  const layout = officeState.getLayout();
  if (tile.col < 0 || tile.col >= layout.cols || tile.row < 0 || tile.row >= layout.rows) {
    return null;
  }

  const zone = inferTileZone(layout, tile.col, tile.row);

  return (
    <div className="absolute right-10 bottom-24 z-10 pixel-panel pointer-events-none px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-text-muted">Tile zone</div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
        <span className="text-accent-bright">
          {tile.col},{tile.row}
        </span>
        <span className="text-text">{zone.zone}</span>
        <span className="text-text-muted">{zoneSourceLabel(zone.source)}</span>
      </div>
    </div>
  );
}
