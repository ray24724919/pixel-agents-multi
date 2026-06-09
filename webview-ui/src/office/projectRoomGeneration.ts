import type { ColorValue } from '../components/ui/types.js';
import {
  DEFAULT_FLOOR_COLOR,
  PROJECT_ROOM_COLLAB_BOTTOM_ROW_OFFSET,
  PROJECT_ROOM_COLLAB_LEFT_CHAIR_OFFSET_COL,
  PROJECT_ROOM_COLLAB_LEFT_PC_OFFSET_COL,
  PROJECT_ROOM_COLLAB_REST_SEAT_OFFSET_COL,
  PROJECT_ROOM_COLLAB_REST_SEAT_OFFSET_ROW,
  PROJECT_ROOM_COLLAB_RIGHT_CHAIR_OFFSET_COL,
  PROJECT_ROOM_COLLAB_RIGHT_PC_OFFSET_COL,
  PROJECT_ROOM_COLLAB_TABLE_OFFSET_COL,
  PROJECT_ROOM_COLLAB_TABLE_OFFSET_ROW,
  PROJECT_ROOM_COLLAB_TEMPLATE_MIN_HEIGHT,
  PROJECT_ROOM_COLLAB_TEMPLATE_MIN_WIDTH,
  PROJECT_ROOM_COLLAB_TOP_ROW_OFFSET,
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
  projectDir?: string;
  projectName?: string;
  providerId?: string;
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
  collaboration?: CollaborationTemplateAssets;
}

interface CollaborationTemplateAssets {
  table: FurnitureCatalogEntry;
  rightElectronics: FurnitureCatalogEntry;
  leftElectronics: FurnitureCatalogEntry;
  rightChair: FurnitureCatalogEntry;
  leftChair: FurnitureCatalogEntry;
}

interface ProjectRoomGenerationProject {
  key: string;
  displayName: string;
  source: ProjectIdentitySource;
  providerIds: string[];
}

