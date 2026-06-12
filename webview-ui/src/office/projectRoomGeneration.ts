import type { ColorValue } from '../components/ui/types.js';
import {
  PROJECT_ROOM_CAMPUS_MAX_HORIZONTAL_SLOTS,
  PROJECT_ROOM_CAMPUS_MAX_VERTICAL_SLOTS,
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
  PROJECT_ROOM_GENERATED_DOORWAY_WIDTH,
  PROJECT_ROOM_GENERATED_FLOOR_COLOR,
  PROJECT_ROOM_GENERATED_FLOOR_TILE,
  PROJECT_ROOM_GENERATED_MARGIN,
  PROJECT_ROOM_GENERATED_REST_MIN_WIDTH,
  PROJECT_ROOM_GENERATED_SHELL_THICKNESS,
  PROJECT_ROOM_GENERATED_WALL_COLOR,
  PROJECT_ROOM_LOBBY_ID,
  PROJECT_ROOM_LOBBY_LABEL,
  PROJECT_ROOM_LOBBY_LOUNGE_EDGE_PADDING_TILES,
  PROJECT_ROOM_LOBBY_LOUNGE_MAX_DECOR,
  PROJECT_ROOM_LOBBY_LOUNGE_MAX_PODS,
  PROJECT_ROOM_LOBBY_LOUNGE_MIN_DECOR,
  PROJECT_ROOM_LOBBY_LOUNGE_MIN_PODS,
  PROJECT_ROOM_LOBBY_LOUNGE_REV,
  PROJECT_ROOM_LOBBY_LOUNGE_TILES_PER_DECOR,
  PROJECT_ROOM_LOBBY_LOUNGE_TILES_PER_POD,
  PROJECT_ROOM_MIN_HEIGHT,
  PROJECT_ROOM_MIN_WIDTH,
  PROJECT_ROOM_STANDARD_DESK_OFFSET_COL,
  PROJECT_ROOM_STANDARD_DESK_OFFSET_ROW,
  PROJECT_ROOM_STANDARD_REST_SEAT_MIN_OFFSET_COL,
  PROJECT_ROOM_STANDARD_REST_SEAT_OFFSET_ROW,
  PROJECT_ROOM_STANDARD_REST_SEAT_RIGHT_MARGIN,
  PROJECT_ROOM_STANDARD_TECH_OFFSET_COL,
  PROJECT_ROOM_STANDARD_TECH_OFFSET_ROW,
  PROJECT_ROOM_STANDARD_WORK_CHAIR_OFFSET_COL,
  PROJECT_ROOM_STANDARD_WORK_CHAIR_OFFSET_ROW,
  PROJECT_ROOM_STUDIO_TEMPLATE_ACCENTS,
  PROJECT_ROOM_STUDIO_WALL_DECOR,
  PROJECT_ROOM_TEMPLATE,
  PROJECT_ROOM_WORK_CORRIDOR_HEIGHT,
  PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_LEFT_TABLE_COL_OFFSET,
  PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_RIGHT_TABLE_MARGIN,
  PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_TABLE_ROW_OFFSET,
  PROJECT_ROOM_WORK_CORRIDOR_MIN_WIDTH,
} from '../constants.js';
import {
  boundsEqual,
  boundsFromPoints,
  pointInBounds,
  rectInsideBounds,
  rectsOverlap,
  unionBounds,
} from './geometry.js';
import { getAllCatalogEntries } from './layout/furnitureCatalog.js';
import { layoutToSeats } from './layout/layoutSerializer.js';
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
  createdLobbyRoom: ProjectRoom | null;
  suiteFurnitureAddedCount: number;
  loungeFurnitureAddedCount: number;
  skippedUnknownCount: number;
  overflowCount: number;
}

interface RoomTemplateAssets {
  desk: FurnitureCatalogEntry;
  electronics: FurnitureCatalogEntry;
  workChair: FurnitureCatalogEntry;
  restSeat: FurnitureCatalogEntry;
  loungeTable?: FurnitureCatalogEntry;
  loungeDecor?: FurnitureCatalogEntry;
  /** Distinct floor greenery for the public lobby lounge, so it reads as a varied lounge rather
   *  than a row of identical plants. Index 0 stays the primary plant for placement stability. */
  lobbyDecorVariety?: FurnitureCatalogEntry[];
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

interface RoomDoorway {
  col: number;
  row: number;
  outsideCol: number;
  outsideRow: number;
  side: 'top' | 'right' | 'bottom' | 'left';
}

type SuiteFurnitureRole = 'work' | 'rest';

interface SuiteFurnitureCandidate {
  item: PlacedFurniture;
  role: SuiteFurnitureRole;
}

export function ensureProjectRoomsForAgents(
  layout: OfficeLayout,
  agents: ProjectRoomGenerationAgent[],
): ProjectRoomGenerationResult {
  const initialRooms = normalizeProjectRooms(layout);
  let current: OfficeLayout = { ...layout, projectRooms: initialRooms };
  const initialProjectRooms = initialRooms.filter((room) => room.kind === ProjectRoomKind.PROJECT);
  // Whether a public lobby already existed BEFORE this provision. Once it does, the campus is frozen
  // (additive only) — see ensureWorkCorridorCampusLayout. The reflow is reserved for the genuine
  // first-build / no-lobby recovery case, where the freshly created lobby must absorb orphaned rooms.
  const lobbyExistedBefore = initialRooms.some((room) => room.kind === ProjectRoomKind.PUBLIC);
  const existingKeys = new Set(
    initialProjectRooms
      .map((room) => normalizeProjectKey(room.project?.key))
      .filter((key): key is string => Boolean(key)),
  );
  const projectInputs = collectMissingProjects(agents, existingKeys);
  const template = pickRoomTemplateAssets();
  const createdRooms: ProjectRoom[] = [];
  let createdLobbyRoom: ProjectRoom | null = null;
  let suiteFurnitureAddedCount = 0;
  let loungeFurnitureAddedCount = 0;
  const skippedUnknownCount = agents.filter(
    (agent) => shouldGenerateForAgent(agent) && !deriveGenerationProject(agent),
  ).length;
  let overflowCount = 0;

  if (!template) {
    return {
      layout: current,
      createdRooms,
      createdLobbyRoom,
      suiteFurnitureAddedCount,
      loungeFurnitureAddedCount,
      skippedUnknownCount,
      overflowCount: projectInputs.length,
    };
  }

  const expectedProjectRoomCount = initialProjectRooms.length + projectInputs.length;
  let lobbyCore = deriveWorkCorridorBounds(current, expectedProjectRoomCount);
  if (projectInputs.length > 0 || initialProjectRooms.length > 0) {
    const lobbyResult = ensurePublicLobbyRoom(current, lobbyCore);
    current = lobbyResult.layout;
    createdLobbyRoom = lobbyResult.createdRoom;

    const corridorResult = ensureWorkCorridorCampusLayout(
      current,
      lobbyCore,
      template,
      expectedProjectRoomCount,
      lobbyExistedBefore,
    );
    current = corridorResult.layout;
    lobbyCore = corridorResult.lobbyCore;
    suiteFurnitureAddedCount += corridorResult.changedCount;
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
    };
    current = paintRoomFloor(current, room, lobbyCore);
    current = {
      ...current,
      furniture: [
        ...current.furniture,
        ...buildGeneratedProjectRoomFurniture(current, room, template, current.furniture),
      ],
    };
    createdRooms.push(room);
    existingKeys.add(project.key);
  }

  // Re-stamp any pre-existing project room that predates the template so the whole campus matches the
  // user-designed room. One-time per room: once stamped (-tpl- uids) it is recognised and left alone,
  // so later manual edits to a room survive.
  const templateMigration = migrateExistingRoomsToTemplate(current);
  current = templateMigration.layout;
  suiteFurnitureAddedCount += templateMigration.changedCount;

  const suiteResult = ensureProjectSuiteFurniture(current, template);
  current = suiteResult.layout;
  suiteFurnitureAddedCount += suiteResult.addedCount;

  const loungeResult = ensureLobbyLoungeFurniture(current, template);
  current = loungeResult.layout;
  loungeFurnitureAddedCount = loungeResult.addedCount;

  // Retrofit the studio interior (back-wall decor, focus desk set, desk plants) onto every project
  // room, including pre-existing rooms persisted by older code that never received these pieces.
  const decorResult = ensureProjectRoomStudioDecor(current);
  current = decorResult.layout;
  suiteFurnitureAddedCount += decorResult.addedCount;

  // Retrofit any pre-existing rooms that still have a front (south) wall so the whole campus
  // follows the open-front rule, not just freshly created rooms.
  const frontResult = openProjectRoomFronts(current);
  current = frontResult.layout;
  suiteFurnitureAddedCount += frontResult.changedCount;

  // Widen any room whose corridor-facing doorway is narrower than the current width.
  const doorwayResult = ensureRoomDoorwayWidth(current);
  current = doorwayResult.layout;
  suiteFurnitureAddedCount += doorwayResult.changedCount;

  return {
    layout: current,
    createdRooms,
    createdLobbyRoom,
    suiteFurnitureAddedCount,
    loungeFurnitureAddedCount,
    skippedUnknownCount,
    overflowCount,
  };
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
  const restSeat = pickRestSeat(entries, workChair) ?? workChair;
  const loungeTable = pickLoungeTable(entries);
  const loungeDecor = pickLoungeDecor(entries);
  const lobbyDecorVariety = pickLobbyDecorVariety(entries);
  return {
    desk,
    electronics,
    workChair,
    restSeat,
    ...(loungeTable ? { loungeTable } : {}),
    ...(loungeDecor ? { loungeDecor } : {}),
    ...(lobbyDecorVariety.length > 0 ? { lobbyDecorVariety } : {}),
    ...(pickCollaborationTemplateAssets(entries) ?? {}),
  };
}

/**
 * Curated palette of distinct floor greenery for the public lobby lounge. The primary plant (the
 * same one pickLoungeDecor would choose) stays first so existing placements/uids are stable; the
 * rest add variety (a second plant, a large plant, a cactus, a pot) for a lusher lounge.
 */
function pickLobbyDecorVariety(entries: FurnitureCatalogEntry[]): FurnitureCatalogEntry[] {
  const floorDecor = entries.filter(
    (entry) => entry.category === 'decor' && !entry.canPlaceOnWalls,
  );
  if (floorDecor.length === 0) return [];
  const ordered: FurnitureCatalogEntry[] = [];
  const seenTypes = new Set<string>();
  const push = (entry: FurnitureCatalogEntry | undefined): void => {
    if (!entry || seenTypes.has(entry.type)) return;
    seenTypes.add(entry.type);
    ordered.push(entry);
  };
  push(pickLoungeDecor(entries));
  const scored = floorDecor
    .map((entry) => ({ entry, score: lobbyDecorVarietyScore(entry) }))
    .sort((a, b) => b.score - a.score);
  for (const { entry } of scored) push(entry);
  return ordered;
}

function lobbyDecorVarietyScore(entry: FurnitureCatalogEntry): number {
  const text = `${entry.type} ${entry.label}`;
  if (/large\s*plant/i.test(text)) return 90;
  if (/plant/i.test(text)) return 80;
  if (/cactus/i.test(text)) return 60;
  if (/pot/i.test(text)) return 40;
  return 20;
}

function pickRestSeat(
  entries: FurnitureCatalogEntry[],
  workChair: FurnitureCatalogEntry,
): FurnitureCatalogEntry | undefined {
  return (
    pickPreferredEntry(
      entries,
      (entry) =>
        entry.category === 'chairs' &&
        (entry.footprintW >= 2 || /sofa|bench|couch|cushion/i.test(`${entry.type} ${entry.label}`)),
      (entry) => {
        const text = `${entry.type} ${entry.label}`;
        if (/sofa/i.test(text) && entry.orientation === 'front') return 120;
        if (/sofa/i.test(text)) return 110;
        if (/bench|couch|cushion/i.test(text) && entry.footprintW >= 2) return 90;
        if (entry.footprintW >= 2) return 70;
        if (/bench|couch|cushion/i.test(text)) return 60;
        return 0;
      },
    ) ??
    pickEntry(entries, (entry) => entry.category === 'chairs' && entry.type !== workChair.type) ??
    workChair
  );
}

