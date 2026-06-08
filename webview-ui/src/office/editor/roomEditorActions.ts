import {
  PROJECT_ROOM_MIN_HEIGHT,
  PROJECT_ROOM_MIN_WIDTH,
  PROJECT_ROOM_PROJECT_KEY_MAX_LENGTH,
} from '../../constants.js';
import {
  normalizeProjectKey,
  normalizeProjectRooms,
  safeProjectRoomIdSegment,
  safeProjectRoomLabel,
} from '../projectRooms.js';
import type { OfficeLayout, ProjectRoom } from '../types.js';
import { ProjectIdentitySource, ProjectRoomKind } from '../types.js';

export interface ProjectRoomEditorPatch {
  label?: string;
  kind?: ProjectRoom['kind'];
  projectKey?: string;
  projectDisplayName?: string;
  col?: number;
  row?: number;
  width?: number;
  height?: number;
}

export function findProjectRoomAtTile(
  layout: OfficeLayout,
  col: number,
  row: number,
): ProjectRoom | null {
  const rooms = normalizeProjectRooms(layout);
  for (let i = rooms.length - 1; i >= 0; i--) {
    const room = rooms[i]!;
    if (
      col >= room.bounds.col &&
      col < room.bounds.col + room.bounds.width &&
      row >= room.bounds.row &&
      row < room.bounds.row + room.bounds.height
    ) {
      return room;
    }
  }
  return null;
}

export function createProjectRoom(
  layout: OfficeLayout,
  col: number,
  row: number,
  width = 6,
  height = 5,
): OfficeLayout {
  const bounds = clampBounds(layout, col, row, width, height);
  const existing = normalizeProjectRooms(layout);
  const id = nextRoomId(existing, 'room');
  return {
    ...layout,
    projectRooms: [
      ...existing,
      {
        id,
        kind: ProjectRoomKind.UNASSIGNED,
        bounds,
        label: 'Room',
      },
    ],
  };
}

export function updateProjectRoom(
  layout: OfficeLayout,
  roomId: string,
  patch: ProjectRoomEditorPatch,
): OfficeLayout {
  const rooms = normalizeProjectRooms(layout);
  let changed = false;
  const nextRooms = rooms.map((room) => {
    if (room.id !== roomId) return room;
    changed = true;
    const nextKind =
      patch.kind && Object.values(ProjectRoomKind).includes(patch.kind) ? patch.kind : room.kind;
    const bounds = clampBounds(
      layout,
      patch.col ?? room.bounds.col,
      patch.row ?? room.bounds.row,
      patch.width ?? room.bounds.width,
      patch.height ?? room.bounds.height,
    );
    const label =
      patch.label !== undefined
        ? safeProjectRoomLabel(patch.label, room.label ?? 'Room')
        : room.label;
    const project = buildProjectMetadata(room, patch, nextKind);
    const now = Date.now();
    return {
      ...room,
      kind: nextKind,
      bounds,
      ...(label ? { label } : {}),
      ...(project ? { project } : {}),
      updatedAtMs: now,
    };
  });

  if (!changed) return layout;
  return { ...layout, projectRooms: nextRooms };
}

export function deleteProjectRoom(layout: OfficeLayout, roomId: string): OfficeLayout {
  const rooms = normalizeProjectRooms(layout);
  const nextRooms = rooms.filter((room) => room.id !== roomId);
  if (nextRooms.length === rooms.length) return layout;
  return { ...layout, projectRooms: nextRooms };
}

function buildProjectMetadata(
  room: ProjectRoom,
  patch: ProjectRoomEditorPatch,
  kind: ProjectRoom['kind'],
): ProjectRoom['project'] | undefined {
  if (kind !== ProjectRoomKind.PROJECT) return undefined;
  const requestedKey = patch.projectKey ?? room.project?.key ?? room.label ?? room.id;
  const key = normalizeProjectKey(requestedKey.slice(0, PROJECT_ROOM_PROJECT_KEY_MAX_LENGTH));
  if (!key) return undefined;
  const displayName = safeProjectRoomLabel(
    patch.projectDisplayName ?? patch.label ?? room.project?.displayName ?? requestedKey,
    'Project',
  );
  return {
    key,
    displayName,
    source: room.project?.source ?? ProjectIdentitySource.UNKNOWN,
    ...(room.project?.providerIds ? { providerIds: room.project.providerIds } : {}),
    ...(room.project?.projectDirHash ? { projectDirHash: room.project.projectDirHash } : {}),
  };
}

function clampBounds(
  layout: OfficeLayout,
  col: number,
  row: number,
  width: number,
  height: number,
): ProjectRoom['bounds'] {
  const safeCol = clampInt(col, 0, Math.max(0, layout.cols - PROJECT_ROOM_MIN_WIDTH));
  const safeRow = clampInt(row, 0, Math.max(0, layout.rows - PROJECT_ROOM_MIN_HEIGHT));
  const maxWidth = Math.max(PROJECT_ROOM_MIN_WIDTH, layout.cols - safeCol);
  const maxHeight = Math.max(PROJECT_ROOM_MIN_HEIGHT, layout.rows - safeRow);
  return {
    col: safeCol,
    row: safeRow,
    width: clampInt(width, PROJECT_ROOM_MIN_WIDTH, maxWidth),
    height: clampInt(height, PROJECT_ROOM_MIN_HEIGHT, maxHeight),
  };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function nextRoomId(rooms: ProjectRoom[], label: string): string {
  const base = `room-${safeProjectRoomIdSegment(label, 'room')}`;
  const ids = new Set(rooms.map((room) => room.id));
  if (!ids.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const id = `${base}-${i}`;
    if (!ids.has(id)) return id;
  }
  return `${base}-${Date.now()}`;
}
