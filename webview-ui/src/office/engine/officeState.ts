import {
  AUTO_ON_FACING_DEPTH,
  AUTO_ON_SIDE_DEPTH,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
  CHARACTER_SITTING_OFFSET_PX,
  DISMISS_BUBBLE_FAST_FADE_SEC,
  FURNITURE_ANIM_INTERVAL_SEC,
  HUE_SHIFT_MIN_DEG,
  HUE_SHIFT_RANGE_DEG,
  SEAT_REST_MAX_SEC,
  SEAT_REST_MIN_SEC,
  SUPERVISION_TOOL_NAME,
  WAITING_BUBBLE_DURATION_SEC,
} from '../../constants.js';
import { getAnimationFrames, getCatalogEntry, getOnStateType } from '../layout/furnitureCatalog.js';
import {
  createDefaultLayout,
  getBlockedTiles,
  getSeatTiles,
  layoutToFurnitureInstances,
  layoutToSeats,
  layoutToTileMap,
} from '../layout/layoutSerializer.js';
import { findPath, getWalkableTiles, isWalkable } from '../layout/tileMap.js';
import {
  deriveAgentProjectKey,
  normalizeProjectRoomsInLayout,
  seatPriorityForAgent,
  seatPriorityForProjectKey,
} from '../projectRooms.js';
import { getLoadedCharacterCount } from '../sprites/spriteData.js';
import type {
  Character,
  DelegationVisualState,
  FurnitureInstance,
  OfficeLayout,
  PlacedFurniture,
  Seat,
  TileType as TileTypeVal,
  TokenRateLimitSnapshot,
  TokenUsageDetails,
} from '../types.js';
import { CharacterState, Direction, MATRIX_EFFECT_DURATION, TILE_SIZE } from '../types.js';
import { inferTileZone } from '../zoneUtils.js';
import { createCharacter, isCharacterSeated, updateCharacter } from './characters.js';
import { matrixEffectSeeds } from './matrixEffect.js';