function pickLoungeTable(entries: FurnitureCatalogEntry[]): FurnitureCatalogEntry | undefined {
  return pickPreferredEntry(
    entries,
    (entry) =>
      (entry.category === 'desks' || entry.category === 'misc') &&
      /coffee|small.*table|table/i.test(`${entry.type} ${entry.label}`) &&
      !entry.canPlaceOnSurfaces,
    (entry) => {
      if (/coffee/i.test(`${entry.type} ${entry.label}`)) return 100;
      if (/small.*table/i.test(`${entry.type} ${entry.label}`)) return 70;
      return 20;
    },
  );
}

function pickLoungeDecor(entries: FurnitureCatalogEntry[]): FurnitureCatalogEntry | undefined {
  return pickPreferredEntry(
    entries,
    (entry) =>
      entry.category === 'decor' &&
      /plant|cactus|pot/i.test(`${entry.type} ${entry.label}`) &&
      !entry.canPlaceOnWalls,
    (entry) => {
      if (/plant/i.test(`${entry.type} ${entry.label}`)) return 100;
      if (/cactus/i.test(`${entry.type} ${entry.label}`)) return 60;
      return 20;
    },
  );
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

function ensurePublicLobbyRoom(
  layout: OfficeLayout,
  bounds: ProjectRoom['bounds'],
): { layout: OfficeLayout; createdRoom: ProjectRoom | null } {
  const rooms = normalizeProjectRooms(layout);
  if (rooms.some((room) => room.kind === ProjectRoomKind.PUBLIC)) {
    return { layout, createdRoom: null };
  }
  if (
    bounds.width < PROJECT_ROOM_MIN_WIDTH ||
    bounds.height < PROJECT_ROOM_MIN_HEIGHT ||
    !boundsFitMax(bounds)
  ) {
    return { layout, createdRoom: null };
  }
  if (
    rooms.some((room) => room.kind === ProjectRoomKind.PROJECT && rectsOverlap(bounds, room.bounds))
  ) {
    return { layout, createdRoom: null };
  }

  const now = Date.now();
  const room: ProjectRoom = {
    id: stableUniqueRoomId(PROJECT_ROOM_LOBBY_ID, rooms),
    kind: ProjectRoomKind.PUBLIC,
    bounds,
    label: PROJECT_ROOM_LOBBY_LABEL,
    createdAtMs: now,
    updatedAtMs: now,
  };
  const expanded = ensureLayoutSize(
    {
      ...layout,
      projectRooms: [room, ...rooms],
    },
    bounds.col + bounds.width,
    bounds.row + bounds.height,
  );
  const shouldPrepareCornerSlots =
    layout.cols < bounds.col + bounds.width || layout.rows < bounds.row + bounds.height;
  const prepared = shouldPrepareCornerSlots
    ? clearCampusTiles(
        expanded,
        buildWorkCorridorRoomSlots(bounds, PROJECT_ROOM_DEFAULT_WIDTH, PROJECT_ROOM_DEFAULT_HEIGHT),
      )
    : expanded;
  const nextLayout = paintLobbyVoidFloor(prepared, room);
  return {
    layout: nextLayout,
    createdRoom: room,
  };
}

function ensureWorkCorridorCampusLayout(
  layout: OfficeLayout,
  lobbyCore: ProjectRoom['bounds'],
  template: RoomTemplateAssets,
  expectedProjectRoomCount: number,
  lobbyExisted: boolean,
): { layout: OfficeLayout; lobbyCore: ProjectRoom['bounds']; changedCount: number } {
  const rooms = normalizeProjectRooms(layout);
  const publicRoom = rooms.find((room) => room.kind === ProjectRoomKind.PUBLIC);
  const projectRooms = rooms.filter((room) => room.kind === ProjectRoomKind.PROJECT);
  if (!publicRoom || projectRooms.length === 0) return { layout, lobbyCore, changedCount: 0 };

  // FREEZE: once a real public lobby and project rooms already exist and the project rooms fit the
  // current grid, the campus is frozen — generation stays additive only (new rooms append via
  // allocateRoomBounds). Re-laying-out existing rooms on every provision reshuffled their bounds,
  // which teleported seated agents and orphaned hand-placed furniture, and the lobby row anchor
  // ratcheted the grid down to MAX_ROWS. Reuse the EXISTING lobby bounds so any new rooms append
  // relative to the real campus, not a recomputed (and possibly ratcheted) position. The reflow
  // below is kept only for the genuine first-build / no-lobby recovery case, where a freshly created
  // lobby must absorb project rooms left orphaned by older code.
  if (lobbyExisted && projectRooms.every((room) => roomBoundsFitGrid(layout, room.bounds))) {
    // The reflow used to also fire on `hasStaleLobbyPods` purely to refresh lounge furniture. That
    // coupling is gone: lounge furniture is owned by the downstream ensureLobbyLoungeFurniture pass,
    // which is idempotent (it skips lounge pods/seats that already exist), so freezing here neither
    // strands nor duplicates it — and stripping pods here would only flip-flop against that pass.
    return { layout, lobbyCore: publicRoom.bounds, changedCount: 0 };
  }

  const corridorBounds = deriveWorkCorridorBounds(layout, expectedProjectRoomCount);
  const roomSlots = buildWorkCorridorRoomSlots(
    corridorBounds,
    PROJECT_ROOM_DEFAULT_WIDTH,
    PROJECT_ROOM_DEFAULT_HEIGHT,
  );
  const sortedProjectRooms = [...projectRooms].sort(compareProjectRoomsForCampus);
  const nextProjectBounds = new Map<string, ProjectRoom['bounds']>();
  for (let index = 0; index < sortedProjectRooms.length; index++) {
    const slot = roomSlots[index];
    if (slot) nextProjectBounds.set(sortedProjectRooms[index]!.id, slot);
  }

  const hasBoundsChange =
    !boundsEqual(publicRoom.bounds, corridorBounds) ||
    sortedProjectRooms.some((room) => {
      const bounds = nextProjectBounds.get(room.id);
      return bounds !== undefined && !boundsEqual(room.bounds, bounds);
    });
  const hasStaleLobbyPods = layout.furniture.some((item) => item.uid.includes('-lounge-pod-'));
  if (!hasBoundsChange && !hasStaleLobbyPods) {
    return { layout, lobbyCore: corridorBounds, changedCount: 0 };
  }

  const oldCampusBounds = rooms
    .filter((room) => room.kind === ProjectRoomKind.PUBLIC || room.kind === ProjectRoomKind.PROJECT)
    .map((room) => room.bounds);
  const roomIds = new Set(rooms.map((room) => room.id));
  const nextRooms = rooms.map((room) => {
    if (room.id === publicRoom.id) {
      return { ...room, bounds: corridorBounds, label: room.label ?? PROJECT_ROOM_LOBBY_LABEL };
    }
    const nextBounds = nextProjectBounds.get(room.id);
    if (nextBounds) return { ...room, bounds: nextBounds };
    return room;
  });
  const movedProjectRooms = nextRooms.filter(
    (room) => room.kind === ProjectRoomKind.PROJECT,
  ) as ProjectRoom[];
  const maxCol = Math.max(
    corridorBounds.col + corridorBounds.width,
    ...movedProjectRooms.map((room) => room.bounds.col + room.bounds.width),
  );
  const maxRow = Math.max(
    corridorBounds.row + corridorBounds.height,
    ...movedProjectRooms.map((room) => room.bounds.row + room.bounds.height),
  );

  const removedFurniture = layout.furniture.filter((item) =>
    shouldRemoveGeneratedCampusFurniture(item, oldCampusBounds, roomIds),
  ).length;
  let current = ensureLayoutSize(
    {
      ...layout,
      projectRooms: nextRooms,
      furniture: layout.furniture.filter(
        (item) => !shouldRemoveGeneratedCampusFurniture(item, oldCampusBounds, roomIds),
      ),
    },
    maxCol,
    maxRow,
  );
  current = clearCampusTiles(current, oldCampusBounds);
  current = paintLobbyVoidFloor(current, { ...publicRoom, bounds: corridorBounds });

  const rebuiltFurniture: PlacedFurniture[] = [];
  for (const room of movedProjectRooms) {
    current = paintRoomFloor(current, room, corridorBounds);
    rebuiltFurniture.push(
      ...buildGeneratedProjectRoomFurniture(current, room, template, [
        ...current.furniture,
        ...rebuiltFurniture,
      ]),
    );
  }
  current = {
    ...current,
    furniture: [...current.furniture, ...rebuiltFurniture],
  };
  return {
    layout: current,
    lobbyCore: corridorBounds,
    changedCount: Math.max(1, removedFurniture + rebuiltFurniture.length),
  };
}

function compareProjectRoomsForCampus(a: ProjectRoom, b: ProjectRoom): number {
  const aLabel =
    normalizeProjectKey(a.project?.displayName ?? a.label ?? a.project?.key ?? a.id) ?? a.id;
  const bLabel =
    normalizeProjectKey(b.project?.displayName ?? b.label ?? b.project?.key ?? b.id) ?? b.id;
  return aLabel.localeCompare(bLabel);
}

/**
 * A furniture item is "generated" if the room generator created it — its uid is prefixed with a
 * room id, and every generated room id starts with `project-` (lobby = `project-room-lobby`,
 * projects = `project-<slug>`). Anything else is the user's own content (the editor places hand
 * furniture with `f-<timestamp>` uids) and must never be deleted or overlapped by generation.
 */
function isGeneratedFurnitureUid(uid: string): boolean {
  return uid.startsWith('project-');
}

function shouldRemoveGeneratedCampusFurniture(
  item: PlacedFurniture,
  oldCampusBounds: ProjectRoom['bounds'][],
  roomIds: Set<string>,
): boolean {
  // Never remove the user's hand-placed furniture, even when it overlaps an old campus rectangle —
  // the campus is anchored clear of the hand-design, and protected content is sacrosanct.
  if (!isGeneratedFurnitureUid(item.uid)) return false;
  if ([...roomIds].some((roomId) => item.uid.startsWith(`${roomId}-`))) return true;
  const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
  if (!entry) return false;
  return oldCampusBounds.some((bounds) => rectsOverlap(bounds, placedFurnitureBounds(item, entry)));
}

function clearCampusTiles(layout: OfficeLayout, boundsList: ProjectRoom['bounds'][]): OfficeLayout {
  if (boundsList.length === 0) return layout;
  // Tiles occupied by the user's hand-placed furniture are protected: clearing the floor under them
  // would strand the furniture on a non-walkable VOID tile. (The campus is anchored clear of the
  // hand-design, so this only ever matters as a safety net.)
  const protectedTiles = new Set<string>();
  for (const item of layout.furniture) {
    if (isGeneratedFurnitureUid(item.uid)) continue;
    const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
    const width = entry?.footprintW ?? 1;
    const height = entry?.footprintH ?? 1;
    for (let row = item.row; row < item.row + height; row++) {
      for (let col = item.col; col < item.col + width; col++) {
        protectedTiles.add(`${col},${row}`);
      }
    }
  }
  const tiles = [...layout.tiles];
  const tileColors = [...(layout.tileColors ?? new Array(layout.tiles.length).fill(null))];
  const zones = [...(layout.zones ?? new Array(layout.tiles.length).fill(null))];
  for (const bounds of boundsList) {
    for (let row = bounds.row; row < bounds.row + bounds.height; row++) {
      for (let col = bounds.col; col < bounds.col + bounds.width; col++) {
        if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) continue;
        if (protectedTiles.has(`${col},${row}`)) continue;
        const idx = row * layout.cols + col;
        tiles[idx] = TileType.VOID;
        tileColors[idx] = null;
        zones[idx] = null;
      }
    }
  }
  return { ...layout, tiles, tileColors, zones };
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
  const candidates: ProjectRoom['bounds'][] = [...buildWorkCorridorRoomSlots(core, width, height)];
  const seen = new Set<string>();
  const horizontalSlots = Math.max(
    1,
    Math.min(
      PROJECT_ROOM_CAMPUS_MAX_HORIZONTAL_SLOTS,
      Math.floor((MAX_COLS - core.col + margin) / (width + margin)),
    ),
  );
  const verticalSlots = Math.max(
    1,
    Math.min(
      PROJECT_ROOM_CAMPUS_MAX_VERTICAL_SLOTS,
      Math.floor((MAX_ROWS - core.row + margin) / (height + margin)),
    ),
  );
  const maxRings = Math.ceil(Math.max(MAX_COLS, MAX_ROWS) / Math.min(width, height));
  const push = (col: number, row: number) => {
    const bounds = { col, row, width, height };
    if (col < 0 || row < 0) return;
    const key = `${col},${row},${width},${height}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(bounds);
  };

  for (const bounds of candidates) {
    seen.add(`${bounds.col},${bounds.row},${bounds.width},${bounds.height}`);
  }

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

function buildWorkCorridorRoomSlots(
  core: ProjectRoom['bounds'],
  width: number,
  height: number,
): ProjectRoom['bounds'][] {
  const margin = PROJECT_ROOM_GENERATED_MARGIN;
  const bayCols = buildWorkCorridorBayCols(core, width);
  const firstBays = bayCols.slice(0, 2);
  const extraBays = bayCols.slice(2);
  const topRow = core.row - height - margin;
  const bottomRow = core.row + core.height + margin;
  return [
    ...firstBays.map((col) => ({ col, row: topRow, width, height })),
    ...firstBays.map((col) => ({ col, row: bottomRow, width, height })),
    ...extraBays.flatMap((col) => [
      { col, row: topRow, width, height },
      { col, row: bottomRow, width, height },
    ]),
  ].filter((bounds) => bounds.col >= 0 && bounds.row >= 0 && boundsFitMax(bounds));
}

function buildWorkCorridorBayCols(core: ProjectRoom['bounds'], roomWidth: number): number[] {
  const margin = PROJECT_ROOM_GENERATED_MARGIN;
  const step = roomWidth + margin;
  const cols: number[] = [];
  for (let col = core.col; col + roomWidth <= core.col + core.width; col += step) {
    cols.push(col);
  }
  const rightCol = core.col + core.width - roomWidth;
  if (rightCol >= core.col && !cols.includes(rightCol)) {
    cols.push(rightCol);
  }
  return cols.sort((a, b) => a - b);
}

function boundsFitMax(bounds: ProjectRoom['bounds']): boolean {
  return (
    bounds.col >= 0 &&
    bounds.row >= 0 &&
    bounds.col + bounds.width <= MAX_COLS &&
    bounds.row + bounds.height <= MAX_ROWS
  );
}

/** True when the bounds lie fully within the layout's current grid (not just the MAX_* ceiling). */
function roomBoundsFitGrid(layout: OfficeLayout, bounds: ProjectRoom['bounds']): boolean {
  return (
    bounds.col >= 0 &&
    bounds.row >= 0 &&
    bounds.col + bounds.width <= layout.cols &&
    bounds.row + bounds.height <= layout.rows
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
  const doorway = deriveRoomDoorway(room.bounds, lobbyCore);
  for (let row = room.bounds.row; row < room.bounds.row + room.bounds.height; row++) {
    for (let col = room.bounds.col; col < room.bounds.col + room.bounds.width; col++) {
      paintWalkableFloor(layout, tiles, tileColors, zones, col, row);
    }
  }
  paintRoomShell(layout, tiles, tileColors, zones, room.bounds, doorway);
  paintCorridorToLobby(layout, tiles, tileColors, zones, lobbyCore, doorway);
  return { ...layout, tiles, tileColors, zones };
}

/** True when every tile of the room's doorway opening is already walkable (current doorway width). */
function roomDoorwayMatchesWidth(
  layout: OfficeLayout,
  room: ProjectRoom,
  lobbyCore: ProjectRoom['bounds'],
): boolean {
  const doorway = deriveRoomDoorway(room.bounds, lobbyCore);
  const horizontal = doorway.side === 'top' || doorway.side === 'bottom';
  for (const d of doorwaySpanOffsets()) {
    const c = horizontal ? doorway.col + d : doorway.col;
    const r = horizontal ? doorway.row : doorway.row + d;
    const tile = layout.tiles[r * layout.cols + c];
    if (tile === TileType.WALL || tile === TileType.VOID || tile === undefined) return false;
  }
  return true;
}

/**
 * Retrofit existing project rooms to the current doorway width: a room whose corridor-facing wall
 * gap is narrower than PROJECT_ROOM_GENERATED_DOORWAY_WIDTH gets its shell + corridor repainted (the
 * stamped furniture is untouched). Guarded so a room already at the right width is skipped — no churn.
 */
function ensureRoomDoorwayWidth(layout: OfficeLayout): {
  layout: OfficeLayout;
  changedCount: number;
} {
  const rooms = normalizeProjectRooms(layout);
  const lobby = rooms.find((room) => room.kind === ProjectRoomKind.PUBLIC);
  if (!lobby) return { layout, changedCount: 0 };
  let current = layout;
  let changedCount = 0;
  for (const room of rooms.filter((room) => room.kind === ProjectRoomKind.PROJECT)) {
    if (roomDoorwayMatchesWidth(current, room, lobby.bounds)) continue;
    current = paintRoomFloor(current, room, lobby.bounds);
    changedCount++;
  }
  return { layout: current, changedCount };
}

function paintLobbyVoidFloor(layout: OfficeLayout, room: ProjectRoom): OfficeLayout {
  const tiles = [...layout.tiles];
  const tileColors = [...(layout.tileColors ?? new Array(layout.tiles.length).fill(null))];
  const zones = [...(layout.zones ?? new Array(layout.tiles.length).fill(null))];
  let changed = false;
  for (let row = room.bounds.row; row < room.bounds.row + room.bounds.height; row++) {
    for (let col = room.bounds.col; col < room.bounds.col + room.bounds.width; col++) {
      if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) continue;
      const idx = row * layout.cols + col;
      if (tiles[idx] !== TileType.VOID) continue;
      tiles[idx] = PROJECT_ROOM_GENERATED_FLOOR_TILE;
      tileColors[idx] = { ...PROJECT_ROOM_GENERATED_FLOOR_COLOR };
      zones[idx] = null;
      changed = true;
    }
  }
  return changed ? { ...layout, tiles, tileColors, zones } : layout;
}

function deriveRoomDoorway(
  room: ProjectRoom['bounds'],
  lobbyCore: ProjectRoom['bounds'],
): RoomDoorway {
  const centerCol = Math.floor(room.col + room.width / 2);
  const centerRow = Math.floor(room.row + room.height / 2);
  if (room.row >= lobbyCore.row + lobbyCore.height) {
    return {
      col: centerCol,
      row: room.row,
      outsideCol: centerCol,
      outsideRow: room.row - PROJECT_ROOM_GENERATED_SHELL_THICKNESS,
      side: 'top',
    };
  }
  if (room.col >= lobbyCore.col + lobbyCore.width) {
    return {
      col: room.col,
      row: centerRow,
      outsideCol: room.col - PROJECT_ROOM_GENERATED_SHELL_THICKNESS,
      outsideRow: centerRow,
      side: 'left',
    };
  }
  if (room.col + room.width <= lobbyCore.col) {
    return {
      col: room.col + room.width - 1,
      row: centerRow,
      outsideCol: room.col + room.width,
      outsideRow: centerRow,
      side: 'right',
    };
  }
  if (room.row + room.height <= lobbyCore.row) {
    return {
      col: centerCol,
      row: room.row + room.height - 1,
      outsideCol: centerCol,
      outsideRow: room.row + room.height,
      side: 'bottom',
    };
  }
  return {
    col: centerCol,
    row: room.row,
    outsideCol: centerCol,
    outsideRow: room.row - PROJECT_ROOM_GENERATED_SHELL_THICKNESS,
    side: 'top',
  };
}

function paintRoomShell(
  layout: OfficeLayout,
  tiles: TileTypeVal[],
  tileColors: Array<ColorValue | null>,
  zones: Array<ZoneType | null>,
  room: ProjectRoom['bounds'],
  doorway: RoomDoorway,
): void {
  // The front (south) wall is intentionally never painted, so the camera can always see into the
  // studio — matching the hand-designed default office. This holds regardless of the room's row:
  // a top-row room's open front doubles as its corridor-facing entrance, and a bottom-row room
  // keeps its furniture fixed with the entrance as a doorway in its (north) corridor-facing wall
  // while its front still stays open.
  const southWallRow = room.row + room.height - PROJECT_ROOM_GENERATED_SHELL_THICKNESS;
  for (let row = room.row; row < room.row + room.height; row++) {
    for (let col = room.col; col < room.col + room.width; col++) {
      const onPerimeter =
        row === room.row ||
        row === southWallRow ||
        col === room.col ||
        col === room.col + room.width - PROJECT_ROOM_GENERATED_SHELL_THICKNESS;
      if (!onPerimeter) continue;
      if (row >= southWallRow) continue; // front wall always open
      if (isDoorwayTile(col, row, doorway)) continue;
      paintWallTile(layout, tiles, tileColors, zones, col, row);
    }
  }
}

/**
 * Offsets that the doorway opening spans, biased center-left for even widths (e.g. width 2 → {-1, 0})
 * so a 2-tile doorway lands on the room's center-left columns and clears the back-wall decor.
 */
function doorwaySpanOffsets(): number[] {
  const width = Math.max(1, PROJECT_ROOM_GENERATED_DOORWAY_WIDTH);
  const lo = Math.floor(width / 2);
  const offsets: number[] = [];
  for (let d = -lo; d <= width - 1 - lo; d++) offsets.push(d);
  return offsets;
}

function isDoorwayTile(col: number, row: number, doorway: RoomDoorway): boolean {
  const offsets = doorwaySpanOffsets();
  if (doorway.side === 'top' || doorway.side === 'bottom') {
    return row === doorway.row && offsets.includes(col - doorway.col);
  }
  return col === doorway.col && offsets.includes(row - doorway.row);
}

/** Paint the corridor as wide as the doorway by laying one segment per doorway-span offset. */
function paintCorridorToLobby(
  layout: OfficeLayout,
  tiles: TileTypeVal[],
  tileColors: Array<ColorValue | null>,
  zones: Array<ZoneType | null>,
  lobbyCore: ProjectRoom['bounds'],
  doorway: RoomDoorway,
): void {
  const horizontalOpening = doorway.side === 'top' || doorway.side === 'bottom';
  for (const d of doorwaySpanOffsets()) {
    const shifted: RoomDoorway = horizontalOpening
      ? { ...doorway, col: doorway.col + d, outsideCol: doorway.outsideCol + d }
      : { ...doorway, row: doorway.row + d, outsideRow: doorway.outsideRow + d };
    paintCorridorSegment(layout, tiles, tileColors, zones, lobbyCore, shifted);
  }
}

function paintCorridorSegment(
  layout: OfficeLayout,
  tiles: TileTypeVal[],
  tileColors: Array<ColorValue | null>,
  zones: Array<ZoneType | null>,
  lobbyCore: ProjectRoom['bounds'],
  doorway: RoomDoorway,
): void {
  const coreCenterCol = Math.floor(lobbyCore.col + lobbyCore.width / 2);

  if (doorway.side === 'top') {
    const col = clampInt(doorway.col, lobbyCore.col, lobbyCore.col + lobbyCore.width - 1);
    paintVerticalFloor(
      layout,
      tiles,
      tileColors,
      zones,
      col,
      lobbyCore.row + lobbyCore.height - 1,
      doorway.outsideRow,
    );
    paintHorizontalFloor(
      layout,
      tiles,
      tileColors,
      zones,
      col,
      doorway.outsideCol,
      doorway.outsideRow,
    );
    paintWalkableFloor(layout, tiles, tileColors, zones, doorway.col, doorway.row);
    return;
  }
  if (doorway.side === 'left') {
    const row = clampInt(doorway.row, lobbyCore.row, lobbyCore.row + lobbyCore.height - 1);
    paintHorizontalFloor(
      layout,
      tiles,
      tileColors,
      zones,
      lobbyCore.col + lobbyCore.width - 1,
      doorway.outsideCol,
      row,
    );
    paintVerticalFloor(
      layout,
      tiles,
      tileColors,
      zones,
      doorway.outsideCol,
      row,
      doorway.outsideRow,
    );
    paintWalkableFloor(layout, tiles, tileColors, zones, doorway.col, doorway.row);
    return;
  }
  if (doorway.side === 'right') {
    const row = clampInt(doorway.row, lobbyCore.row, lobbyCore.row + lobbyCore.height - 1);
    paintHorizontalFloor(layout, tiles, tileColors, zones, doorway.outsideCol, lobbyCore.col, row);
    paintVerticalFloor(
      layout,
      tiles,
      tileColors,
      zones,
      doorway.outsideCol,
      row,
      doorway.outsideRow,
    );
    paintWalkableFloor(layout, tiles, tileColors, zones, doorway.col, doorway.row);
    return;
  }
  if (doorway.side === 'bottom') {
    const col = clampInt(doorway.col, lobbyCore.col, lobbyCore.col + lobbyCore.width - 1);
    paintVerticalFloor(layout, tiles, tileColors, zones, col, doorway.outsideRow, lobbyCore.row);
    paintHorizontalFloor(
      layout,
      tiles,
      tileColors,
      zones,
      col,
      doorway.outsideCol,
      doorway.outsideRow,
    );
    paintWalkableFloor(layout, tiles, tileColors, zones, doorway.col, doorway.row);
    return;
  }

  paintHorizontalFloor(layout, tiles, tileColors, zones, coreCenterCol, doorway.col, doorway.row);
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
  tiles[idx] = PROJECT_ROOM_GENERATED_FLOOR_TILE;
  tileColors[idx] = { ...PROJECT_ROOM_GENERATED_FLOOR_COLOR };
  zones[idx] = null;
}

function paintWallTile(
  layout: OfficeLayout,
  tiles: TileTypeVal[],
  tileColors: Array<ColorValue | null>,
  zones: Array<ZoneType | null>,
  col: number,
  row: number,
): void {
  if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return;
  const idx = row * layout.cols + col;
  tiles[idx] = TileType.WALL;
  tileColors[idx] = { ...PROJECT_ROOM_GENERATED_WALL_COLOR };
  zones[idx] = null;
}

/**
 * Retrofit existing generated project rooms to the open-front rule: convert any remaining south
 * (front) perimeter wall back to floor. New rooms are already created without a south wall, so this
 * is a no-op for them; it only migrates rooms created before the open-front change so the whole
 * campus stays consistent without needing a full layout reset.
 */
export function openProjectRoomFronts(layout: OfficeLayout): {
  layout: OfficeLayout;
  changedCount: number;
} {
  const rooms = normalizeProjectRooms(layout).filter(
    (room) => room.kind === ProjectRoomKind.PROJECT,
  );
  if (rooms.length === 0) return { layout, changedCount: 0 };
  const tiles = [...layout.tiles];
  const tileColors = [...(layout.tileColors ?? new Array(layout.tiles.length).fill(null))];
  const zones = [...(layout.zones ?? new Array(layout.tiles.length).fill(null))];
  let changedCount = 0;
  for (const room of rooms) {
    const southRow = room.bounds.row + room.bounds.height - PROJECT_ROOM_GENERATED_SHELL_THICKNESS;
    if (southRow < 0 || southRow >= layout.rows) continue;
    for (let col = room.bounds.col; col < room.bounds.col + room.bounds.width; col++) {
      if (col < 0 || col >= layout.cols) continue;
      const idx = southRow * layout.cols + col;
      if (tiles[idx] !== TileType.WALL) continue;
      tiles[idx] = PROJECT_ROOM_GENERATED_FLOOR_TILE;
      tileColors[idx] = { ...PROJECT_ROOM_GENERATED_FLOOR_COLOR };
      zones[idx] = null;
      changedCount++;
    }
  }
  return changedCount > 0
    ? { layout: { ...layout, tiles, tileColors, zones }, changedCount }
    : { layout, changedCount: 0 };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function buildRoomFurnitureCandidates(
  room: ProjectRoom,
  template: RoomTemplateAssets,
): SuiteFurnitureCandidate[] {
  if (
    template.collaboration &&
    room.bounds.width >= PROJECT_ROOM_COLLAB_TEMPLATE_MIN_WIDTH &&
    room.bounds.height >= PROJECT_ROOM_COLLAB_TEMPLATE_MIN_HEIGHT
  ) {
    return buildCollaborationRoomFurnitureCandidates(room, template);
  }

  const { col, row, width } = room.bounds;
  const furniture: SuiteFurnitureCandidate[] = [
    {
      role: 'work',
      item: {
        uid: `${room.id}-desk`,
        type: template.desk.type,
        col: col + PROJECT_ROOM_STANDARD_DESK_OFFSET_COL,
        row: row + PROJECT_ROOM_STANDARD_DESK_OFFSET_ROW,
      },
    },
    {
      role: 'work',
      item: {
        uid: `${room.id}-tech`,
        type: template.electronics.type,
        col: col + PROJECT_ROOM_STANDARD_TECH_OFFSET_COL,
        row: row + PROJECT_ROOM_STANDARD_TECH_OFFSET_ROW,
      },
    },
    {
      role: 'work',
      item: {
        uid: `${room.id}-work-chair`,
        type: template.workChair.type,
        col: col + PROJECT_ROOM_STANDARD_WORK_CHAIR_OFFSET_COL,
        row: row + PROJECT_ROOM_STANDARD_WORK_CHAIR_OFFSET_ROW,
      },
    },
  ];
  if (width >= PROJECT_ROOM_GENERATED_REST_MIN_WIDTH) {
    furniture.push({
      role: 'rest',
      item: {
        uid: `${room.id}-rest-seat`,
        type: template.restSeat.type,
        col:
          col +
          Math.max(
            PROJECT_ROOM_STANDARD_REST_SEAT_MIN_OFFSET_COL,
            width - template.restSeat.footprintW - PROJECT_ROOM_STANDARD_REST_SEAT_RIGHT_MARGIN,
          ),
        row: row + PROJECT_ROOM_STANDARD_REST_SEAT_OFFSET_ROW,
      },
    });
  }
  return furniture;
}

function buildCollaborationRoomFurnitureCandidates(
  room: ProjectRoom,
  template: RoomTemplateAssets,
): SuiteFurnitureCandidate[] {
  const { col, row } = room.bounds;
  const collaboration = template.collaboration!;
  const furniture: SuiteFurnitureCandidate[] = [
    {
      role: 'work',
      item: {
        uid: `${room.id}-team-table`,
        type: collaboration.table.type,
        col: col + PROJECT_ROOM_COLLAB_TABLE_OFFSET_COL,
        row: row + PROJECT_ROOM_COLLAB_TABLE_OFFSET_ROW,
      },
    },
  ];

  for (const rowOffset of [
    PROJECT_ROOM_COLLAB_TOP_ROW_OFFSET,
    PROJECT_ROOM_COLLAB_BOTTOM_ROW_OFFSET,
  ]) {
    furniture.push(
      {
        role: 'work',
        item: {
          uid: `${room.id}-pc-right-${rowOffset}`,
          type: collaboration.rightElectronics.type,
          col: col + PROJECT_ROOM_COLLAB_LEFT_PC_OFFSET_COL,
          row: row + rowOffset,
        },
      },
      {
        role: 'work',
        item: {
          uid: `${room.id}-pc-left-${rowOffset}`,
          type: collaboration.leftElectronics.type,
          col: col + PROJECT_ROOM_COLLAB_RIGHT_PC_OFFSET_COL,
          row: row + rowOffset,
        },
      },
      {
        role: 'work',
        item: {
          uid: `${room.id}-chair-right-${rowOffset}`,
          type: collaboration.rightChair.type,
          col: col + PROJECT_ROOM_COLLAB_LEFT_CHAIR_OFFSET_COL,
          row: row + rowOffset,
        },
      },
      {
        role: 'work',
        item: {
          uid: `${room.id}-chair-left-${rowOffset}`,
          type: collaboration.leftChair.type,
          col: col + PROJECT_ROOM_COLLAB_RIGHT_CHAIR_OFFSET_COL,
          row: row + rowOffset,
        },
      },
    );
  }

  furniture.push({
    role: 'rest',
    item: {
      uid: `${room.id}-rest-seat`,
      type: template.restSeat.type,
      col: col + PROJECT_ROOM_COLLAB_REST_SEAT_OFFSET_COL,
      row: row + PROJECT_ROOM_COLLAB_REST_SEAT_OFFSET_ROW,
    },
  });

  return furniture;
}

function ensureLobbyLoungeFurniture(
  layout: OfficeLayout,
  template: RoomTemplateAssets,
): { layout: OfficeLayout; addedCount: number } {
  let furniture = layout.furniture;
  let addedCount = 0;
  const stampedRoomIds = new Set<string>();
  for (const room of normalizeProjectRooms(layout).filter(
    (candidate) => candidate.kind === ProjectRoomKind.PUBLIC,
  )) {
    // One-time lounge: a stamped lobby is owned by the user — generation never reasserts its lounge
    // furniture, so manual edits (move/delete/add) survive every reload. Without this, the corridor
    // ensure recomputed the canonical lounge set each provision and snapped any deviation back.
    if (room.loungeRev === PROJECT_ROOM_LOBBY_LOUNGE_REV) continue;
    // Migration for lobbies provisioned before the stamp existed: lounge furniture already present →
    // stamp as-is WITHOUT reasserting, so any user edits made since are respected from now on.
    if (furniture.some((item) => isGeneratedLobbyLoungeFurniture(room, item))) {
      stampedRoomIds.add(room.id);
      continue;
    }
    stampedRoomIds.add(room.id);
    let roomAdded = 0;
    const cleanedFurniture = furniture.filter((item) => {
      if (!isGeneratedFurnitureUid(item.uid)) return true; // never remove hand-placed furniture
      const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
      if (!entry || !rectsOverlap(room.bounds, placedFurnitureBounds(item, entry))) return true;
      if (!isLobbyWorkFurniture(entry)) return true;
      roomAdded++;
      return false;
    });
    const layoutAfterCleanup = { ...layout, furniture: cleanedFurniture };
    const seats = roomSeats(layoutAfterCleanup, room);
    const hasRestSeat = seats.some((seat) => seat.seatKind === 'rest');
    const hasLoungeTable = roomHasFurniture(layoutAfterCleanup, room, isLoungeTableFurniture);
    const hasDecor = roomHasFurniture(layoutAfterCleanup, room, isLoungeDecorFurniture);
    const nextFurniture = [...cleanedFurniture];
    const isCorridorLobby = isWorkCorridorLobby(room);

    if (isCorridorLobby) {
      const corridorResult = ensureWorkCorridorLobbyLoungeFurniture(
        layout,
        room,
        nextFurniture,
        template,
      );
      const changedCount = roomAdded + corridorResult.changedCount;
      if (changedCount > 0) {
        furniture = corridorResult.furniture;
        addedCount += changedCount;
      }
      continue;
    }

    if (!hasRestSeat) {
      for (const item of findLobbyRestSeatPlacements(
        layout,
        room,
        template.restSeat,
        nextFurniture,
      )) {
        nextFurniture.push(item);
        roomAdded++;
      }
    }

    if (!hasLoungeTable && template.loungeTable) {
      const table = findLobbyFurniturePlacement(
        layout,
        room,
        template.loungeTable,
        `${room.id}-lounge-table`,
        nextFurniture,
        [
          {
            col:
              room.bounds.col +
              Math.max(1, Math.floor((room.bounds.width - template.loungeTable.footprintW) / 2)),
            row:
              room.bounds.row +
              Math.max(2, Math.floor((room.bounds.height - template.loungeTable.footprintH) / 2)),
          },
        ],
      );
      if (table) {
        nextFurniture.push(table);
        roomAdded++;
      }
    }

    if (!hasDecor && template.loungeDecor) {
      const decor = findLobbyFurniturePlacement(
        layout,
        room,
        template.loungeDecor,
        `${room.id}-lounge-decor`,
        nextFurniture,
        [
          {
            col: room.bounds.col + 1,
            row: room.bounds.row + room.bounds.height - template.loungeDecor.footprintH - 1,
          },
          {
            col: room.bounds.col + room.bounds.width - template.loungeDecor.footprintW - 1,
            row: room.bounds.row + 1,
          },
        ],
      );
      if (decor) {
        nextFurniture.push(decor);
        roomAdded++;
      }
    }

    roomAdded += appendLobbyLoungePods(layout, room, template, nextFurniture);
    if (template.loungeDecor) {
      roomAdded += appendLobbyLoungeDecor(layout, room, template.loungeDecor, nextFurniture);
    }

    if (roomAdded > 0) {
      furniture = nextFurniture;
      addedCount += roomAdded;
    }
  }
  if (stampedRoomIds.size > 0) {
    const projectRooms = normalizeProjectRooms(layout).map((room) =>
      stampedRoomIds.has(room.id) ? { ...room, loungeRev: PROJECT_ROOM_LOBBY_LOUNGE_REV } : room,
    );
    // Stamping must persist (count as a change) so an already-provisioned lobby is marked exactly
    // once and never touched again.
    return {
      layout: { ...layout, furniture, projectRooms },
      addedCount: addedCount + stampedRoomIds.size,
    };
  }
  return addedCount > 0 ? { layout: { ...layout, furniture }, addedCount } : { layout, addedCount };
}

function isWorkCorridorLobby(room: ProjectRoom): boolean {
  return (
    room.kind === ProjectRoomKind.PUBLIC &&
    room.bounds.height >= PROJECT_ROOM_WORK_CORRIDOR_HEIGHT &&
    room.bounds.width >= PROJECT_ROOM_WORK_CORRIDOR_MIN_WIDTH
  );
}

function findLobbyRestSeatPlacements(
  layout: OfficeLayout,
  room: ProjectRoom,
  restSeat: FurnitureCatalogEntry,
  furniture: PlacedFurniture[],
): PlacedFurniture[] {
  const placements: PlacedFurniture[] = [];
  const preferred = [
    {
      uid: `${room.id}-lounge-seat-a`,
      col: room.bounds.col + 2,
      row: room.bounds.row + 2,
    },
    {
      uid: `${room.id}-lounge-seat-b`,
      col: room.bounds.col + room.bounds.width - restSeat.footprintW - 3,
      row: room.bounds.row + 2,
    },
  ];
  for (const candidate of preferred) {
    const placement = findLobbyFurniturePlacement(
      layout,
      room,
      restSeat,
      candidate.uid,
      [...furniture, ...placements],
      [{ col: candidate.col, row: candidate.row }],
    );
    if (placement) placements.push(placement);
  }
  return placements;
}

function ensureWorkCorridorLobbyLoungeFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  furniture: PlacedFurniture[],
  template: RoomTemplateAssets,
): { furniture: PlacedFurniture[]; changedCount: number } {
  const baseFurniture = furniture.filter((item) => !isGeneratedLobbyLoungeFurniture(room, item));
  const generatedFurniture = furniture.filter((item) =>
    isGeneratedLobbyLoungeFurniture(room, item),
  );
  const plannedFurniture = buildWorkCorridorLobbyLoungeFurniture(
    layout,
    room,
    template,
    baseFurniture,
  );
  if (sameFurnitureSet(generatedFurniture, plannedFurniture)) {
    return { furniture, changedCount: 0 };
  }
  return {
    furniture: [...baseFurniture, ...plannedFurniture],
    changedCount: generatedFurniture.length + plannedFurniture.length,
  };
}

function buildWorkCorridorLobbyLoungeFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  template: RoomTemplateAssets,
  baseFurniture: PlacedFurniture[],
): PlacedFurniture[] {
  const planned: PlacedFurniture[] = [];
  if (!template.loungeTable) return planned;

  const entries = getAllCatalogEntries();
  const frontSeat = pickDirectionalRestSeat(entries, template.restSeat, 'front');
  const backSeat = pickDirectionalRestSeat(entries, template.restSeat, 'back');
  const rightFacingSeat = pickDirectionalRestSeat(entries, template.restSeat, 'right');
  const leftFacingSeat = pickDirectionalRestSeat(entries, template.restSeat, 'left');
  const tableRow = clampInt(
    room.bounds.row + PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_TABLE_ROW_OFFSET,
    room.bounds.row + 1,
    room.bounds.row + room.bounds.height - template.loungeTable.footprintH - 1,
  );
  const tableCols = [
    room.bounds.col + PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_LEFT_TABLE_COL_OFFSET,
    room.bounds.col +
      room.bounds.width -
      template.loungeTable.footprintW -
      PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_RIGHT_TABLE_MARGIN,
  ];

  for (const [index, preferredCol] of tableCols.entries()) {
    const suffix = index === 0 ? 'a' : 'b';
    const table = tryPlanLobbyFurniture(
      layout,
      room,
      template.loungeTable,
      `${room.id}-lounge-table-${suffix}`,
      baseFurniture,
      planned,
      [{ col: preferredCol, row: tableRow }],
    );
    if (!table) continue;
    planned.push(table);
    for (const seat of buildCorridorSofaClusterSeats(
      room,
      table,
      template.loungeTable,
      frontSeat,
      backSeat,
      rightFacingSeat,
      leftFacingSeat,
      `${room.id}-lounge-seat-${suffix}`,
    )) {
      const placement = tryPlanLobbyFurniture(
        layout,
        room,
        seat.entry,
        seat.uid,
        baseFurniture,
        planned,
        [{ col: seat.col, row: seat.row }],
      );
      if (placement) planned.push(placement);
    }
  }

  const decorPalette =
    template.lobbyDecorVariety && template.lobbyDecorVariety.length > 0
      ? template.lobbyDecorVariety
      : template.loungeDecor
        ? [template.loungeDecor]
        : [];
  if (decorPalette.length > 0) {
    const targetDecor = targetLobbyLoungeDecorCount(room);
    for (let decorIndex = 0; decorIndex < targetDecor; decorIndex++) {
      const decorEntry = decorPalette[decorIndex % decorPalette.length]!;
      const uid =
        decorIndex === 0 ? `${room.id}-lounge-decor` : `${room.id}-lounge-decor-${decorIndex + 1}`;
      const decor = tryPlanLobbyFurniture(
        layout,
        room,
        decorEntry,
        uid,
        baseFurniture,
        planned,
        buildCorridorLobbyDecorPreferredPositions(room, decorEntry, decorIndex),
      );
      if (decor) planned.push(decor);
    }
  }

  return planned;
}

function pickDirectionalRestSeat(
  entries: FurnitureCatalogEntry[],
  fallback: FurnitureCatalogEntry,
  direction: 'front' | 'back' | 'left' | 'right',
): FurnitureCatalogEntry {
  return (
    pickPreferredEntry(
      entries,
      (entry) =>
        entry.category === 'chairs' &&
        isRestSeatFurniture(entry) &&
        directionalRestSeatMatches(entry, direction),
      (entry) => {
        const text = `${entry.type} ${entry.label}`;
        if (/sofa/i.test(text)) return 100;
        if (/couch/i.test(text)) return 90;
        if (/bench|cushion/i.test(text)) return 60;
        return 10;
      },
    ) ?? fallback
  );
}

function directionalRestSeatMatches(
  entry: FurnitureCatalogEntry,
  direction: 'front' | 'back' | 'left' | 'right',
): boolean {
  if (direction === 'front' || direction === 'back') return entry.orientation === direction;
  return isSideOrientation(entry.orientation, direction);
}

function buildCorridorSofaClusterSeats(
  room: ProjectRoom,
  table: PlacedFurniture,
  tableEntry: FurnitureCatalogEntry,
  frontSeat: FurnitureCatalogEntry,
  backSeat: FurnitureCatalogEntry,
  rightFacingSeat: FurnitureCatalogEntry,
  leftFacingSeat: FurnitureCatalogEntry,
  uidPrefix: string,
): Array<{ uid: string; entry: FurnitureCatalogEntry; col: number; row: number }> {
  const centerCol = table.col + Math.floor((tableEntry.footprintW - frontSeat.footprintW) / 2);
  const backCol = table.col + Math.floor((tableEntry.footprintW - backSeat.footprintW) / 2);
  return [
    {
      uid: uidPrefix,
      entry: frontSeat,
      col: clampInt(
        centerCol,
        room.bounds.col + 1,
        room.bounds.col + room.bounds.width - frontSeat.footprintW - 1,
      ),
      row: table.row - frontSeat.footprintH,
    },
    {
      uid: `${uidPrefix}-back`,
      entry: backSeat,
      col: clampInt(
        backCol,
        room.bounds.col + 1,
        room.bounds.col + room.bounds.width - backSeat.footprintW - 1,
      ),
      row: table.row + tableEntry.footprintH,
    },
    {
      uid: `${uidPrefix}-left`,
      entry: rightFacingSeat,
      col: table.col - rightFacingSeat.footprintW,
      row: table.row,
    },
    {
      uid: `${uidPrefix}-right`,
      entry: leftFacingSeat,
      col: table.col + tableEntry.footprintW,
      row: table.row,
    },
  ];
}

function tryPlanLobbyFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  entry: FurnitureCatalogEntry,
  uid: string,
  baseFurniture: PlacedFurniture[],
  plannedFurniture: PlacedFurniture[],
  preferred: Array<{ col: number; row: number }>,
): PlacedFurniture | null {
  return findLobbyFurniturePlacement(
    layout,
    room,
    entry,
    uid,
    [...baseFurniture, ...plannedFurniture],
    preferred,
  );
}

function isGeneratedLobbyLoungeFurniture(room: ProjectRoom, item: PlacedFurniture): boolean {
  return item.uid.startsWith(`${room.id}-lounge-`);
}

function buildCorridorLobbyDecorPreferredPositions(
  room: ProjectRoom,
  decor: FurnitureCatalogEntry,
  decorIndex: number,
): Array<{ col: number; row: number }> {
  const topRow = room.bounds.row + 1;
  const centerCol = room.bounds.col + Math.floor((room.bounds.width - decor.footprintW) / 2);
  const rightCol = room.bounds.col + room.bounds.width - decor.footprintW - 1;
  const leftAccentCol =
    room.bounds.col +
    PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_LEFT_TABLE_COL_OFFSET +
    decor.footprintW +
    1;
  const positions = [
    { col: centerCol, row: topRow },
    { col: rightCol, row: topRow },
    { col: leftAccentCol, row: topRow },
    ...buildLobbyDecorPreferredPositions(room, decor, decorIndex),
  ];
  return [positions[decorIndex % positions.length]!, ...positions];
}

function sameFurnitureSet(actual: PlacedFurniture[], expected: PlacedFurniture[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualByUid = new Map(actual.map((item) => [item.uid, item]));
  return expected.every((item) => {
    const actualItem = actualByUid.get(item.uid);
    return (
      actualItem?.type === item.type && actualItem.col === item.col && actualItem.row === item.row
    );
  });
}

function appendLobbyLoungePods(
  layout: OfficeLayout,
  room: ProjectRoom,
  template: RoomTemplateAssets,
  furniture: PlacedFurniture[],
): number {
  const target = targetLobbyLoungePodCount(room);
  const generatedLegacySeats = furniture.filter(
    (item) => item.uid === `${room.id}-lounge-seat-a` || item.uid === `${room.id}-lounge-seat-b`,
  ).length;
  let added = 0;
  for (let podIndex = generatedLegacySeats; podIndex < target; podIndex++) {
    const podNumber = podIndex + 1;
    const seatUid = `${room.id}-lounge-pod-${podNumber}-seat`;
    const tableUid = `${room.id}-lounge-pod-${podNumber}-table`;
    const seatExists = furniture.some((item) => item.uid === seatUid);
    const tableExists = !template.loungeTable || furniture.some((item) => item.uid === tableUid);
    if (seatExists && tableExists) continue;

    if (seatExists) {
      const seat = furniture.find((item) => item.uid === seatUid);
      if (seat && template.loungeTable && !tableExists) {
        const table = findTableNearLobbySeat(
          layout,
          room,
          seat,
          template.restSeat,
          template.loungeTable,
          tableUid,
          furniture,
        );
        if (table) {
          furniture.push(table);
          added++;
        }
      }
      continue;
    }

    const pod = findLobbyLoungePodPlacement(
      layout,
      room,
      template.restSeat,
      template.loungeTable,
      seatUid,
      tableUid,
      podIndex,
      furniture,
    );
    if (pod) {
      furniture.push(pod.seat);
      added++;
      if (pod.table) {
        furniture.push(pod.table);
        added++;
      }
    }
  }
  return added;
}

function appendLobbyLoungeDecor(
  layout: OfficeLayout,
  room: ProjectRoom,
  decor: FurnitureCatalogEntry,
  furniture: PlacedFurniture[],
): number {
  const target = targetLobbyLoungeDecorCount(room);
  const legacyDecorCount = furniture.some((item) => item.uid === `${room.id}-lounge-decor`) ? 1 : 0;
  let added = 0;
  for (let decorIndex = legacyDecorCount; decorIndex < target; decorIndex++) {
    const uid = `${room.id}-lounge-decor-${decorIndex + 1}`;
    if (furniture.some((item) => item.uid === uid)) continue;
    const placement = findLobbyFurniturePlacement(
      layout,
      room,
      decor,
      uid,
      furniture,
      buildLobbyDecorPreferredPositions(room, decor, decorIndex),
    );
    if (placement) {
      furniture.push(placement);
      added++;
    }
  }
  return added;
}

function targetLobbyLoungePodCount(room: ProjectRoom): number {
  return clampInt(
    Math.floor((room.bounds.width * room.bounds.height) / PROJECT_ROOM_LOBBY_LOUNGE_TILES_PER_POD),
    PROJECT_ROOM_LOBBY_LOUNGE_MIN_PODS,
    PROJECT_ROOM_LOBBY_LOUNGE_MAX_PODS,
  );
}

function targetLobbyLoungeDecorCount(room: ProjectRoom): number {
  return clampInt(
    Math.floor(
      (room.bounds.width * room.bounds.height) / PROJECT_ROOM_LOBBY_LOUNGE_TILES_PER_DECOR,
    ),
    PROJECT_ROOM_LOBBY_LOUNGE_MIN_DECOR,
    PROJECT_ROOM_LOBBY_LOUNGE_MAX_DECOR,
  );
}

function findLobbyLoungePodPlacement(
  layout: OfficeLayout,
  room: ProjectRoom,
  restSeat: FurnitureCatalogEntry,
  loungeTable: FurnitureCatalogEntry | undefined,
  seatUid: string,
  tableUid: string,
  podIndex: number,
  furniture: PlacedFurniture[],
): { seat: PlacedFurniture; table?: PlacedFurniture } | null {
  const candidates = buildLobbyPodSeatCandidates(room, restSeat, loungeTable, seatUid, podIndex);
  const seen = new Set<string>();
  for (const seat of candidates) {
    const key = `${seat.col},${seat.row},${seat.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!canPlaceSuiteFurniture(layout, room, seat, furniture)) continue;
    if (!loungeTable) return { seat };
    const table = findTableNearLobbySeat(layout, room, seat, restSeat, loungeTable, tableUid, [
      ...furniture,
      seat,
    ]);
    if (table) return { seat, table };
  }
  return null;
}

