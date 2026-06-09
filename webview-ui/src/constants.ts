import type { ColorValue } from './components/ui/types.js';

// ── Grid & Layout ────────────────────────────────────────────
export const TILE_SIZE = 16;
export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 11;
export const MAX_COLS = 64;
export const MAX_ROWS = 64;

// ── Character Animation ─────────────────────────────────────
export const WALK_SPEED_PX_PER_SEC = 48;
export const WALK_FRAME_DURATION_SEC = 0.15;
export const TYPE_FRAME_DURATION_SEC = 0.3;
export const WANDER_PAUSE_MIN_SEC = 2.0;
export const WANDER_PAUSE_MAX_SEC = 20.0;
export const WANDER_MOVES_BEFORE_REST_MIN = 3;
export const WANDER_MOVES_BEFORE_REST_MAX = 6;
export const SEAT_REST_MIN_SEC = 120.0;
export const SEAT_REST_MAX_SEC = 240.0;
export const SUPERVISION_TOOL_NAME = 'Delegation';

// ── Matrix Effect ────────────────────────────────────────────
export const MATRIX_EFFECT_DURATION_SEC = 0.3;
export const MATRIX_TRAIL_LENGTH = 6;
export const MATRIX_SPRITE_COLS = 16;
export const MATRIX_SPRITE_ROWS = 24;
export const MATRIX_FLICKER_FPS = 30;
export const MATRIX_FLICKER_VISIBILITY_THRESHOLD = 180;
export const MATRIX_COLUMN_STAGGER_RANGE = 0.3;
export const MATRIX_HEAD_COLOR = '#ccffcc';
export const matrixGreenBright = (a: number): string => `rgba(0, 255, 65, ${a})`;
export const matrixGreenMid = (a: number): string => `rgba(0, 170, 40, ${a})`;
export const matrixGreenDim = (a: number): string => `rgba(0, 85, 20, ${a})`;
export const MATRIX_TRAIL_OVERLAY_ALPHA = 0.6;
export const MATRIX_TRAIL_EMPTY_ALPHA = 0.5;
export const MATRIX_TRAIL_MID_THRESHOLD = 0.33;
export const MATRIX_TRAIL_DIM_THRESHOLD = 0.66;

// ── Rendering ────────────────────────────────────────────────
export const CHARACTER_SITTING_OFFSET_PX = 6;
export const CHARACTER_Z_SORT_OFFSET = 0.5;
export const OUTLINE_Z_SORT_OFFSET = 0.001;
export const SELECTED_OUTLINE_ALPHA = 1.0;
export const HOVERED_OUTLINE_ALPHA = 0.5;
export const GHOST_PREVIEW_SPRITE_ALPHA = 0.5;
export const GHOST_PREVIEW_TINT_ALPHA = 0.25;
export const SELECTION_DASH_PATTERN: [number, number] = [4, 3];
export const BUTTON_MIN_RADIUS = 6;
export const BUTTON_RADIUS_ZOOM_FACTOR = 3;
export const BUTTON_ICON_SIZE_FACTOR = 0.45;
export const BUTTON_LINE_WIDTH_MIN = 1.5;
export const BUTTON_LINE_WIDTH_ZOOM_FACTOR = 0.5;
export const BUBBLE_FADE_DURATION_SEC = 0.5;
export const BUBBLE_SITTING_OFFSET_PX = 10;
export const BUBBLE_VERTICAL_OFFSET_PX = 24;
export const DELEGATION_MARKER_OFFSET_X_PX = 9;
export const DELEGATION_MARKER_VERTICAL_OFFSET_PX = 23;
export const DELEGATION_MARKER_MIN_WIDTH_PX = 14;
export const DELEGATION_MARKER_HEIGHT_PX = 7;
export const DELEGATION_MARKER_PADDING_X_PX = 3;
export const DELEGATION_MARKER_FONT_PX = 5;
export const DELEGATION_MARKER_DOT_SIZE_PX = 2;
export const DELEGATION_MARKER_BORDER_WIDTH_PX = 1;
export const TIMELINE_HISTORY_MAX_EVENTS = 500;
export const TIMELINE_MS_PER_DAY = 24 * 60 * 60 * 1000;
export const TIMELINE_LAST_7_DAYS = 7;
export const TIMELINE_REPLAY_SPEED_OPTIONS = [0.5, 1, 2, 4] as const;
export const TIMELINE_REPLAY_BASE_INTERVAL_MS = 1200;
export const HANDOFF_DRAFT_MAX_IMPORTANT_EVENTS = 8;
export const FALLBACK_FLOOR_COLOR = '#808080';

