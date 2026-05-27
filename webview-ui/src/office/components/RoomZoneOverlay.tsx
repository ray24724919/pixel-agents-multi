import { useEffect, useState } from 'react';

import {
  MEETING_ZONE_BACKGROUND,
  MEETING_ZONE_BORDER_COLOR,
  MEETING_ZONE_LABEL_COLOR,
  NEUTRAL_ZONE_BACKGROUND,
  NEUTRAL_ZONE_BORDER_COLOR,
  NEUTRAL_ZONE_LABEL_COLOR,
  REST_ZONE_BACKGROUND,
  REST_ZONE_BORDER_COLOR,
  REST_ZONE_LABEL_COLOR,
  WORK_ZONE_BACKGROUND,
  WORK_ZONE_BORDER_COLOR,
  WORK_ZONE_LABEL_COLOR,
  ZONE_LABEL_BACKGROUND,
} from '../../constants.js';
import type { OfficeState } from '../engine/officeState.js';
import { getVisibleRoomBounds } from '../layout/visibleRoomBounds.js';
import { TILE_SIZE, TileType, type ZoneType } from '../types.js';

interface RoomZoneOverlayProps {
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

interface ZoneRect {
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  borderColor: string;
  background: string;
  labelColor: string;
}

function zoneStyles(zone: ZoneType): Pick<ZoneRect, 'borderColor' | 'background' | 'labelColor'> {
  switch (zone) {
    case 'work':
      return {
        borderColor: WORK_ZONE_BORDER_COLOR,
        background: WORK_ZONE_BACKGROUND,
        labelColor: WORK_ZONE_LABEL_COLOR,
      };
    case 'meeting':
      return {
        borderColor: MEETING_ZONE_BORDER_COLOR,
        background: MEETING_ZONE_BACKGROUND,
        labelColor: MEETING_ZONE_LABEL_COLOR,
      };
    case 'neutral':
      return {
        borderColor: NEUTRAL_ZONE_BORDER_COLOR,
        background: NEUTRAL_ZONE_BACKGROUND,
        labelColor: NEUTRAL_ZONE_LABEL_COLOR,
      };
    case 'rest':
    default:
      return {
        borderColor: REST_ZONE_BORDER_COLOR,
        background: REST_ZONE_BACKGROUND,
        labelColor: REST_ZONE_LABEL_COLOR,
      };
  }
}

export function RoomZoneOverlay({ officeState, containerRef, zoom, panRef }: RoomZoneOverlayProps) {
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
  const splitCol = Math.floor((roomBounds.minCol + roomBounds.maxCol + 1) / 2);

  const toScreenRect = (
    minCol: number,
    maxCol: number,
    minRow: number,
    maxRow: number,
    label: string,
    borderColor: string,
    background: string,
    labelColor: string,
  ): ZoneRect | null => {
    if (maxCol < minCol || maxRow < minRow) return null;

    const worldLeft = minCol * TILE_SIZE;
    const worldTop = minRow * TILE_SIZE;
    const worldWidth = (maxCol - minCol + 1) * TILE_SIZE;
    const worldHeight = (maxRow - minRow + 1) * TILE_SIZE;

    return {
      label,
      left: (deviceOffsetX + worldLeft * zoom) / dpr,
      top: (deviceOffsetY + worldTop * zoom) / dpr,
      width: (worldWidth * zoom) / dpr,
      height: (worldHeight * zoom) / dpr,
      borderColor,
      background,
      labelColor,
    };
  };

  const zones = [
    toScreenRect(
      roomBounds.minCol,
      splitCol,
      roomBounds.minRow,
      roomBounds.maxRow,
      'WORK',
      WORK_ZONE_BORDER_COLOR,
      WORK_ZONE_BACKGROUND,
      WORK_ZONE_LABEL_COLOR,
    ),
    toScreenRect(
      splitCol + 1,
      roomBounds.maxCol,
      roomBounds.minRow,
      roomBounds.maxRow,
      'REST',
      REST_ZONE_BORDER_COLOR,
      REST_ZONE_BACKGROUND,
      REST_ZONE_LABEL_COLOR,
    ),
  ].filter((zone): zone is ZoneRect => zone !== null);
  const paintedZones: ZoneRect[] = [];
  if (layout.zones) {
    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        const idx = row * layout.cols + col;
        const zone = layout.zones[idx];
        if (!zone || layout.tiles[idx] === TileType.VOID) continue;
        const style = zoneStyles(zone);
        const rect = toScreenRect(
          col,
          col,
          row,
          row,
          '',
          style.borderColor,
          style.background,
          style.labelColor,
        );
        if (rect) paintedZones.push(rect);
      }
    }
  }

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 8 }}>
      {zones.map((zone) => (
        <div
          key={zone.label}
          className="absolute border-2"
          style={{
            left: zone.left,
            top: zone.top,
            width: zone.width,
            height: zone.height,
            borderColor: zone.borderColor,
            background: zone.background,
          }}
        >
          <div
            className="absolute left-2 top-2 px-2 py-1 font-mono text-[11px] leading-none tracking-normal"
            style={{
              color: zone.labelColor,
              background: ZONE_LABEL_BACKGROUND,
              border: `1px solid ${zone.borderColor}`,
            }}
          >
            {zone.label}
          </div>
        </div>
      ))}
      {paintedZones.map((zone, index) => (
        <div
          key={`${zone.left}-${zone.top}-${index}`}
          className="absolute border"
          style={{
            left: zone.left,
            top: zone.top,
            width: zone.width,
            height: zone.height,
            borderColor: zone.borderColor,
            background: zone.background,
          }}
        />
      ))}
    </div>
  );
}
