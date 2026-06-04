import * as path from 'path';

import {
  HANDOFF_ARTIFACT_FALLBACK_SLUG,
  HANDOFF_ARTIFACT_FILENAME_SUFFIX,
  HANDOFF_ARTIFACT_MAX_SLUG_LENGTH,
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

function assertPathInsideRepo(repoRoot: string, targetPath: string): void {
  const relative = path.relative(repoRoot, targetPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Handoff artifact path escaped the repository root.');
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
