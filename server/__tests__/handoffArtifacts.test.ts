import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildHandoffArtifactMetadata,
  buildHandoffArtifactTarget,
  buildHandoffDispatchPrompt,
  extractHandoffMarkdownTitle,
  formatHandoffTimestamp,
  getHandoffArtifactMetadataRelativePath,
  parseHandoffArtifactMetadata,
  resolveHandoffArtifactMetadataPath,
  resolveHandoffArtifactOpenPath,
  safeHandoffFilenamePart,
  scanHandoffArtifacts,
  updateHandoffArtifactStatus,
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
    expect(target.artifactId).toBe('2026-06-04-1507-pixel-agents-multi-handoff');
    expect(target.metadataRelativePath).toBe(
      'docs/agent-handoffs/2026-06-04-1507-pixel-agents-multi-handoff.handoff.json',
    );
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

  it('writes and reads sidecar metadata when present in the handoff library', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-metadata-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Pixel Agents Multi' },
        new Date(2026, 5, 4, 15, 7).getTime(),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Markdown fallback title\n\nBody', 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        {
          title: 'Reviewed W10-C handoff',
          providerId: 'codex',
          projectName: 'Pixel Agents Multi',
          agentName: 'Codex Lead',
          sessionId: 'session-123',
          runId: 'W10-C',
        },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );

      const summaries = scanHandoffArtifacts(repoRoot);

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.title).toBe('Reviewed W10-C handoff');
      expect(summaries[0]?.artifactId).toBe(target.artifactId);
      expect(summaries[0]?.metadataRelativePath).toBe(target.metadataRelativePath);
      expect(summaries[0]?.status).toBe('draft');
      expect(summaries[0]?.providerId).toBe('codex');
      expect(summaries[0]?.projectName).toBe('Pixel Agents Multi');
      expect(summaries[0]?.sessionId).toBe('session-123');
      expect(summaries[0]?.runId).toBe('W10-C');
      expect(summaries[0]?.createdAt).toBe('2026-06-04T07:07:00.000Z');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('falls back to markdown headings when sidecar metadata is malformed', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-bad-metadata-'));
    try {
      const target = buildHandoffArtifactTarget(repoRoot, { project: 'Bad Metadata' });
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Fallback title\n\nBody', 'utf8');
      fs.writeFileSync(
        target.metadataAbsolutePath,
        JSON.stringify({
          schemaVersion: 999,
          artifactId: target.artifactId,
          artifactType: 'handoff',
          markdownRelativePath: target.relativePath,
          title: 'Bad sidecar title',
          status: 'draft',
          createdAt: '2026-06-04T00:00:00.000Z',
          updatedAt: '2026-06-04T00:00:00.000Z',
        }),
        'utf8',
      );

      const summaries = scanHandoffArtifacts(repoRoot);

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.title).toBe('Fallback title');
      expect(summaries[0]?.artifactId).toBeUndefined();
      expect(summaries[0]?.status).toBeUndefined();
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('builds draft metadata without raw paths or unsafe prompt-like title text', () => {
    const repoRoot = path.resolve('/workspace/project');
    const target = buildHandoffArtifactTarget(repoRoot, { project: 'Safe Project' });

    const metadata = buildHandoffArtifactMetadata(target, {
      title: 'Raw prompt: read C:\\Users\\User\\secret\\transcript.jsonl sk-secret0000',
      projectName: 'C:\\Users\\User\\repo',
      providerId: 'codex',
      agentName: 'Codex C:\\Users\\User\\agent',
      sessionId: 'session-123',
      runId: 'run-123',
    });

    expect(metadata.schemaVersion).toBe(1);
    expect(metadata.artifactId).toBe(target.artifactId);
    expect(metadata.markdownRelativePath).toBe(target.relativePath);
    expect(metadata.status).toBe('draft');
    expect(metadata.title).toBe('[redacted content]');
    expect(metadata.projectName).toBe('[redacted path]');
    expect(metadata.agentName).toBe('Codex [redacted path]');
    expect(JSON.stringify(metadata)).not.toContain('C:\\Users\\User');
    expect(JSON.stringify(metadata)).not.toContain('sk-secret0000');
  });

  it('parses only valid local handoff metadata schema', () => {
    const valid = {
      schemaVersion: 1,
      artifactId: '2026-06-04-1507-safe-handoff',
      artifactType: 'handoff',
      markdownRelativePath: 'docs/agent-handoffs/2026-06-04-1507-safe-handoff.md',
      title: 'Safe handoff',
      status: 'draft',
      createdAt: '2026-06-04T07:07:00.000Z',
      updatedAt: '2026-06-04T07:08:00.000Z',
    };

    expect(parseHandoffArtifactMetadata(valid)?.artifactId).toBe('2026-06-04-1507-safe-handoff');
    expect(parseHandoffArtifactMetadata({ ...valid, status: 'deleted' })).toBeUndefined();
    expect(
      parseHandoffArtifactMetadata({
        ...valid,
        markdownRelativePath: 'docs/agent-handoffs/../escape.md',
      }),
    ).toBeUndefined();
    expect(
      parseHandoffArtifactMetadata({ ...valid, artifactId: 'different-artifact-id' }),
    ).toBeUndefined();
    expect(parseHandoffArtifactMetadata({ ...valid, createdAt: 'not a date' })).toBeUndefined();
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

  it('validates metadata sidecar paths as repo-relative handoff JSON only', () => {
    const repoRoot = path.resolve('C:/workspace/pixel-agents-multi');
    expect(
      getHandoffArtifactMetadataRelativePath(
        'docs/agent-handoffs/2026-01-03-0900-gamma-handoff.md',
      ),
    ).toBe('docs/agent-handoffs/2026-01-03-0900-gamma-handoff.handoff.json');
    const target = resolveHandoffArtifactMetadataPath(
      repoRoot,
      'docs/agent-handoffs/2026-01-03-0900-gamma-handoff.handoff.json',
    );

    expect(target.relativePath).toBe(
      'docs/agent-handoffs/2026-01-03-0900-gamma-handoff.handoff.json',
    );
    expect(() =>
      resolveHandoffArtifactMetadataPath(
        repoRoot,
        'docs/agent-handoffs/2026-01-03-0900-gamma-handoff.json',
      ),
    ).toThrow(/metadata must be JSON files under docs\/agent-handoffs/);
    expect(() =>
      resolveHandoffArtifactMetadataPath(
        repoRoot,
        'docs/agent-handoffs/nested/2026-01-03-0900-gamma-handoff.handoff.json',
      ),
    ).toThrow(/metadata must be JSON files under docs\/agent-handoffs/);
    expect(() =>
      resolveHandoffArtifactMetadataPath(
        repoRoot,
        'C:/workspace/pixel-agents-multi/docs/agent-handoffs/review.handoff.json',
      ),
    ).toThrow(/repo-relative/);
  });

  it('builds a safe bounded executor dispatch prompt from handoff metadata', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-dispatch-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(
        target.absolutePath,
        '# Dispatch handoff\n\nRaw prompt: do not leak this body C:\\Users\\User\\secret.jsonl',
        'utf8',
      );
      const metadata = buildHandoffArtifactMetadata(
        target,
        {
          title: 'Dispatch W11-A',
          providerId: 'codex',
          projectName: 'Pixel Agents Multi',
          sessionId: 'session-123',
          runId: 'W11-A',
        },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );

      const dispatch = buildHandoffDispatchPrompt(repoRoot, target.relativePath);

      expect(dispatch.branchName).toBe('product/handoff-dispatch-w11-a');
      expect(dispatch.reportRelativePath).toBe(
        'docs/roadmap/supervision/reports/dispatch-w11-a-executor-report.md',
      );
      expect(dispatch.prompt).toContain(`cwd:\n  ${path.resolve(repoRoot)}`);
      expect(dispatch.prompt).toContain(target.relativePath);
      expect(dispatch.prompt).toContain('Begin by reading:');
      expect(dispatch.prompt).toContain('git checkout -b product/handoff-dispatch-w11-a');
      expect(dispatch.prompt).toContain('npm run build');
      expect(dispatch.prompt).toContain(
        'Do NOT push, merge, --amend, rebase, stash, reset, clean, or delete files.',
      );
      expect(dispatch.prompt.length).toBeLessThanOrEqual(8_000);
      expect(dispatch.prompt).not.toContain('Raw prompt: do not leak');
      expect(dispatch.prompt).not.toContain('secret.jsonl');
      expect(dispatch.prompt).not.toContain(target.absolutePath);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('derives conservative dispatch branch and report slugs from unsafe markdown titles', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-dispatch-slug-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Fallback Project' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(
        target.absolutePath,
        '# C:\\Users\\User\\secret\\Dispatch ..\\..\\Review\n\nBody',
        'utf8',
      );

      const dispatch = buildHandoffDispatchPrompt(repoRoot, target.relativePath);

      expect(dispatch.branchName).toMatch(/^product\/handoff-[a-z0-9._-]+$/);
      expect(dispatch.branchName).not.toContain('..');
      expect(dispatch.branchName).not.toContain(':');
      expect(dispatch.branchName).not.toContain('\\');
      expect(dispatch.reportRelativePath).toMatch(
        /^docs\/roadmap\/supervision\/reports\/[a-z0-9._-]+-executor-report\.md$/,
      );
      expect(dispatch.reportRelativePath).not.toContain('..');
      expect(dispatch.reportRelativePath).not.toContain(':');
      expect(path.posix.basename(dispatch.reportRelativePath).length).toBeLessThanOrEqual(96);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects unsafe dispatch prompt handoff paths', () => {
    const repoRoot = path.resolve('C:/workspace/pixel-agents-multi');

    expect(() => buildHandoffDispatchPrompt(repoRoot, '../docs/agent-handoffs/escape.md')).toThrow(
      /Markdown files under docs\/agent-handoffs/,
    );
    expect(() =>
      buildHandoffDispatchPrompt(repoRoot, 'C:/workspace/pixel-agents-multi/docs/review.md'),
    ).toThrow(/repo-relative/);
    expect(() => buildHandoffDispatchPrompt(repoRoot, 'docs/agent-handoffs/review.txt')).toThrow(
      /Markdown files under docs\/agent-handoffs/,
    );
  });

  it('updates handoff status in the metadata sidecar without changing markdown', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-status-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      const markdown = '# Handoff\n\nEditable body';
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, markdown, 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        {
          title: 'Review me',
          providerId: 'codex',
          projectName: 'Pixel Agents Multi',
        },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );

      const result = updateHandoffArtifactStatus(
        repoRoot,
        target.relativePath,
        'reviewed',
        Date.UTC(2026, 5, 4, 9, 30),
      );
      const updated = JSON.parse(fs.readFileSync(target.metadataAbsolutePath, 'utf8')) as {
        status?: unknown;
        updatedAt?: unknown;
        createdAt?: unknown;
        markdownRelativePath?: unknown;
      };

      expect(result.previousStatus).toBe('draft');
      expect(result.nextStatus).toBe('reviewed');
      expect(result.metadata.status).toBe('reviewed');
      expect(result.metadataPath.relativePath).toBe(target.metadataRelativePath);
      expect(updated.status).toBe('reviewed');
      expect(updated.updatedAt).toBe('2026-06-04T09:30:00.000Z');
      expect(updated.createdAt).toBe('2026-06-04T07:07:00.000Z');
      expect(updated.markdownRelativePath).toBe(target.relativePath);
      expect(fs.readFileSync(target.absolutePath, 'utf8')).toBe(markdown);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects status updates when sidecar metadata is missing or mismatched', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-status-reject-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Missing Metadata' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Handoff\n\nBody', 'utf8');

      expect(() => updateHandoffArtifactStatus(repoRoot, target.relativePath, 'reviewed')).toThrow(
        /metadata sidecar does not exist/,
      );

      fs.writeFileSync(
        target.metadataAbsolutePath,
        JSON.stringify({
          schemaVersion: 1,
          artifactId: '2026-06-04-0707-other-handoff',
          artifactType: 'handoff',
          markdownRelativePath: 'docs/agent-handoffs/2026-06-04-0707-other-handoff.md',
          title: 'Other handoff',
          status: 'draft',
          createdAt: '2026-06-04T07:07:00.000Z',
          updatedAt: '2026-06-04T07:07:00.000Z',
        }),
        'utf8',
      );

      expect(() => updateHandoffArtifactStatus(repoRoot, target.relativePath, 'reviewed')).toThrow(
        /does not match/,
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects unsafe status update paths and invalid statuses', () => {
    const repoRoot = path.resolve('C:/workspace/pixel-agents-multi');

    expect(() =>
      updateHandoffArtifactStatus(repoRoot, '../docs/agent-handoffs/escape.md', 'reviewed'),
    ).toThrow(/Markdown files under docs\/agent-handoffs/);
    expect(() =>
      updateHandoffArtifactStatus(
        repoRoot,
        'C:/workspace/pixel-agents-multi/docs/review.md',
        'reviewed',
      ),
    ).toThrow(/repo-relative/);
    expect(() =>
      updateHandoffArtifactStatus(repoRoot, 'docs/agent-handoffs/review.txt', 'reviewed'),
    ).toThrow(/Markdown files under docs\/agent-handoffs/);
    expect(() =>
      updateHandoffArtifactStatus(repoRoot, 'docs/agent-handoffs/review.md', 'published'),
    ).toThrow(/status must be draft, reviewed, or stale/);
  });
});