export function ensureProjectRoomsForAgents(
  layout: OfficeLayout,
  agents: ProjectRoomGenerationAgent[],
): ProjectRoomGenerationResult {
  const initialRooms = normalizeProjectRooms(layout);
  let current: OfficeLayout = { ...layout, projectRooms: initialRooms };
  const lobbyCore = deriveLobbyCoreBounds(current);
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
    (agent) => shouldGenerateForAgent(agent) && !deriveGenerationProject(agent),
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
    const allocation = allocateRoomBounds(current, lobbyCore);
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
        source: project.source,
        ...(project.providerIds.length > 0 ? { providerIds: project.providerIds } : {}),
      },
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
    current = {
      ...current,
      projectRooms: [...currentRooms, room],
      furniture: [...current.furniture, ...buildRoomFurniture(room, template)],
    };
    current = paintRoomFloor(current, room, lobbyCore);
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
): ProjectRoomGenerationProject[] {
  const projects = new Map<string, ProjectRoomGenerationProject>();
  for (const agent of agents) {
    if (!shouldGenerateForAgent(agent)) continue;
    const project = deriveGenerationProject(agent);
    if (!project || existingKeys.has(project.key)) continue;
    const existing = projects.get(project.key);
    if (existing) {
      projects.set(project.key, mergeProjectProviderIds(existing, project.providerIds));
    } else {
      projects.set(project.key, project);
    }
  }
  return [...projects.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function mergeProjectProviderIds(
  project: ProjectRoomGenerationProject,
  providerIds: string[],
): ProjectRoomGenerationProject {
  const merged = [...new Set([...project.providerIds, ...providerIds])].sort();
  return { ...project, providerIds: merged };
}

function deriveGenerationProject(
  agent: ProjectRoomGenerationAgent,
): ProjectRoomGenerationProject | null {
  const providerIds = agent.providerId ? [agent.providerId] : [];
  const projectDirKey = normalizeProjectKey(agent.projectDir);
  if (projectDirKey && !isWeakProjectKey(projectDirKey)) {
    return {
      key: projectDirKey,
      displayName: safeProjectRoomLabel(
        agent.projectName ?? agent.folderName ?? agent.projectDir,
        'Project',
      ),
      source: ProjectIdentitySource.PROJECT_DIR,
      providerIds,
    };
  }

  const projectNameLabel = safeProjectRoomLabel(agent.projectName, '');
  const projectNameKey = normalizeProjectKey(projectNameLabel);
  if (projectNameKey && !isWeakProjectKey(projectNameKey)) {
    return {
      key: projectNameKey,
      displayName: safeProjectRoomLabel(projectNameLabel, 'Project'),
      source: ProjectIdentitySource.PROJECT_NAME,
      providerIds,
    };
  }

  const folderKey = normalizeProjectKey(agent.folderName);
  if (folderKey && !isWeakProjectKey(folderKey)) {
    return {
      key: folderKey,
      displayName: safeProjectRoomLabel(agent.folderName, 'Project'),
      source: ProjectIdentitySource.FOLDER_NAME,
      providerIds,
    };
  }

  return null;
}

function isWeakProjectKey(key: string): boolean {
  return key === 'unknown' || key === 'unknown project' || key === 'untitled';
}

function pickRoomTemplateAssets(): RoomTemplateAssets | null {
  const entries = getAllCatalogEntries();
  const desk = pickWorkstationDesk(entries);
  const electronics = desk ? pickDeskElectronics(entries, desk) : undefined;
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
    ...(pickCollaborationTemplateAssets(entries) ?? {}),
    ...(restSeat ? { restSeat } : {}),
  };
}

function pickCollaborationTemplateAssets(
  entries: FurnitureCatalogEntry[],
): Pick<RoomTemplateAssets, 'collaboration'> | null {
  const table = pickCollaborationTable(entries);
  const rightElectronics = pickSideElectronics(entries, 'right');
  const leftElectronics = pickSideElectronics(entries, 'left');
  const rightChair = pickSideChair(entries, 'right');
  const leftChair = pickSideChair(entries, 'left');
  if (!table || !rightElectronics || !leftElectronics || !rightChair || !leftChair) return null;
  return {
    collaboration: {
      table,
      rightElectronics,
      leftElectronics,
      rightChair,
      leftChair,
    },
  };
}

function pickCollaborationTable(
  entries: FurnitureCatalogEntry[],
): FurnitureCatalogEntry | undefined {
  return pickPreferredEntry(
    entries,
    (entry) =>
      entry.category === 'desks' &&
      entry.isDesk &&
      entry.footprintW >= 3 &&
      entry.footprintH >= 4 &&
      !isCoffeeFurniture(entry),
    (entry) => {
      if (entry.type === 'TABLE_FRONT') return 100;
      if (/table/i.test(`${entry.type} ${entry.label}`)) return 50;
      return 0;
    },
  );
}

function pickSideElectronics(
  entries: FurnitureCatalogEntry[],
  side: 'left' | 'right',
): FurnitureCatalogEntry | undefined {
  return pickPreferredEntry(
    entries,
    (entry) =>
      entry.category === 'electronics' &&
      !!entry.canPlaceOnSurfaces &&
      isOffOrStaticElectronics(entry) &&
      isSideOrientation(entry.orientation, side),
    (entry) => {
      if (side === 'left' && entry.type === 'PC_SIDE:left') return 100;
      if (side === 'right' && entry.type === 'PC_SIDE') return 100;
      if (/pc/i.test(entry.type)) return 50;
      return 0;
    },
  );
}

function pickSideChair(
  entries: FurnitureCatalogEntry[],
  side: 'left' | 'right',
): FurnitureCatalogEntry | undefined {
  return pickPreferredEntry(
    entries,
    (entry) => entry.category === 'chairs' && isSideOrientation(entry.orientation, side),
    (entry) => {
      if (side === 'left' && entry.type === 'WOODEN_CHAIR_SIDE:left') return 100;
      if (side === 'right' && entry.type === 'WOODEN_CHAIR_SIDE') return 100;
      if (/wooden/i.test(entry.type)) return 50;
      return 0;
    },
  );
}

function pickWorkstationDesk(entries: FurnitureCatalogEntry[]): FurnitureCatalogEntry | undefined {
  return (
    pickEntry(
      entries,
      (entry) =>
        entry.category === 'desks' &&
        entry.isDesk &&
        entry.orientation === 'front' &&
        !isCoffeeFurniture(entry),
    ) ??
    pickEntry(
      entries,
      (entry) => entry.category === 'desks' && entry.isDesk && !isCoffeeFurniture(entry),
    ) ??
    pickEntry(entries, (entry) => entry.category === 'desks' && entry.isDesk)
  );
}

function pickDeskElectronics(
  entries: FurnitureCatalogEntry[],
  desk: FurnitureCatalogEntry,
): FurnitureCatalogEntry | undefined {
  const isSurfaceElectronics = (entry: FurnitureCatalogEntry) =>
    entry.category === 'electronics' && !!entry.canPlaceOnSurfaces;
  return (
    pickEntry(
      entries,
      (entry) =>
        isSurfaceElectronics(entry) &&
        isOrientationCompatible(entry.orientation, desk.orientation) &&
        isOffOrStaticElectronics(entry),
    ) ??
    pickEntry(
      entries,
      (entry) =>
        isSurfaceElectronics(entry) && isOrientationCompatible(entry.orientation, desk.orientation),
    ) ??
    pickEntry(
      entries,
      (entry) =>
        isSurfaceElectronics(entry) &&
        (entry.orientation === 'front' || !entry.orientation) &&
        isOffOrStaticElectronics(entry),
    ) ??
    pickEntry(entries, (entry) => isSurfaceElectronics(entry) && isOffOrStaticElectronics(entry)) ??
    pickEntry(entries, isSurfaceElectronics)
  );
}

function isOrientationCompatible(
  electronicsOrientation: string | undefined,
  deskOrientation: string | undefined,
): boolean {
  if (!deskOrientation) return electronicsOrientation === 'front' || !electronicsOrientation;
  if (deskOrientation === electronicsOrientation) return true;
  if (deskOrientation === 'side' || deskOrientation === 'right') {
    return electronicsOrientation === 'side' || electronicsOrientation === 'right';
  }
  if (deskOrientation === 'left') {
    return electronicsOrientation === 'left' || electronicsOrientation === 'side';
  }
  return false;
}

function isSideOrientation(orientation: string | undefined, side: 'left' | 'right'): boolean {
  if (side === 'left') return orientation === 'left';
  return orientation === 'side' || orientation === 'right';
}

function isOffOrStaticElectronics(entry: FurnitureCatalogEntry): boolean {
  return !/_ON(?:_|$)/i.test(entry.type);
}

function isCoffeeFurniture(entry: FurnitureCatalogEntry): boolean {
  return /coffee/i.test(`${entry.type} ${entry.label}`);
}

function pickEntry(
  entries: FurnitureCatalogEntry[],
  predicate: (entry: FurnitureCatalogEntry) => boolean,
): FurnitureCatalogEntry | undefined {
  return entries.filter(predicate).sort((a, b) => a.type.localeCompare(b.type))[0];
}

function pickPreferredEntry(
  entries: FurnitureCatalogEntry[],
  predicate: (entry: FurnitureCatalogEntry) => boolean,
  score: (entry: FurnitureCatalogEntry) => number,
): FurnitureCatalogEntry | undefined {
  return entries.filter(predicate).sort((a, b) => {
    const scoreDelta = score(b) - score(a);
    return scoreDelta === 0 ? a.type.localeCompare(b.type) : scoreDelta;
  })[0];
}

function allocateRoomBounds(
  layout: OfficeLayout,
  lobbyCore: ProjectRoom['bounds'],
): { layout: OfficeLayout; bounds: ProjectRoom['bounds'] } | null {
  const width = PROJECT_ROOM_DEFAULT_WIDTH;
  const height = PROJECT_ROOM_DEFAULT_HEIGHT;
  const candidates = buildRoomAllocationCandidates(lobbyCore, width, height);
  for (const bounds of candidates) {
    if (!boundsFitMax(bounds)) continue;
    const expanded = ensureLayoutSize(
      layout,
      bounds.col + bounds.width,
      bounds.row + bounds.height,
    );
    if (!canPlaceRoomBounds(expanded, bounds)) continue;
    return { layout: expanded, bounds };
  }
  return null;
}

function buildRoomAllocationCandidates(
  core: ProjectRoom['bounds'],
  width: number,
  height: number,
): ProjectRoom['bounds'][] {
  const margin = PROJECT_ROOM_GENERATED_MARGIN;
  const candidates: ProjectRoom['bounds'][] = [];
  const seen = new Set<string>();
  const horizontalSlots = Math.max(1, Math.ceil(core.width / (width + margin)));
  const verticalSlots = Math.max(1, Math.ceil(core.height / (height + margin)));
  const maxRings = Math.ceil(Math.max(MAX_COLS, MAX_ROWS) / Math.min(width, height));
  const push = (col: number, row: number) => {
    const bounds = { col, row, width, height };
    if (col < 0 || row < 0) return;
    const key = `${col},${row},${width},${height}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(bounds);
  };

  for (let ring = 0; ring <= maxRings; ring++) {
    const belowRow = core.row + core.height + margin + ring * (height + margin);
    for (let slot = 0; slot < horizontalSlots; slot++) {
      push(core.col + slot * (width + margin), belowRow);
    }

    const rightCol = core.col + core.width + margin + ring * (width + margin);
    for (let slot = 0; slot < verticalSlots; slot++) {
      push(rightCol, core.row + slot * (height + margin));
    }

    const leftCol = core.col - width - margin - ring * (width + margin);
    for (let slot = 0; slot < verticalSlots; slot++) {
      push(leftCol, core.row + slot * (height + margin));
    }

    const aboveRow = core.row - height - margin - ring * (height + margin);
    for (let slot = 0; slot < horizontalSlots; slot++) {
      push(core.col + slot * (width + margin), aboveRow);
    }
  }

  return candidates;
}

function boundsFitMax(bounds: ProjectRoom['bounds']): boolean {
  return (
    bounds.col >= 0 &&
    bounds.row >= 0 &&
    bounds.col + bounds.width <= MAX_COLS &&
    bounds.row + bounds.height <= MAX_ROWS
  );
}

function canPlaceRoomBounds(layout: OfficeLayout, bounds: ProjectRoom['bounds']): boolean {
  if (!boundsFitMax(bounds)) return false;
  if (bounds.col + bounds.width > layout.cols || bounds.row + bounds.height > layout.rows) {
    return false;
  }
  for (const room of normalizeProjectRooms(layout)) {
    if (rectsOverlap(bounds, room.bounds)) return false;
  }
  for (const item of layout.furniture) {
    const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
    const footprint = {
      col: item.col,
      row: item.row,
      width: entry?.footprintW ?? 1,
      height: entry?.footprintH ?? 1,
    };
    if (rectsOverlap(bounds, footprint)) return false;
  }
  for (let row = bounds.row; row < bounds.row + bounds.height; row++) {
    for (let col = bounds.col; col < bounds.col + bounds.width; col++) {
      const tile = layout.tiles[row * layout.cols + col];
      if (tile !== TileType.VOID) return false;
    }
  }
  return true;
}

function rectsOverlap(a: ProjectRoom['bounds'], b: ProjectRoom['bounds']): boolean {
  return (
    a.col < b.col + b.width &&
    a.col + a.width > b.col &&
    a.row < b.row + b.height &&
    a.row + a.height > b.row
  );
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

function paintRoomFloor(
  layout: OfficeLayout,
  room: ProjectRoom,
  lobbyCore: ProjectRoom['bounds'],
): OfficeLayout {
  const tiles = [...layout.tiles];
  const tileColors = [...(layout.tileColors ?? new Array(layout.tiles.length).fill(null))];
  const zones = [...(layout.zones ?? new Array(layout.tiles.length).fill(null))];
  for (let row = room.bounds.row; row < room.bounds.row + room.bounds.height; row++) {
    for (let col = room.bounds.col; col < room.bounds.col + room.bounds.width; col++) {
      paintWalkableFloor(layout, tiles, tileColors, zones, col, row);
    }
  }
  paintCorridorToLobby(layout, tiles, tileColors, zones, lobbyCore, room.bounds);
  return { ...layout, tiles, tileColors, zones };
}

function paintCorridorToLobby(
  layout: OfficeLayout,
  tiles: TileTypeVal[],
  tileColors: Array<ColorValue | null>,
  zones: Array<ZoneType | null>,
  lobbyCore: ProjectRoom['bounds'],
  room: ProjectRoom['bounds'],
): void {
  const roomCenterCol = Math.floor(room.col + room.width / 2);
  const roomCenterRow = Math.floor(room.row + room.height / 2);
  const coreCenterCol = Math.floor(lobbyCore.col + lobbyCore.width / 2);

  if (room.row >= lobbyCore.row + lobbyCore.height) {
    const col = clampInt(roomCenterCol, lobbyCore.col, lobbyCore.col + lobbyCore.width - 1);
    paintVerticalFloor(
      layout,
      tiles,
      tileColors,
      zones,
      col,
      lobbyCore.row + lobbyCore.height - 1,
      room.row,
    );
    paintHorizontalFloor(layout, tiles, tileColors, zones, col, roomCenterCol, room.row);
    return;
  }
  if (room.col >= lobbyCore.col + lobbyCore.width) {
    const row = clampInt(roomCenterRow, lobbyCore.row, lobbyCore.row + lobbyCore.height - 1);
    paintHorizontalFloor(
      layout,
      tiles,
      tileColors,
      zones,
      lobbyCore.col + lobbyCore.width - 1,
      room.col,
      row,
    );
    return;
  }
  if (room.col + room.width <= lobbyCore.col) {
    const row = clampInt(roomCenterRow, lobbyCore.row, lobbyCore.row + lobbyCore.height - 1);
    paintHorizontalFloor(
      layout,
      tiles,
      tileColors,
      zones,
      room.col + room.width - 1,
      lobbyCore.col,
      row,
    );
    return;
  }
  if (room.row + room.height <= lobbyCore.row) {
    const col = clampInt(roomCenterCol, lobbyCore.col, lobbyCore.col + lobbyCore.width - 1);
    paintVerticalFloor(
      layout,
      tiles,
      tileColors,
      zones,
      col,
      room.row + room.height - 1,
      lobbyCore.row,
    );
    paintHorizontalFloor(layout, tiles, tileColors, zones, col, coreCenterCol, lobbyCore.row);
    return;
  }

  paintHorizontalFloor(
    layout,
    tiles,
    tileColors,
    zones,
    coreCenterCol,
    roomCenterCol,
    roomCenterRow,
  );
}

function paintHorizontalFloor(
  layout: OfficeLayout,
  tiles: TileTypeVal[],
  tileColors: Array<ColorValue | null>,
  zones: Array<ZoneType | null>,
  startCol: number,
  endCol: number,
  row: number,
): void {
  const min = Math.min(startCol, endCol);
  const max = Math.max(startCol, endCol);
  for (let col = min; col <= max; col++) {
    paintWalkableFloor(layout, tiles, tileColors, zones, col, row);
  }
}

function paintVerticalFloor(
  layout: OfficeLayout,
  tiles: TileTypeVal[],
  tileColors: Array<ColorValue | null>,
  zones: Array<ZoneType | null>,
  col: number,
  startRow: number,
  endRow: number,
): void {
  const min = Math.min(startRow, endRow);
  const max = Math.max(startRow, endRow);
  for (let row = min; row <= max; row++) {
    paintWalkableFloor(layout, tiles, tileColors, zones, col, row);
  }
}

function paintWalkableFloor(
  layout: OfficeLayout,
  tiles: TileTypeVal[],
  tileColors: Array<ColorValue | null>,
  zones: Array<ZoneType | null>,
  col: number,
  row: number,
): void {
  if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return;
  const idx = row * layout.cols + col;
  tiles[idx] = TileType.FLOOR_1;
  tileColors[idx] = { ...DEFAULT_FLOOR_COLOR };
  zones[idx] = null;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function buildRoomFurniture(room: ProjectRoom, template: RoomTemplateAssets): PlacedFurniture[] {
  if (
    template.collaboration &&
    room.bounds.width >= PROJECT_ROOM_COLLAB_TEMPLATE_MIN_WIDTH &&
    room.bounds.height >= PROJECT_ROOM_COLLAB_TEMPLATE_MIN_HEIGHT
  ) {
    return buildCollaborationRoomFurniture(room, template);
  }

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

function buildCollaborationRoomFurniture(
  room: ProjectRoom,
  template: RoomTemplateAssets,
): PlacedFurniture[] {
  const { col, row } = room.bounds;
  const collaboration = template.collaboration!;
  const furniture: PlacedFurniture[] = [
    {
      uid: `${room.id}-team-table`,
      type: collaboration.table.type,
      col: col + PROJECT_ROOM_COLLAB_TABLE_OFFSET_COL,
      row: row + PROJECT_ROOM_COLLAB_TABLE_OFFSET_ROW,
    },
  ];

  for (const rowOffset of [
    PROJECT_ROOM_COLLAB_TOP_ROW_OFFSET,
    PROJECT_ROOM_COLLAB_BOTTOM_ROW_OFFSET,
  ]) {
    furniture.push(
      {
        uid: `${room.id}-pc-right-${rowOffset}`,
        type: collaboration.rightElectronics.type,
        col: col + PROJECT_ROOM_COLLAB_LEFT_PC_OFFSET_COL,
        row: row + rowOffset,
      },
      {
        uid: `${room.id}-pc-left-${rowOffset}`,
        type: collaboration.leftElectronics.type,
        col: col + PROJECT_ROOM_COLLAB_RIGHT_PC_OFFSET_COL,
        row: row + rowOffset,
      },
      {
        uid: `${room.id}-chair-right-${rowOffset}`,
        type: collaboration.rightChair.type,
        col: col + PROJECT_ROOM_COLLAB_LEFT_CHAIR_OFFSET_COL,
        row: row + rowOffset,
      },
      {
        uid: `${room.id}-chair-left-${rowOffset}`,
        type: collaboration.leftChair.type,
        col: col + PROJECT_ROOM_COLLAB_RIGHT_CHAIR_OFFSET_COL,
        row: row + rowOffset,
      },
    );
  }

  if (template.restSeat) {
    furniture.push({
      uid: `${room.id}-rest-seat`,
      type: template.restSeat.type,
      col: col + PROJECT_ROOM_COLLAB_REST_SEAT_OFFSET_COL,
      row: row + PROJECT_ROOM_COLLAB_REST_SEAT_OFFSET_ROW,
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

function deriveLobbyCoreBounds(layout: OfficeLayout): ProjectRoom['bounds'] {
  const rooms = normalizeProjectRooms(layout);
  const publicRooms = rooms.filter((room) => room.kind === ProjectRoomKind.PUBLIC);
  if (publicRooms.length > 0) return unionBounds(publicRooms.map((room) => room.bounds));

  const projectRooms = rooms.filter((room) => room.kind === ProjectRoomKind.PROJECT);
  const points: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const tile = layout.tiles[row * layout.cols + col];
      if (tile === TileType.VOID) continue;
      if (projectRooms.some((room) => pointInBounds(col, row, room.bounds))) continue;
      points.push({ col, row });
    }
  }
  for (const item of layout.furniture) {
    const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
    const width = entry?.footprintW ?? 1;
    const height = entry?.footprintH ?? 1;
    if (
      projectRooms.some((room) =>
        rectsOverlap({ col: item.col, row: item.row, width, height }, room.bounds),
      )
    ) {
      continue;
    }
    points.push({ col: item.col, row: item.row });
    points.push({ col: item.col + width - 1, row: item.row + height - 1 });
  }

  if (points.length > 0) return boundsFromPoints(points);
  return {
    col: 0,
    row: 0,
    width: Math.max(1, layout.cols),
    height: Math.max(1, layout.rows),
  };
}

function pointInBounds(col: number, row: number, bounds: ProjectRoom['bounds']): boolean {
  return (
    col >= bounds.col &&
    col < bounds.col + bounds.width &&
    row >= bounds.row &&
    row < bounds.row + bounds.height
  );
}

function boundsFromPoints(points: Array<{ col: number; row: number }>): ProjectRoom['bounds'] {
  let minCol = Number.POSITIVE_INFINITY;
  let minRow = Number.POSITIVE_INFINITY;
  let maxCol = Number.NEGATIVE_INFINITY;
  let maxRow = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minCol = Math.min(minCol, point.col);
    minRow = Math.min(minRow, point.row);
    maxCol = Math.max(maxCol, point.col);
    maxRow = Math.max(maxRow, point.row);
  }
  return {
    col: minCol,
    row: minRow,
    width: maxCol - minCol + 1,
    height: maxRow - minRow + 1,
  };
}

function unionBounds(bounds: ProjectRoom['bounds'][]): ProjectRoom['bounds'] {
  const points = bounds.flatMap((bound) => [
    { col: bound.col, row: bound.row },
    { col: bound.col + bound.width - 1, row: bound.row + bound.height - 1 },
  ]);
  return boundsFromPoints(points);
}