function buildLobbyPodSeatCandidates(
  room: ProjectRoom,
  restSeat: FurnitureCatalogEntry,
  loungeTable: FurnitureCatalogEntry | undefined,
  uid: string,
  podIndex: number,
): PlacedFurniture[] {
  const pad = PROJECT_ROOM_LOBBY_LOUNGE_EDGE_PADDING_TILES;
  const maxCol = room.bounds.col + room.bounds.width - restSeat.footprintW - pad;
  const maxRow =
    room.bounds.row +
    room.bounds.height -
    restSeat.footprintH -
    (loungeTable?.footprintH ?? 0) -
    pad;
  const minCol = room.bounds.col + pad;
  const minRow = room.bounds.row + pad;
  const centerCol = room.bounds.col + Math.floor((room.bounds.width - restSeat.footprintW) / 2);
  const centerRow =
    room.bounds.row +
    Math.floor((room.bounds.height - restSeat.footprintH - (loungeTable?.footprintH ?? 0)) / 2);
  const primary = [
    { col: minCol, row: minRow },
    { col: maxCol, row: minRow },
    { col: minCol, row: maxRow },
    { col: maxCol, row: maxRow },
    { col: centerCol, row: centerRow },
    { col: minCol, row: centerRow },
  ];
  return [
    primary[podIndex % primary.length]!,
    ...primary,
    ...buildFallbackLobbyFurnitureCandidates(room, restSeat, uid),
  ].map((position) => ({ uid, type: restSeat.type, col: position.col, row: position.row }));
}

