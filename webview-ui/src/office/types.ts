export {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MATRIX_EFFECT_DURATION_SEC as MATRIX_EFFECT_DURATION,
  MAX_COLS,
  MAX_ROWS,
  TILE_SIZE,
} from '../constants.js';

export const TileType = {
  WALL: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  FLOOR_5: 5,
  FLOOR_6: 6,
  FLOOR_7: 7,
  FLOOR_8: 8,
  FLOOR_9: 9,
  VOID: 255,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];
export type ZoneType = 'work' | 'rest' | 'meeting' | 'neutral';

/** Re-export ColorValue for consumers that import color types from office/types */
export type { ColorValue } from '../components/ui/types.js';
import type { ColorValue } from '../components/ui/types.js';

export const CharacterState = {
  IDLE: 'idle',
  WALK: 'walk',
  TYPE: 'type',
} as const;
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState];

export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

/** 2D array of hex color strings: '' = transparent, '#RRGGBB' = opaque, '#RRGGBBAA' = semi-transparent. [row][col] */
export type SpriteData = string[][];

export interface Seat {
  /** Chair furniture uid */
  uid: string;
  /** Tile col where agent sits */
  seatCol: number;
  /** Tile row where agent sits */
  seatRow: number;
  /** Direction character faces when sitting (toward adjacent desk) */
  facingDir: Direction;
  /** Work/rest classification derived from nearby computers or room zone. */
  seatKind: 'work' | 'rest';
  /** Why this seat was classified as work/rest. */
  zoneSource?: 'workstation' | 'computer-adjacent' | 'zone-paint' | 'default-split';
  assigned: boolean;
}

export interface FurnitureInstance {
  sprite: SpriteData;
  /** Pixel x (top-left) */
  x: number;
  /** Pixel y (top-left) */
  y: number;
  /** Y value used for depth sorting (typically bottom edge) */
  zY: number;
  /** Render-time horizontal flip flag (for mirrored side variants) */
  mirrored?: boolean;
}

export interface ToolActivity {
  toolId: string;
  status: string;
  done: boolean;
  permissionWait?: boolean;
}

export const EditTool = {
  TILE_PAINT: 'tile_paint',
  WALL_PAINT: 'wall_paint',
  FURNITURE_PLACE: 'furniture_place',
  FURNITURE_PICK: 'furniture_pick',
  SELECT: 'select',
  EYEDROPPER: 'eyedropper',
  ERASE: 'erase',
  ZONE_PAINT: 'zone_paint',
  ROOM: 'room',
} as const;
export type EditTool = (typeof EditTool)[keyof typeof EditTool];

export interface FurnitureCatalogEntry {
  type: string; // asset ID from furniture manifest
  label: string;
  footprintW: number;
  footprintH: number;
  sprite: SpriteData;
  isDesk: boolean;
  category?: string;
  /** Orientation from rotation group: 'front' | 'back' | 'left' | 'right' */
  orientation?: string;
  /** Whether this item can be placed on top of desk/table surfaces */
  canPlaceOnSurfaces?: boolean;
  /** Number of tile rows from the top of the footprint that are "background" (allow placement, still block walking). Default 0. */
  backgroundTiles?: number;
  /** Whether this item can be placed on wall tiles */
  canPlaceOnWalls?: boolean;
  /** Whether this is a side-oriented asset that produces a mirrored "left" variant */
  mirrorSide?: boolean;
}

export interface PlacedFurniture {
  uid: string;
  type: string; // asset ID from furniture manifest
  col: number;
  row: number;
  /** Optional color override for furniture */
  color?: ColorValue;
}

export const ProjectRoomKind = {
  PROJECT: 'project',
  PUBLIC: 'public',
  REST: 'rest',
  MEETING: 'meeting',
  UNASSIGNED: 'unassigned',
} as const;
export type ProjectRoomKind = (typeof ProjectRoomKind)[keyof typeof ProjectRoomKind];

