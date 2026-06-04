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

// Usage Intelligence persistence
export const USAGE_STORE_FILE_DIR = LAYOUT_FILE_DIR;
export const LEGACY_USAGE_STORE_FILE_DIR = LEGACY_LAYOUT_FILE_DIR;
export const USAGE_STORE_SUBDIR = 'usage';
export const USAGE_STORE_FILE_NAME = 'usage-v1.jsonl';
export const USAGE_RECORD_SCHEMA_VERSION = 1;
export const USAGE_PATH_HASH_PREFIX = 'sha256:';
export const USAGE_PATH_HASH_LENGTH = 16;

// Timeline persistence
export const TIMELINE_STORE_FILE_DIR = LAYOUT_FILE_DIR;
export const TIMELINE_STORE_SUBDIR = 'timeline';
export const TIMELINE_STORE_FILE_NAME = 'timeline-v1.jsonl';
export const TIMELINE_RECORD_SCHEMA_VERSION = 1;
export const TIMELINE_HISTORY_MAX_RECORDS = 500;

// Repo-centered handoff artifacts
export const HANDOFF_ARTIFACTS_RELATIVE_DIR = 'docs/agent-handoffs';
export const HANDOFF_ARTIFACT_FILENAME_SUFFIX = 'handoff';
export const HANDOFF_ARTIFACT_FALLBACK_SLUG = 'agent';
export const HANDOFF_ARTIFACT_MAX_SLUG_LENGTH = 64;
export const HANDOFF_ARTIFACT_LIBRARY_MAX_ITEMS = 25;
export const HANDOFF_ARTIFACT_TITLE_SCAN_BYTES = 16 * 1024;

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
