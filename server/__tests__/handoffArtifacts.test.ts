import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildHandoffArtifactMetadata,
  buildHandoffArtifactTarget,
  buildHandoffCompletionReview,
  buildHandoffDispatchPrompt,
  buildHandoffWorkPackagePrompt,
  buildHandoffWorkPackageTarget,
  clearHandoffExecutorLink,
  confirmAndMarkHandoffExecutorLaunch,
  createHandoffWorkPackage,
  detectHandoffCompletionStatus,
  extractHandoffMarkdownTitle,
  formatHandoffTimestamp,
  getHandoffArtifactMetadataRelativePath,
  linkHandoffExecutionAgent,
  markHandoffExecutorLaunched,
  parseHandoffArtifactMetadata,
  refreshHandoffCompletionStatus,
  resolveGitRepoRoot,
  resolveHandoffArtifactMetadataPath,
  resolveHandoffArtifactOpenPath,
  resolveHandoffReportOpenPath,
  resolveHandoffWorkPackageOpenPath,
  safeHandoffFilenamePart,
  sanitizeHandoffMarkdownBody,
  scanHandoffArtifacts,
  scanHandoffArtifactsAcrossRoots,
  updateHandoffArtifactStatus,
  updateHandoffDispatchStatus,
  updateHandoffExecutionStatus,
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

  it('resolveGitRepoRoot walks up to the nearest .git and returns undefined when there is none', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-gitroot-'));
    try {
      const repo = path.join(base, 'repo');
      const deep = path.join(repo, 'src', 'office');
      fs.mkdirSync(deep, { recursive: true });
      fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
      expect(resolveGitRepoRoot(deep)).toBe(path.resolve(repo));
      expect(resolveGitRepoRoot(repo)).toBe(path.resolve(repo));
      const noRepo = path.join(base, 'loose');
      fs.mkdirSync(noRepo, { recursive: true });
      expect(resolveGitRepoRoot(noRepo)).toBeUndefined();
      expect(resolveGitRepoRoot(undefined)).toBeUndefined();
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it('scanHandoffArtifactsAcrossRoots merges repos newest-first and maps each artifact to its repo', () => {
    const repoA = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-rootA-'));
    const repoB = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-rootB-'));
    try {
      const dirA = path.join(repoA, 'docs', 'agent-handoffs');
      const dirB = path.join(repoB, 'docs', 'agent-handoffs');
      fs.mkdirSync(dirA, { recursive: true });
      fs.mkdirSync(dirB, { recursive: true });
      const aOld = path.join(dirA, '2026-01-01-0900-alpha-handoff.md');
      const bNew = path.join(dirB, '2026-02-02-0900-beta-handoff.md');
      fs.writeFileSync(aOld, '# Alpha handoff\n\nBody', 'utf8');
      fs.writeFileSync(bNew, '# Beta handoff\n\nBody', 'utf8');
      fs.utimesSync(aOld, new Date(1000), new Date(1000));
      fs.utimesSync(bNew, new Date(2000), new Date(2000));

      // Duplicate root is de-duped; the newer artifact (repoB) sorts first.
      const { artifacts, repoRootByRelativePath } = scanHandoffArtifactsAcrossRoots([
        repoA,
        repoB,
        repoA,
      ]);

      expect(artifacts.map((a) => a.filename)).toEqual([
        '2026-02-02-0900-beta-handoff.md',
        '2026-01-01-0900-alpha-handoff.md',
      ]);
      expect(artifacts[0]?.repoRoot).toBe(path.resolve(repoB));
      expect(artifacts[1]?.repoRoot).toBe(path.resolve(repoA));
      expect(repoRootByRelativePath['docs/agent-handoffs/2026-02-02-0900-beta-handoff.md']).toBe(
        path.resolve(repoB),
      );
      expect(repoRootByRelativePath['docs/agent-handoffs/2026-01-01-0900-alpha-handoff.md']).toBe(
        path.resolve(repoA),
      );
    } finally {
      fs.rmSync(repoA, { recursive: true, force: true });
      fs.rmSync(repoB, { recursive: true, force: true });
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

  it('creates a repo-local handoff work package and tracks it in metadata', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-work-package-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      const handoffMarkdown = '# Dispatch source\n\nRaw prompt: do not copy this body';
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, handoffMarkdown, 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        {
          title: 'Queue W11-B',
          providerId: 'codex',
          projectName: 'Pixel Agents Multi',
          sessionId: 'session-123',
          runId: 'W11-B',
        },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );

      const workPackage = createHandoffWorkPackage(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 8, 30),
      );
      const sidecar = JSON.parse(fs.readFileSync(target.metadataAbsolutePath, 'utf8')) as {
        dispatchPackage?: {
          packageRelativePath?: string;
          branchName?: string;
          reportRelativePath?: string;
          status?: string;
          createdAt?: string;
          updatedAt?: string;
        };
      };
      const workPackageMarkdown = fs.readFileSync(workPackage.packageAbsolutePath, 'utf8');

      expect(workPackage.packageRelativePath).toBe(
        'docs/roadmap/supervision/work-packages/handoffs/queue-w11-b-work-package.md',
      );
      expect(workPackage.branchName).toBe('product/handoff-queue-w11-b');
      expect(workPackage.reportRelativePath).toBe(
        'docs/roadmap/supervision/reports/queue-w11-b-executor-report.md',
      );
      expect(sidecar.dispatchPackage).toMatchObject({
        packageRelativePath: workPackage.packageRelativePath,
        branchName: workPackage.branchName,
        reportRelativePath: workPackage.reportRelativePath,
        status: 'draft',
        createdAt: '2026-06-04T08:30:00.000Z',
        updatedAt: '2026-06-04T08:30:00.000Z',
      });
      expect(workPackageMarkdown).toContain(`Source handoff:\n  ${target.relativePath}`);
      expect(workPackageMarkdown).toContain('git checkout -b product/handoff-queue-w11-b');
      expect(workPackageMarkdown).toContain('npm run build');
      expect(workPackageMarkdown).toContain(
        'Do NOT push, merge, --amend, rebase, stash, reset, clean, or delete files.',
      );
      expect(workPackageMarkdown).not.toContain('Raw prompt: do not copy');
      expect(fs.readFileSync(target.absolutePath, 'utf8')).toBe(handoffMarkdown);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('opens and prompts from an existing handoff work package without embedding the handoff body', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-work-prompt-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Prompt Package' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(
        target.absolutePath,
        '# Prompt handoff\n\nTool output: private implementation dump',
        'utf8',
      );
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Prompt W11-B', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const workPackage = createHandoffWorkPackage(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 8, 30),
      );

      const openPath = resolveHandoffWorkPackageOpenPath(repoRoot, target.relativePath);
      const prompt = buildHandoffWorkPackagePrompt(repoRoot, target.relativePath);

      expect(openPath.relativePath).toBe(workPackage.packageRelativePath);
      expect(prompt.prompt).toContain(workPackage.packageRelativePath);
      expect(prompt.prompt).toContain(target.relativePath);
      expect(prompt.prompt).toContain('product/handoff-prompt-w11-b');
      expect(prompt.prompt).toContain(
        'Do NOT push, merge, --amend, rebase, stash, reset, clean, or delete files.',
      );
      expect(prompt.prompt.length).toBeLessThanOrEqual(8_000);
      expect(prompt.prompt).not.toContain('Tool output: private implementation dump');
      expect(prompt.prompt).not.toContain(target.absolutePath);
      fs.rmSync(workPackage.packageAbsolutePath);
      expect(() => buildHandoffWorkPackagePrompt(repoRoot, target.relativePath)).toThrow(
        /work package does not exist/,
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('updates handoff dispatch status in the sidecar without changing markdown files', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-dispatch-status-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Status Package' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      const handoffMarkdown = '# Status handoff\n\nEditable handoff body';
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, handoffMarkdown, 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Status W11-B', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const workPackage = createHandoffWorkPackage(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 8, 30),
      );
      const workPackageMarkdown = fs.readFileSync(workPackage.packageAbsolutePath, 'utf8');

      const result = updateHandoffDispatchStatus(
        repoRoot,
        target.relativePath,
        'dispatched',
        Date.UTC(2026, 5, 4, 9, 45),
      );
      const parsed = parseHandoffArtifactMetadata(
        JSON.parse(fs.readFileSync(target.metadataAbsolutePath, 'utf8')),
      );

      expect(result.previousStatus).toBe('draft');
      expect(result.nextStatus).toBe('dispatched');
      expect(result.dispatchPackage.status).toBe('dispatched');
      expect(result.dispatchPackage.updatedAt).toBe('2026-06-04T09:45:00.000Z');
      expect(parsed?.dispatchPackage?.status).toBe('dispatched');
      expect(fs.readFileSync(target.absolutePath, 'utf8')).toBe(handoffMarkdown);
      expect(fs.readFileSync(workPackage.packageAbsolutePath, 'utf8')).toBe(workPackageMarkdown);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('links handoff execution metadata to a visible agent without changing markdown files', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-execution-link-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Execution Link' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      const handoffMarkdown = '# Execution handoff\n\nEditable handoff body';
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, handoffMarkdown, 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Execution W11-C', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const workPackage = createHandoffWorkPackage(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 8, 30),
      );
      const workPackageMarkdown = fs.readFileSync(workPackage.packageAbsolutePath, 'utf8');

      const result = linkHandoffExecutionAgent(
        repoRoot,
        target.relativePath,
        {
          agentId: 12,
          agentName: 'Codex executor C:\\Users\\User\\secret',
          providerId: 'codex',
          projectName: '\\\\?\\C:\\Users\\User\\repo',
          sessionId: 'session-abc',
          runId: 'run-abc',
        },
        Date.UTC(2026, 5, 4, 9, 45),
      );
      const parsed = parseHandoffArtifactMetadata(
        JSON.parse(fs.readFileSync(target.metadataAbsolutePath, 'utf8')),
      );

      expect(result.execution).toMatchObject({
        agentId: 12,
        providerId: 'codex',
        sessionId: 'session-abc',
        runId: 'run-abc',
        status: 'linked',
        linkedAt: '2026-06-04T09:45:00.000Z',
        updatedAt: '2026-06-04T09:45:00.000Z',
      });
      expect(result.execution.agentName).toContain('[redacted path]');
      expect(result.execution.projectName).toContain('[redacted path]');
      expect(parsed?.dispatchPackage?.execution?.agentId).toBe(12);
      expect(fs.readFileSync(target.absolutePath, 'utf8')).toBe(handoffMarkdown);
      expect(fs.readFileSync(workPackage.packageAbsolutePath, 'utf8')).toBe(workPackageMarkdown);
      expect(JSON.stringify(parsed)).not.toContain('C:\\Users\\User\\secret');
      expect(JSON.stringify(parsed)).not.toContain('\\\\?\\C:\\Users\\User\\repo');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('updates handoff execution status and rejects invalid execution inputs', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-execution-status-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Execution Status' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Execution status handoff\n\nBody', 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Status W11-C', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      createHandoffWorkPackage(repoRoot, target.relativePath, Date.UTC(2026, 5, 4, 8, 30));

      expect(() => updateHandoffExecutionStatus(repoRoot, target.relativePath, 'active')).toThrow(
        /Link a visible agent/,
      );
      expect(() =>
        linkHandoffExecutionAgent(repoRoot, target.relativePath, { agentId: -1 }),
      ).toThrow(/visible agent id/);

      linkHandoffExecutionAgent(
        repoRoot,
        target.relativePath,
        { agentId: 12, agentName: 'Codex executor', providerId: 'codex' },
        Date.UTC(2026, 5, 4, 9, 45),
      );
      const result = updateHandoffExecutionStatus(
        repoRoot,
        target.relativePath,
        'blocked',
        Date.UTC(2026, 5, 4, 10, 10),
      );

      expect(result.previousStatus).toBe('linked');
      expect(result.nextStatus).toBe('blocked');
      expect(result.execution.status).toBe('blocked');
      expect(result.execution.agentId).toBe(12);
      expect(result.execution.linkedAt).toBe('2026-06-04T09:45:00.000Z');
      expect(result.execution.updatedAt).toBe('2026-06-04T10:10:00.000Z');
      expect(() =>
        updateHandoffExecutionStatus(repoRoot, target.relativePath, 'published'),
      ).toThrow(/execution status must be linked, active, waiting, completed, blocked, or unknown/);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('marks an executor launch as active and dispatched without changing markdown files', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-executor-launch-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Executor Launch' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      const handoffMarkdown = '# Executor handoff\n\nEditable body';
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, handoffMarkdown, 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Launch W11', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const workPackage = createHandoffWorkPackage(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 8, 30),
      );
      const workPackageMarkdown = fs.readFileSync(workPackage.packageAbsolutePath, 'utf8');

      const result = markHandoffExecutorLaunched(
        repoRoot,
        target.relativePath,
        {
          agentId: 18,
          agentName: 'Codex executor',
          providerId: 'codex',
          projectName: 'Pixel Agents Multi',
          sessionId: 'executor-session',
        },
        Date.UTC(2026, 5, 4, 9, 45),
      );
      const parsed = parseHandoffArtifactMetadata(
        JSON.parse(fs.readFileSync(target.metadataAbsolutePath, 'utf8')),
      );

      expect(result.previousDispatchStatus).toBe('draft');
      expect(result.nextDispatchStatus).toBe('dispatched');
      expect(result.dispatchPackage.status).toBe('dispatched');
      expect(result.execution).toMatchObject({
        agentId: 18,
        providerId: 'codex',
        sessionId: 'executor-session',
        status: 'active',
        linkedAt: '2026-06-04T09:45:00.000Z',
        updatedAt: '2026-06-04T09:45:00.000Z',
      });
      expect(parsed?.dispatchPackage?.execution?.agentId).toBe(18);
      expect(fs.readFileSync(target.absolutePath, 'utf8')).toBe(handoffMarkdown);
      expect(fs.readFileSync(workPackage.packageAbsolutePath, 'utf8')).toBe(workPackageMarkdown);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('cancels a dispatched executor: drops the link and returns dispatch to ready', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-executor-cancel-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Executor Cancel' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Executor handoff\n\nbody', 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Cancel W', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      createHandoffWorkPackage(repoRoot, target.relativePath, Date.UTC(2026, 5, 4, 8, 30));
      markHandoffExecutorLaunched(
        repoRoot,
        target.relativePath,
        { agentId: 21, providerId: 'codex', sessionId: 's', projectName: 'P' },
        Date.UTC(2026, 5, 4, 9, 45),
      );

      const result = clearHandoffExecutorLink(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 10, 0),
      );

      expect(result.previousDispatchStatus).toBe('dispatched');
      expect(result.nextDispatchStatus).toBe('ready');
      expect(result.previousAgentId).toBe(21);
      expect(result.dispatchPackage.status).toBe('ready');
      expect(result.dispatchPackage.execution).toBeUndefined();
      const parsed = parseHandoffArtifactMetadata(
        JSON.parse(fs.readFileSync(target.metadataAbsolutePath, 'utf8')),
      );
      expect(parsed?.dispatchPackage?.status).toBe('ready');
      expect(parsed?.dispatchPackage?.execution).toBeUndefined();
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('cancel leaves a completed handoff status untouched while still dropping the link', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-executor-cancel-done-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Executor Cancel Done' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Executor handoff\n\nbody', 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Cancel Done', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      createHandoffWorkPackage(repoRoot, target.relativePath, Date.UTC(2026, 5, 4, 8, 30));
      markHandoffExecutorLaunched(
        repoRoot,
        target.relativePath,
        { agentId: 7, providerId: 'codex', sessionId: 's', projectName: 'P' },
        Date.UTC(2026, 5, 4, 9, 45),
      );
      updateHandoffDispatchStatus(repoRoot, target.relativePath, 'completed');

      const result = clearHandoffExecutorLink(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 10, 0),
      );

      expect(result.previousDispatchStatus).toBe('completed');
      expect(result.nextDispatchStatus).toBe('completed');
      expect(result.dispatchPackage.execution).toBeUndefined();
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('confirms+marks a bound executor active but refuses to mark a launch with no evidence', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-confirm-launch-'));
    const scratchDirs: string[] = [];
    const nonEmptyRollout = (): string => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-codex-rollout-'));
      scratchDirs.push(dir);
      const file = path.join(dir, 'rollout.jsonl');
      fs.writeFileSync(file, '{"type":"session_meta"}\n', 'utf8');
      return file;
    };
    try {
      // Seed a draft handoff with a created work package (the state that exposes "Launch executor").
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Launch Gate' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Handoff\n\nBody', 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Gate', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      createHandoffWorkPackage(repoRoot, target.relativePath, Date.UTC(2026, 5, 4, 8, 30));

      // No bound rollout + immediate timeout: the terminal "opened" but no Codex session appeared.
      // The launch MUST NOT be marked active, and the sidecar must be left exactly as seeded.
      const unbound = await confirmAndMarkHandoffExecutorLaunch({
        repoRoot,
        markdownRelativePath: target.relativePath,
        providerId: 'codex',
        agent: {
          id: 7,
          projectDir: repoRoot,
          sessionId: 'placeholder-uuid',
          hookDelivered: false,
          jsonlFile: '',
          linesProcessed: 0,
        },
        options: { timeoutMs: 0, pollMs: 1 },
      });
      expect(unbound.confirmed).toBe(false);
      if (!unbound.confirmed) {
        expect(unbound.errorMessage).toMatch(/Codex/);
      }
      const afterUnbound = parseHandoffArtifactMetadata(
        JSON.parse(fs.readFileSync(target.metadataAbsolutePath, 'utf8')),
      );
      expect(afterUnbound?.dispatchPackage?.status).toBe('draft');
      expect(afterUnbound?.dispatchPackage?.execution).toBeUndefined();

      // A bound, non-empty rollout is real evidence: now the launch is confirmed and marked active.
      const bound = await confirmAndMarkHandoffExecutorLaunch({
        repoRoot,
        markdownRelativePath: target.relativePath,
        providerId: 'codex',
        agent: {
          id: 9,
          agentName: 'Codex executor',
          providerId: 'codex',
          projectName: 'Pixel Agents Multi',
          projectDir: repoRoot,
          sessionId: 'real-thread-id',
          hookDelivered: false,
          jsonlFile: nonEmptyRollout(),
          linesProcessed: 0,
        },
        options: { timeoutMs: 0, pollMs: 1 },
        nowMs: Date.UTC(2026, 5, 4, 9, 45),
      });
      expect(bound.confirmed).toBe(true);
      if (bound.confirmed) {
        expect(bound.evidence).toBe('codex-rollout-file');
        expect(bound.result.execution.status).toBe('active');
        expect(bound.result.dispatchPackage.status).toBe('dispatched');
      }
      const afterBound = parseHandoffArtifactMetadata(
        JSON.parse(fs.readFileSync(target.metadataAbsolutePath, 'utf8')),
      );
      expect(afterBound?.dispatchPackage?.status).toBe('dispatched');
      expect(afterBound?.dispatchPackage?.execution?.agentId).toBe(9);
      expect(afterBound?.dispatchPackage?.execution?.status).toBe('active');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      for (const dir of scratchDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('sanitizes the handoff markdown body: redacts paths/secrets, preserves structure, caps size', () => {
    const body = [
      '# Handoff',
      '',
      'Edited src/handoffArtifacts.ts (relative paths stay).',
      'Ran in C:\\Users\\ray\\secret\\workspace and /home/ray/private/notes.txt',
      'secret: hunter2-not-a-real-password',
      'token sk-ABCD1234efgh5678ZZ leaked into the log',
      '',
      '## Validation',
      '- npm test passed',
    ].join('\n');

    const safe = sanitizeHandoffMarkdownBody(body);

    // Sensitive content is gone.
    expect(safe).not.toContain('C:\\Users\\ray');
    expect(safe).not.toContain('/home/ray/private');
    expect(safe).not.toContain('sk-ABCD1234efgh5678ZZ');
    expect(safe).not.toContain('hunter2-not-a-real-password');
    expect(safe).toContain('[redacted path]');
    expect(safe).toContain('[redacted secret]');
    expect(safe).toContain('[redacted content]');

    // Markdown structure and relative paths survive (line count and headings preserved).
    expect(safe).toContain('# Handoff');
    expect(safe).toContain('## Validation');
    expect(safe).toContain('src/handoffArtifacts.ts');
    expect(safe.split('\n')).toHaveLength(body.split('\n').length);

    // A pasted-transcript-sized body is truncated with a visible marker.
    const huge = 'A'.repeat(250_000);
    const capped = sanitizeHandoffMarkdownBody(huge);
    expect(capped.length).toBeLessThan(huge.length);
    expect(capped).toMatch(/truncated at 100000 characters/);
  });

  it('detects report and branch completion with a mocked read-only git runner', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-completion-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Completion Scan' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Completion handoff\n\nBody', 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Completion W11', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const workPackage = createHandoffWorkPackage(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 8, 30),
      );
      const reportAbsolutePath = path.resolve(
        repoRoot,
        ...workPackage.dispatchPackage.reportRelativePath.split('/'),
      );
      fs.mkdirSync(path.dirname(reportAbsolutePath), { recursive: true });
      fs.writeFileSync(reportAbsolutePath, '# Executor report\n\nBuild passed', 'utf8');

      const completion = detectHandoffCompletionStatus(repoRoot, workPackage.dispatchPackage, {
        nowMs: Date.UTC(2026, 5, 4, 10, 30),
        gitRunner: (_cwd, args) =>
          args[0] === 'rev-parse' || args[0] === 'merge-base' ? true : false,
      });
      const refreshed = refreshHandoffCompletionStatus(repoRoot, target.relativePath, {
        nowMs: Date.UTC(2026, 5, 4, 10, 30),
        gitRunner: (_cwd, args) => args[0] === 'rev-parse',
      });
      const reportOpenPath = resolveHandoffReportOpenPath(repoRoot, target.relativePath);

      expect(completion).toMatchObject({
        reportExists: true,
        reportRelativePath: workPackage.dispatchPackage.reportRelativePath,
        branchName: workPackage.dispatchPackage.branchName,
        branchExists: true,
        branchMergedToMain: true,
        checkedAt: '2026-06-04T10:30:00.000Z',
      });
      expect(completion.reportSizeBytes).toBeGreaterThan(0);
      expect(refreshed.completion.branchMergedToMain).toBe(false);
      expect(reportOpenPath.relativePath).toBe(workPackage.dispatchPackage.reportRelativePath);
      expect(reportOpenPath.absolutePath).toBe(reportAbsolutePath);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('builds a safe completion review from bounded report signals and read-only git facts', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-review-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Review Scan' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Review handoff\n\nBody', 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Review W13-A', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const workPackage = createHandoffWorkPackage(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 8, 30),
      );
      const reportAbsolutePath = path.resolve(
        repoRoot,
        ...workPackage.dispatchPackage.reportRelativePath.split('/'),
      );
      fs.mkdirSync(path.dirname(reportAbsolutePath), { recursive: true });
      fs.writeFileSync(
        reportAbsolutePath,
        [
          '# Executor report',
          '',
          '## Summary',
          '- Completed W13-A review layer.',
          '',
          '## Files changed',
          '- src/handoffArtifacts.ts',
          '- C:\\Users\\User\\private\\secret.ts',
          '',
          '## Validation',
          '- npm run build passed',
          '- npm run test:server passed',
          '',
          '## Deviations / Follow-up',
          '- Follow-up: inspect /home/user/private/transcript.jsonl',
          '- Raw prompt: do not leak this sentence',
        ].join('\n'),
        'utf8',
      );
      const completion = {
        reportExists: true,
        reportRelativePath: workPackage.dispatchPackage.reportRelativePath,
        reportModifiedAt: Date.UTC(2026, 5, 4, 10, 0),
        reportSizeBytes: 400,
        branchName: workPackage.dispatchPackage.branchName,
        branchExists: true,
        branchMergedToMain: false,
        checkedAt: '2026-06-04T10:30:00.000Z',
      };
      const gitCalls: string[][] = [];

      const review = buildHandoffCompletionReview(repoRoot, workPackage.metadata, completion, {
        gitReadRunner: (_cwd, args) => {
          gitCalls.push([...args]);
          if (args[0] === 'rev-parse' && args[2] === workPackage.dispatchPackage.branchName) {
            return { status: 0, stdout: 'abc1234567890abcdef\n' };
          }
          if (args[0] === 'rev-parse' && args[2] === 'main') {
            return { status: 0, stdout: 'def1234567890abcdef\n' };
          }
          if (args[0] === 'merge-base') return { status: 1 };
          if (args[0] === 'rev-list') return { status: 0, stdout: '0\t2\n' };
          return { status: 99 };
        },
      });

      expect(review.status).toBe('ready_to_merge');
      expect(review.statusLabel).toBe('Ready to merge');
      expect(review.nextActionLabel).toBe('Inspect branch');
      expect(review.report?.hasSummary).toBe(true);
      expect(review.report?.hasFilesChanged).toBe(true);
      expect(review.report?.hasValidation).toBe(true);
      expect(review.report?.hasDeviations).toBe(true);
      expect(review.report?.validationLines).toContain('npm run build passed');
      expect(review.report?.changedFileLines.join('\n')).toContain('[redacted path]');
      expect(JSON.stringify(review)).not.toContain('C:\\Users\\User');
      expect(JSON.stringify(review)).not.toContain('/home/user/private');
      expect(JSON.stringify(review)).not.toContain('do not leak this sentence');
      expect(review.git).toMatchObject({
        branchExists: true,
        branchMergedToMain: false,
        branchHeadSha: 'abc1234567890abcdef',
        mainHeadSha: 'def1234567890abcdef',
        aheadCount: 2,
        behindCount: 0,
      });
      expect(gitCalls).toEqual([
        ['rev-parse', '--verify', workPackage.dispatchPackage.branchName],
        ['rev-parse', '--verify', 'main'],
        ['merge-base', '--is-ancestor', workPackage.dispatchPackage.branchName, 'main'],
        ['rev-list', '--left-right', '--count', `main...${workPackage.dispatchPackage.branchName}`],
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('maps completion review states for missing reports, active execution, blocked execution, and merged branches', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-review-states-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Review States' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Review states\n\nBody', 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'States W13-A', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const workPackage = createHandoffWorkPackage(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 8, 30),
      );
      const baseCompletion = {
        reportExists: false,
        reportRelativePath: workPackage.dispatchPackage.reportRelativePath,
        branchName: workPackage.dispatchPackage.branchName,
        checkedAt: '2026-06-04T10:30:00.000Z',
      };

      expect(
        buildHandoffCompletionReview(repoRoot, workPackage.metadata, baseCompletion).status,
      ).toBe('needs_report');
      expect(
        buildHandoffCompletionReview(
          repoRoot,
          {
            ...workPackage.metadata,
            dispatchPackage: {
              ...workPackage.dispatchPackage,
              status: 'dispatched',
              execution: {
                agentId: 12,
                linkedAt: '2026-06-04T09:00:00.000Z',
                updatedAt: '2026-06-04T09:00:00.000Z',
                status: 'active',
              },
            },
          },
          baseCompletion,
        ).status,
      ).toBe('active');
      expect(
        buildHandoffCompletionReview(
          repoRoot,
          {
            ...workPackage.metadata,
            dispatchPackage: {
              ...workPackage.dispatchPackage,
              status: 'blocked',
            },
          },
          baseCompletion,
        ).status,
      ).toBe('blocked');

      const reportAbsolutePath = path.resolve(
        repoRoot,
        ...workPackage.dispatchPackage.reportRelativePath.split('/'),
      );
      fs.mkdirSync(path.dirname(reportAbsolutePath), { recursive: true });
      fs.writeFileSync(
        reportAbsolutePath,
        '# Report\n\n## Summary\nDone\n\n## Files changed\nsrc/a.ts\n\n## Validation\nnpm run build passed',
        'utf8',
      );
      const mergedReview = buildHandoffCompletionReview(
        repoRoot,
        workPackage.metadata,
        {
          ...baseCompletion,
          reportExists: true,
          branchExists: true,
          branchMergedToMain: true,
        },
        {
          gitReadRunner: (_cwd, args) => {
            if (args[0] === 'rev-parse') return { status: 0, stdout: 'abc1234567890\n' };
            if (args[0] === 'merge-base') return { status: 0 };
            if (args[0] === 'rev-list') return { status: 0, stdout: '0 0\n' };
            return { status: 99 };
          },
        },
      );

      expect(mergedReview.status).toBe('merged');
      expect(mergedReview.nextActionLabel).toBe('Mark reviewed');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('exposes completion review data through handoff artifact scans without absolute paths', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-review-scan-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Review Scan Library' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Review scan\n\nBody', 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Library W13-A', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const workPackage = createHandoffWorkPackage(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 8, 30),
      );
      const reportAbsolutePath = path.resolve(
        repoRoot,
        ...workPackage.dispatchPackage.reportRelativePath.split('/'),
      );
      fs.mkdirSync(path.dirname(reportAbsolutePath), { recursive: true });
      fs.writeFileSync(
        reportAbsolutePath,
        '# Report\n\n## Summary\nDone\n\n## Files changed\nC:\\Users\\User\\private.ts\n\n## Validation\nnpm run test:server passed',
        'utf8',
      );

      const summary = scanHandoffArtifacts(repoRoot)[0];

      expect(summary?.review?.statusLabel).toBeTruthy();
      expect(summary?.review?.report?.validationLines).toContain('npm run test:server passed');
      expect(JSON.stringify(summary?.review)).not.toContain('C:\\Users\\User');
      expect(summary?.completion?.reportExists).toBe(true);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('rejects unsafe or missing executor report opens', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-handoff-report-safe-'));
    try {
      const target = buildHandoffArtifactTarget(
        repoRoot,
        { project: 'Report Safety' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
      fs.writeFileSync(target.absolutePath, '# Report safety handoff\n\nBody', 'utf8');
      const metadata = buildHandoffArtifactMetadata(
        target,
        { title: 'Report Safety W11', projectName: 'Pixel Agents Multi' },
        Date.UTC(2026, 5, 4, 7, 7),
      );
      fs.writeFileSync(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const workPackage = createHandoffWorkPackage(
        repoRoot,
        target.relativePath,
        Date.UTC(2026, 5, 4, 8, 30),
      );

      expect(() => resolveHandoffReportOpenPath(repoRoot, target.relativePath)).toThrow(
        /executor report does not exist/,
      );
      const badSidecar = parseHandoffArtifactMetadata({
        ...workPackage.metadata,
        dispatchPackage: {
          ...workPackage.dispatchPackage,
          reportRelativePath: 'docs/roadmap/supervision/reports/../escape.md',
        },
      });

      expect(badSidecar).toBeUndefined();
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('parses legacy sidecars and rejects malformed dispatch package metadata safely', () => {
    const legacy = {
      schemaVersion: 1,
      artifactId: '2026-06-04-1507-safe-handoff',
      artifactType: 'handoff',
      markdownRelativePath: 'docs/agent-handoffs/2026-06-04-1507-safe-handoff.md',
      title: 'Safe handoff',
      status: 'draft',
      createdAt: '2026-06-04T07:07:00.000Z',
      updatedAt: '2026-06-04T07:08:00.000Z',
    };
    const valid = {
      ...legacy,
      dispatchPackage: {
        packageRelativePath:
          'docs/roadmap/supervision/work-packages/handoffs/safe-handoff-work-package.md',
        branchName: 'product/handoff-safe-handoff',
        reportRelativePath: 'docs/roadmap/supervision/reports/safe-handoff-executor-report.md',
        status: 'ready',
        createdAt: '2026-06-04T07:09:00.000Z',
        updatedAt: '2026-06-04T07:10:00.000Z',
      },
    };

    expect(parseHandoffArtifactMetadata(legacy)?.dispatchPackage).toBeUndefined();
    expect(parseHandoffArtifactMetadata(valid)?.dispatchPackage?.status).toBe('ready');
    expect(
      parseHandoffArtifactMetadata({
        ...valid,
        dispatchPackage: {
          ...valid.dispatchPackage,
          packageRelativePath: 'docs/agent-handoffs/escape.md',
        },
      }),
    ).toBeUndefined();
    expect(
      parseHandoffArtifactMetadata({
        ...valid,
        dispatchPackage: {
          ...valid.dispatchPackage,
          branchName: 'main; rm -rf',
        },
      }),
    ).toBeUndefined();
    expect(
      parseHandoffArtifactMetadata({
        ...valid,
        dispatchPackage: {
          ...valid.dispatchPackage,
          execution: {
            agentId: 12,
            status: 'active',
            linkedAt: '2026-06-04T07:11:00.000Z',
            updatedAt: '2026-06-04T07:12:00.000Z',
          },
        },
      })?.dispatchPackage?.execution?.status,
    ).toBe('active');
    expect(
      parseHandoffArtifactMetadata({
        ...valid,
        dispatchPackage: {
          ...valid.dispatchPackage,
          execution: {
            agentId: 12,
            status: 'published',
            linkedAt: '2026-06-04T07:11:00.000Z',
            updatedAt: '2026-06-04T07:12:00.000Z',
          },
        },
      }),
    ).toBeUndefined();
  });

  it('rejects unsafe work-package creation and dispatch status inputs', () => {
    const repoRoot = path.resolve('C:/workspace/pixel-agents-multi');

    expect(() =>
      buildHandoffWorkPackageTarget(repoRoot, '../docs/agent-handoffs/escape.md'),
    ).toThrow(/Markdown files under docs\/agent-handoffs/);
    expect(() =>
      buildHandoffWorkPackageTarget(
        repoRoot,
        'C:/workspace/pixel-agents-multi/docs/agent-handoffs/review.md',
      ),
    ).toThrow(/repo-relative/);
    expect(() =>
      updateHandoffDispatchStatus(repoRoot, 'docs/agent-handoffs/review.md', 'published'),
    ).toThrow(/dispatch status must be draft, ready, dispatched, completed, or blocked/);
  });
});
