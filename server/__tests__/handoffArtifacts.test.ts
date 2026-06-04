import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildHandoffArtifactTarget,
  formatHandoffTimestamp,
  safeHandoffFilenamePart,
} from '../../src/handoffArtifacts.js';

describe('handoff artifact path safety', () => {
  it('builds the default repo handoff path with a safe timestamped filename', () => {
    const repoRoot = path.resolve('C:/workspace/pixel-agents-multi');
    const timestampMs = new Date(2026, 5, 4, 15, 7).getTime();

    const target = buildHandoffArtifactTarget(
      repoRoot,
      { project: 'Pixel Agents Multi', timestampMs },
      timestampMs,
    );

    expect(target.relativeDir).toBe('docs/agent-handoffs');
    expect(target.filename).toBe('2026-06-04-1507-pixel-agents-multi-handoff.md');
    expect(target.absolutePath).toBe(
      path.resolve(repoRoot, 'docs/agent-handoffs', target.filename),
    );
  });

  it('strips path traversal, drive letters, separators, and control characters from slugs', () => {
    const slug = safeHandoffFilenamePart('..\\..\\C:\\Users\\User\\secret\nhandoff');

    expect(slug).not.toContain('..');
    expect(slug).not.toContain(':');
    expect(slug).not.toContain('\\');
    expect(slug).not.toContain('/');
    expect(slug).toMatch(/secret-handoff$/);
  });

  it('ignores arbitrary path-like fields from webview metadata', () => {
    const repoRoot = path.resolve('/workspace/project');
    const target = buildHandoffArtifactTarget(
      repoRoot,
      {
        project: 'Safe Project',
        targetPath: '../../escape.md',
        absolutePath: 'C:\\Users\\User\\escape.md',
      } as Record<string, unknown>,
      new Date(2026, 0, 2, 3, 4).getTime(),
    );

    expect(target.relativePath).toBe('docs/agent-handoffs/2026-01-02-0304-safe-project-handoff.md');
    expect(path.relative(repoRoot, target.absolutePath).startsWith('..')).toBe(false);
  });

  it('formats timestamps with minute precision for generated filenames', () => {
    expect(formatHandoffTimestamp(new Date(2026, 11, 31, 9, 5).getTime())).toBe('2026-12-31-0905');
  });
});