function manhattan(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

export class OfficeState {
  layout: OfficeLayout;
  tileMap: TileTypeVal[][];
  seats: Map<string, Seat>;
  blockedTiles: Set<string>;
  furniture: FurnitureInstance[];
  walkableTiles: Array<{ col: number; row: number }>;
  idleWalkableTiles: Array<{ col: number; row: number }>;
  characters: Map<number, Character> = new Map();
  /** Accumulated time for furniture animation frame cycling */
  furnitureAnimTimer = 0;
  selectedAgentId: number | null = null;
  cameraFollowId: number | null = null;
  hoveredAgentId: number | null = null;
  hoveredTile: { col: number; row: number } | null = null;
  meetingTeamName: string | null = null;
  /** Maps "parentId:toolId" → sub-agent character ID (negative) */
  subagentIdMap: Map<string, number> = new Map();
  /** Reverse lookup: sub-agent character ID → parent info */
  subagentMeta: Map<number, { parentAgentId: number; parentToolId: string }> = new Map();
  private nextSubagentId = -1;

  constructor(layout?: OfficeLayout) {
    this.layout = normalizeProjectRoomsInLayout(layout || createDefaultLayout());
    this.tileMap = layoutToTileMap(this.layout);
    this.seats = layoutToSeats(this.layout);
    this.blockedTiles = getBlockedTiles(this.layout.furniture);
    this.furniture = layoutToFurnitureInstances(this.layout.furniture);
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);
    this.idleWalkableTiles = this.getIdleWalkableTiles();
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters.
   *  @param shift Optional pixel shift to apply when grid expands left/up */
  rebuildFromLayout(layout: OfficeLayout, shift?: { col: number; row: number }): void {
    this.layout = normalizeProjectRoomsInLayout(layout);
    this.tileMap = layoutToTileMap(this.layout);
    this.seats = layoutToSeats(this.layout);
    this.blockedTiles = getBlockedTiles(this.layout.furniture);
    this.rebuildFurnitureInstances();
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);
    this.idleWalkableTiles = this.getIdleWalkableTiles();

    // Shift character positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const ch of this.characters.values()) {
        ch.tileCol += shift.col;
        ch.tileRow += shift.row;
        ch.x += shift.col * TILE_SIZE;
        ch.y += shift.row * TILE_SIZE;
        // Clear path since tile coords changed
        ch.path = [];
        ch.moveProgress = 0;
      }
    }

    this.repairSeatingAssignments('layout');
  }

  /** Move a character to a random walkable tile */
  private relocateCharacterToWalkable(ch: Character): void {
    if (this.walkableTiles.length === 0) return;
    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.path = [];
    ch.moveProgress = 0;
  }

  getLayout(): OfficeLayout {
    return this.layout;
  }

  /** Get the blocked-tile key for a character's own seat, or null */
  private ownSeatKey(ch: Character): string | null {
    if (!ch.seatId) return null;
    const seat = this.seats.get(ch.seatId);
    if (!seat) return null;
    return `${seat.seatCol},${seat.seatRow}`;
  }

  /** Temporarily unblock a character's own seat, run fn, then re-block */
  private withOwnSeatUnblocked<T>(ch: Character, fn: () => T): T {
    const key = this.ownSeatKey(ch);
    return this.withTilesUnblocked(key ? [key] : [], fn);
  }

  private withTilesUnblocked<T>(keys: string[], fn: () => T): T {
    const removed: string[] = [];
    for (const key of keys) {
      if (this.blockedTiles.delete(key)) removed.push(key);
    }
    try {
      return fn();
    } finally {
      for (const key of removed) {
        this.blockedTiles.add(key);
      }
    }
  }

  private seatKey(seat: Seat): string {
    return `${seat.seatCol},${seat.seatRow}`;
  }

  private isTopLevelCharacter(ch: Character): boolean {
    return !ch.isSubagent;
  }

  private isInsideLayout(col: number, row: number): boolean {
    return row >= 0 && row < this.layout.rows && col >= 0 && col < this.layout.cols;
  }

  private isCharacterOnWalkableTile(ch: Character): boolean {
    if (!this.isInsideLayout(ch.tileCol, ch.tileRow)) return false;
    const ownSeatKey = this.ownSeatKey(ch);
    const blocked = ownSeatKey
      ? new Set([...this.blockedTiles].filter((key) => key !== ownSeatKey))
      : this.blockedTiles;
    return isWalkable(ch.tileCol, ch.tileRow, this.tileMap, blocked);
  }

  private isSeatReachableForCharacter(ch: Character, seat: Seat): boolean {
    if (ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) return true;
    const keys = [this.seatKey(seat)];
    const ownKey = this.ownSeatKey(ch);
    if (ownKey) keys.push(ownKey);
    return this.withTilesUnblocked(keys, () => {
      const path = findPath(
        ch.tileCol,
        ch.tileRow,
        seat.seatCol,
        seat.seatRow,
        this.tileMap,
        this.blockedTiles,
      );
      return path.length > 0;
    });
  }

  isSeatValidForAgent(ch: Character, seat: Seat, mode: 'work' | 'rest'): boolean {
    if (!this.isTopLevelCharacter(ch)) return true;
    if (!this.seats.has(seat.uid)) return false;
    if (!this.isInsideLayout(seat.seatCol, seat.seatRow)) return false;
    if (mode === 'work') {
      if (seat.seatKind !== 'work' || seat.zoneSource !== 'workstation') return false;
    } else if (seat.seatKind !== 'rest') {
      return false;
    }
    if (seat.assigned && ch.seatId !== seat.uid) return false;
    return this.isSeatReachableForCharacter(ch, seat);
  }

  private isSeatModeMatch(seat: Seat, mode: 'work' | 'rest'): boolean {
    if (mode === 'work') {
      return seat.seatKind === 'work' && seat.zoneSource === 'workstation';
    }
    return seat.seatKind === 'rest';
  }

  private getSeatPriorityForAgent(ch: Character, seat: Seat, mode: 'work' | 'rest'): number {
    return seatPriorityForAgent(this.layout, ch, seat, mode);
  }

  private getSeatPriorityForProjectKey(
    projectKey: string | null,
    seat: Seat,
    mode: 'work' | 'rest',
  ): number {
    return seatPriorityForProjectKey(this.layout, projectKey, seat, mode);
  }

  private getSeatCandidatesForAgent(
    ch: Character,
    mode: 'work' | 'rest',
  ): Array<{ id: string; seat: Seat; priority: number; distance: number }> {
    return [...this.seats.entries()]
      .filter(([, seat]) => this.isSeatValidForAgent(ch, seat, mode))
      .map(([id, seat]) => ({
        id,
        seat,
        priority: this.getSeatPriorityForAgent(ch, seat, mode),
        distance: manhattan(
          { col: ch.tileCol, row: ch.tileRow },
          { col: seat.seatCol, row: seat.seatRow },
        ),
      }))
      .sort(
        (a, b) => a.priority - b.priority || a.distance - b.distance || a.id.localeCompare(b.id),
      );
  }

  private shouldKeepAssignedSeatForAgent(
    ch: Character,
    seat: Seat,
    mode: 'work' | 'rest',
  ): boolean {
    if (!this.isSeatValidForAgent(ch, seat, mode)) return false;
    const candidates = this.getSeatCandidatesForAgent(ch, mode);
    const bestPriority = candidates[0]?.priority ?? Number.POSITIVE_INFINITY;
    return this.getSeatPriorityForAgent(ch, seat, mode) <= bestPriority;
  }

  private chooseSeatForAgent(ch: Character, mode: 'work' | 'rest'): string | null {
    const preferredId = mode === 'work' ? ch.workSeatId : ch.restSeatId;
    const candidates = this.getSeatCandidatesForAgent(ch, mode);
    const bestPriority = candidates[0]?.priority ?? Number.POSITIVE_INFINITY;
    if (preferredId) {
      const preferred = this.seats.get(preferredId);
      if (
        preferred &&
        this.isSeatValidForAgent(ch, preferred, mode) &&
        this.getSeatPriorityForAgent(ch, preferred, mode) <= bestPriority
      ) {
        return preferredId;
      }
    }

    return candidates[0]?.id ?? null;
  }

  private findUnassignedSeatByMode(
    mode: 'work' | 'rest',
    projectKey: string | null = null,
  ): string | null {
    const candidates = [...this.seats.entries()]
      .filter(([, seat]) => {
        if (seat.assigned) return false;
        return this.isSeatModeMatch(seat, mode);
      })
      .map(([id, seat]) => ({
        id,
        priority: this.getSeatPriorityForProjectKey(projectKey, seat, mode),
      }))
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    return candidates[0]?.id ?? null;
  }

  private findRandomUnassignedSeatByMode(
    mode: 'work' | 'rest',
    projectKey: string | null = null,
  ): string | null {
    const rankedCandidates = [...this.seats.entries()]
      .filter(([, seat]) => !seat.assigned && this.isSeatModeMatch(seat, mode))
      .map(([id, seat]) => ({
        id,
        priority: this.getSeatPriorityForProjectKey(projectKey, seat, mode),
      }))
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const bestPriority = rankedCandidates[0]?.priority;
    const candidates = rankedCandidates.filter((candidate) => candidate.priority === bestPriority);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)]?.id ?? null;
  }

  private getBestUnassignedSeatPriority(mode: 'work' | 'rest', projectKey: string | null): number {
    let best = Number.POSITIVE_INFINITY;
    for (const seat of this.seats.values()) {
      if (seat.assigned || !this.isSeatModeMatch(seat, mode)) continue;
      best = Math.min(best, this.getSeatPriorityForProjectKey(projectKey, seat, mode));
    }
    return best;
  }

  private snapCharacterToSeat(ch: Character, seat: Seat): void {
    ch.tileCol = seat.seatCol;
    ch.tileRow = seat.seatRow;
    ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
    ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
    ch.dir = seat.facingDir;
    ch.path = [];
    ch.moveProgress = 0;
  }

  private assignSeatToCharacter(
    ch: Character,
    seatId: string,
    mode: 'work' | 'rest',
    snap = false,
  ): void {
    const seat = this.seats.get(seatId);
    if (!seat) return;
    this.releaseCurrentSeat(ch);
    seat.assigned = true;
    ch.seatId = seatId;
    if (mode === 'work') {
      ch.workSeatId = seatId;
    } else {
      ch.restSeatId = seatId;
    }
    if (snap) {
      this.snapCharacterToSeat(ch, seat);
      ch.state = mode === 'work' && ch.isActive ? CharacterState.TYPE : CharacterState.IDLE;
      return;
    }
    this.sendToSeat(ch.id);
  }

  private clearInvalidSeatPreference(ch: Character, mode: 'work' | 'rest'): void {
    const seatId = mode === 'work' ? ch.workSeatId : ch.restSeatId;
    if (!seatId) return;
    const seat = this.seats.get(seatId);
    if (!seat || !this.isSeatValidForAgent(ch, seat, mode)) {
      if (mode === 'work') {
        ch.workSeatId = null;
      } else {
        ch.restSeatId = null;
      }
    }
  }

  private keepActiveAgentNonTyping(ch: Character): void {
    this.releaseCurrentSeat(ch);
    ch.path = [];
    ch.moveProgress = 0;
    if (ch.state === CharacterState.TYPE) {
      ch.state = CharacterState.IDLE;
      ch.frame = 0;
      ch.frameTimer = 0;
    }
    if (!this.isCharacterOnWalkableTile(ch)) {
      this.relocateCharacterToWalkable(ch);
    }
  }

  repairSeatingAssignments(reason: 'layout' | 'active' | 'idle' | 'manual' | 'tick'): void {
    const snap = reason === 'layout';
    for (const seat of this.seats.values()) {
      seat.assigned = false;
    }

    const topLevelCharacters = [...this.characters.values()]
      .filter((ch) => this.isTopLevelCharacter(ch))
      .sort((a, b) => a.id - b.id);

    for (const ch of topLevelCharacters) {
      const mode = ch.isActive ? 'work' : 'rest';
      const seat = ch.seatId ? this.seats.get(ch.seatId) : undefined;
      if (seat && !seat.assigned && this.shouldKeepAssignedSeatForAgent(ch, seat, mode)) {
        seat.assigned = true;
        if (mode === 'work') ch.workSeatId = ch.seatId;
        if (mode === 'rest') ch.restSeatId = ch.seatId;
        if (snap) {
          this.snapCharacterToSeat(ch, seat);
          ch.state = mode === 'work' && ch.isActive ? CharacterState.TYPE : CharacterState.IDLE;
        }
        continue;
      }
      ch.seatId = null;
      ch.path = [];
      ch.moveProgress = 0;
      if (ch.state === CharacterState.TYPE) {
        ch.state = CharacterState.IDLE;
      }
    }

    for (const ch of topLevelCharacters) {
      this.clearInvalidSeatPreference(ch, 'work');
      this.clearInvalidSeatPreference(ch, 'rest');
      if (ch.isActive) {
        if (ch.seatId) continue;
        const workSeatId = this.chooseSeatForAgent(ch, 'work');
        if (workSeatId) {
          this.assignSeatToCharacter(ch, workSeatId, 'work', snap);
        } else {
          this.keepActiveAgentNonTyping(ch);
        }
      } else {
        if (ch.seatId) continue;
        const restSeatId = this.chooseSeatForAgent(ch, 'rest');
        if (restSeatId) {
          this.assignSeatToCharacter(ch, restSeatId, 'rest', snap);
        } else if (!this.isCharacterOnWalkableTile(ch)) {
          this.relocateCharacterToWalkable(ch);
        }
      }
    }

    for (const ch of this.characters.values()) {
      if (!ch.isSubagent) continue;
      if (!this.isCharacterOnWalkableTile(ch)) {
        this.relocateCharacterToWalkable(ch);
      }
    }

    this.rebuildFurnitureInstances();
  }

  randomizeTopLevelSeats(): void {
    const topLevelCharacters = [...this.characters.values()]
      .filter((ch) => this.isTopLevelCharacter(ch))
      .sort(() => Math.random() - 0.5);

    for (const seat of this.seats.values()) {
      seat.assigned = false;
    }
    for (const ch of topLevelCharacters) {
      ch.seatId = null;
      if (ch.isActive) {
        ch.workSeatId = null;
      } else {
        ch.restSeatId = null;
      }
      ch.path = [];
      ch.moveProgress = 0;
      if (ch.state === CharacterState.TYPE) {
        ch.state = CharacterState.IDLE;
      }
    }

    for (const ch of topLevelCharacters) {
      const mode = ch.isActive ? 'work' : 'rest';
      const seatId = this.findRandomUnassignedSeatByMode(mode, deriveAgentProjectKey(ch));
      if (seatId) {
        this.assignSeatToCharacter(ch, seatId, mode, true);
      } else if (ch.isActive) {
        this.keepActiveAgentNonTyping(ch);
      } else if (!this.isCharacterOnWalkableTile(ch)) {
        this.relocateCharacterToWalkable(ch);
      }
    }

    for (const ch of this.characters.values()) {
      if (!ch.isSubagent) continue;
      if (!this.isCharacterOnWalkableTile(ch)) {
        this.relocateCharacterToWalkable(ch);
      }
    }

    this.rebuildFurnitureInstances();
  }

  private getIdleWalkableTiles(): Array<{ col: number; row: number }> {
    const seatTiles = getSeatTiles(this.seats);
    const workSeatTiles = new Set<string>();
    for (const seat of this.seats.values()) {
      if (seat.seatKind !== 'work') continue;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          workSeatTiles.add(`${seat.seatCol + dc},${seat.seatRow + dr}`);
        }
      }
    }
    const nonWorkSeatTiles = this.walkableTiles.filter(
      (tile) =>
        !seatTiles.has(`${tile.col},${tile.row}`) && !workSeatTiles.has(`${tile.col},${tile.row}`),
    );
    const nonWorkTiles = nonWorkSeatTiles.filter(
      (tile) => inferTileZone(this.layout, tile.col, tile.row).zone !== 'work',
    );
    if (nonWorkTiles.length > 0) return nonWorkTiles;
    return nonWorkSeatTiles.length > 0 ? nonWorkSeatTiles : this.walkableTiles;
  }

  private getIdleWalkableTilesForCharacter(ch: Character): Array<{ col: number; row: number }> {
    if (!this.layout.projectRooms || this.layout.projectRooms.length === 0 || ch.isSubagent) {
      return this.idleWalkableTiles;
    }
    const projectKey = deriveAgentProjectKey(ch);
    const rankedTiles = this.idleWalkableTiles
      .map((tile) => ({
        tile,
        priority: seatPriorityForProjectKey(
          this.layout,
          projectKey,
          { seatCol: tile.col, seatRow: tile.row },
          'rest',
        ),
      }))
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          manhattan(a.tile, { col: ch.tileCol, row: ch.tileRow }) -
            manhattan(b.tile, { col: ch.tileCol, row: ch.tileRow }),
      );
    const bestPriority = rankedTiles[0]?.priority;
    const localTiles = rankedTiles
      .filter((candidate) => candidate.priority === bestPriority)
      .map((candidate) => candidate.tile);
    return localTiles.length > 0 ? localTiles : this.idleWalkableTiles;
  }

  private getUpdateSeatsForCharacter(ch: Character): Map<string, Seat> {
    if (
      ch.isActive ||
      ch.isSubagent ||
      !this.layout.projectRooms ||
      this.layout.projectRooms.length === 0
    ) {
      return this.seats;
    }
    const projectKey = deriveAgentProjectKey(ch);
    const restCandidates = [...this.seats.entries()]
      .filter(([, seat]) => seat.seatKind === 'rest')
      .map(([id, seat]) => ({
        id,
        seat,
        priority: this.getSeatPriorityForProjectKey(projectKey, seat, 'rest'),
      }))
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const bestPriority = restCandidates[0]?.priority;
    const localRestSeats = restCandidates.filter(
      (candidate) =>
        candidate.priority === bestPriority ||
        candidate.id === ch.seatId ||
        candidate.id === ch.restSeatId,
    );
    if (localRestSeats.length === 0) return this.seats;
    return new Map(localRestSeats.map((candidate) => [candidate.id, candidate.seat]));
  }

  setMeetingTeam(teamName: string | null): void {
    if (this.meetingTeamName === teamName) return;
    this.meetingTeamName = teamName;
    if (!teamName) return;

    const targets = this.getMeetingWalkableTiles();
    if (targets.length === 0) return;

    let index = 0;
    for (const ch of this.characters.values()) {
      if (ch.teamName !== teamName || ch.isActive || ch.isSubagent || ch.matrixEffect) continue;
      const target = targets[index % targets.length];
      index++;
      this.walkCharacterToTile(ch, target.col, target.row);
    }
  }

  private getMeetingWalkableTiles(): Array<{ col: number; row: number }> {
    const meetingTiles = this.idleWalkableTiles.filter(
      (tile) => inferTileZone(this.layout, tile.col, tile.row).zone === 'meeting',
    );
    const restTiles = this.idleWalkableTiles.filter((tile) => {
      const zone = inferTileZone(this.layout, tile.col, tile.row).zone;
      return zone === 'rest' || zone === 'neutral';
    });
    const nonWorkTiles = this.idleWalkableTiles.filter(
      (tile) => inferTileZone(this.layout, tile.col, tile.row).zone !== 'work',
    );
    const candidates =
      meetingTiles.length > 0
        ? meetingTiles
        : restTiles.length > 0
          ? restTiles
          : nonWorkTiles.length > 0
            ? nonWorkTiles
            : this.idleWalkableTiles;
    if (candidates.length <= 6) return candidates;

    const center = this.getTileCentroid(candidates);
    return candidates
      .slice()
      .sort((a, b) => manhattan(a, center) - manhattan(b, center))
      .slice(0, 10);
  }

  private getTileCentroid(tiles: Array<{ col: number; row: number }>): {
    col: number;
    row: number;
  } {
    const sum = tiles.reduce(
      (acc, tile) => ({ col: acc.col + tile.col, row: acc.row + tile.row }),
      { col: 0, row: 0 },
    );
    return {
      col: Math.round(sum.col / tiles.length),
      row: Math.round(sum.row / tiles.length),
    };
  }

  private walkCharacterToTile(ch: Character, col: number, row: number): boolean {
    if (!isWalkable(col, row, this.tileMap, this.blockedTiles)) return false;
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, col, row, this.tileMap, this.blockedTiles),
    );
    if (path.length === 0) return false;
    ch.path = path;
    ch.moveProgress = 0;
    ch.state = CharacterState.WALK;
    ch.frame = 0;
    ch.frameTimer = 0;
    return true;
  }

  /**
   * Pick a diverse palette for a new agent based on currently active agents.
   * First 6 agents each get a unique skin (random order). Beyond 6, skins
   * repeat in balanced rounds with a random hue shift (≥45°).
   */
  private pickDiversePalette(): { palette: number; hueShift: number } {
    // Count how many non-sub-agents use each base palette (0-5)
    const paletteCount = getLoadedCharacterCount();
    const counts = new Array(paletteCount).fill(0) as number[];
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue;
      if (ch.palette < paletteCount) counts[ch.palette]++;
    }
    const minCount = Math.min(...counts);
    // Available = palettes at the minimum count (least used)
    const available: number[] = [];
    for (let i = 0; i < paletteCount; i++) {
      if (counts[i] === minCount) available.push(i);
    }
    const palette = available[Math.floor(Math.random() * available.length)];
    // First round (minCount === 0): no hue shift. Subsequent rounds: random ≥45°.
    let hueShift = 0;
    if (minCount > 0) {
      hueShift = HUE_SHIFT_MIN_DEG + Math.floor(Math.random() * HUE_SHIFT_RANGE_DEG);
    }
    return { palette, hueShift };
  }

  addAgent(
    id: number,
    preferredPalette?: number,
    preferredHueShift?: number,
    preferredSeatId?: string,
    skipSpawnEffect?: boolean,
    folderName?: string,
    initialActive = true,
    randomizeInitialSeat = false,
    projectDir?: string,
    projectName?: string,
  ): void {
    if (this.characters.has(id)) return;

    let palette: number;
    let hueShift: number;
    if (preferredPalette !== undefined) {
      palette = preferredPalette;
      hueShift = preferredHueShift ?? 0;
    } else {
      const pick = this.pickDiversePalette();
      palette = pick.palette;
      hueShift = pick.hueShift;
    }

    // Persisted seats are preferences. Only valid workstation seats can seed active agents.
    let seatId: string | null = null;
    const initialMode = initialActive ? 'work' : 'rest';
    const projectKey = deriveAgentProjectKey({ folderName, projectDir, projectName });
    if (!randomizeInitialSeat && preferredSeatId && this.seats.has(preferredSeatId)) {
      const seat = this.seats.get(preferredSeatId)!;
      if (
        !seat.assigned &&
        this.isSeatModeMatch(seat, initialMode) &&
        this.getSeatPriorityForProjectKey(projectKey, seat, initialMode) <=
          this.getBestUnassignedSeatPriority(initialMode, projectKey)
      ) {
        seatId = preferredSeatId;
      }
    }
    if (!seatId) {
      seatId = randomizeInitialSeat
        ? this.findRandomUnassignedSeatByMode(initialMode, projectKey)
        : this.findUnassignedSeatByMode(initialMode, projectKey);
    }

    let ch: Character;
    if (seatId) {
      const seat = this.seats.get(seatId)!;
      seat.assigned = true;
      ch = createCharacter(id, palette, seatId, seat, hueShift);
      ch.isActive = initialActive;
      ch.workSeatId = seat.seatKind === 'work' ? seatId : null;
      ch.restSeatId = seat.seatKind === 'rest' ? seatId : null;
      if (!initialActive) {
        ch.state = CharacterState.IDLE;
        ch.wanderLimit = this.randomShortIdleWanderLimit();
      }
    } else {
      // No seats: spawn inactive agents in the rest zone when possible.
      const spawnTiles = initialActive ? this.walkableTiles : this.idleWalkableTiles;
      const spawn =
        spawnTiles.length > 0
          ? spawnTiles[Math.floor(Math.random() * spawnTiles.length)]
          : { col: 1, row: 1 };
      ch = createCharacter(id, palette, null, null, hueShift);
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
      ch.tileCol = spawn.col;
      ch.tileRow = spawn.row;
      ch.isActive = initialActive;
      ch.state = CharacterState.IDLE;
      ch.workSeatId = null;
      ch.restSeatId = null;
      if (!initialActive) {
        ch.wanderLimit = this.randomShortIdleWanderLimit();
      }
    }

    if (folderName) {
      ch.folderName = folderName;
    }
    if (projectDir) {
      ch.projectDir = projectDir;
    }
    if (projectName) {
      ch.projectName = projectName;
    }
    if (!skipSpawnEffect) {
      ch.matrixEffect = 'spawn';
      ch.matrixEffectTimer = 0;
      ch.matrixEffectSeeds = matrixEffectSeeds();
    }
    this.characters.set(id, ch);
    this.repairSeatingAssignments(initialActive ? 'active' : 'idle');
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    if (ch.matrixEffect === 'despawn') return; // already despawning
    // Free seat and clear selection immediately
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId);
      if (seat) seat.assigned = false;
    }
    if (this.selectedAgentId === id) this.selectedAgentId = null;
    if (this.cameraFollowId === id) this.cameraFollowId = null;
    // Start despawn animation instead of immediate delete
    ch.matrixEffect = 'despawn';
    ch.matrixEffectTimer = 0;
    ch.matrixEffectSeeds = matrixEffectSeeds();
    ch.bubbleType = null;
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of this.seats) {
      if (seat.seatCol === col && seat.seatRow === row) return uid;
    }
    return null;
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId);
    if (!ch || ch.isSubagent) return;
    const seat = this.seats.get(seatId);
    const mode = ch.isActive ? 'work' : 'rest';
    if (!seat || !this.isSeatValidForAgent(ch, seat, mode)) return;
    this.assignSeatToCharacter(ch, seatId, mode);
    this.repairSeatingAssignments('manual');
  }

  private releaseCurrentSeat(ch: Character): void {
    if (!ch.seatId) return;
    const current = this.seats.get(ch.seatId);
    if (current) current.assigned = false;
    ch.seatId = null;
  }

  /** Send an agent back to their currently assigned seat */
  sendToSeat(agentId: number): void {
    const ch = this.characters.get(agentId);
    if (!ch || !ch.seatId) return;
    const seat = this.seats.get(ch.seatId);
    if (!seat) return;
    const mode = ch.isActive ? 'work' : 'rest';
    if (!ch.isSubagent && !this.isSeatValidForAgent(ch, seat, mode)) {
      this.releaseCurrentSeat(ch);
      return;
    }
    const path = this.withTilesUnblocked([this.seatKey(seat)], () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else if (ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
      // Already at seat: sit down
      ch.state =
        ch.isSubagent || !ch.isActive || seat.seatKind === 'work'
          ? CharacterState.TYPE
          : CharacterState.IDLE;
      ch.dir = seat.facingDir;
      ch.frame = 0;
      ch.frameTimer = 0;
      if (!ch.isActive) {
        if (ch.seatTimer < 0) {
          ch.seatTimer = 0;
        } else {
          ch.seatTimer = this.randomRestSeatDuration();
        }
      }
    } else {
      ch.state = CharacterState.IDLE;
      ch.frame = 0;
      ch.frameTimer = 0;
    }
  }

  /** Walk an agent to an arbitrary walkable tile (right-click command) */
  walkToTile(agentId: number, col: number, row: number): boolean {
    const ch = this.characters.get(agentId);
    if (!ch || ch.isSubagent) return false;
    if (!isWalkable(col, row, this.tileMap, this.blockedTiles)) {
      // Also allow walking to own seat tile (blocked for others but not self)
      const key = this.ownSeatKey(ch);
      if (!key || key !== `${col},${row}`) return false;
    }
    return this.walkCharacterToTile(ch, col, row);
  }

  /** Create a sub-agent character with the parent's palette. Returns the sub-agent ID. */
  addSubagent(parentAgentId: number, parentToolId: string): number {
    const key = `${parentAgentId}:${parentToolId}`;
    if (this.subagentIdMap.has(key)) return this.subagentIdMap.get(key)!;

    const id = this.nextSubagentId--;
    const parentCh = this.characters.get(parentAgentId);
    const palette = parentCh ? parentCh.palette : 0;
    const hueShift = parentCh ? parentCh.hueShift : 0;

    // Find the closest walkable tile to the parent, avoiding tiles occupied by other characters
    const parentCol = parentCh ? parentCh.tileCol : 0;
    const parentRow = parentCh ? parentCh.tileRow : 0;
    const dist = (c: number, r: number) => Math.abs(c - parentCol) + Math.abs(r - parentRow);

    // Build set of tiles occupied by existing characters
    const occupiedTiles = new Set<string>();
    for (const [, other] of this.characters) {
      occupiedTiles.add(`${other.tileCol},${other.tileRow}`);
    }

    let spawn = { col: parentCol, row: parentRow };
    if (this.walkableTiles.length > 0) {
      let closest = this.walkableTiles[0];
      let closestDist = Infinity;
      for (const tile of this.walkableTiles) {
        if (occupiedTiles.has(`${tile.col},${tile.row}`)) continue;
        const d = dist(tile.col, tile.row);
        if (d < closestDist) {
          closest = tile;
          closestDist = d;
        }
      }
      spawn = closest;
    }

    const ch = createCharacter(id, palette, null, null, hueShift);
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    // Face the same direction as the parent agent
    if (parentCh) ch.dir = parentCh.dir;
    ch.isSubagent = true;
    ch.parentAgentId = parentAgentId;
    ch.matrixEffect = 'spawn';
    ch.matrixEffectTimer = 0;
    ch.matrixEffectSeeds = matrixEffectSeeds();
    this.characters.set(id, ch);

    this.subagentIdMap.set(key, id);
    this.subagentMeta.set(id, { parentAgentId, parentToolId });
    return id;
  }

  /** Remove a specific sub-agent character and free its seat */
  removeSubagent(parentAgentId: number, parentToolId: string): void {
    const key = `${parentAgentId}:${parentToolId}`;
    const id = this.subagentIdMap.get(key);
    if (id === undefined) return;

    const ch = this.characters.get(id);
    if (ch) {
      if (ch.matrixEffect === 'despawn') {
        // Already despawning — just clean up maps
        this.subagentIdMap.delete(key);
        this.subagentMeta.delete(id);
        return;
      }
      if (ch.seatId) {
        const seat = this.seats.get(ch.seatId);
        if (seat) seat.assigned = false;
      }
      // Start despawn animation — keep character in map for rendering
      ch.matrixEffect = 'despawn';
      ch.matrixEffectTimer = 0;
      ch.matrixEffectSeeds = matrixEffectSeeds();
      ch.bubbleType = null;
    }
    // Clean up tracking maps immediately so keys don't collide
    this.subagentIdMap.delete(key);
    this.subagentMeta.delete(id);
    if (this.selectedAgentId === id) this.selectedAgentId = null;
    if (this.cameraFollowId === id) this.cameraFollowId = null;
  }

  /** Remove all sub-agents belonging to a parent agent */
  removeAllSubagents(parentAgentId: number): void {
    const toRemove: string[] = [];
    for (const [key, id] of this.subagentIdMap) {
      const meta = this.subagentMeta.get(id);
      if (meta && meta.parentAgentId === parentAgentId) {
        const ch = this.characters.get(id);
        if (ch) {
          if (ch.matrixEffect === 'despawn') {
            // Already despawning — just clean up maps
            this.subagentMeta.delete(id);
            toRemove.push(key);
            continue;
          }
          if (ch.seatId) {
            const seat = this.seats.get(ch.seatId);
            if (seat) seat.assigned = false;
          }
          // Start despawn animation
          ch.matrixEffect = 'despawn';
          ch.matrixEffectTimer = 0;
          ch.matrixEffectSeeds = matrixEffectSeeds();
          ch.bubbleType = null;
        }
        this.subagentMeta.delete(id);
        if (this.selectedAgentId === id) this.selectedAgentId = null;
        if (this.cameraFollowId === id) this.cameraFollowId = null;
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      this.subagentIdMap.delete(key);
    }
  }

  /** Look up the sub-agent character ID for a given parent+toolId, or null */
  getSubagentId(parentAgentId: number, parentToolId: string): number | null {
    return this.subagentIdMap.get(`${parentAgentId}:${parentToolId}`) ?? null;
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    if (!active && !ch.isSubagent && ch.delegation?.isActive) {
      ch.isActive = true;
      ch.delegationDrivesActive = true;
      ch.currentTool = SUPERVISION_TOOL_NAME;
      ch.seatTimer = 0;
      this.repairSeatingAssignments('active');
      return;
    }
    if (active && !ch.isSubagent) {
      ch.delegationDrivesActive = false;
    }
    ch.isActive = active;
    if (ch.isSubagent) {
      if (active && ch.state === CharacterState.IDLE) {
        ch.state = CharacterState.TYPE;
      } else if (!active) {
        ch.currentTool = null;
        ch.state = CharacterState.IDLE;
      }
      this.rebuildFurnitureInstances();
      return;
    }

    if (!active) {
      ch.path = [];
      ch.moveProgress = 0;
      ch.currentTool = null;
      ch.state = CharacterState.IDLE;
      ch.frame = 0;
      ch.frameTimer = 0;
      ch.seatTimer = 0;
      ch.wanderTimer = 0;
      ch.wanderLimit = this.randomShortIdleWanderLimit();
      this.repairSeatingAssignments('idle');
    } else {
      ch.seatTimer = 0;
      this.repairSeatingAssignments('active');
    }
  }

  setAgentDelegation(id: number, delegation: DelegationVisualState | undefined): void {
    const ch = this.characters.get(id);
    if (!ch || ch.isSubagent) return;
    const wasDelegationDriven = ch.delegationDrivesActive;
    const wasActiveDelegation = ch.delegation?.isActive === true;
    ch.delegation = delegation;

    if (delegation?.isActive) {
      if (!ch.isActive) {
        ch.delegationDrivesActive = true;
      }
      ch.isActive = true;
      ch.currentTool = ch.currentTool ?? SUPERVISION_TOOL_NAME;
      ch.seatTimer = 0;
      this.repairSeatingAssignments('active');
      return;
    }

    if (ch.currentTool === SUPERVISION_TOOL_NAME) {
      ch.currentTool = null;
    }
    ch.delegationDrivesActive = false;
    if (wasDelegationDriven) {
      ch.isActive = false;
      ch.path = [];
      ch.moveProgress = 0;
      ch.state = CharacterState.IDLE;
      ch.frame = 0;
      ch.frameTimer = 0;
      ch.seatTimer = 0;
      ch.wanderTimer = 0;
      ch.wanderLimit = this.randomShortIdleWanderLimit();
      this.repairSeatingAssignments('idle');
    } else if (wasActiveDelegation) {
      this.repairSeatingAssignments(ch.isActive ? 'active' : 'idle');
    } else {
      this.rebuildFurnitureInstances();
    }
  }

  /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
  private rebuildFurnitureInstances(): void {
    // Collect the closest on-capable furniture each active agent is facing.
    const autoOnFurnitureUids = new Set<string>();
    for (const ch of this.characters.values()) {
      if (!ch.isActive || !ch.seatId) continue;
      const seat = this.seats.get(ch.seatId);
      if (!seat) continue;
      const uid = this.findNearestFacedOnCapableFurniture(seat);
      if (uid) autoOnFurnitureUids.add(uid);
    }

    if (autoOnFurnitureUids.size === 0) {
      this.furniture = layoutToFurnitureInstances(this.layout.furniture);
      return;
    }

    // Build modified furniture list with auto-state and animation applied
    const animFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    const modifiedFurniture: PlacedFurniture[] = this.layout.furniture.map((item) => {
      const entry = getCatalogEntry(item.type);
      if (!entry) return item;
      if (autoOnFurnitureUids.has(item.uid)) {
        let onType = getOnStateType(item.type);
        if (onType !== item.type) {
          const frames = getAnimationFrames(onType);
          if (frames && frames.length > 1) {
            const frameIdx = animFrame % frames.length;
            onType = frames[frameIdx];
          }
          return { ...item, type: onType };
        }
      }
      return item;
    });

    this.furniture = layoutToFurnitureInstances(modifiedFurniture);
  }

  private findNearestFacedOnCapableFurniture(seat: Seat): string | null {
    const tileScores = this.getFacedAutoOnTileScores(seat);
    let bestUid: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const item of this.layout.furniture) {
      if (getOnStateType(item.type) === item.type) continue;
      const entry = getCatalogEntry(item.type);
      if (!entry) continue;

      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          const score = tileScores.get(`${item.col + dc},${item.row + dr}`);
          if (score === undefined || score >= bestScore) continue;
          bestScore = score;
          bestUid = item.uid;
        }
      }
    }

    return bestUid;
  }

  private randomRestSeatDuration(): number {
    return SEAT_REST_MIN_SEC + Math.random() * (SEAT_REST_MAX_SEC - SEAT_REST_MIN_SEC);
  }

  private randomShortIdleWanderLimit(): number {
    return 1 + Math.floor(Math.random() * 4);
  }

  private nudgeInactiveStandingOffSeats(ch: Character): void {
    if (ch.isActive || ch.state === CharacterState.TYPE || ch.path.length > 0) return;
    if (!this.getSeatAtTile(ch.tileCol, ch.tileRow)) return;
    const target = this.findNearestIdleFloorTile(ch.tileCol, ch.tileRow);
    if (!target) return;
    ch.tileCol = target.col;
    ch.tileRow = target.row;
    ch.x = target.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = target.row * TILE_SIZE + TILE_SIZE / 2;
  }

  private findNearestIdleFloorTile(col: number, row: number): { col: number; row: number } | null {
    let best: { col: number; row: number } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const tile of this.idleWalkableTiles) {
      const distance = Math.abs(tile.col - col) + Math.abs(tile.row - row);
      if (distance >= bestDistance) continue;
      best = tile;
      bestDistance = distance;
    }
    return best;
  }

  private getFacedAutoOnTileScores(seat: Seat): Map<string, number> {
    const scores = new Map<string, number>();
    const dCol =
      seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0;
    const dRow = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0;
    const lateralCol = dRow !== 0 ? 1 : 0;
    const lateralRow = dCol !== 0 ? 1 : 0;

    for (let forward = 1; forward <= AUTO_ON_FACING_DEPTH; forward++) {
      for (let lateral = -AUTO_ON_SIDE_DEPTH; lateral <= AUTO_ON_SIDE_DEPTH; lateral++) {
        const col = seat.seatCol + dCol * forward + lateralCol * lateral;
        const row = seat.seatRow + dRow * forward + lateralRow * lateral;
        const score = forward * 10 + Math.abs(lateral);
        const key = `${col},${row}`;
        const previous = scores.get(key);
        if (previous === undefined || score < previous) {
          scores.set(key, score);
        }
      }
    }

    return scores;
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.currentTool = tool;
    }
  }

  showPermissionBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'permission';
      ch.bubbleTimer = 0;
    }
  }

  clearPermissionBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch && ch.bubbleType === 'permission') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    }
  }

  showWaitingBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'waiting';
      ch.bubbleTimer = WAITING_BUBBLE_DURATION_SEC;
    }
  }

  /** Dismiss bubble on click — permission: instant, waiting: quick fade */
  dismissBubble(id: number): void {
    const ch = this.characters.get(id);
    if (!ch || !ch.bubbleType) return;
    if (ch.bubbleType === 'permission') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    } else if (ch.bubbleType === 'waiting') {
      // Trigger immediate fade (0.3s remaining)
      ch.bubbleTimer = Math.min(ch.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC);
    }
  }

  setTeamInfo(
    id: number,
    teamName?: string,
    agentName?: string,
    isTeamLead?: boolean,
    leadAgentId?: number,
    teamUsesTmux?: boolean,
  ): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    ch.teamName = teamName;
    ch.agentName = agentName;
    ch.isTeamLead = isTeamLead;
    ch.leadAgentId = leadAgentId;
    if (teamUsesTmux !== undefined) {
      ch.teamUsesTmux = teamUsesTmux;
    }
  }

  setAgentTokens(
    id: number,
    inputTokens: number,
    outputTokens: number,
    estimated = false,
    artifactOutputTokens = 0,
    details?: TokenUsageDetails,
    codexRateLimit?: TokenRateLimitSnapshot,
  ): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    ch.inputTokens = inputTokens;
    ch.outputTokens = outputTokens;
    ch.artifactOutputTokens = artifactOutputTokens;
    ch.tokenUsageEstimated = estimated;
    ch.tokenUsageDetails = details;
    ch.codexRateLimit = codexRateLimit;
  }

  update(dt: number): void {
    // Furniture animation cycling
    const prevFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    this.furnitureAnimTimer += dt;
    const newFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    if (newFrame !== prevFrame) {
      this.rebuildFurnitureInstances();
    }

    const toDelete: number[] = [];
    for (const ch of this.characters.values()) {
      // Handle matrix effect animation
      if (ch.matrixEffect) {
        ch.matrixEffectTimer += dt;
        if (ch.matrixEffectTimer >= MATRIX_EFFECT_DURATION) {
          if (ch.matrixEffect === 'spawn') {
            // Spawn complete — clear effect, resume normal FSM
            ch.matrixEffect = null;
            ch.matrixEffectTimer = 0;
            ch.matrixEffectSeeds = [];
          } else {
            // Despawn complete — mark for deletion
            toDelete.push(ch.id);
          }
        }
        continue; // skip normal FSM while effect is active
      }

      // Temporarily unblock own seat so character can pathfind to it
      const wanderTiles = ch.isActive
        ? this.walkableTiles
        : this.getIdleWalkableTilesForCharacter(ch);
      const updateSeats = this.getUpdateSeatsForCharacter(ch);
      this.withOwnSeatUnblocked(ch, () =>
        updateCharacter(ch, dt, wanderTiles, updateSeats, this.tileMap, this.blockedTiles),
      );
      this.nudgeInactiveStandingOffSeats(ch);

      // Tick bubble timer for waiting bubbles
      if (ch.bubbleType === 'waiting') {
        ch.bubbleTimer -= dt;
        if (ch.bubbleTimer <= 0) {
          ch.bubbleType = null;
          ch.bubbleTimer = 0;
        }
      }
    }
    // Remove characters that finished despawn
    for (const id of toDelete) {
      this.characters.delete(id);
    }
  }

  getCharacters(): Character[] {
    return Array.from(this.characters.values());
  }

  /** Get character at pixel position (for hit testing). Returns id or null. */
  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = this.getCharacters().sort((a, b) => b.y - a.y);
    for (const ch of chars) {
      // Skip characters that are despawning
      if (ch.matrixEffect === 'despawn') continue;
      // Character sprite is 16x24, anchored bottom-center
      // Apply sitting offset to match visual position
      const sittingOffset = isCharacterSeated(ch) ? CHARACTER_SITTING_OFFSET_PX : 0;
      const anchorY = ch.y + sittingOffset;
      const left = ch.x - CHARACTER_HIT_HALF_WIDTH;
      const right = ch.x + CHARACTER_HIT_HALF_WIDTH;
      const top = anchorY - CHARACTER_HIT_HEIGHT;
      const bottom = anchorY;
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id;
      }
    }
    return null;
  }
}
