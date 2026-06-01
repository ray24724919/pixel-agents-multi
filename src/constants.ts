// ── User-Level Layout Persistence ─────────────────────────────
export const EXTENSION_PUBLISHER = 'raychen';
export const EXTENSION_NAME = 'pixel-agents-multi';
export const EXTENSION_ID = `${EXTENSION_PUBLISHER}.${EXTENSION_NAME}`;
export const DISPLAY_NAME = 'Pixel Agents Multi';
export const CONFIG_SECTION = EXTENSION_NAME;
export const LEGACY_CONFIG_SECTION = 'pixel-agents';

export const LAYOUT_FILE_DIR = '.pixel-agents-multi';
export const LEGACY_LAYOUT_FILE_DIR = '.pixel-agents';
export const LAYOUT_FILE_NAME = 'layout.json';
export const CONFIG_FILE_NAME = 'config.json';
export const LAYOUT_FILE_POLL_INTERVAL_MS = 2000;
export const LAYOUT_REVISION_KEY = 'layoutRevision';

// ── Settings Persistence (VS Code globalState keys) ─────────
export const GLOBAL_KEY_SOUND_ENABLED = `${EXTENSION_NAME}.soundEnabled`;
export const GLOBAL_KEY_LAST_SEEN_VERSION = `${EXTENSION_NAME}.lastSeenVersion`;
export const GLOBAL_KEY_ALWAYS_SHOW_LABELS = `${EXTENSION_NAME}.alwaysShowLabels`;
export const GLOBAL_KEY_WATCH_ALL_SESSIONS = `${EXTENSION_NAME}.watchAllSessions`;
export const GLOBAL_KEY_HOOKS_ENABLED = `${EXTENSION_NAME}.hooksEnabled`;
export const GLOBAL_KEY_HOOKS_INFO_SHOWN = `${EXTENSION_NAME}.hooksInfoShown`;

// ── VS Code Identifiers ─────────────────────────────────────
export const VIEW_CONTAINER_ID = `${EXTENSION_NAME}-panel`;
export const VIEW_ID = `${EXTENSION_NAME}.panelView`;
export const COMMAND_SHOW_PANEL = `${EXTENSION_NAME}.showPanel`;
export const COMMAND_EXPORT_DEFAULT_LAYOUT = `${EXTENSION_NAME}.exportDefaultLayout`;
export const WORKSPACE_KEY_AGENTS = `${EXTENSION_NAME}.agents`;
export const WORKSPACE_KEY_ARCHIVED_AGENTS = `${EXTENSION_NAME}.archivedAgents`;
export const WORKSPACE_KEY_AGENT_SEATS = `${EXTENSION_NAME}.agentSeats`;
export const WORKSPACE_KEY_LAYOUT = `${EXTENSION_NAME}.layout`;
export const TERMINAL_NAME_PREFIX = 'Codex';
