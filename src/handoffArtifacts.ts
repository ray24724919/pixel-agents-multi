import * as fs from 'fs';
import * as path from 'path';

import {
  HANDOFF_ARTIFACT_FALLBACK_SLUG,
  HANDOFF_ARTIFACT_FILENAME_SUFFIX,
  HANDOFF_ARTIFACT_LIBRARY_MAX_ITEMS,
  HANDOFF_ARTIFACT_MAX_SLUG_LENGTH,
  HANDOFF_ARTIFACT_TITLE_SCAN_BYTES,
  HANDOFF_ARTIFACTS_RELATIVE_DIR,
} from './constants.js';

export interface HandoffArtifactNamingInput {
  project?: unknown;
  agentName?: unknown;
  title?: unknown;
  timestampMs?: number;
}

export interface HandoffArtifactTarget {
  repoRoot: string;
  relativeDir: string;
  relativePath: string;
  filename: string;
  absolutePath: string;
}

export interface HandoffArtifactSummary {
  relativePath: string;
  filename: string;
  modifiedAt: number;
  sizeBytes: number;
  title?: string;
}

export interface HandoffArtifactOpenPath {
  repoRoot: string;
  relativePath: string;
  filename: string;
  absolutePath: string;
}

export function buildHandoffArtifactTarget(
  repoRoot: string,
  input: HandoffArtifactNamingInput,
  nowMs = Date.now(),
): HandoffArtifactTarget {
  const resolvedRoot = path.resolve(repoRoot);
  const timestamp = formatHandoffTimestamp(input.timestampMs ?? nowMs);
  const slug = safeHandoffFilenamePart(input.project ?? input.agentName ?? input.title);
  const filename = `${timestamp}-${slug}-${HANDOFF_ARTIFACT_FILENAME_SUFFIX}.md`;
  const absolutePath = path.resolve(resolvedRoot, HANDOFF_ARTIFACTS_RELATIVE_DIR, filename);
  assertPathInsideRepo(resolvedRoot, absolutePath);
  return {
    repoRoot: resolvedRoot,
    relativeDir: HANDOFF_ARTIFACTS_RELATIVE_DIR,
    relativePath: `${HANDOFF_ARTIFACTS_RELATIVE_DIR}/${filename}`,
    filename,
    absolutePath,
  };
}

export function scanHandoffArtifacts(
  repoRoot: string,
  maxItems = HANDOFF_ARTIFACT_LIBRARY_MAX_ITEMS,
): HandoffArtifactSummary[] {
  const handoffDir = path.resolve(path.resolve(repoRoot), HANDOFF_ARTIFACTS_RELATIVE_DIR);
  assertPathInsideRepo(path.resolve(repoRoot), handoffDir);
  if (!fs.existsSync(handoffDir)) return [];
  const entries = fs.readdirSync(handoffDir, { withFileTypes: true });
  const summaries: HandoffArtifactSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue;
    const absolutePath = path.resolve(handoffDir, entry.name);
    const relativePath = `${HANDOFF_ARTIFACTS_RELATIVE_DIR}/${entry.name}`;
    try {
      resolveHandoffArtifactOpenPath(repoRoot, relativePath);
    } catch {
      continue;
    }
    const stat = fs.statSync(absolutePath);
    summaries.push({
      relativePath,
      filename: entry.name,
      modifiedAt: stat.mtimeMs,
      sizeBytes: stat.size,
      title: readHandoffMarkdownTitle(absolutePath),
    });
  }
  return summaries
    .sort((a, b) => b.modifiedAt - a.modifiedAt || a.filename.localeCompare(b.filename))
    .slice(0, Math.max(0, Math.floor(maxItems)));
}

export function resolveHandoffArtifactOpenPath(
  repoRoot: string,
  relativePath: unknown,
): HandoffArtifactOpenPath {
  const safeRelativePath = normalizedHandoffRelativePath(relativePath);
  const resolvedRoot = path.resolve(repoRoot);
  const absolutePath = path.resolve(resolvedRoot, ...safeRelativePath.split('/'));
  assertPathInsideRepo(resolvedRoot, absolutePath);
  return {
    repoRoot: resolvedRoot,
    relativePath: safeRelativePath,
    filename: path.posix.basename(safeRelativePath),
    absolutePath,
  };
}

export function safeHandoffFilenamePart(value: unknown): string {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const sanitized = raw
    .normalize('NFKD')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\\\\\?\\/g, ' ')
    .replace(/[A-Za-z]:/g, ' ')
    .replace(/[\\/]/g, ' ')
    .replace(/\.\.+/g, ' ')
    .replace(/[<>:"|?*`'()[\]{}]/g, ' ')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .replace(/-{2,}/g, '-')
    .toLowerCase()
    .slice(0, HANDOFF_ARTIFACT_MAX_SLUG_LENGTH)
    .replace(/^[.-]+|[.-]+$/g, '');
  return sanitized || HANDOFF_ARTIFACT_FALLBACK_SLUG;
}

export function extractHandoffMarkdownTitle(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const title = safeHandoffTitle(match[2] ?? '');
    if (title) return title;
  }
  return undefined;
}

export function formatHandoffTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return formatHandoffTimestamp(Date.now());
  }
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    pad2(date.getHours()) + pad2(date.getMinutes()),
  ].join('-');
}

function normalizedHandoffRelativePath(relativePath: unknown): string {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new Error('A handoff artifact path is required.');
  }
  const raw = relativePath.trim();
  if (
    raw.includes('\\') ||
    /^[A-Za-z]:/.test(raw) ||
    path.isAbsolute(raw) ||
    raw.startsWith('//') ||
    raw.includes('\0')
  ) {
    throw new Error('Handoff artifact paths must be repo-relative markdown paths.');
  }
  const normalized = path.posix.normalize(raw);
  if (
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized === '..' ||
    normalized.startsWith('/') ||
    !normalized.startsWith(`${HANDOFF_ARTIFACTS_RELATIVE_DIR}/`) ||
    path.posix.dirname(normalized) !== HANDOFF_ARTIFACTS_RELATIVE_DIR ||
    path.posix.extname(normalized).toLowerCase() !== '.md'
  ) {
    throw new Error(
      `Handoff artifacts must be Markdown files under ${HANDOFF_ARTIFACTS_RELATIVE_DIR}.`,
    );
  }
  return normalized;
}

function readHandoffMarkdownTitle(absolutePath: string): string | undefined {
  let fd: number;
  try {
    fd = fs.openSync(absolutePath, 'r');
  } catch {
    return undefined;
  }
  try {
    const buffer = Buffer.alloc(HANDOFF_ARTIFACT_TITLE_SCAN_BYTES);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return extractHandoffMarkdownTitle(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

function safeHandoffTitle(value: string): string | undefined {
  const title = value
    .replace(/\\\\\?\\[^\s)]+/g, '[redacted path]')
    .replace(/[A-Za-z]:\\[^\s)]+/g, '[redacted path]')
    .replace(/\\\\[^\s)]+/g, '[redacted path]')
    .replace(
      /(^|[\s(["'])\/(?:Users|home|var|tmp|private|mnt|Volumes)\/[^\s)]+/g,
      '$1[redacted path]',
    )
    .replace(
      /\b(?:raw prompt|tool output|transcript text|credential|secret|api[_-]?key)\s*[:=].*$/gi,
      '[redacted content]',
    )
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted secret]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title || undefined;
}

function assertPathInsideRepo(repoRoot: string, targetPath: string): void {
  const relative = path.relative(repoRoot, targetPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Handoff artifact path escaped the repository root.');
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
