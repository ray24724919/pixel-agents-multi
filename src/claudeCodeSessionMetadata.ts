import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CLAUDE_EXPLICIT_TITLE_MAX_LENGTH } from '../server/src/constants.js';

interface RawClaudeCodeSessionMetadata {
  sessionId?: unknown;
  cliSessionId?: unknown;
  cwd?: unknown;
  originCwd?: unknown;
  title?: unknown;
  isArchived?: unknown;
  lastActivityAt?: unknown;
  lastFocusedAt?: unknown;
  createdAt?: unknown;
}

export interface ClaudeCodeSessionMetadata {
  cliSessionId: string;
  localSessionId?: string;
  cwd?: string;
  originCwd?: string;
  title: string;
  lastActivityAt?: number;
  lastFocusedAt?: number;
  createdAt?: number;
  metadataPath: string;
}

const CACHE_TTL_MS = 5_000;
const MAX_SCAN_DEPTH = 4;
const MAX_METADATA_FILES = 1_000;

const metadataCache = new Map<
  string,
  { checkedAt: number; result: ClaudeCodeSessionMetadata | undefined }
>();

export function getClaudeCodeSessionsRoot(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  homeDir = os.homedir(),
): string {
  const sessionsDir = 'claude-code-sessions';
  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Claude', sessionsDir);
  }
  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.join(homeDir, 'AppData', 'Roaming');
    return path.join(appData, 'Claude', sessionsDir);
  }
  const configHome = env.XDG_CONFIG_HOME ?? path.join(homeDir, '.config');
  return path.join(configHome, 'Claude', sessionsDir);
}

export function clearClaudeCodeSessionMetadataCache(): void {
  metadataCache.clear();
}

export function readClaudeCodeSessionMetadata(
  cliSessionId: string | undefined,
  cwd?: string,
  root = getClaudeCodeSessionsRoot(),
): ClaudeCodeSessionMetadata | undefined {
  const normalizedSessionId = normalizeSessionId(cliSessionId);
  if (!normalizedSessionId) return undefined;

  const normalizedCwd = normalizeFsPath(cwd);
  const cacheKey = `${root}|${normalizedSessionId}|${normalizedCwd ?? ''}`;
  const cached = metadataCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.checkedAt < CACHE_TTL_MS) return cached.result;

  const result = findBestClaudeCodeSessionMetadata(root, normalizedSessionId, normalizedCwd);
  metadataCache.set(cacheKey, { checkedAt: now, result });
  return result;
}

function findBestClaudeCodeSessionMetadata(
  root: string,
  cliSessionId: string,
  normalizedCwd: string | undefined,
): ClaudeCodeSessionMetadata | undefined {
  const candidates: Array<{
    metadata: ClaudeCodeSessionMetadata;
    cwdScore: number;
    recency: number;
  }> = [];

  for (const metadataPath of findClaudeCodeSessionMetadataFiles(root)) {
    const metadata = readMetadataFile(metadataPath);
    if (!metadata || metadata.cliSessionId !== cliSessionId) continue;
    const cwdScore = scoreCwdMatch(metadata, normalizedCwd);
    const recency = latestTimestamp(metadata);
    candidates.push({ metadata, cwdScore, recency });
  }

  candidates.sort((a, b) => b.cwdScore - a.cwdScore || b.recency - a.recency);
  return candidates[0]?.metadata;
}

function findClaudeCodeSessionMetadataFiles(root: string): string[] {
  const out: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > MAX_SCAN_DEPTH || out.length >= MAX_METADATA_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (out.length >= MAX_METADATA_FILES) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (/^local_[\w-]+\.json$/i.test(entry.name)) {
        out.push(fullPath);
      }
    }
  }

  walk(root, 0);
  return out;
}

function readMetadataFile(metadataPath: string): ClaudeCodeSessionMetadata | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as RawClaudeCodeSessionMetadata;
    if (raw.isArchived === true) return undefined;

    const cliSessionId = normalizeSessionId(raw.cliSessionId);
    if (!cliSessionId) return undefined;

    const title = normalizeTitleText(stringValue(raw.title));
    if (!title) return undefined;

    return {
      cliSessionId,
      localSessionId: stringValue(raw.sessionId),
      cwd: stringValue(raw.cwd),
      originCwd: stringValue(raw.originCwd),
      title: truncateTitle(title),
      lastActivityAt: numberValue(raw.lastActivityAt),
      lastFocusedAt: numberValue(raw.lastFocusedAt),
      createdAt: numberValue(raw.createdAt),
      metadataPath,
    };
  } catch {
    return undefined;
  }
}

function normalizeSessionId(value: unknown): string | undefined {
  const text = stringValue(value)?.trim();
  return text || undefined;
}

function scoreCwdMatch(
  metadata: ClaudeCodeSessionMetadata,
  normalizedCwd: string | undefined,
): number {
  if (!normalizedCwd) return 0;
  const metadataCwds = [metadata.cwd, metadata.originCwd]
    .map((value) => normalizeFsPath(value))
    .filter((value): value is string => Boolean(value));
  return metadataCwds.includes(normalizedCwd) ? 2 : 0;
}

function latestTimestamp(metadata: ClaudeCodeSessionMetadata): number {
  return Math.max(
    metadata.lastActivityAt ?? 0,
    metadata.lastFocusedAt ?? 0,
    metadata.createdAt ?? 0,
  );
}

function normalizeFsPath(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return path.resolve(value).toLowerCase();
}

function normalizeTitleText(value: string | undefined): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (text.includes('<command-name>') || text.includes('<tool_use_id>')) return undefined;
  return text;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function truncateTitle(title: string): string {
  if (title.length <= CLAUDE_EXPLICIT_TITLE_MAX_LENGTH) return title;
  const ellipsis = '...';
  return `${title.slice(0, CLAUDE_EXPLICIT_TITLE_MAX_LENGTH - ellipsis.length)}${ellipsis}`;
}