export const ProjectIdentitySource = {
  PROJECT_DIR: 'projectDir',
  PROJECT_NAME: 'projectName',
  FOLDER_NAME: 'folderName',
  CWD_HASH: 'cwdHash',
  UNKNOWN: 'unknown',
} as const;
export type ProjectIdentitySource =
  (typeof ProjectIdentitySource)[keyof typeof ProjectIdentitySource];

export interface ProjectRoomBounds {
  col: number;
  row: number;
  width: number;
  height: number;
}

export interface ProjectRoomProjectKey {
  key: string;
  displayName: string;
  source: ProjectIdentitySource;
  providerIds?: string[];
  projectDirHash?: string;
}

export interface ProjectRoom {
  id: string;
  kind: ProjectRoomKind;
  bounds: ProjectRoomBounds;
  project?: ProjectRoomProjectKey;
  label?: string;
  color?: ColorValue;
  createdAtMs?: number;
  updatedAtMs?: number;
  /** Lounge-stamp revision for PUBLIC rooms: once set, generation never reasserts the lobby's lounge
   *  furniture, so the user's manual lobby edits survive reloads (same one-time-stamp pattern as the
   *  project-room template's -tpl- uids). */
  loungeRev?: number;
  /** Lobby width (tiles) the lounge furniture was last filled for. When ③c right-anchored growth
   *  widens the lobby, the new span's pods/decor are appended once (append-only, via
   *  ensureLobbyLoungeWidthFill) and this is re-stamped — WITHOUT bumping loungeRev, so manual lobby
   *  edits survive. undefined → baseline-stamped to the current width without adding anything. */
  loungeSpanWidth?: number;
  /** When a generated PROJECT room's project has no live agent, provisioning stamps the time it was
   *  first seen vacant (and clears it the moment the project returns). On the next reload a still-vacant
   *  room stamped before this session started becomes reclaimable, so its slot frees for a new project.
   *  See applyVacancyLifecycle in projectRoomGeneration. */
  vacatedAtMs?: number;
}

export interface OfficeLayout {
  version: 1;
  cols: number;
  rows: number;
  tiles: TileType[];
  furniture: PlacedFurniture[];
  /** Per-tile color settings, parallel to tiles array. null = wall/no color */
  tileColors?: Array<ColorValue | null>;
  /** Per-tile zone override. null/undefined falls back to default split. */
  zones?: Array<ZoneType | null>;
  /** Optional room metadata used to scope project-aware seating and future doorplates. */
  projectRooms?: ProjectRoom[];
  /** Bumped when the bundled default layout changes; forces a reset on existing installs */
  layoutRevision?: number;
}