// ── Rendering - Overlay Colors (canvas, not CSS) ─────────────
export const SEAT_OWN_COLOR = 'rgba(0, 127, 212, 0.35)';
export const SEAT_AVAILABLE_COLOR = 'rgba(0, 200, 80, 0.35)';
export const SEAT_BUSY_COLOR = 'rgba(220, 50, 50, 0.35)';
export const GRID_LINE_COLOR = 'rgba(255,255,255,0.12)';
export const VOID_TILE_OUTLINE_COLOR = 'rgba(255,255,255,0.08)';
export const VOID_TILE_DASH_PATTERN: [number, number] = [2, 2];
export const GHOST_BORDER_HOVER_FILL = 'rgba(60, 130, 220, 0.25)';
export const GHOST_BORDER_HOVER_STROKE = 'rgba(60, 130, 220, 0.5)';
export const GHOST_BORDER_STROKE = 'rgba(255, 255, 255, 0.06)';
export const GHOST_VALID_TINT = '#00ff00';
export const GHOST_INVALID_TINT = '#ff0000';
export const SELECTION_HIGHLIGHT_COLOR = '#007fd4';
export const DELETE_BUTTON_BG = 'rgba(200, 50, 50, 0.85)';
export const ROTATE_BUTTON_BG = 'rgba(50, 120, 200, 0.85)';
export const BUTTON_ICON_COLOR = '#fff';
export const DELEGATION_MARKER_BG = 'rgba(20, 20, 34, 0.92)';
export const DELEGATION_MARKER_BORDER = '#ffd700';
export const DELEGATION_MARKER_TEXT = '#ffffff';
export const DELEGATION_MARKER_ACTIVE_DOT = '#66aaff';
export const DELEGATION_MARKER_ERROR_DOT = '#ff665c';
export const DELEGATION_MARKER_DONE_DOT = '#66d28f';
export const CANVAS_FALLBACK_TILE_COLOR = '#444';
export const CANVAS_ERROR_TILE_COLOR = '#FF00FF';
export const WALL_COLOR = '#3A3A5C';

// ── Camera ───────────────────────────────────────────────────
export const CAMERA_FOLLOW_LERP = 0.1;
export const CAMERA_FOLLOW_SNAP_THRESHOLD = 0.5;

// ── Zoom ─────────────────────────────────────────────────────
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 10;
export const ZOOM_DEFAULT_DPR_FACTOR = 2;
export const ZOOM_LEVEL_FADE_DELAY_MS = 1500;
export const ZOOM_LEVEL_HIDE_DELAY_MS = 2000;
export const ZOOM_LEVEL_FADE_DURATION_SEC = 0.5;
export const ZOOM_SCROLL_THRESHOLD = 50;
export const PAN_DRAG_THRESHOLD_PX = 4;
export const PAN_MARGIN_FRACTION = 0.25;

// ── Editor ───────────────────────────────────────────────────
export const UNDO_STACK_MAX_SIZE = 50;
export const LAYOUT_SAVE_DEBOUNCE_MS = 500;
export const DEFAULT_FLOOR_COLOR: ColorValue = { h: 35, s: 30, b: 15, c: 0 };
export const DEFAULT_WALL_COLOR: ColorValue = { h: 240, s: 25, b: 0, c: 0 };
export const DEFAULT_NEUTRAL_COLOR: ColorValue = { h: 0, s: 0, b: 0, c: 0 };

// ── Notification Sound (done: ascending chime) ─────────────
export const NOTIFICATION_NOTE_1_HZ = 659.25; // E5
export const NOTIFICATION_NOTE_2_HZ = 1318.51; // E6 (octave up)
export const NOTIFICATION_NOTE_1_START_SEC = 0;
export const NOTIFICATION_NOTE_2_START_SEC = 0.1;
export const NOTIFICATION_NOTE_DURATION_SEC = 0.18;
export const NOTIFICATION_VOLUME = 0.14;

