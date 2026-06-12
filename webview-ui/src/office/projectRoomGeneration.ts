import type { ColorValue } from '../components/ui/types.js';
import {
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
  PROJECT_ROOM_GENERATED_REST_MIN_WIDTH,
  PROJECT_ROOM_GENERATED_SHELL_THICKNESS,
  PROJECT_ROOM_GENERATED_WALL_COLOR,
  PROJECT_ROOM_LOBBY_ID,
  PROJECT_ROOM_LOBBY_LABEL,
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
} from '../constants.js';
import {
  allocateRoomBounds,
  boundsFitMax,
  buildWorkCorridorRoomSlots,
  deriveWorkCorridorBounds,
  ensureLayoutSize,
  roomBoundsFitGrid,
} from './campusBounds.js';
import {
  canPlaceSuiteFurniture,
  clampInt,
  isCoffeeFurniture,
  isGeneratedFurnitureUid,
  isLoungeTableFurniture,
  isSideOrientation,
  pickEntry,
  pickPreferredEntry,
  placedFurnitureBounds,
  roomHasFurniture,
  roomSeats,
  type RoomTemplateAssets,
} from './generationShared.js';
import { boundsEqual, rectsOverlap } from './geometry.js';
import { ensureLobbyLoungeFurniture, findLobbyFurniturePlacement } from './lobbyLounge.js';

// Re-export: tests and the editor consume this from projectRoomGeneration historically.
export { roomDoorwayKeepClearTiles } from './generationShared.js';
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
import { ProjectIdentitySource, ProjectRoomKind, TileType } from './types.js';

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

function isOffOrStaticElectronics(entry: FurnitureCatalogEntry): boolean {
  return !/_ON(?:_|$)/i.test(entry.type);
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
