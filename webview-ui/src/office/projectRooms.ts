import {
  PROJECT_ROOM_ID_MAX_LENGTH,
  PROJECT_ROOM_LABEL_MAX_LENGTH,
  PROJECT_ROOM_PROJECT_KEY_MAX_LENGTH,
} from '../constants.js';
import type {
  Character,
  OfficeLayout,
  ProjectIdentitySource as ProjectIdentitySourceType,
  ProjectRoom,
  Seat,
} from './types.js';
import { ProjectIdentitySource, ProjectRoomKind } from './types.js';

type RoomMode = 'work' | 'rest';

const PROJECT_ROOM_KIND_VALUES = new Set<string>(Object.values(ProjectRoomKind));
const PROJECT_IDENTITY_SOURCE_VALUES = new Set<string>(Object.values(ProjectIdentitySource));
const WINDOWS_ABSOLUTE_PATH_RE = /^[a-z]:[\\/]/i;
const WINDOWS_UNC_PATH_RE = /^\\\\/;
const POSIX_ABSOLUTE_PATH_RE = /^\//;
const SECRET_OR_TRANSCRIPT_RE =
  /(api[_-]?key|password|secret|token|sk-[a-z0-9]|\.jsonl|transcript|raw prompt|tool output|BEGIN [A-Z ]*KEY)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/\0/g, '');
  if (!cleaned) return undefined;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

export function isUnsafeProjectRoomLabel(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value
    .trim()
    .replace(/^\\\\\?\\UNC\\/i, '//')
    .replace(/^\\\\\?\\/i, '');
  return (
    SECRET_OR_TRANSCRIPT_RE.test(normalized) ||
    WINDOWS_ABSOLUTE_PATH_RE.test(normalized) ||
    WINDOWS_UNC_PATH_RE.test(normalized) ||
    POSIX_ABSOLUTE_PATH_RE.test(normalized)
  );
}

export function safeProjectRoomLabel(value: string | undefined, fallback = 'Project'): string {
  const cleaned = cleanString(value, PROJECT_ROOM_LABEL_MAX_LENGTH);
  if (!cleaned) return fallback;
  if (SECRET_OR_TRANSCRIPT_RE.test(cleaned)) return fallback;

  const withoutNamespace = cleaned.replace(/^\\\\\?\\UNC\\/i, '//').replace(/^\\\\\?\\/i, '');
  if (
    WINDOWS_ABSOLUTE_PATH_RE.test(withoutNamespace) ||
    WINDOWS_UNC_PATH_RE.test(withoutNamespace) ||
    POSIX_ABSOLUTE_PATH_RE.test(withoutNamespace)
  ) {
    const parts = withoutNamespace.replace(/\\/g, '/').split('/').filter(Boolean);
    const basename = cleanString(parts.at(-1), PROJECT_ROOM_LABEL_MAX_LENGTH);
    return basename && !SECRET_OR_TRANSCRIPT_RE.test(basename) ? basename : fallback;
  }

  return withoutNamespace.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');
}

export function safeProjectRoomIdSegment(value: string | undefined, fallback = 'project'): string {
  const label = safeProjectRoomLabel(value, fallback)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return label || fallback;
}

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((item) => cleanString(item, PROJECT_ROOM_LABEL_MAX_LENGTH))
    .filter((item): item is string => Boolean(item));
  return cleaned.length > 0 ? cleaned : undefined;
}

function cleanTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function normalizeProjectKey(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\0/g, '');
  if (!trimmed) return null;
  const withoutWindowsNamespace = trimmed
    .replace(/^\\\\\?\\UNC\\/i, '//')
    .replace(/^\\\\\?\\/i, '');
  const normalized = withoutWindowsNamespace
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/g, '')
    .toLocaleLowerCase();
  return normalized ? normalized.slice(0, PROJECT_ROOM_PROJECT_KEY_MAX_LENGTH) : null;
}

export function deriveAgentProjectKey(
  ch: Pick<Character, 'folderName' | 'projectDir' | 'projectName'>,
): string | null {
  return (
    normalizeProjectKey(ch.projectDir) ??
    normalizeProjectKey(ch.projectName) ??
    normalizeProjectKey(ch.folderName)
  );
}