// ── Permission Sound (attention: descending double tap) ────
export const PERMISSION_NOTE_1_HZ = 880; // A5
export const PERMISSION_NOTE_2_HZ = 659.25; // E5 (down a fourth)
export const PERMISSION_NOTE_1_START_SEC = 0;
export const PERMISSION_NOTE_2_START_SEC = 0.12;
export const PERMISSION_NOTE_DURATION_SEC = 0.15;
export const PERMISSION_VOLUME = 0.12;

// ── Furniture Animation ─────────────────────────────────────
export const FURNITURE_ANIM_INTERVAL_SEC = 0.2;

// ── Version Notice ──────────────────────────────────────────
export const WHATS_NEW_AUTO_CLOSE_MS = 20000;
export const WHATS_NEW_FADE_MS = 1000;

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1;
export const WAITING_BUBBLE_DURATION_SEC = 2.0;
export const DISMISS_BUBBLE_FAST_FADE_SEC = 0.3;
export const INACTIVE_SEAT_TIMER_MIN_SEC = 3.0;
export const INACTIVE_SEAT_TIMER_RANGE_SEC = 2.0;
/** Default/fallback palette count (bundled characters). Actual count comes from getLoadedCharacterCount(). */
export const PALETTE_COUNT = 6;
export const HUE_SHIFT_MIN_DEG = 45;
export const HUE_SHIFT_RANGE_DEG = 271;
export const AUTO_ON_FACING_DEPTH = 3;
export const AUTO_ON_SIDE_DEPTH = 2;
export const CHARACTER_HIT_HALF_WIDTH = 8;
export const CHARACTER_HIT_HEIGHT = 24;
export const TOOL_OVERLAY_VERTICAL_OFFSET = 32;

// ── Agent Teams ─────────────────────────────────────────────
export const MAX_CONTEXT_TOKENS = 200_000;
export const TOKEN_WARN_THRESHOLD = 0.6;
export const TOKEN_DANGER_THRESHOLD = 0.8;
export const TOKEN_CRITICAL_THRESHOLD = 0.95;
export const FUEL_GAUGE_WIDTH_PX = 40;
export const FUEL_GAUGE_HEIGHT_PX = 4;
export const FUEL_COLOR_OK = '#44cc44';
export const FUEL_COLOR_WARN = '#ffcc00';
export const FUEL_COLOR_DANGER = '#ff8800';
export const FUEL_COLOR_CRITICAL = '#ff2222';
export const FUEL_GAUGE_BG = '#222';
export const TEAM_LEAD_COLOR = '#ffd700';
export const TEAM_ROLE_COLOR = '#66aaff';

// ── Room Zones ─────────────────────────────────────────────
export const WORK_ZONE_BORDER_COLOR = 'rgba(109, 111, 255, 0.75)';
export const WORK_ZONE_BACKGROUND = 'rgba(109, 111, 255, 0.12)';
export const WORK_ZONE_LABEL_COLOR = 'rgb(183, 184, 255)';
export const REST_ZONE_BORDER_COLOR = 'rgba(107, 214, 173, 0.72)';
export const REST_ZONE_BACKGROUND = 'rgba(107, 214, 173, 0.10)';
export const REST_ZONE_LABEL_COLOR = 'rgb(169, 239, 211)';
export const MEETING_ZONE_BORDER_COLOR = 'rgba(255, 198, 92, 0.76)';
export const MEETING_ZONE_BACKGROUND = 'rgba(255, 198, 92, 0.12)';
export const MEETING_ZONE_LABEL_COLOR = 'rgb(255, 224, 160)';
export const NEUTRAL_ZONE_BORDER_COLOR = 'rgba(172, 179, 204, 0.64)';
export const NEUTRAL_ZONE_BACKGROUND = 'rgba(172, 179, 204, 0.08)';
export const NEUTRAL_ZONE_LABEL_COLOR = 'rgb(213, 218, 235)';
export const ZONE_LABEL_BACKGROUND = 'rgba(20, 20, 34, 0.78)';