function findTableNearLobbySeat(
  layout: OfficeLayout,
  room: ProjectRoom,
  seat: PlacedFurniture,
  restSeat: FurnitureCatalogEntry,
  loungeTable: FurnitureCatalogEntry,
  tableUid: string,
  furniture: PlacedFurniture[],
): PlacedFurniture | null {
  const preferred = [
    { col: seat.col, row: seat.row + restSeat.footprintH },
    { col: seat.col, row: seat.row - loungeTable.footprintH },
    { col: seat.col + restSeat.footprintW + 1, row: seat.row },
    { col: seat.col - loungeTable.footprintW - 1, row: seat.row },
  ];
  return findLobbyFurniturePlacement(layout, room, loungeTable, tableUid, furniture, preferred);
}

function buildLobbyDecorPreferredPositions(
  room: ProjectRoom,
  decor: FurnitureCatalogEntry,
  decorIndex: number,
): Array<{ col: number; row: number }> {
  const pad = PROJECT_ROOM_LOBBY_LOUNGE_EDGE_PADDING_TILES;
  const maxCol = room.bounds.col + room.bounds.width - decor.footprintW - pad;
  const maxRow = room.bounds.row + room.bounds.height - decor.footprintH - pad;
  const minCol = room.bounds.col + pad;
  const minRow = room.bounds.row + pad;
  const centerCol = room.bounds.col + Math.floor((room.bounds.width - decor.footprintW) / 2);
  const centerRow = room.bounds.row + Math.floor((room.bounds.height - decor.footprintH) / 2);
  const positions = [
    { col: minCol, row: maxRow },
    { col: maxCol, row: maxRow },
    { col: minCol, row: minRow },
    { col: maxCol, row: minRow },
    { col: centerCol, row: centerRow },
  ];
  return [positions[decorIndex % positions.length]!, ...positions];
}