function normalizeProjectRoomProject(value: unknown): ProjectRoom['project'] | undefined {
  if (!isRecord(value)) return undefined;
  const key = normalizeProjectKey(cleanString(value.key, PROJECT_ROOM_PROJECT_KEY_MAX_LENGTH));
  const rawDisplayName = cleanString(value.displayName, PROJECT_ROOM_LABEL_MAX_LENGTH);
  const displayName = rawDisplayName ? safeProjectRoomLabel(rawDisplayName, 'Project') : undefined;
  if (!key || !displayName) return undefined;

  const rawSource = cleanString(value.source, PROJECT_ROOM_LABEL_MAX_LENGTH);
  const source =
    rawSource && PROJECT_IDENTITY_SOURCE_VALUES.has(rawSource)
      ? (rawSource as ProjectIdentitySourceType)
      : ProjectIdentitySource.UNKNOWN;
  const providerIds = cleanStringArray(value.providerIds);
  const projectDirHash = cleanString(value.projectDirHash, PROJECT_ROOM_PROJECT_KEY_MAX_LENGTH);
  return {
    key,
    displayName,
    source,
    ...(providerIds ? { providerIds } : {}),
    ...(projectDirHash ? { projectDirHash } : {}),
  };
}

export function normalizeProjectRoom(layout: OfficeLayout, value: unknown): ProjectRoom | null {
  if (!isRecord(value) || !isRecord(value.bounds)) return null;
  if (layout.cols <= 0 || layout.rows <= 0) return null;

  const id = cleanString(value.id, PROJECT_ROOM_ID_MAX_LENGTH);
  const rawKind = cleanString(value.kind, PROJECT_ROOM_LABEL_MAX_LENGTH);
  if (!id || !rawKind || !PROJECT_ROOM_KIND_VALUES.has(rawKind)) return null;

  const col = clampInt(value.bounds.col, 0, layout.cols - 1);
  const row = clampInt(value.bounds.row, 0, layout.rows - 1);
  const rawWidth = clampInt(value.bounds.width, 1, layout.cols);
  const rawHeight = clampInt(value.bounds.height, 1, layout.rows);
  if (col === null || row === null || rawWidth === null || rawHeight === null) return null;

  const width = Math.min(rawWidth, layout.cols - col);
  const height = Math.min(rawHeight, layout.rows - row);
  if (width <= 0 || height <= 0) return null;

  const project = normalizeProjectRoomProject(value.project);
  const rawLabel = cleanString(value.label, PROJECT_ROOM_LABEL_MAX_LENGTH);
  const label = rawLabel ? safeProjectRoomLabel(rawLabel, '') : undefined;
  const createdAtMs = cleanTimestamp(value.createdAtMs);
  const updatedAtMs = cleanTimestamp(value.updatedAtMs);
  const loungeRev = cleanTimestamp(value.loungeRev);
  const vacatedAtMs = cleanTimestamp(value.vacatedAtMs);

  return {
    id,
    kind: rawKind as ProjectRoom['kind'],
    bounds: { col, row, width, height },
    ...(project ? { project } : {}),
    ...(label ? { label } : {}),
    ...(value.color ? { color: value.color as ProjectRoom['color'] } : {}),
    ...(createdAtMs !== undefined ? { createdAtMs } : {}),
    ...(updatedAtMs !== undefined ? { updatedAtMs } : {}),
    ...(loungeRev !== undefined ? { loungeRev } : {}),
    ...(vacatedAtMs !== undefined ? { vacatedAtMs } : {}),
  };
}

export function normalizeProjectRooms(layout: OfficeLayout): ProjectRoom[] {
  if (!Array.isArray(layout.projectRooms)) return [];
  const rooms: ProjectRoom[] = [];
  const seen = new Set<string>();
  for (const value of layout.projectRooms) {
    const room = normalizeProjectRoom(layout, value);
    if (!room || seen.has(room.id)) continue;
    seen.add(room.id);
    rooms.push(room);
  }
  return rooms;
}

export function normalizeProjectRoomsInLayout(layout: OfficeLayout): OfficeLayout {
  if (!Array.isArray(layout.projectRooms)) return layout;
  return { ...layout, projectRooms: normalizeProjectRooms(layout) };
}

export function roomContainsTile(room: ProjectRoom, col: number, row: number): boolean {
  return (
    col >= room.bounds.col &&
    col < room.bounds.col + room.bounds.width &&
    row >= room.bounds.row &&
    row < room.bounds.row + room.bounds.height
  );
}

export function roomsForTile(layout: OfficeLayout, col: number, row: number): ProjectRoom[] {
  return normalizeProjectRooms(layout).filter((room) => roomContainsTile(room, col, row));
}

