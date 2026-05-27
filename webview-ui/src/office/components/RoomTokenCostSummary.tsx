import { useEffect, useState } from 'react';

import { TokenCostSummary } from '../../components/TokenCostSummary.js';
import type { OfficeState } from '../engine/officeState.js';
import { getVisibleRoomBounds } from '../layout/visibleRoomBounds.js';
import { TILE_SIZE } from '../types.js';

interface RoomTokenCostSummaryProps {
  officeState: OfficeState;
  agents: number[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

export function RoomTokenCostSummary({
  officeState,
  agents,
  containerRef,
  zoom,
  panRef,
}: RoomTokenCostSummaryProps) {
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

  const el = containerRef.current;
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);
  const roomBounds = getVisibleRoomBounds(layout);

  const worldX = ((roomBounds.minCol + roomBounds.maxCol + 1) * TILE_SIZE) / 2;
  const worldY = (roomBounds.maxRow + 1) * TILE_SIZE + TILE_SIZE * 0.25;
  const screenX = (deviceOffsetX + worldX * zoom) / dpr;
  const screenY = (deviceOffsetY + worldY * zoom) / dpr;

  return (
    <div
      className="absolute z-10 w-[min(760px,84vw)] -translate-x-1/2 pointer-events-none"
      style={{ left: screenX, top: screenY }}
    >
      <TokenCostSummary agents={agents} officeState={officeState} compact />
    </div>
  );
}