function findLobbyFurniturePlacement(
  layout: OfficeLayout,
  room: ProjectRoom,
  entry: FurnitureCatalogEntry,
  uid: string,
  furniture: PlacedFurniture[],
  preferred: Array<{ col: number; row: number }>,
): PlacedFurniture | null {
  const candidates = [
    ...preferred.map((position) => ({ uid, type: entry.type, ...position })),
    ...buildFallbackLobbyFurnitureCandidates(room, entry, uid),
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.col},${candidate.row},${candidate.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (canPlaceSuiteFurniture(layout, room, candidate, furniture)) return candidate;
  }
  return null;
}

function buildFallbackLobbyFurnitureCandidates(
  room: ProjectRoom,
  entry: FurnitureCatalogEntry,
  uid: string,
): PlacedFurniture[] {
  const candidates: PlacedFurniture[] = [];
  const minCol = room.bounds.col + 1;
  const maxCol = room.bounds.col + room.bounds.width - entry.footprintW - 1;
  const minRow = room.bounds.row + 1;
  const maxRow = room.bounds.row + room.bounds.height - entry.footprintH - 1;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      candidates.push({ uid, type: entry.type, col, row });
    }
  }
  return candidates;
}

function roomHasFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  predicate: (entry: FurnitureCatalogEntry) => boolean,
): boolean {
  return layout.furniture.some((item) => {
    const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
    if (!entry || !predicate(entry)) return false;
    return rectsOverlap(room.bounds, placedFurnitureBounds(item, entry));
  });
}