// -- Project Rooms ----------------------------------------------------------
export const PROJECT_ROOM_ID_MAX_LENGTH = 80;
export const PROJECT_ROOM_LABEL_MAX_LENGTH = 80;
export const PROJECT_ROOM_PROJECT_KEY_MAX_LENGTH = 160;
export const PROJECT_ROOM_DOORPLATE_MAX_CHARS = 22;
export const PROJECT_ROOM_DOORPLATE_MIN_ZOOM = 1;
export const PROJECT_ROOM_DOORPLATE_FONT_PX = 7;
export const PROJECT_ROOM_DOORPLATE_PADDING_X_PX = 3;
export const PROJECT_ROOM_DOORPLATE_PADDING_Y_PX = 2;
export const PROJECT_ROOM_BOUNDARY_LINE_WIDTH_PX = 1;
export const PROJECT_ROOM_DEFAULT_WIDTH = 12;
export const PROJECT_ROOM_DEFAULT_HEIGHT = 10;
export const PROJECT_ROOM_MIN_WIDTH = 3;
export const PROJECT_ROOM_MIN_HEIGHT = 3;
export const PROJECT_ROOM_LOBBY_ID = 'project-room-lobby';
export const PROJECT_ROOM_LOBBY_LABEL = 'Lobby';
export const PROJECT_ROOM_LOBBY_LOUNGE_EDGE_PADDING_TILES = 2;
export const PROJECT_ROOM_LOBBY_LOUNGE_MIN_PODS = 2;
export const PROJECT_ROOM_LOBBY_LOUNGE_MAX_PODS = 6;
export const PROJECT_ROOM_LOBBY_LOUNGE_TILES_PER_POD = 48;
export const PROJECT_ROOM_LOBBY_LOUNGE_MIN_DECOR = 2;
export const PROJECT_ROOM_LOBBY_LOUNGE_MAX_DECOR = 5;
export const PROJECT_ROOM_LOBBY_LOUNGE_TILES_PER_DECOR = 70;
export const PROJECT_ROOM_WORK_CORRIDOR_HEIGHT = 6;
export const PROJECT_ROOM_WORK_CORRIDOR_MIN_WIDTH = 25;
export const PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_TABLE_ROW_OFFSET = 2;
export const PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_LEFT_TABLE_COL_OFFSET = 3;
export const PROJECT_ROOM_WORK_CORRIDOR_LOUNGE_RIGHT_TABLE_MARGIN = 4;
export const PROJECT_ROOM_GENERATED_MARGIN = 1;
export const PROJECT_ROOM_CAMPUS_MAX_HORIZONTAL_SLOTS = 4;
export const PROJECT_ROOM_CAMPUS_MAX_VERTICAL_SLOTS = 3;
export const PROJECT_ROOM_GENERATED_SHELL_THICKNESS = 1;
export const PROJECT_ROOM_GENERATED_DOORWAY_WIDTH = 1;
export const PROJECT_ROOM_GENERATED_FLOOR_TILE = 7;
export const PROJECT_ROOM_GENERATED_FLOOR_COLOR: ColorValue = { h: 25, s: 48, b: -43, c: -88 };
export const PROJECT_ROOM_GENERATED_WALL_COLOR: ColorValue = { h: 214, s: 30, b: -100, c: -55 };
export const PROJECT_ROOM_GENERATED_REST_MIN_WIDTH = 7;
export const PROJECT_ROOM_STANDARD_DESK_OFFSET_COL = 2;
export const PROJECT_ROOM_STANDARD_DESK_OFFSET_ROW = 2;
export const PROJECT_ROOM_STANDARD_TECH_OFFSET_COL = 3;
export const PROJECT_ROOM_STANDARD_TECH_OFFSET_ROW = 2;
export const PROJECT_ROOM_STANDARD_WORK_CHAIR_OFFSET_COL = 3;
export const PROJECT_ROOM_STANDARD_WORK_CHAIR_OFFSET_ROW = 4;
export const PROJECT_ROOM_STANDARD_REST_SEAT_MIN_OFFSET_COL = 5;
export const PROJECT_ROOM_STANDARD_REST_SEAT_RIGHT_MARGIN = 2;
export const PROJECT_ROOM_STANDARD_REST_SEAT_OFFSET_ROW = 7;
export const PROJECT_ROOM_AUTO_PROVISION_DEBOUNCE_MS = 120;
export const PROJECT_ROOM_COLLAB_TEMPLATE_MIN_WIDTH = 12;
export const PROJECT_ROOM_COLLAB_TEMPLATE_MIN_HEIGHT = 10;
export const PROJECT_ROOM_COLLAB_TABLE_OFFSET_COL = 7;
export const PROJECT_ROOM_COLLAB_TABLE_OFFSET_ROW = 1;
export const PROJECT_ROOM_COLLAB_LEFT_CHAIR_OFFSET_COL = 6;
export const PROJECT_ROOM_COLLAB_RIGHT_CHAIR_OFFSET_COL = 10;
export const PROJECT_ROOM_COLLAB_LEFT_PC_OFFSET_COL = 7;
export const PROJECT_ROOM_COLLAB_RIGHT_PC_OFFSET_COL = 9;
export const PROJECT_ROOM_COLLAB_TOP_ROW_OFFSET = 1;
export const PROJECT_ROOM_COLLAB_BOTTOM_ROW_OFFSET = 3;
export const PROJECT_ROOM_COLLAB_REST_SEAT_OFFSET_COL = 2;
export const PROJECT_ROOM_COLLAB_REST_SEAT_OFFSET_ROW = 1;
export const PROJECT_ROOM_STUDIO_TEMPLATE_ACCENTS = [
  { uidSuffix: 'rest-seat-side-left', type: 'SOFA_SIDE', colOffset: 1, rowOffset: 2 },
  { uidSuffix: 'rest-seat-side-right', type: 'SOFA_SIDE:left', colOffset: 4, rowOffset: 2 },
  { uidSuffix: 'decor-plant-nw', type: 'PLANT_2', colOffset: 1, rowOffset: 0 },
  { uidSuffix: 'decor-bin', type: 'BIN', colOffset: 5, rowOffset: 1 },
  { uidSuffix: 'team-table-coffee', type: 'COFFEE', colOffset: 8, rowOffset: 2 },
  { uidSuffix: 'decor-pot-left', type: 'POT', colOffset: 1, rowOffset: 4 },
  { uidSuffix: 'focus-desk', type: 'DESK_FRONT', colOffset: 7, rowOffset: 5 },
  { uidSuffix: 'focus-pc', type: 'PC_FRONT_OFF', colOffset: 8, rowOffset: 5 },
  { uidSuffix: 'focus-chair', type: 'CUSHIONED_BENCH', colOffset: 8, rowOffset: 7 },
  { uidSuffix: 'lounge-seat-lower-left', type: 'SOFA_SIDE', colOffset: 1, rowOffset: 5 },
  { uidSuffix: 'lounge-table-lower', type: 'COFFEE_TABLE', colOffset: 2, rowOffset: 5 },
  { uidSuffix: 'lounge-seat-lower-right', type: 'SOFA_SIDE:left', colOffset: 4, rowOffset: 5 },
  { uidSuffix: 'lounge-seat-bottom-left', type: 'SOFA_SIDE', colOffset: 1, rowOffset: 7 },
  { uidSuffix: 'lounge-table-bottom', type: 'COFFEE_TABLE', colOffset: 2, rowOffset: 7 },
  { uidSuffix: 'lounge-seat-bottom-right', type: 'SOFA_SIDE:left', colOffset: 4, rowOffset: 7 },
] as const;
export const PROJECT_ROOM_PROJECT_COLOR = 'rgba(109, 111, 255, 0.16)';
export const PROJECT_ROOM_PROJECT_BORDER = 'rgba(183, 184, 255, 0.78)';
export const PROJECT_ROOM_PUBLIC_COLOR = 'rgba(107, 214, 173, 0.12)';
export const PROJECT_ROOM_PUBLIC_BORDER = 'rgba(169, 239, 211, 0.72)';
export const PROJECT_ROOM_REST_COLOR = 'rgba(107, 214, 173, 0.14)';
export const PROJECT_ROOM_REST_BORDER = 'rgba(107, 214, 173, 0.78)';
export const PROJECT_ROOM_MEETING_COLOR = 'rgba(255, 198, 92, 0.13)';
export const PROJECT_ROOM_MEETING_BORDER = 'rgba(255, 224, 160, 0.78)';
export const PROJECT_ROOM_UNASSIGNED_COLOR = 'rgba(172, 179, 204, 0.10)';
export const PROJECT_ROOM_UNASSIGNED_BORDER = 'rgba(213, 218, 235, 0.66)';
export const PROJECT_ROOM_DOORPLATE_BG = 'rgba(20, 20, 34, 0.82)';
export const PROJECT_ROOM_DOORPLATE_TEXT = '#ffffff';
