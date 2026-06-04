import * as fs from 'fs';
import * as path from 'path';

import {
  HANDOFF_ARTIFACT_FALLBACK_SLUG,
  HANDOFF_ARTIFACT_FILENAME_SUFFIX,
  HANDOFF_ARTIFACT_LIBRARY_MAX_ITEMS,
  HANDOFF_ARTIFACT_MAX_SLUG_LENGTH,
  HANDOFF_ARTIFACT_METADATA_EXTENSION,
  HANDOFF_ARTIFACT_METADATA_SCHEMA_VERSION,
  HANDOFF_ARTIFACT_TITLE_SCAN_BYTES,
  HANDOFF_ARTIFACTS_RELATIVE_DIR,
  HANDOFF_DISPATCH_BRANCH_PREFIX,
  HANDOFF_DISPATCH_PROMPT_MAX_LENGTH,
  HANDOFF_DISPATCH_REPORT_SUFFIX,
  HANDOFF_DISPATCH_REPORTS_RELATIVE_DIR,
} from './constants.js';

export interface HandoffArtifactNamingInput {
  project?: unknown;
  agentName?: unknown;
  title?: unknown;
  timestampMs?: number;
}

export interface HandoffArtifactMetadataInput {
  title?: unknown;
  providerId?: unknown;
  projectName?: unknown;
  agentName?: unknown;
  sessionId?: unknown;
  runId?: unknown;
  status?: unknown;
}

export interface HandoffArtifactTarget {
  repoRoot: string;
  relativeDir: string;
  relativePath: string;
  filename: string;
  absolutePath: string;
  artifactId: string;
  metadataRelativePath: string;
  metadataFilename: string;
  metadataAbsolutePath: string;
}

export type HandoffArtifactStatus = 'draft' | 'published' | 'reviewed' | 'stale';
export type HandoffArtifactLocalStatus = 'draft' | 'reviewed' | 'stale';

export interface HandoffArtifactMetadataV1 {
  schemaVersion: typeof HANDOFF_ARTIFACT_METADATA_SCHEMA_VERSION;
  artifactId: string;
  artifactType: 'handoff';
  markdownRelativePath: string;
  title: string;
  status: HandoffArtifactStatus;
  createdAt: string;
  updatedAt: string;
  providerId?: string;
  projectName?: string;
  agentName?: string;
  sessionId?: string;
  runId?: string;
}

export interface HandoffArtifactSummary {
  relativePath: string;
  filename: string;
  modifiedAt: number;
  sizeBytes: number;
  title?: string;
  artifactId?: string;
  artifactType?: 'handoff';
  metadataRelativePath?: string;
  status?: HandoffArtifactStatus;
  createdAt?: string;
  updatedAt?: string;
  providerId?: string;
  projectName?: string;
  agentName?: string;
  sessionId?: string;
  runId?: string;
}

export interface HandoffArtifactOpenPath {
  repoRoot: string;
  relativePath: string;
  filename: string;
  absolutePath: string;
}

export interface HandoffArtifactMetadataPath extends HandoffArtifactOpenPath {}

export interface HandoffArtifactStatusUpdateResult {
  markdown: HandoffArtifactOpenPath;
  metadataPath: HandoffArtifactMetadataPath;
  metadata: HandoffArtifactMetadataV1;
  previousStatus: HandoffArtifactStatus;
  nextStatus: HandoffArtifactLocalStatus;
}