function isLoungeTableFurniture(entry: FurnitureCatalogEntry): boolean {
  return isCoffeeFurniture(entry) || /small.*table/i.test(`${entry.type} ${entry.label}`);
}

function isLoungeDecorFurniture(entry: FurnitureCatalogEntry): boolean {
  return entry.category === 'decor' && /plant|cactus|pot/i.test(`${entry.type} ${entry.label}`);
}

function isLobbyWorkFurniture(entry: FurnitureCatalogEntry): boolean {
  if (entry.category === 'electronics') return true;
  if (entry.isDesk && !isLoungeTableFurniture(entry)) return true;
  if (entry.category === 'chairs' && !isRestSeatFurniture(entry)) return true;
  return false;
}

function isRestSeatFurniture(entry: FurnitureCatalogEntry): boolean {
  const text = `${entry.type} ${entry.label}`;
  return (
    entry.category === 'chairs' && (entry.footprintW >= 2 || /sofa|bench|couch|cushion/i.test(text))
  );
}

function ensureProjectSuiteFurniture(
  layout: OfficeLayout,
  template: RoomTemplateAssets,
): { layout: OfficeLayout; addedCount: number } {
  let furniture = layout.furniture;
  let addedCount = 0;
  for (const room of normalizeProjectRooms(layout).filter(
    (candidate) => candidate.kind === ProjectRoomKind.PROJECT,
  )) {
    // A template-stamped room is already the complete designed interior — leave it untouched.
    if (roomHasCurrentTemplateStamp({ ...layout, furniture }, room)) continue;
    const seats = roomSeats({ ...layout, furniture }, room);
    const missingWork = !seats.some(
      (seat) => seat.seatKind === 'work' && seat.zoneSource === 'workstation',
    );
    const missingRest = !seats.some((seat) => seat.seatKind === 'rest');

    const nextFurniture = [...furniture];
    let roomAdded = 0;
    // Additive-only: auto-provision may ADD furniture a room is missing, but must never reposition
    // or remove what is already there. Repositioning (the old reflow) and rest-seat "upgrades" could
    // not tell a user's manual edit from stale generated furniture, so they clobbered hand edits —
    // "a desk jumps, accessories vanish on exit". Existing furniture is now left untouched.

    if (missingWork) {
      const workCandidates = buildRoomFurnitureCandidates(room, template)
        .filter((candidate) => candidate.role === 'work')
        .map((candidate) => candidate.item);
      const plannedFurniture = [...nextFurniture];
      let canPlaceAllWork = true;
      for (const item of workCandidates) {
        if (!canPlaceSuiteFurniture(layout, room, item, plannedFurniture)) {
          canPlaceAllWork = false;
          break;
        }
        plannedFurniture.push(item);
      }
      if (canPlaceAllWork) {
        nextFurniture.push(...workCandidates);
        roomAdded += workCandidates.length;
      }
    }
    if (missingRest) {
      const restSeat = findRestSeatPlacement(layout, room, template.restSeat, nextFurniture);
      if (restSeat) {
        nextFurniture.push(restSeat);
        roomAdded++;
      }
    }
    if (
      template.loungeTable &&
      !roomHasFurniture({ ...layout, furniture: nextFurniture }, room, isLoungeTableFurniture)
    ) {
      const restTable = findProjectRestTablePlacement(
        layout,
        room,
        template.loungeTable,
        nextFurniture,
      );
      if (restTable) {
        nextFurniture.push(restTable);
        roomAdded++;
      }
    }
    if (roomAdded > 0) {
      furniture = nextFurniture;
      addedCount += roomAdded;
    }
  }
  return addedCount > 0 ? { layout: { ...layout, furniture }, addedCount } : { layout, addedCount };
}

