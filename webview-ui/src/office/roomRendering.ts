import {
  PROJECT_ROOM_DOORPLATE_MAX_CHARS,
  PROJECT_ROOM_DOORPLATE_MIN_ZOOM,
  PROJECT_ROOM_MEETING_BORDER,
  PROJECT_ROOM_MEETING_COLOR,
  PROJECT_ROOM_PROJECT_BORDER,
  PROJECT_ROOM_PROJECT_COLOR,
  PROJECT_ROOM_PUBLIC_BORDER,
  PROJECT_ROOM_PUBLIC_COLOR,
  PROJECT_ROOM_REST_BORDER,
  PROJECT_ROOM_REST_COLOR,
  PROJECT_ROOM_UNASSIGNED_BORDER,
  PROJECT_ROOM_UNASSIGNED_COLOR,
} from '../constants.js';
import { normalizeProjectRooms, safeProjectRoomLabel } from './projectRooms.js';
import type { OfficeLayout, ProjectRoom } from './types.js';
import { ProjectRoomKind, TILE_SIZE } from './types.js';

export interface RoomRenderInstruction {
  id: string;
  kind: ProjectRoom['kind'];
  col: number;
  row: number;
  width: number;
  height: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  border: string;
  doorplate: {
    label: string;
    x: number;
    y: number;
    maxWidth: number;
    visible: boolean;
  };
  selected: boolean;
  hovered: boolean;
}

interface RoomPalette {
  fill: string;
  border: string;
  fallbackLabel: string;
}

function paletteForKind(kind: ProjectRoom['kind']): RoomPalette {
  switch (kind) {
    case ProjectRoomKind.PUBLIC:
      return {
        fill: PROJECT_ROOM_PUBLIC_COLOR,
        border: PROJECT_ROOM_PUBLIC_BORDER,
        fallbackLabel: 'Public',
      };
    case ProjectRoomKind.REST:
      return {
        fill: PROJECT_ROOM_REST_COLOR,
        border: PROJECT_ROOM_REST_BORDER,
        fallbackLabel: 'Rest',
      };
    case ProjectRoomKind.MEETING:
      return {
        fill: PROJECT_ROOM_MEETING_COLOR,
        border: PROJECT_ROOM_MEETING_BORDER,
        fallbackLabel: 'Meeting',
      };
    case ProjectRoomKind.UNASSIGNED:
      return {
        fill: PROJECT_ROOM_UNASSIGNED_COLOR,
        border: PROJECT_ROOM_UNASSIGNED_BORDER,
        fallbackLabel: 'Unassigned',
      };
    case ProjectRoomKind.PROJECT:
    default:
      return {
        fill: PROJECT_ROOM_PROJECT_COLOR,
        border: PROJECT_ROOM_PROJECT_BORDER,
        fallbackLabel: 'Project',
      };
  }
}

export function projectRoomDoorplateLabel(room: ProjectRoom): string {
  const palette = paletteForKind(room.kind);
  const source = room.label || room.project?.displayName || room.project?.key;
  const safe = safeProjectRoomLabel(source, palette.fallbackLabel);
  if (safe.length <= PROJECT_ROOM_DOORPLATE_MAX_CHARS) return safe;
  return `${safe.slice(0, PROJECT_ROOM_DOORPLATE_MAX_CHARS - 3)}...`;
}

export function buildRoomRenderInstructions(
  layout: OfficeLayout,
  zoom: number,
  selectedRoomId: string | null = null,
  hoveredRoomId: string | null = null,
): RoomRenderInstruction[] {
  const rooms = normalizeProjectRooms(layout);
  if (rooms.length === 0) return [];

  return rooms.map((room) => {
    const palette = paletteForKind(room.kind);
    const x = room.bounds.col * TILE_SIZE * zoom;
    const y = room.bounds.row * TILE_SIZE * zoom;
    const w = room.bounds.width * TILE_SIZE * zoom;
    const h = room.bounds.height * TILE_SIZE * zoom;
    const plateX = x + 2 * zoom;
    const plateY = y + 2 * zoom;
    return {
      id: room.id,
      kind: room.kind,
      col: room.bounds.col,
      row: room.bounds.row,
      width: room.bounds.width,
      height: room.bounds.height,
      x,
      y,
      w,
      h,
      fill: palette.fill,
      border: palette.border,
      doorplate: {
        label: projectRoomDoorplateLabel(room),
        x: plateX,
        y: plateY,
        maxWidth: Math.max(0, w - 4 * zoom),
        visible: zoom >= PROJECT_ROOM_DOORPLATE_MIN_ZOOM && room.bounds.width >= 3,
      },
      selected: room.id === selectedRoomId,
      hovered: room.id === hoveredRoomId,
    };
  });
}
