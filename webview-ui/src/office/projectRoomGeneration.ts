import type { ColorValue } from '../components/ui/types.js';
import {
  DEFAULT_FLOOR_COLOR,
  PROJECT_ROOM_DEFAULT_HEIGHT,
  PROJECT_ROOM_DEFAULT_WIDTH,
  PROJECT_ROOM_GENERATED_MARGIN,
  PROJECT_ROOM_GENERATED_REST_MIN_WIDTH,
} from '../constants.js';
import { getAllCatalogEntries } from './layout/furnitureCatalog.js';
import {
  normalizeProjectKey,
  normalizeProjectRooms,
  safeProjectRoomIdSegment,
  safeProjectRoomLabel,
} from './projectRooms.js';
import type {
  Character,
  FurnitureCatalogEntry,
  OfficeLayout,
  PlacedFurniture,
  ProjectRoom,
  TileType as TileTypeVal,
  ZoneType,
} from './types.js';
import { MAX_COLS, MAX_ROWS, ProjectIdentitySource, ProjectRoomKind, TileType } from './types.js';

export interface ProjectRoomGenerationAgent extends Pick<Character, 'folderName' | 'isSubagent'> {
  hidden?: boolean;
  archived?: boolean;
  killed?: boolean;
}

export interface ProjectRoomGenerationResult {
  layout: OfficeLayout;
  createdRooms: ProjectRoom[];
  skippedUnknownCount: number;
  overflowCount: number;
}

interface RoomTemplateAssets {
  desk: FurnitureCatalogEntry;
  electronics: FurnitureCatalogEntry;
  workChair: FurnitureCatalogEntry;
  restSeat?: FurnitureCatalogEntry;
}