export interface Character {
  id: number;
  state: CharacterState;
  dir: Direction;
  /** Pixel position */
  x: number;
  y: number;
  /** Current tile column */
  tileCol: number;
  /** Current tile row */
  tileRow: number;
  /** Remaining path steps (tile coords) */
  path: Array<{ col: number; row: number }>;
  /** 0-1 lerp between current tile and next tile */
  moveProgress: number;
  /** Current tool name for typing vs reading animation, or null */
  currentTool: string | null;
  /** Palette index (0-5) */
  palette: number;
  /** Hue shift in degrees (0 = no shift, ≥45 for repeated palettes) */
  hueShift: number;
  /** Animation frame index */
  frame: number;
  /** Time accumulator for animation */
  frameTimer: number;
  /** Timer for idle wander decisions */
  wanderTimer: number;
  /** Number of wander moves completed in current roaming cycle */
  wanderCount: number;
  /** Max wander moves before returning to seat for rest */
  wanderLimit: number;
  /** Whether the agent is actively working */
  isActive: boolean;
  /** Assigned seat uid, or null if no seat */
  seatId: string | null;
  /** Seat used when the agent is active/working */
  workSeatId: string | null;
  /** Seat used when the agent is idle/resting */
  restSeatId: string | null;
  /** True when the character is currently parked ON its own seat tile (not walking). Drives the
   *  seated sprite pose + sitting offset — position-based, so an agent only "sits" when actually on a
   *  seat, never standing on a sofa (idle on seat) or sitting in mid-air (TYPE on a floor tile). */
  seated: boolean;
  /** Active speech bubble type, or null if none showing */
  bubbleType: 'permission' | 'waiting' | null;
  /** Countdown timer for bubble (waiting: 2→0, permission: unused) */
  bubbleTimer: number;
  /** Timer to stay seated while inactive after seat reassignment (counts down to 0) */
  seatTimer: number;
  /** Whether this character represents a sub-agent (spawned by Task tool) */
  isSubagent: boolean;
  /** Parent agent ID if this is a sub-agent, null otherwise */
  parentAgentId: number | null;
  /** Active matrix spawn/despawn effect, or null */
  matrixEffect: 'spawn' | 'despawn' | null;
  /** Timer counting up from 0 to MATRIX_EFFECT_DURATION */
  matrixEffectTimer: number;
  /** Per-column random seeds (16 values) for staggered rain timing */
  matrixEffectSeeds: number[];
  /** Workspace folder name (only set for multi-root workspaces) */
  folderName?: string;
  /** Provider/project cwd when available. Used for project-room seating. */
  projectDir?: string;
  /** Safe provider/project display name when available. */
  projectName?: string;
  /** Source provider, e.g. codex or claude */
  providerId?: string;
  /** True when adopted from an external session (no extension-owned terminal). Used to gate the Kill
   *  action: an external non-codex agent has no terminal handle to dispose, so Kill can't work. */
  isExternal?: boolean;

  // -- Agent Teams --
  /** Team name this agent belongs to */
  teamName?: string;
  /** Role name within the team (null for lead) */
  agentName?: string;
  /** Whether this agent is the team lead */
  isTeamLead?: boolean;
  /** ID of the lead agent (set on teammates) */
  leadAgentId?: number;
  /** True when lead spawns teammates via tmux (run_in_background Agent calls) */
  teamUsesTmux?: boolean;
  /** Provider-agnostic supervisor delegation marker shown in office/canvas surfaces */
  delegation?: DelegationVisualState;
  /** Whether delegation temporarily promoted this otherwise-idle character to active. */
  delegationDrivesActive: boolean;
  /** Cumulative input tokens consumed */
  inputTokens: number;
  /** Cumulative output tokens consumed */
  outputTokens: number;
  /** Estimated generated artifact/code tokens; shown separately from API billing proxy. */
  artifactOutputTokens?: number;
  /** True when tokens are inferred from transcript text instead of provider usage fields */
  tokenUsageEstimated?: boolean;
  tokenUsageDetails?: TokenUsageDetails;
  codexRateLimit?: TokenRateLimitSnapshot;
}

export interface TokenUsageDetails {
  input: number;
  output: number;
  reasoningOutput: number;
  cacheRead: number;
  cacheWrite: number;
  artifactEstimate: number;
  estimated: boolean;
}

export interface TokenRateLimitSnapshot {
  name: 'primary' | 'secondary';
  usedPercent?: number;
  remainingPercent?: number;
  resetAtMs?: number;
  resetAfterSeconds?: number;
}

export type DelegationVisualStatus = 'delegating' | 'waiting_for_delegate' | 'delegate_error';
export type DelegationVisualSource =
  | 'terminal'
  | 'hook'
  | 'codex_app_worker'
  | 'claude_worker'
  | 'unknown';

export interface DelegationVisualState {
  status: DelegationVisualStatus;
  activeDelegateCount: number;
  completedDelegateCount: number;
  failedDelegateCount: number;
  totalDelegateCount: number;
  delegateSource: DelegationVisualSource;
  teamName?: string;
  /** True while at least one delegated worker is still active. */
  isActive: boolean;
}
