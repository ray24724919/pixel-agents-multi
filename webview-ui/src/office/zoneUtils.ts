import { getVisibleRoomBounds } from './layout/visibleRoomBounds.js';
import type { Character, OfficeLayout, Seat, ZoneType } from './types.js';

export type AgentZone = ZoneType;
export type AgentZoneSource =
  | 'seat-computer'
  | 'seat-paint'
  | 'seat-zone'
  | 'zone-paint'
  | 'active-state'
  | 'default-split';

export interface AgentZoneInfo {
  zone: AgentZone;
  source: AgentZoneSource;
}

export function inferTileZone(layout: OfficeLayout, col: number, row?: number): AgentZoneInfo {
  if (row !== undefined) {
    const idx = row * layout.cols + col;
    const paintedZone = layout.zones?.[idx];
    if (paintedZone) {
      return { zone: paintedZone, source: 'zone-paint' };
    }
  }
  const bounds = getVisibleRoomBounds(layout);
  const splitCol = Math.floor((bounds.minCol + bounds.maxCol + 1) / 2);
  return {
    zone: col > splitCol ? 'rest' : 'work',
    source: 'default-split',
  };
}

export function inferAgentZone(
  ch: Character,
  layout: OfficeLayout,
  seats: Map<string, Seat>,
): AgentZoneInfo {
  if (ch.seatId) {
    const seat = seats.get(ch.seatId);
    if (seat) {
      return {
        zone: seat.seatKind,
        source:
          seat.zoneSource === 'workstation' || seat.zoneSource === 'computer-adjacent'
            ? 'seat-computer'
            : seat.zoneSource === 'zone-paint'
              ? 'seat-paint'
              : 'seat-zone',
      };
    }
  }

  if (ch.isActive) {
    return { zone: 'work', source: 'active-state' };
  }

  return inferTileZone(layout, ch.tileCol, ch.tileRow);
}

export function zoneSourceLabel(source: AgentZoneSource): string {
  switch (source) {
    case 'zone-paint':
      return 'painted tile';
    case 'default-split':
      return 'default split';
    case 'active-state':
      return 'active work state';
    case 'seat-computer':
      return 'workstation seat';
    case 'seat-paint':
      return 'painted seat';
    case 'seat-zone':
      return 'zone-derived seat';
    default:
      return source;
  }
}