export interface HandoffDispatchPrompt {
  markdown: HandoffArtifactOpenPath;
  metadata?: HandoffArtifactMetadataV1;
  slug: string;
  branchName: string;
  reportRelativePath: string;
  prompt: string;
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
  const artifactId = artifactIdFromMarkdownFilename(filename);
  const metadataFilename = `${artifactId}${HANDOFF_ARTIFACT_METADATA_EXTENSION}`;
  const absolutePath = path.resolve(resolvedRoot, HANDOFF_ARTIFACTS_RELATIVE_DIR, filename);
  const metadataAbsolutePath = path.resolve(
    resolvedRoot,
    HANDOFF_ARTIFACTS_RELATIVE_DIR,
    metadataFilename,
  );
  assertPathInsideRepo(resolvedRoot, absolutePath);
  assertPathInsideRepo(resolvedRoot, metadataAbsolutePath);
  return {
    repoRoot: resolvedRoot,
    relativeDir: HANDOFF_ARTIFACTS_RELATIVE_DIR,
    relativePath: `${HANDOFF_ARTIFACTS_RELATIVE_DIR}/${filename}`,
    filename,
    absolutePath,
    artifactId,
    metadataRelativePath: `${HANDOFF_ARTIFACTS_RELATIVE_DIR}/${metadataFilename}`,
    metadataFilename,
    metadataAbsolutePath,
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
    const metadata = readHandoffArtifactMetadataForMarkdown(repoRoot, relativePath);
    summaries.push({
      relativePath,
      filename: entry.name,
      modifiedAt: timestampMs(metadata?.updatedAt) ?? stat.mtimeMs,
      sizeBytes: stat.size,
      title: metadata?.title ?? readHandoffMarkdownTitle(absolutePath),
      artifactId: metadata?.artifactId,
      artifactType: metadata?.artifactType,
      metadataRelativePath: metadata
        ? getHandoffArtifactMetadataRelativePath(metadata.markdownRelativePath)
        : undefined,
      status: metadata?.status,
      createdAt: metadata?.createdAt,
      updatedAt: metadata?.updatedAt,
      providerId: metadata?.providerId,
      projectName: metadata?.projectName,
      agentName: metadata?.agentName,
      sessionId: metadata?.sessionId,
      runId: metadata?.runId,
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

export function resolveHandoffArtifactMetadataPath(
  repoRoot: string,
  relativePath: unknown,
): HandoffArtifactMetadataPath {
  const safeRelativePath = normalizedHandoffMetadataRelativePath(relativePath);
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

export function buildHandoffArtifactMetadata(
  target: HandoffArtifactTarget,
  input: HandoffArtifactMetadataInput,
  nowMs = Date.now(),
): HandoffArtifactMetadataV1 {
  const timestamp = new Date(nowMs);
  const isoTimestamp = Number.isFinite(timestamp.getTime())
    ? timestamp.toISOString()
    : new Date().toISOString();
  const title =
    safeHandoffMetadataText(input.title) ??
    safeHandoffMetadataText(input.projectName) ??
    safeHandoffMetadataText(target.filename) ??
    'Handoff draft';
  const metadata: HandoffArtifactMetadataV1 = {
    schemaVersion: HANDOFF_ARTIFACT_METADATA_SCHEMA_VERSION,
    artifactId: target.artifactId,
    artifactType: 'handoff',
    markdownRelativePath: target.relativePath,
    title,
    status: handoffArtifactStatus(input.status) ?? 'draft',
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  };
  const providerId = safeHandoffMetadataToken(input.providerId);
  const projectName = safeHandoffMetadataText(input.projectName);
  const agentName = safeHandoffMetadataText(input.agentName);
  const sessionId = safeHandoffMetadataToken(input.sessionId);
  const runId = safeHandoffMetadataToken(input.runId);
  if (providerId) metadata.providerId = providerId;
  if (projectName) metadata.projectName = projectName;
  if (agentName) metadata.agentName = agentName;
  if (sessionId) metadata.sessionId = sessionId;
  if (runId) metadata.runId = runId;
  return metadata;
}

export function updateHandoffArtifactStatus(
  repoRoot: string,
  markdownRelativePath: unknown,
  nextStatusValue: unknown,
  nowMs = Date.now(),
): HandoffArtifactStatusUpdateResult {
  const markdown = resolveHandoffArtifactOpenPath(repoRoot, markdownRelativePath);
  const nextStatus = handoffArtifactLocalStatus(nextStatusValue);
  if (!nextStatus) {
    throw new Error('Handoff artifact status must be draft, reviewed, or stale.');
  }
  if (!fs.existsSync(markdown.absolutePath) || !fs.statSync(markdown.absolutePath).isFile()) {
    throw new Error(`Handoff artifact does not exist: ${markdown.relativePath}`);
  }

  const metadataRelativePath = getHandoffArtifactMetadataRelativePath(markdown.relativePath);
  const metadataPath = resolveHandoffArtifactMetadataPath(repoRoot, metadataRelativePath);
  if (
    !fs.existsSync(metadataPath.absolutePath) ||
    !fs.statSync(metadataPath.absolutePath).isFile()
  ) {
    throw new Error(`Handoff metadata sidecar does not exist: ${metadataPath.relativePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(metadataPath.absolutePath, 'utf8')) as unknown;
  } catch {
    throw new Error(`Handoff metadata sidecar is malformed: ${metadataPath.relativePath}`);
  }
  const metadata = parseHandoffArtifactMetadata(parsed);
  if (!metadata) {
    throw new Error(`Handoff metadata sidecar is invalid: ${metadataPath.relativePath}`);
  }
  if (
    metadata.markdownRelativePath !== markdown.relativePath ||
    metadata.artifactId !== artifactIdFromMarkdownRelativePath(markdown.relativePath)
  ) {
    throw new Error('Handoff metadata sidecar does not match the Markdown artifact.');
  }

  const previousStatus = metadata.status;
  const timestamp = new Date(nowMs);
  const updatedAt = Number.isFinite(timestamp.getTime())
    ? timestamp.toISOString()
    : new Date().toISOString();
  const updatedMetadata: HandoffArtifactMetadataV1 = {
    ...metadata,
    status: nextStatus,
    updatedAt,
  };
  fs.writeFileSync(
    metadataPath.absolutePath,
    `${JSON.stringify(updatedMetadata, null, 2)}\n`,
    'utf8',
  );
  return {
    markdown,
    metadataPath,
    metadata: updatedMetadata,
    previousStatus,
    nextStatus,
  };
}

export function buildHandoffDispatchPrompt(
  repoRoot: string,
  markdownRelativePath: unknown,
): HandoffDispatchPrompt {
  const markdown = resolveHandoffArtifactOpenPath(repoRoot, markdownRelativePath);
  if (!fs.existsSync(markdown.absolutePath) || !fs.statSync(markdown.absolutePath).isFile()) {
    throw new Error(`Handoff artifact does not exist: ${markdown.relativePath}`);
  }

  const metadata = readHandoffArtifactMetadataForMarkdown(repoRoot, markdown.relativePath);
  const title = metadata?.title ?? readHandoffMarkdownTitle(markdown.absolutePath);
  const slug = safeHandoffFilenamePart(
    title ?? metadata?.artifactId ?? path.posix.basename(markdown.filename, '.md'),
  );
  const branchName = `${HANDOFF_DISPATCH_BRANCH_PREFIX}${slug}`;
  const reportRelativePath = `${HANDOFF_DISPATCH_REPORTS_RELATIVE_DIR}/${slug}-${HANDOFF_DISPATCH_REPORT_SUFFIX}.md`;
  const resolvedRoot = path.resolve(repoRoot);
  const prompt = [
    'You are executing a repo-centered Pixel Agents handoff.',
    '',
    'cwd:',
    `  ${resolvedRoot}`,
    '',
    'Handoff artifact:',
    `  ${markdown.relativePath}`,
    '',
    'Branch from CURRENT main:',
    '  git checkout main',
    '  git pull --ff-only origin main',
    '  git status --short --branch',
    '  # If the worktree is dirty, stop and report the exact status.',
    `  git checkout -b ${branchName}`,
    '',
    'Begin by reading:',
    `  ${markdown.relativePath}`,
    '',
    'Then inspect the relevant source files before editing. Do not assume the handoff is complete.',
    '',
    'Implementation rules:',
    '- Keep the patch scoped to the handoff artifact.',
    '- Do not include raw transcripts, raw tool output, credentials, or absolute private paths beyond the cwd above.',
    `- Write the executor report to: ${reportRelativePath}`,
    '- If blocked, write a clear report and stop without dirty cross-branch changes.',
    '- If the work is completed, commit on the executor branch.',
    '',
    'Testing expectations:',
    '- Run at minimum: npm run build',
    '- Run targeted tests based on touched files:',
    '  - npm run test:webview for webview-ui changes',
    '  - npm run test:server for src/server/helper changes',
    '  - npm test when changes cross both areas or risk is broad',
    '- Run git diff --check before committing.',
    '',
    'Do NOT push, merge, --amend, rebase, stash, reset, clean, or delete files.',
  ].join('\n');
  if (prompt.length > HANDOFF_DISPATCH_PROMPT_MAX_LENGTH) {
    throw new Error('Generated handoff dispatch prompt exceeded the safe size limit.');
  }
  return {
    markdown,
    metadata,
    slug,
    branchName,
    reportRelativePath,
    prompt,
  };
}

export function parseHandoffArtifactMetadata(
  value: unknown,
): HandoffArtifactMetadataV1 | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== HANDOFF_ARTIFACT_METADATA_SCHEMA_VERSION) return undefined;
  if (record.artifactType !== 'handoff') return undefined;
  const artifactId = safeArtifactId(record.artifactId);
  const markdownRelativePath = safeHandoffMarkdownRelativePath(record.markdownRelativePath);
  const title = safeHandoffMetadataText(record.title);
  const status = handoffArtifactStatus(record.status);
  const createdAt = isoTimestamp(record.createdAt);
  const updatedAt = isoTimestamp(record.updatedAt);
  if (!artifactId || !markdownRelativePath || !title || !status || !createdAt || !updatedAt) {
    return undefined;
  }
  let markdownArtifactId: string;
  try {
    markdownArtifactId = artifactIdFromMarkdownRelativePath(markdownRelativePath);
  } catch {
    return undefined;
  }
  if (artifactId !== markdownArtifactId) {
    return undefined;
  }

  const metadata: HandoffArtifactMetadataV1 = {
    schemaVersion: HANDOFF_ARTIFACT_METADATA_SCHEMA_VERSION,
    artifactId,
    artifactType: 'handoff',
    markdownRelativePath,
    title,
    status,
    createdAt,
    updatedAt,
  };
  const providerId = safeHandoffMetadataToken(record.providerId);
  const projectName = safeHandoffMetadataText(record.projectName);
  const agentName = safeHandoffMetadataText(record.agentName);
  const sessionId = safeHandoffMetadataToken(record.sessionId);
  const runId = safeHandoffMetadataToken(record.runId);
  if (providerId) metadata.providerId = providerId;
  if (projectName) metadata.projectName = projectName;
  if (agentName) metadata.agentName = agentName;
  if (sessionId) metadata.sessionId = sessionId;
  if (runId) metadata.runId = runId;
  return metadata;
}

export function getHandoffArtifactMetadataRelativePath(markdownRelativePath: unknown): string {
  const safeMarkdownRelativePath = normalizedHandoffRelativePath(markdownRelativePath);
  const filename = path.posix.basename(safeMarkdownRelativePath);
  const artifactId = artifactIdFromMarkdownFilename(filename);
  return `${HANDOFF_ARTIFACTS_RELATIVE_DIR}/${artifactId}${HANDOFF_ARTIFACT_METADATA_EXTENSION}`;
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

function normalizedHandoffMetadataRelativePath(relativePath: unknown): string {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new Error('A handoff artifact metadata path is required.');
  }
  const raw = relativePath.trim();
  if (
    raw.includes('\\') ||
    /^[A-Za-z]:/.test(raw) ||
    path.isAbsolute(raw) ||
    raw.startsWith('//') ||
    raw.includes('\0')
  ) {
    throw new Error('Handoff artifact metadata paths must be repo-relative JSON paths.');
  }
  const normalized = path.posix.normalize(raw);
  if (
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized === '..' ||
    normalized.startsWith('/') ||
    !normalized.startsWith(`${HANDOFF_ARTIFACTS_RELATIVE_DIR}/`) ||
    path.posix.dirname(normalized) !== HANDOFF_ARTIFACTS_RELATIVE_DIR ||
    !normalized.endsWith(HANDOFF_ARTIFACT_METADATA_EXTENSION)
  ) {
    throw new Error(
      `Handoff artifact metadata must be JSON files under ${HANDOFF_ARTIFACTS_RELATIVE_DIR}.`,
    );
  }
  safeArtifactId(path.posix.basename(normalized, HANDOFF_ARTIFACT_METADATA_EXTENSION), true);
  return normalized;
}

export function readHandoffArtifactMetadataForMarkdown(
  repoRoot: string,
  markdownRelativePath: string,
): HandoffArtifactMetadataV1 | undefined {
  let metadataTarget: HandoffArtifactMetadataPath;
  try {
    const metadataRelativePath = getHandoffArtifactMetadataRelativePath(markdownRelativePath);
    metadataTarget = resolveHandoffArtifactMetadataPath(repoRoot, metadataRelativePath);
  } catch {
    return undefined;
  }
  if (!fs.existsSync(metadataTarget.absolutePath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataTarget.absolutePath, 'utf8')) as unknown;
    const metadata = parseHandoffArtifactMetadata(parsed);
    if (!metadata || metadata.markdownRelativePath !== markdownRelativePath) return undefined;
    return metadata;
  } catch {
    return undefined;
  }
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
  return safeHandoffMetadataText(value);
}

function safeHandoffMetadataText(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const title = String(value)
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
    .trim()
    .slice(0, 240)
    .trim();
  return title || undefined;
}

function safeHandoffMetadataToken(value: unknown): string | undefined {
  const text = safeHandoffMetadataText(value);
  if (!text || text.includes('[redacted')) return undefined;
  return text.slice(0, 160);
}

function safeHandoffMarkdownRelativePath(value: unknown): string | undefined {
  try {
    return normalizedHandoffRelativePath(value);
  } catch {
    return undefined;
  }
}

function handoffArtifactStatus(value: unknown): HandoffArtifactStatus | undefined {
  if (value === 'draft' || value === 'published' || value === 'reviewed' || value === 'stale') {
    return value;
  }
  return undefined;
}

export function handoffArtifactLocalStatus(value: unknown): HandoffArtifactLocalStatus | undefined {
  if (value === 'draft' || value === 'reviewed' || value === 'stale') {
    return value;
  }
  return undefined;
}

function isoTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}

function timestampMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function artifactIdFromMarkdownRelativePath(markdownRelativePath: string): string {
  return artifactIdFromMarkdownFilename(path.posix.basename(markdownRelativePath));
}

function artifactIdFromMarkdownFilename(filename: string): string {
  const basename = path.posix.basename(filename, '.md');
  const artifactId = safeArtifactId(basename);
  if (!artifactId) {
    throw new Error('Handoff artifact id must be a safe filename-derived identifier.');
  }
  return artifactId;
}

function safeArtifactId(value: unknown, shouldThrow = false): string | undefined {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (/^[a-z0-9][a-z0-9._-]{0,127}$/.test(raw) && !raw.includes('..')) {
    return raw;
  }
  if (shouldThrow) {
    throw new Error('Handoff artifact id must be a safe repo-local identifier.');
  }
  return undefined;
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