export function roomsForSeat(
  layout: OfficeLayout,
  seat: Pick<Seat, 'seatCol' | 'seatRow'>,
): ProjectRoom[] {
  return roomsForTile(layout, seat.seatCol, seat.seatRow);
}

function hasMatchingProjectRoom(rooms: ProjectRoom[], projectKey: string | null): boolean {
  if (!projectKey) return false;
  return rooms.some(
    (room) =>
      room.kind === ProjectRoomKind.PROJECT &&
      normalizeProjectKey(room.project?.key) === projectKey,
  );
}

function seatIsInOwnProjectRoom(
  containingRooms: ProjectRoom[],
  projectKey: string | null,
): boolean {
  if (!projectKey) return false;
  return containingRooms.some(
    (room) =>
      room.kind === ProjectRoomKind.PROJECT &&
      normalizeProjectKey(room.project?.key) === projectKey,
  );
}

function seatIsInKind(containingRooms: ProjectRoom[], kind: ProjectRoom['kind']): boolean {
  return containingRooms.some((room) => room.kind === kind);
}

function seatIsInOtherProjectRoom(
  containingRooms: ProjectRoom[],
  projectKey: string | null,
): boolean {
  return containingRooms.some(
    (room) =>
      room.kind === ProjectRoomKind.PROJECT &&
      (!projectKey || normalizeProjectKey(room.project?.key) !== projectKey),
  );
}

export function seatPriorityForProjectKey(
  layout: OfficeLayout,
  projectKey: string | null,
  seat: Pick<Seat, 'seatCol' | 'seatRow'>,
  mode: RoomMode,
): number {
  const rooms = normalizeProjectRooms(layout);
  if (rooms.length === 0) return 0;

  const containingRooms = roomsForSeat({ ...layout, projectRooms: rooms }, seat);
  const hasOwnProjectRoom = hasMatchingProjectRoom(rooms, projectKey);
  const inOwnProject = seatIsInOwnProjectRoom(containingRooms, projectKey);
  const inUnassigned = seatIsInKind(containingRooms, ProjectRoomKind.UNASSIGNED);
  const inPublicRest =
    seatIsInKind(containingRooms, ProjectRoomKind.PUBLIC) ||
    seatIsInKind(containingRooms, ProjectRoomKind.REST);
  const inMeeting = seatIsInKind(containingRooms, ProjectRoomKind.MEETING);
  const inOtherProject = seatIsInOtherProjectRoom(containingRooms, projectKey);

  if (mode === 'work') {
    if (hasOwnProjectRoom) {
      if (inOwnProject) return 0;
      if (inUnassigned) return 1;
      if (!inOtherProject) return 2;
      return 3;
    }
    if (inUnassigned) return 0;
    if (!inOtherProject) return 1;
    return 2;
  }

  if (hasOwnProjectRoom) {
    if (inOwnProject) return 0;
    if (inPublicRest) return 1;
    if (inUnassigned) return 2;
    if (inMeeting || !inOtherProject) return 3;
    return 4;
  }
  if (inUnassigned) return 0;
  if (inPublicRest) return 1;
  if (inMeeting || !inOtherProject) return 2;
  return 3;
}

export function seatPriorityForAgent(
  layout: OfficeLayout,
  ch: Pick<Character, 'folderName' | 'projectDir' | 'projectName'>,
  seat: Pick<Seat, 'seatCol' | 'seatRow'>,
  mode: RoomMode,
): number {
  return seatPriorityForProjectKey(layout, deriveAgentProjectKey(ch), seat, mode);
}

/**
 * True when a seat sits inside a DIFFERENT project's room while the agent has a project room of its
 * own. Such seats must be rejected outright (not merely deprioritized): an agent should rather stay
 * seatless in its own room than occupy another project's room. Agents without a matching own room are
 * never blocked, so unassigned/neutral fallbacks still work.
 */
export function seatIsForeignProjectRoomForAgent(
  layout: OfficeLayout,
  ch: Pick<Character, 'folderName' | 'projectDir' | 'projectName'>,
  seat: Pick<Seat, 'seatCol' | 'seatRow'>,
): boolean {
  const projectKey = deriveAgentProjectKey(ch);
  if (!projectKey) return false;
  const rooms = normalizeProjectRooms(layout);
  if (!hasMatchingProjectRoom(rooms, projectKey)) return false;
  const containingRooms = roomsForSeat({ ...layout, projectRooms: rooms }, seat);
  return (
    seatIsInOtherProjectRoom(containingRooms, projectKey) &&
    !seatIsInOwnProjectRoom(containingRooms, projectKey)
  );
}