export function ensureProjectRoomsForAgents(
  layout: OfficeLayout,
  agents: ProjectRoomGenerationAgent[],
): ProjectRoomGenerationResult {
  const initialRooms = normalizeProjectRooms(layout);
  let current: OfficeLayout = { ...layout, projectRooms: initialRooms };
  const existingKeys = new Set(
    initialRooms
      .filter((room) => room.kind === ProjectRoomKind.PROJECT)
      .map((room) => normalizeProjectKey(room.project?.key))
      .filter((key): key is string => Boolean(key)),
  );
  const projectInputs = collectMissingProjects(agents, existingKeys);
  const template = pickRoomTemplateAssets();
  const createdRooms: ProjectRoom[] = [];
  const skippedUnknownCount = agents.filter(
    (agent) => shouldGenerateForAgent(agent) && !normalizeProjectKey(agent.folderName),
  ).length;
  let overflowCount = 0;

  if (!template) {
    return {
      layout: current,
      createdRooms,
      skippedUnknownCount,
      overflowCount: projectInputs.length,
    };
  }

  for (const project of projectInputs) {
    const allocation = allocateRoomBounds(current);
    if (!allocation) {
      overflowCount++;
      continue;
    }
    current = allocation.layout;
    const currentRooms = normalizeProjectRooms(current);
    current = { ...current, projectRooms: currentRooms };
    const roomId = stableRoomId(project.key, currentRooms);
    const room: ProjectRoom = {
      id: roomId,
      kind: ProjectRoomKind.PROJECT,
      bounds: allocation.bounds,
      label: project.displayName,
      project: {
        key: project.key,
        displayName: project.displayName,
        source: ProjectIdentitySource.FOLDER_NAME,
      },
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
    current = {
      ...current,
      projectRooms: [...currentRooms, room],
      furniture: [...current.furniture, ...buildRoomFurniture(room, template)],
    };
    current = paintRoomFloor(current, room);
    createdRooms.push(room);
    existingKeys.add(project.key);
  }

  return { layout: current, createdRooms, skippedUnknownCount, overflowCount };
}

function shouldGenerateForAgent(agent: ProjectRoomGenerationAgent): boolean {
  return !agent.isSubagent && !agent.hidden && !agent.archived && !agent.killed;
}

function collectMissingProjects(
  agents: ProjectRoomGenerationAgent[],
  existingKeys: Set<string>,
): Array<{ key: string; displayName: string }> {
  const projects = new Map<string, string>();
  for (const agent of agents) {
    if (!shouldGenerateForAgent(agent)) continue;
    const key = normalizeProjectKey(agent.folderName);
    if (!key || existingKeys.has(key) || projects.has(key)) continue;
    projects.set(key, safeProjectRoomLabel(agent.folderName, 'Project'));
  }
  return [...projects.entries()]
    .map(([key, displayName]) => ({ key, displayName }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function pickRoomTemplateAssets(): RoomTemplateAssets | null {
  const entries = getAllCatalogEntries();
  const desk = pickEntry(entries, (entry) => entry.category === 'desks' && entry.isDesk);
  const electronics = pickEntry(
    entries,
    (entry) => entry.category === 'electronics' && !!entry.canPlaceOnSurfaces,
  );
  const workChair =
    pickEntry(entries, (entry) => entry.category === 'chairs' && entry.orientation === 'back') ??
    pickEntry(entries, (entry) => entry.category === 'chairs');
  if (!desk || !electronics || !workChair) return null;
  const restSeat =
    pickEntry(
      entries,
      (entry) =>
        entry.category === 'chairs' &&
        (entry.footprintW >= 2 || /sofa|bench|couch|cushion/i.test(entry.type + entry.label)),
    ) ??
    pickEntry(entries, (entry) => entry.category === 'chairs' && entry.type !== workChair.type);
  return {
    desk,
    electronics,
    workChair,
    ...(restSeat ? { restSeat } : {}),
  };
}

function pickEntry(
  entries: FurnitureCatalogEntry[],
  predicate: (entry: FurnitureCatalogEntry) => boolean,
): FurnitureCatalogEntry | undefined {
  return entries.filter(predicate).sort((a, b) => a.type.localeCompare(b.type))[0];
}

function allocateRoomBounds(
  layout: OfficeLayout,
): { layout: OfficeLayout; bounds: ProjectRoom['bounds'] } | null {
  const width = PROJECT_ROOM_DEFAULT_WIDTH;
  const height = PROJECT_ROOM_DEFAULT_HEIGHT;
  const margin = PROJECT_ROOM_GENERATED_MARGIN;
  const row = layout.rows + margin;
  if (row + height <= MAX_ROWS) {
    const bounds = { col: margin, row, width, height };
    return {
      layout: ensureLayoutSize(layout, Math.max(layout.cols, width + margin * 2), row + height),
      bounds,
    };
  }
  const col = layout.cols + margin;
  if (col + width <= MAX_COLS && height + margin * 2 <= layout.rows) {
    const bounds = { col, row: margin, width, height };
    return { layout: ensureLayoutSize(layout, col + width, layout.rows), bounds };
  }
  return null;
}

function ensureLayoutSize(layout: OfficeLayout, cols: number, rows: number): OfficeLayout {
  const nextCols = Math.min(MAX_COLS, Math.max(layout.cols, cols));
  const nextRows = Math.min(MAX_ROWS, Math.max(layout.rows, rows));
  if (nextCols === layout.cols && nextRows === layout.rows) return layout;
  const tiles: TileTypeVal[] = new Array(nextCols * nextRows).fill(TileType.VOID);
  const tileColors: Array<ColorValue | null> = new Array(nextCols * nextRows).fill(null);
  const zones: Array<ZoneType | null> = new Array(nextCols * nextRows).fill(null);
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const oldIdx = r * layout.cols + c;
      const newIdx = r * nextCols + c;
      tiles[newIdx] = layout.tiles[oldIdx] ?? TileType.VOID;
      tileColors[newIdx] = layout.tileColors?.[oldIdx] ?? null;
      zones[newIdx] = layout.zones?.[oldIdx] ?? null;
    }
  }
  return { ...layout, cols: nextCols, rows: nextRows, tiles, tileColors, zones };
}

function paintRoomFloor(layout: OfficeLayout, room: ProjectRoom): OfficeLayout {
  const tiles = [...layout.tiles];
  const tileColors = [...(layout.tileColors ?? new Array(layout.tiles.length).fill(null))];
  const zones = [...(layout.zones ?? new Array(layout.tiles.length).fill(null))];
  for (let row = room.bounds.row; row < room.bounds.row + room.bounds.height; row++) {
    for (let col = room.bounds.col; col < room.bounds.col + room.bounds.width; col++) {
      const idx = row * layout.cols + col;
      tiles[idx] = TileType.FLOOR_1;
      tileColors[idx] = { ...DEFAULT_FLOOR_COLOR };
      zones[idx] = null;
    }
  }
  return { ...layout, tiles, tileColors, zones };
}

function buildRoomFurniture(room: ProjectRoom, template: RoomTemplateAssets): PlacedFurniture[] {
  const { col, row, width } = room.bounds;
  const furniture: PlacedFurniture[] = [
    { uid: `${room.id}-desk`, type: template.desk.type, col: col + 2, row: row + 1 },
    { uid: `${room.id}-tech`, type: template.electronics.type, col: col + 3, row: row + 1 },
    { uid: `${room.id}-work-chair`, type: template.workChair.type, col: col + 3, row: row + 3 },
  ];
  if (template.restSeat && width >= PROJECT_ROOM_GENERATED_REST_MIN_WIDTH) {
    furniture.push({
      uid: `${room.id}-rest-seat`,
      type: template.restSeat.type,
      col: col + Math.max(5, width - template.restSeat.footprintW - 1),
      row: row + 4,
    });
  }
  return furniture;
}

function stableRoomId(projectKey: string, rooms: ProjectRoom[]): string {
  const base = `project-${safeProjectRoomIdSegment(projectKey)}`;
  const ids = new Set(rooms.map((room) => room.id));
  if (!ids.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const id = `${base}-${i}`;
    if (!ids.has(id)) return id;
  }
  return `${base}-${rooms.length + 1}`;
}
