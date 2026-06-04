import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildHandoffArtifactTarget,
  extractHandoffMarkdownTitle,
  formatHandoffTimestamp,
  resolveHandoffArtifactOpenPath,
  safeHandoffFilenamePart,
  scanHandoffArtifacts,
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

  it('scans only recent Markdown handoffs with newest-first bounded ordering', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-library-'));
    try {
      const handoffDir = path.join(repoRoot, 'docs', 'agent-handoffs');
      fs.mkdirSync(handoffDir, { recursive: true });
      const older = path.join(handoffDir, '2026-01-01-0900-alpha-handoff.md');
      const newer = path.join(handoffDir, '2026-01-02-0900-beta-handoff.md');
      const newest = path.join(handoffDir, '2026-01-03-0900-gamma-handoff.md');
      fs.writeFileSync(older, '# Alpha handoff\n\nBody', 'utf8');
      fs.writeFileSync(newer, '# Beta handoff\n\nBody', 'utf8');
      fs.writeFileSync(newest, '# Gamma handoff\n\nBody', 'utf8');
      fs.writeFileSync(path.join(handoffDir, 'notes.txt'), '# Not markdown', 'utf8');
      fs.mkdirSync(path.join(repoRoot, 'elsewhere'), { recursive: true });
      fs.writeFileSync(path.join(repoRoot, 'elsewhere', 'outside.md'), '# Outside', 'utf8');
      fs.utimesSync(older, new Date(1000), new Date(1000));
      fs.utimesSync(newer, new Date(2000), new Date(2000));
      fs.utimesSync(newest, new Date(3000), new Date(3000));

      const summaries = scanHandoffArtifacts(repoRoot, 2);

      expect(summaries).toHaveLength(2);
      expect(summaries.map((summary) => summary.filename)).toEqual([
        '2026-01-03-0900-gamma-handoff.md',
        '2026-01-02-0900-beta-handoff.md',
      ]);
      expect(summaries[0]?.relativePath).toBe(
        'docs/agent-handoffs/2026-01-03-0900-gamma-handoff.md',
      );
      expect(summaries[0]?.title).toBe('Gamma handoff');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('extracts the first safe markdown heading for library titles', () => {
    expect(
      extractHandoffMarkdownTitle(
        'intro\n\n## Review C:\\Users\\User\\secret\\transcript.jsonl\n\n# Later',
      ),
    ).toBe('Review [redacted path]');
    expect(extractHandoffMarkdownTitle('## Raw prompt: expose sk-secret0000')).toBe(
      '[redacted content]',
    );
  });

  it('validates open paths as repo-relative Markdown handoffs only', () => {
    const repoRoot = path.resolve('C:/workspace/pixel-agents-multi');
    const target = resolveHandoffArtifactOpenPath(
      repoRoot,
      'docs/agent-handoffs/2026-01-03-0900-gamma-handoff.md',
    );

    expect(target.relativePath).toBe('docs/agent-handoffs/2026-01-03-0900-gamma-handoff.md');
    expect(target.absolutePath).toBe(
      path.resolve(repoRoot, 'docs/agent-handoffs/2026-01-03-0900-gamma-handoff.md'),
    );
    expect(() =>
      resolveHandoffArtifactOpenPath(repoRoot, '../docs/agent-handoffs/escape.md'),
    ).toThrow(/Markdown files under docs\/agent-handoffs/);
    expect(() =>
      resolveHandoffArtifactOpenPath(repoRoot, 'docs/agent-handoffs/../../escape.md'),
    ).toThrow(/Markdown files under docs\/agent-handoffs/);
    expect(() =>
      resolveHandoffArtifactOpenPath(repoRoot, 'C:/workspace/pixel-agents-multi/docs/agent.md'),
    ).toThrow(/repo-relative/);
    expect(() =>
      resolveHandoffArtifactOpenPath(repoRoot, 'docs/agent-handoffs/not-markdown.txt'),
    ).toThrow(/Markdown files under docs\/agent-handoffs/);
    expect(() =>
      resolveHandoffArtifactOpenPath(repoRoot, 'docs/agent-handoffs/nested/review.md'),
    ).toThrow(/Markdown files under docs\/agent-handoffs/);
    expect(() => resolveHandoffArtifactOpenPath(repoRoot, 'docs/not-handoffs/review.md')).toThrow(
      /Markdown files under docs\/agent-handoffs/,
    );
  });
});
