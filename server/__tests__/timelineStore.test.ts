import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const {
  appendTimelineRecord,
  createTimelineRecord,
  ensureTimelineStoreDir,
  getTimelineStorePath,
  readTimelineRecords,
} = await import('../../src/timelineStore.js');

describe('timeline store foundation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-timeline-store-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the local timeline store directory under the private fork path', () => {
    const storePath = getTimelineStorePath(tmpDir);
    const storeDir = ensureTimelineStoreDir({ homeDir: tmpDir });

    expect(storePath).toBe(
      path.join(tmpDir, '.pixel-agents-multi', 'timeline', 'timeline-v1.jsonl'),
    );
    expect(storeDir).toBe(path.dirname(storePath));
    expect(fs.existsSync(storeDir)).toBe(true);
  });

  it('appends safe timeline records and drops arbitrary payload data', () => {
    const record = appendTimelineRecord(
      {
        id: 'timeline-1',
        agentId: 7,
        providerId: 'codex',
        projectName: 'pixel-agents',
        sessionId: 'session-1',
        runId: 'W8-A',
        artifactId: '2026-06-04-1507-safe-handoff',
        artifactStatus: 'draft',
        dispatchStatus: 'ready',
        executionStatus: 'active',
        packageRelativePath:
          'docs/roadmap/supervision/work-packages/handoffs/safe-handoff-work-package.md',
        reportRelativePath: 'docs/roadmap/supervision/reports/safe-handoff-executor-report.md',
        branchName: 'product/handoff-safe-handoff',
        reportExists: true,
        branchExists: true,
        branchMergedToMain: false,
        linkedAgentId: 12,
        linkedAgentName: 'Codex executor',
        linkedAgentProviderId: 'codex',
        linkedAgentProjectName: 'pixel-agents',
        linkedAgentSessionId: 'executor-session',
        timestamp: 2000,
        kind: 'delegation.started',
        title: 'Delegation started',
        summary: 'Codex supervisor #7 / 1 worker',
        statusAfter: 'tool_running',
        severity: 'info',
        source: 'agent',
        visibility: 'default',
        payload: { rawPrompt: 'do not persist me' },
      } as Record<string, unknown>,
      { homeDir: tmpDir },
    );

    const records = readTimelineRecords({ homeDir: tmpDir });
    expect(record).toMatchObject({ id: 'timeline-1', schemaVersion: 1 });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'timeline-1',
      agentId: 7,
      providerId: 'codex',
      projectName: 'pixel-agents',
      sessionId: 'session-1',
      runId: 'W8-A',
      artifactId: '2026-06-04-1507-safe-handoff',
      artifactStatus: 'draft',
      dispatchStatus: 'ready',
      executionStatus: 'active',
      packageRelativePath:
        'docs/roadmap/supervision/work-packages/handoffs/safe-handoff-work-package.md',
      reportRelativePath: 'docs/roadmap/supervision/reports/safe-handoff-executor-report.md',
      branchName: 'product/handoff-safe-handoff',
      reportExists: true,
      branchExists: true,
      branchMergedToMain: false,
      linkedAgentId: 12,
      linkedAgentName: 'Codex executor',
      linkedAgentProviderId: 'codex',
      linkedAgentProjectName: 'pixel-agents',
      linkedAgentSessionId: 'executor-session',
      kind: 'delegation.started',
      title: 'Delegation started',
      summary: 'Codex supervisor #7 / 1 worker',
      statusAfter: 'tool_running',
      severity: 'info',
      source: 'agent',
      visibility: 'default',
    });
    expect(JSON.stringify(records[0])).not.toContain('rawPrompt');
    expect(JSON.stringify(records[0])).not.toContain('do not persist');
  });

  it('deduplicates by id, returns newest-first records, and applies the read cap', () => {
    appendTimelineRecord(
      {
        id: 'same-id',
        agentId: 1,
        timestamp: 100,
        kind: 'tool.started',
        title: 'Old duplicate',
      },
      { homeDir: tmpDir },
    );
    appendTimelineRecord(
      {
        id: 'newer',
        agentId: 1,
        timestamp: 300,
        kind: 'tool.completed',
        title: 'Newest',
      },
      { homeDir: tmpDir },
    );
    appendTimelineRecord(
      {
        id: 'same-id',
        agentId: 1,
        timestamp: 200,
        kind: 'tool.started',
        title: 'New duplicate',
      },
      { homeDir: tmpDir },
    );

    const records = readTimelineRecords({ homeDir: tmpDir, maxRecords: 2 });

    expect(records.map((record) => record.id)).toEqual(['newer', 'same-id']);
    expect(records.find((record) => record.id === 'same-id')?.title).toBe('New duplicate');
  });

  it('tolerates malformed JSONL and invalid records while reading', () => {
    const storePath = getTimelineStorePath(tmpDir);
    ensureTimelineStoreDir({ homeDir: tmpDir });
    const valid = createTimelineRecord({
      id: 'valid',
      agentId: 2,
      timestamp: 100,
      kind: 'action.archive',
      title: 'Archived',
    });
    fs.writeFileSync(
      storePath,
      [
        JSON.stringify(valid),
        'not-json',
        JSON.stringify({ schemaVersion: 1, id: 'missing-required' }),
      ].join('\n') + '\n',
      'utf8',
    );

    const records = readTimelineRecords({ homeDir: tmpDir });

    expect(records.map((record) => record.id)).toEqual(['valid']);
  });
});