/**
 * Stamp the user-authored room template (PROJECT_ROOM_TEMPLATE) verbatim for this room, offsetting
 * each piece by the room's top-left bounds. Returns null when any template type is absent from the
 * loaded catalog (e.g. minimal test catalogs) so the caller falls back to heuristic generation.
 * Placed verbatim — the saved design is authoritative, including intentional surface overlaps.
 */
function templateStampPrefix(room: ProjectRoom): string {
  return `${room.id}-tpl-r${PROJECT_ROOM_TEMPLATE.rev}-`;
}

function stampRoomTemplate(room: ProjectRoom): PlacedFurniture[] | null {
  const entries = getAllCatalogEntries();
  const known = new Set(entries.map((entry) => entry.type));
  if (!PROJECT_ROOM_TEMPLATE.furniture.every((item) => known.has(item.type))) return null;
  const prefix = templateStampPrefix(room);
  return PROJECT_ROOM_TEMPLATE.furniture.map((item, index) => ({
    uid: `${prefix}${index}`,
    type: item.type,
    col: room.bounds.col + item.colOffset,
    row: room.bounds.row + item.rowOffset,
  }));
}

/**
 * A room carries the CURRENT template stamp (matching `PROJECT_ROOM_TEMPLATE.rev`). Rooms stamped by
 * an older template rev return false, so the migration re-stamps them — that is how template edits
 * propagate to every room. Within the same rev a stamped room is left alone, so manual edits survive.
 */
function roomHasCurrentTemplateStamp(layout: OfficeLayout, room: ProjectRoom): boolean {
  const prefix = templateStampPrefix(room);
  return layout.furniture.some((item) => item.uid.startsWith(prefix));
}

/**
 * Re-stamp every project room whose stamp is not the CURRENT template rev (older rev, or never
 * stamped) so the whole campus matches the user-designed room and template edits propagate. Clears
 * the room's interior — including its wall-decor row above and any stale older-rev stamp — and lays
 * down the current template verbatim. Idempotent within a rev: a room already on the current rev is
 * skipped, so manual edits made between template revisions survive. No-op when the template cannot be
 * stamped (incomplete catalog), so minimal test catalogs are unaffected.
 */
function migrateExistingRoomsToTemplate(layout: OfficeLayout): {
  layout: OfficeLayout;
  changedCount: number;
} {
  let furniture = layout.furniture;
  let changedCount = 0;
  for (const room of normalizeProjectRooms(layout).filter(
    (candidate) => candidate.kind === ProjectRoomKind.PROJECT,
  )) {
    if (roomHasCurrentTemplateStamp({ ...layout, furniture }, room)) continue;
    const stamped = stampRoomTemplate(room);
    if (!stamped) continue;
    const b = room.bounds;
    // Clear furniture whose origin sits in the room interior or its wall-decor row (2 rows above).
    const inRoomRegion = (item: PlacedFurniture) =>
      item.col >= b.col &&
      item.col < b.col + b.width &&
      item.row >= b.row - 2 &&
      item.row < b.row + b.height;
    furniture = [...furniture.filter((item) => !inRoomRegion(item)), ...stamped];
    changedCount += stamped.length;
  }
  return changedCount > 0
    ? { layout: { ...layout, furniture }, changedCount }
    : { layout, changedCount };
}

function buildGeneratedProjectRoomFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  template: RoomTemplateAssets,
  baseFurniture: PlacedFurniture[],
): PlacedFurniture[] {
  // Prefer the user-authored template: a new room becomes a verbatim copy of the designed room.
  const stamped = stampRoomTemplate(room);
  if (stamped) return stamped;

  const planned: PlacedFurniture[] = [];
  for (const candidate of buildRoomFurnitureCandidates(room, template).map((item) => item.item)) {
    if (!canPlaceSuiteFurniture(layout, room, candidate, [...baseFurniture, ...planned])) {
      return [];
    }
    planned.push(candidate);
  }

  if (template.loungeTable) {
    const restTable = findProjectRestTablePlacement(layout, room, template.loungeTable, [
      ...baseFurniture,
      ...planned,
    ]);
    if (restTable) planned.push(restTable);
  }

  for (const candidate of buildStudioAccentFurniture(room)) {
    if (canPlaceSuiteFurniture(layout, room, candidate, [...baseFurniture, ...planned])) {
      planned.push(candidate);
    }
  }

  for (const decor of buildStudioWallDecor(layout, room, [...baseFurniture, ...planned])) {
    planned.push(decor);
  }

  return planned;
}

/**
 * Idempotently retrofit the signature studio interior (wall decor, focus desk set, desk plants and
 * other accents) onto EVERY project room — not just freshly created ones. Older rooms persisted to
 * layout.json predate these pieces, and the all-or-nothing reflow path silently bails whenever a
 * single candidate cannot be placed, leaving existing rooms without back-wall decor or a focus desk.
 *
 * This pass is additive and per-item: each studio piece has a deterministic uid, so a piece already
 * present is skipped, and a piece that does not fit (collision with the room's existing furniture) is
 * skipped too. Re-running it never duplicates or churns furniture — it only fills in what is missing,
 * converging existing rooms onto the same look as a brand-new room.
 */
function ensureProjectRoomStudioDecor(layout: OfficeLayout): {
  layout: OfficeLayout;
  addedCount: number;
} {
  let furniture = layout.furniture;
  let addedCount = 0;
  for (const room of normalizeProjectRooms(layout).filter(
    (candidate) => candidate.kind === ProjectRoomKind.PROJECT,
  )) {
    // Template-stamped rooms already carry the full designed decor — don't add the heuristic accents.
    if (roomHasCurrentTemplateStamp({ ...layout, furniture }, room)) continue;
    const existingUids = new Set(furniture.map((item) => item.uid));
    const additions: PlacedFurniture[] = [];

    // Interior accents (focus desk set, desk plant, pots, bin, lounge seats) sit fully inside the
    // room, so they use the standard suite placement check.
    for (const accent of buildStudioAccentFurniture(room)) {
      if (existingUids.has(accent.uid)) continue;
      if (canPlaceSuiteFurniture(layout, room, accent, [...furniture, ...additions])) {
        additions.push(accent);
        existingUids.add(accent.uid);
      }
    }

    // Back-wall decor hangs above the room interior; buildStudioWallDecor already returns only the
    // pieces that fit on solid wall tiles without overlapping existing furniture.
    for (const decor of buildStudioWallDecor(layout, room, [...furniture, ...additions])) {
      if (existingUids.has(decor.uid)) continue;
      additions.push(decor);
      existingUids.add(decor.uid);
    }

    if (additions.length > 0) {
      furniture = [...furniture, ...additions];
      addedCount += additions.length;
    }
  }
  return addedCount > 0 ? { layout: { ...layout, furniture }, addedCount } : { layout, addedCount };
}

function buildStudioAccentFurniture(room: ProjectRoom): PlacedFurniture[] {
  if (
    room.bounds.width < PROJECT_ROOM_COLLAB_TEMPLATE_MIN_WIDTH ||
    room.bounds.height < PROJECT_ROOM_COLLAB_TEMPLATE_MIN_HEIGHT
  ) {
    return [];
  }
  return PROJECT_ROOM_STUDIO_TEMPLATE_ACCENTS.map((placement) => ({
    uid: `${room.id}-${placement.uidSuffix}`,
    type: placement.type,
    col: room.bounds.col + placement.colOffset,
    row: room.bounds.row + placement.rowOffset,
  }));
}

/**
 * Wall-mounted back-wall decor (bookshelves, paintings, clock) along the room's top wall, matching
 * the hand-designed studio. Wall items hang on the wall: their bottom footprint row sits on the wall
 * tile and upper rows extend above it. Any column that isn't a solid wall (e.g. the doorway gap of a
 * bottom-row room) is skipped, so decor never blocks the entrance.
 */
function buildStudioWallDecor(
  layout: OfficeLayout,
  room: ProjectRoom,
  furniture: PlacedFurniture[],
): PlacedFurniture[] {
  if (room.bounds.width < PROJECT_ROOM_COLLAB_TEMPLATE_MIN_WIDTH) return [];
  const placed: PlacedFurniture[] = [];
  for (const decor of PROJECT_ROOM_STUDIO_WALL_DECOR) {
    const entry = getAllCatalogEntries().find((candidate) => candidate.type === decor.type);
    if (!entry?.canPlaceOnWalls) continue;
    const col = room.bounds.col + decor.colOffset;
    const bottomRow = room.bounds.row; // the top (back) wall row
    const item: PlacedFurniture = {
      uid: `${room.id}-${decor.uidSuffix}`,
      type: decor.type,
      col,
      row: bottomRow - (entry.footprintH - 1),
    };
    if (canPlaceWallDecor(layout, room, item, entry, [...furniture, ...placed])) {
      placed.push(item);
    }
  }
  return placed;
}

function canPlaceWallDecor(
  layout: OfficeLayout,
  room: ProjectRoom,
  item: PlacedFurniture,
  entry: FurnitureCatalogEntry,
  furniture: PlacedFurniture[],
): boolean {
  const bottomRow = item.row + entry.footprintH - 1;
  if (
    item.col < room.bounds.col ||
    item.col + entry.footprintW > room.bounds.col + room.bounds.width
  )
    return false;
  if (bottomRow < 0 || bottomRow >= layout.rows) return false;
  // The bottom row must sit on solid wall tiles (this skips the doorway gap automatically).
  for (let dc = 0; dc < entry.footprintW; dc++) {
    if (layout.tiles[bottomRow * layout.cols + (item.col + dc)] !== TileType.WALL) return false;
  }
  const bounds = placedFurnitureBounds(item, entry);
  for (const existing of furniture) {
    const existingEntry = getAllCatalogEntries().find(
      (candidate) => candidate.type === existing.type,
    );
    if (!existingEntry) continue;
    if (rectsOverlap(bounds, placedFurnitureBounds(existing, existingEntry))) return false;
  }
  return true;
}

function roomSeats(layout: OfficeLayout, room: ProjectRoom) {
  return [...layoutToSeats(layout).values()].filter(
    (seat) =>
      seat.seatCol >= room.bounds.col &&
      seat.seatCol < room.bounds.col + room.bounds.width &&
      seat.seatRow >= room.bounds.row &&
      seat.seatRow < room.bounds.row + room.bounds.height,
  );
}

function findRestSeatPlacement(
  layout: OfficeLayout,
  room: ProjectRoom,
  restSeat: FurnitureCatalogEntry,
  furniture: PlacedFurniture[],
): PlacedFurniture | null {
  const candidates = [
    preferredRestSeatPlacement(room, restSeat),
    ...buildFallbackRestSeatCandidates(room, restSeat),
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.col},${candidate.row},${candidate.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (canPlaceSuiteFurniture(layout, room, candidate, furniture)) return candidate;
  }
  return null;
}

