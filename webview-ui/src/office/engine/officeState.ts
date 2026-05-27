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
import { getLoadedCharacterCount } from '../sprites/spriteData.js';
import type {
  Character,
  FurnitureInstance,
  OfficeLayout,
  PlacedFurniture,
  Seat,
  TileType as TileTypeVal,
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
    this.layout = layout || createDefaultLayout();
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
    this.layout = layout;
    this.tileMap = layoutToTileMap(layout);
    this.seats = layoutToSeats(layout);
    this.blockedTiles = getBlockedTiles(layout.furniture);
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

    // Reassign characters to new seats, preserving existing assignments when possible
    for (const seat of this.seats.values()) {
      seat.assigned = false;
    }

    // First pass: try to keep characters at their existing seats
    for (const ch of this.characters.values()) {
      if (ch.seatId && this.seats.has(ch.seatId)) {
        const seat = this.seats.get(ch.seatId)!;
        const expectedKind = ch.isActive ? 'work' : 'rest';
        if (!seat.assigned && seat.seatKind === expectedKind) {
          seat.assigned = true;
          // Snap character to seat position
          ch.tileCol = seat.seatCol;
          ch.tileRow = seat.seatRow;
          const cx = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
          const cy = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
          ch.x = cx;
          ch.y = cy;
          ch.dir = seat.facingDir;
          if (seat.seatKind === 'work') ch.workSeatId = ch.seatId;
          if (seat.seatKind === 'rest') ch.restSeatId = ch.seatId;
          continue;
        }
      }
      ch.seatId = null; // will be reassigned below
    }

    // Second pass: assign remaining characters to free seats
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue;
      if (!ch.isActive) continue;
      const seatId = this.findFreeSeatByKind('work');
      if (seatId) {
        this.seats.get(seatId)!.assigned = true;
        ch.seatId = seatId;
        const seat = this.seats.get(seatId)!;
        ch.tileCol = seat.seatCol;
        ch.tileRow = seat.seatRow;
        ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
        ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
        ch.dir = seat.facingDir;
        if (seat.seatKind === 'work') ch.workSeatId = seatId;
        if (seat.seatKind === 'rest') ch.restSeatId = seatId;
      }
    }

    // Relocate any characters that ended up outside bounds or on non-walkable tiles
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue; // seated characters are fine
      if (
        ch.tileCol < 0 ||
        ch.tileCol >= layout.cols ||
        ch.tileRow < 0 ||
        ch.tileRow >= layout.rows
      ) {
        this.relocateCharacterToWalkable(ch);
      }
    }
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
    if (key) this.blockedTiles.delete(key);
    const result = fn();
    if (key) this.blockedTiles.add(key);
    return result;
  }

  private findFreeSeat(): string | null {
    return this.findFreeSeatByKind('work') ?? this.findFreeSeatByKind('rest');
  }

  private findFreeSeatByKind(kind: 'work' | 'rest'): string | null {
    const candidates: string[] = [];
    for (const [uid, seat] of this.seats) {
      if (seat.assigned) continue;
      if (seat.seatKind === kind) candidates.push(uid);
    }
    return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
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

    // Active agents begin at a work seat. Inactive/restored agents start roaming
    // in rest zones and only sit when their idle cycle decides to rest.
    let seatId: string | null = null;
    if (initialActive) {
      if (preferredSeatId && this.seats.has(preferredSeatId)) {
        const seat = this.seats.get(preferredSeatId)!;
        if (!seat.assigned && seat.seatKind === 'work') {
          seatId = preferredSeatId;
        }
      }
      if (!seatId) {
        seatId = this.findFreeSeatByKind('work') ?? this.findFreeSeat();
      }
    }

    let ch: Character;
    if (seatId) {
      const seat = this.seats.get(seatId)!;
      seat.assigned = true;
      ch = createCharacter(id, palette, seatId, seat, hueShift);
      ch.isActive = initialActive;
      ch.workSeatId = seat.seatKind === 'work' ? seatId : this.findFreeSeatByKind('work');
      ch.restSeatId = seat.seatKind === 'rest' ? seatId : this.findFreeSeatByKind('rest');
    } else {
      // No seats — spawn inactive agents in the rest zone when possible.
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
      ch.state = initialActive ? CharacterState.TYPE : CharacterState.IDLE;
      ch.workSeatId = this.findFreeSeatByKind('work');
      ch.restSeatId = this.findFreeSeatByKind('rest');
      if (!initialActive) {
        ch.wanderLimit = this.randomShortIdleWanderLimit();
      }
    }

    if (folderName) {
      ch.folderName = folderName;
    }
    if (!skipSpawnEffect) {
      ch.matrixEffect = 'spawn';
      ch.matrixEffectTimer = 0;
      ch.matrixEffectSeeds = matrixEffectSeeds();
    }
    this.characters.set(id, ch);
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
    if (!ch) return;
    // Assign new seat
    const seat = this.seats.get(seatId);
    if (!seat || seat.assigned) return;
    if (ch.isActive && seat.seatKind !== 'work') return;
    if (!ch.isActive && seat.seatKind !== 'rest') return;
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId);
      if (old) old.assigned = false;
    }
    seat.assigned = true;
    ch.seatId = seatId;
    if (seat.seatKind === 'work') {
      ch.workSeatId = seatId;
    } else {
      ch.restSeatId = seatId;
    }
    // Pathfind to new seat (unblock own seat tile for this query)
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else if (ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
      // Already at seat — sit down
      ch.state = CharacterState.TYPE;
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

  private switchAgentSeat(agentId: number, kind: 'work' | 'rest'): boolean {
    const ch = this.characters.get(agentId);
    if (!ch) return false;
    const targetId = kind === 'work' ? ch.workSeatId : ch.restSeatId;
    let nextSeatId: string | null = null;
    if (targetId) {
      const target = this.seats.get(targetId);
      if (target && (!target.assigned || ch.seatId === targetId) && target.seatKind === kind) {
        nextSeatId = targetId;
      }
    }
    if (!nextSeatId) {
      nextSeatId = this.findFreeSeatByKind(kind);
    }
    if (!nextSeatId) return false;
    if (nextSeatId === ch.seatId) return true;

    if (ch.seatId) {
      const current = this.seats.get(ch.seatId);
      if (current) current.assigned = false;
    }
    const nextSeat = this.seats.get(nextSeatId);
    if (!nextSeat || nextSeat.assigned) return false;
    nextSeat.assigned = true;
    ch.seatId = nextSeatId;
    if (kind === 'work') {
      ch.workSeatId = nextSeatId;
    } else {
      ch.restSeatId = nextSeatId;
    }
    return true;
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
    if (ch.isActive && seat.seatKind !== 'work') return;
    if (!ch.isActive && seat.seatKind !== 'rest') {
      this.releaseCurrentSeat(ch);
      return;
    }
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else if (ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
      // Already at seat — sit down
      ch.state = CharacterState.TYPE;
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
    if (ch) {
      ch.isActive = active;
      if (!active) {
        ch.path = [];
        ch.moveProgress = 0;
        ch.currentTool = null;
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.seatTimer = 0;
        ch.wanderTimer = 0;
        const shouldSitNow = Math.random() < 0.45;
        const hasRestSeat = shouldSitNow && this.switchAgentSeat(id, 'rest');
        const restSeat = hasRestSeat && ch.seatId ? this.seats.get(ch.seatId) : undefined;
        if (restSeat?.seatKind === 'rest') {
          this.sendToSeat(id);
        } else {
          this.releaseCurrentSeat(ch);
          ch.wanderLimit = this.randomShortIdleWanderLimit();
        }
      } else {
        const hasWorkSeat = this.switchAgentSeat(id, 'work');
        const seat = ch.seatId ? this.seats.get(ch.seatId) : undefined;
        if (hasWorkSeat && seat?.seatKind === 'work') {
          this.sendToSeat(id);
        } else {
          this.releaseCurrentSeat(ch);
          ch.state = CharacterState.IDLE;
        }
      }
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
  ): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    ch.inputTokens = inputTokens;
    ch.outputTokens = outputTokens;
    ch.artifactOutputTokens = artifactOutputTokens;
    ch.tokenUsageEstimated = estimated;
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
      const wanderTiles = ch.isActive ? this.walkableTiles : this.idleWalkableTiles;
      this.withOwnSeatUnblocked(ch, () =>
        updateCharacter(ch, dt, wanderTiles, this.seats, this.tileMap, this.blockedTiles),
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
