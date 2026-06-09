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
export const HANDOFF_ARTIFACT_METADATA_SCHEMA_VERSION = 1;
export const HANDOFF_ARTIFACT_METADATA_EXTENSION = '.handoff.json';
export const HANDOFF_DISPATCH_BRANCH_PREFIX = 'product/handoff-';
export const HANDOFF_DISPATCH_REPORTS_RELATIVE_DIR = 'docs/roadmap/supervision/reports';
export const HANDOFF_DISPATCH_REPORT_SUFFIX = 'executor-report';
export const HANDOFF_DISPATCH_PROMPT_MAX_LENGTH = 8_000;
export const HANDOFF_WORK_PACKAGE_RELATIVE_DIR = 'docs/roadmap/supervision/work-packages/handoffs';
export const HANDOFF_WORK_PACKAGE_SUFFIX = 'work-package';
export const HANDOFF_WORK_PACKAGE_PROMPT_MAX_LENGTH = 8_000;
export const HANDOFF_COMPLETION_REPORT_SCAN_BYTES = 32 * 1024;
export const HANDOFF_COMPLETION_REVIEW_MAX_LINES = 4;
export const HANDOFF_COMPLETION_REVIEW_MAX_LINE_LENGTH = 180;
export const HANDOFF_COMPLETION_REVIEW_MAX_WARNINGS = 6;
// Launch-evidence gate (both providers): how long to wait for a real session signal
// (Claude transcript/hook, Codex bound rollout) before reporting the launch unconfirmed.
export const HANDOFF_LAUNCH_EVIDENCE_TIMEOUT_MS = 12_000;
export const HANDOFF_LAUNCH_EVIDENCE_POLL_MS = 500;

// ── Settings Persistence (VS Code globalState keys) ─────────
export const GLOBAL_KEY_SOUND_ENABLED = `${EXTENSION_NAME}.soundEnabled`;
export const GLOBAL_KEY_LAST_SEEN_VERSION = `${EXTENSION_NAME}.lastSeenVersion`;
export const GLOBAL_KEY_ALWAYS_SHOW_LABELS = `${EXTENSION_NAME}.alwaysShowLabels`;
export const GLOBAL_KEY_WATCH_ALL_SESSIONS = `${EXTENSION_NAME}.watchAllSessions`;
export const GLOBAL_KEY_HOOKS_ENABLED = `${EXTENSION_NAME}.hooksEnabled`;
export const GLOBAL_KEY_HOOKS_INFO_SHOWN = `${EXTENSION_NAME}.hooksInfoShown`;
export const GLOBAL_KEY_AUTO_CREATE_PROJECT_ROOMS = `${EXTENSION_NAME}.autoCreateProjectRooms`;

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
export const CLAUDE_TERMINAL_NAME_PREFIX = 'Claude';