function findProjectRestTablePlacement(
  layout: OfficeLayout,
  room: ProjectRoom,
  loungeTable: FurnitureCatalogEntry,
  furniture: PlacedFurniture[],
): PlacedFurniture | null {
  const restSeat = furniture.find((item) => item.uid === `${room.id}-rest-seat`);
  const restEntry = restSeat
    ? getAllCatalogEntries().find((candidate) => candidate.type === restSeat.type)
    : undefined;
  const preferred = restSeat
    ? [
        { col: restSeat.col, row: restSeat.row - loungeTable.footprintH },
        { col: restSeat.col - loungeTable.footprintW - 1, row: restSeat.row },
        { col: restSeat.col + (restEntry?.footprintW ?? 1) + 1, row: restSeat.row },
        { col: restSeat.col, row: restSeat.row + (restEntry?.footprintH ?? 1) },
      ]
    : [
        {
          col: room.bounds.col + 1,
          row: room.bounds.row + room.bounds.height - loungeTable.footprintH - 2,
        },
      ];
  return findLobbyFurniturePlacement(
    layout,
    room,
    loungeTable,
    `${room.id}-rest-table`,
    furniture,
    preferred,
  );
}

function preferredRestSeatPlacement(
  room: ProjectRoom,
  restSeat: FurnitureCatalogEntry,
): PlacedFurniture {
  const { col, row, width } = room.bounds;
  const isCollaborationRoom =
    width >= PROJECT_ROOM_COLLAB_TEMPLATE_MIN_WIDTH &&
    room.bounds.height >= PROJECT_ROOM_COLLAB_TEMPLATE_MIN_HEIGHT;
  return {
    uid: `${room.id}-rest-seat`,
    type: restSeat.type,
    col: isCollaborationRoom
      ? col + PROJECT_ROOM_COLLAB_REST_SEAT_OFFSET_COL
      : col +
        Math.max(
          PROJECT_ROOM_STANDARD_REST_SEAT_MIN_OFFSET_COL,
          width - restSeat.footprintW - PROJECT_ROOM_STANDARD_REST_SEAT_RIGHT_MARGIN,
        ),
    row: isCollaborationRoom
      ? row + PROJECT_ROOM_COLLAB_REST_SEAT_OFFSET_ROW
      : row + PROJECT_ROOM_STANDARD_REST_SEAT_OFFSET_ROW,
  };
}

function buildFallbackRestSeatCandidates(
  room: ProjectRoom,
  restSeat: FurnitureCatalogEntry,
): PlacedFurniture[] {
  const candidates: PlacedFurniture[] = [];
  const minCol = room.bounds.col + 1;
  const maxCol = room.bounds.col + room.bounds.width - restSeat.footprintW - 1;
  const minRow = room.bounds.row + 1;
  const maxRow = room.bounds.row + room.bounds.height - restSeat.footprintH - 1;
  for (let row = maxRow; row >= minRow; row--) {
    for (let col = maxCol; col >= minCol; col--) {
      candidates.push({
        uid: `${room.id}-rest-seat`,
        type: restSeat.type,
        col,
        row,
      });
    }
  }
  return candidates;
}

/**
 * Tiles that must stay clear so the room's corridor-facing doorway is never blocked by furniture.
 * The doorway is the floor gap in an otherwise-walled perimeter side: for a bottom-row room that's a
 * gap in the top (north) wall; for a side room a gap in the east/west wall. The open south front is
 * NOT treated as a doorway — it is the intentional camera-facing opening where lounge seating sits.
 * Includes the gap tile and the tile one step inside it (the entry path).
 */
export function roomDoorwayKeepClearTiles(layout: OfficeLayout, room: ProjectRoom): Set<string> {
  const clear = new Set<string>();
  const { col, row, width, height } = room.bounds;
  const within = (c: number, r: number): boolean =>
    c >= col && c < col + width && r >= row && r < row + height;
  const markGap = (c: number, r: number, insideC: number, insideR: number): void => {
    if (c < 0 || c >= layout.cols || r < 0 || r >= layout.rows) return;
    const tile = layout.tiles[r * layout.cols + c];
    if (tile === TileType.WALL || tile === TileType.VOID || tile === undefined) return;
    clear.add(`${c},${r}`);
    if (within(insideC, insideR)) clear.add(`${insideC},${insideR}`);
  };
  for (let c = col; c < col + width; c++) markGap(c, row, c, row + 1);
  for (let r = row + 1; r < row + height - 1; r++) {
    markGap(col, r, col + 1, r);
    markGap(col + width - 1, r, col + width - 2, r);
  }
  return clear;
}

function canPlaceSuiteFurniture(
  layout: OfficeLayout,
  room: ProjectRoom,
  item: PlacedFurniture,
  furniture: PlacedFurniture[],
): boolean {
  if (furniture.some((existing) => existing.uid === item.uid)) return false;
  const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
  if (!entry) return false;
  const bounds = placedFurnitureBounds(item, entry);
  if (!rectInsideRoom(bounds, room.bounds)) return false;
  for (let row = bounds.row; row < bounds.row + bounds.height; row++) {
    for (let col = bounds.col; col < bounds.col + bounds.width; col++) {
      const tile = layout.tiles[row * layout.cols + col];
      if (tile === TileType.WALL || tile === TileType.VOID || tile === undefined) return false;
    }
  }
  const keepClear = roomDoorwayKeepClearTiles(layout, room);
  if (keepClear.size > 0) {
    for (let row = bounds.row; row < bounds.row + bounds.height; row++) {
      for (let col = bounds.col; col < bounds.col + bounds.width; col++) {
        if (keepClear.has(`${col},${row}`)) return false;
      }
    }
  }
  for (const existing of furniture) {
    const existingEntry = getAllCatalogEntries().find(
      (candidate) => candidate.type === existing.type,
    );
    if (!existingEntry) continue;
    if (!rectsOverlap(bounds, placedFurnitureBounds(existing, existingEntry))) continue;
    if (canFurnitureOverlap(entry, existingEntry)) continue;
    return false;
  }
  return true;
}

function canFurnitureOverlap(
  entry: FurnitureCatalogEntry,
  existingEntry: FurnitureCatalogEntry,
): boolean {
  return (
    (entry.canPlaceOnSurfaces === true && existingEntry.isDesk) ||
    (existingEntry.canPlaceOnSurfaces === true && entry.isDesk)
  );
}

function placedFurnitureBounds(
  item: PlacedFurniture,
  entry: Pick<FurnitureCatalogEntry, 'footprintW' | 'footprintH'>,
): ProjectRoom['bounds'] {
  return {
    col: item.col,
    row: item.row,
    width: entry.footprintW,
    height: entry.footprintH,
  };
}

function rectInsideRoom(rect: ProjectRoom['bounds'], room: ProjectRoom['bounds']): boolean {
  return (
    rect.col >= room.col &&
    rect.row >= room.row &&
    rect.col + rect.width <= room.col + room.width &&
    rect.row + rect.height <= room.row + room.height
  );
}

function stableRoomId(projectKey: string, rooms: ProjectRoom[]): string {
  const base = `project-${safeProjectRoomIdSegment(projectKey)}`;
  return stableUniqueRoomId(base, rooms);
}

function stableUniqueRoomId(base: string, rooms: ProjectRoom[]): string {
  const ids = new Set(rooms.map((room) => room.id));
  if (!ids.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const id = `${base}-${i}`;
    if (!ids.has(id)) return id;
  }
  return `${base}-${rooms.length + 1}`;
}

/**
 * The lowest grid row the user's hand-design occupies, or -1 when there is nothing to protect (a
 * blank or fully generated layout). The design extent is the union of hand-placed furniture
 * footprints and any user-painted (non-VOID) tile that is not already inside a generated room. The
 * campus is anchored below this row so generation never lands on top of the hand-design.
 */
function protectedDesignMaxRow(layout: OfficeLayout): number {
  const handFurniture = layout.furniture.filter((item) => !isGeneratedFurnitureUid(item.uid));
  if (handFurniture.length === 0) return -1;
  const rooms = normalizeProjectRooms(layout);
  const campusRooms = rooms.filter(
    (room) => room.kind === ProjectRoomKind.PUBLIC || room.kind === ProjectRoomKind.PROJECT,
  );
  // The campus footprint is the bounding box of every generated room (lobby + project rooms). The
  // generator paints corridor tiles WITHIN this box (between room doorways and the lobby) that fall
  // outside any single room rect. The old code counted those generated tiles, so the anchor row
  // ratcheted downward every provision — pushing the campus lower and growing the grid to MAX_ROWS.
  const footprint =
    campusRooms.length > 0 ? unionBounds(campusRooms.map((room) => room.bounds)) : null;

  let maxRow = -1;
  for (const item of handFurniture) {
    const entry = getAllCatalogEntries().find((candidate) => candidate.type === item.type);
    const footprintW = entry?.footprintW ?? 1;
    const footprintH = entry?.footprintH ?? 1;
    const rect = { col: item.col, row: item.row, width: footprintW, height: footprintH };
    // Skip hand furniture that sits fully inside an existing ROOM (the room already contains it, so
    // it must not push the campus below its own contents). Crucially we test individual rooms, NOT
    // the footprint bbox: a hand item in the gap BETWEEN scattered rooms is real design and must
    // still extend the protected row.
    if (campusRooms.some((room) => rectInsideBounds(rect, room.bounds))) continue;
    maxRow = Math.max(maxRow, item.row + footprintH - 1);
  }
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const tile = layout.tiles[row * layout.cols + col];
      if (tile === TileType.VOID) continue;
      // Skip tiles inside the campus footprint — this is what excludes the generator's own corridor
      // tiles (untagged floor between rooms) and stops the ratchet. Hand-painted floor outside the
      // campus is still counted; hand-painted floor wedged inside the bbox is rare and additionally
      // guarded at allocation time by canPlaceRoomBounds / clearCampusTiles.
      if (footprint !== null && pointInBounds(col, row, footprint)) continue;
      maxRow = Math.max(maxRow, row);
    }
  }
  return maxRow;
}

function deriveWorkCorridorBounds(
  layout: OfficeLayout,
  projectRoomCount = normalizeProjectRooms(layout).filter(
    (room) => room.kind === ProjectRoomKind.PROJECT,
  ).length,
): ProjectRoom['bounds'] {
  const base = deriveLobbyCoreBounds(layout);
  const bayCount = targetWorkCorridorBayCount(projectRoomCount);
  const bayWidth =
    bayCount * PROJECT_ROOM_DEFAULT_WIDTH + (bayCount - 1) * PROJECT_ROOM_GENERATED_MARGIN;
  const width = Math.min(
    MAX_COLS,
    Math.max(PROJECT_ROOM_WORK_CORRIDOR_MIN_WIDTH, bayWidth, base.width),
  );
  const col = clampInt(base.col, 0, MAX_COLS - width);
  const minRow = PROJECT_ROOM_DEFAULT_HEIGHT + PROJECT_ROOM_GENERATED_MARGIN;
  // Anchor the whole corridor (and the row of rooms above it) below the user's hand-design so
  // generation never overlaps it. The rooms above the lobby sit at lobby.row - DEFAULT_HEIGHT -
  // MARGIN, so the lobby must clear the design by that much plus one more margin.
  const designMaxRow = protectedDesignMaxRow(layout);
  const designFloorRow =
    designMaxRow >= 0
      ? designMaxRow +
        1 +
        PROJECT_ROOM_GENERATED_MARGIN +
        PROJECT_ROOM_DEFAULT_HEIGHT +
        PROJECT_ROOM_GENERATED_MARGIN
      : -1;
  const preferredRow = Math.max(base.row > 0 ? base.row : minRow, designFloorRow);
  const maxRow =
    MAX_ROWS -
    PROJECT_ROOM_DEFAULT_HEIGHT -
    PROJECT_ROOM_GENERATED_MARGIN -
    PROJECT_ROOM_WORK_CORRIDOR_HEIGHT;
  return {
    col,
    row: clampInt(preferredRow, minRow, maxRow),
    width,
    height: PROJECT_ROOM_WORK_CORRIDOR_HEIGHT,
  };
}

function targetWorkCorridorBayCount(projectRoomCount: number): number {
  return Math.max(2, Math.ceil(Math.max(0, projectRoomCount) / 2));
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
