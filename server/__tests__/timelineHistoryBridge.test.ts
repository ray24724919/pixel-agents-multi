import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { loadTimelineHistoryForWebview, persistTimelineEventForWebview } =
  await import('../../src/timelineHistoryBridge.js');
const { appendTimelineRecord, getTimelineStorePath } = await import('../../src/timelineStore.js');

describe('timeline history webview bridge', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-timeline-history-bridge-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads persisted timeline records into a webview payload', () => {
    appendTimelineRecord(
      {
        id: 'timeline-record-1',
        agentId: 1,
        providerId: 'claude',
        projectName: 'docs',
        timestamp: 1000,
        kind: 'action.hide',
        title: 'Agent hidden',
        summary: 'Hidden from normal views.',
        severity: 'info',
        source: 'user',
      },
      { homeDir: tmpDir },
    );

    const payload = loadTimelineHistoryForWebview({ homeDir: tmpDir }, 1234);

    expect(payload).toMatchObject({
      type: 'timelineHistoryLoaded',
      loadedAtMs: 1234,
    });
    expect(payload.unavailable).toBeUndefined();
    expect(payload.error).toBeUndefined();
    expect(payload.records).toHaveLength(1);
    expect(payload.records[0]?.id).toBe('timeline-record-1');
  });

  it('returns an empty records payload when the timeline store is missing', () => {
    const payload = loadTimelineHistoryForWebview({ homeDir: tmpDir }, 2000);

    expect(payload).toEqual({
      type: 'timelineHistoryLoaded',
      records: [],
      loadedAtMs: 2000,
    });
  });

  it('returns an unavailable payload instead of throwing when reading fails', () => {
    const storePath = path.join(tmpDir, 'timeline-v1.jsonl');
    fs.mkdirSync(storePath, { recursive: true });

    const payload = loadTimelineHistoryForWebview({ storePath }, 3000);

    expect(payload.type).toBe('timelineHistoryLoaded');
    expect(payload.records).toEqual([]);
    expect(payload.loadedAtMs).toBe(3000);
    expect(payload.unavailable).toBe(true);
    expect(payload.error).toBeTruthy();
  });

  it('persists a webview timeline event through the bridge without payload blobs', () => {
    const persisted = persistTimelineEventForWebview(
      {
        id: 'delegation-1',
        agentId: 5,
        providerId: 'codex',
        projectName: 'pixel-agents',
        timestamp: 4000,
        kind: 'delegation.started',
        title: 'Delegation started',
        summary: 'Codex supervisor #5 / 2 workers',
        severity: 'info',
        source: 'agent',
        visibility: 'default',
        payload: { rawOutput: 'secret' },
      } as Record<string, unknown>,
      { homeDir: tmpDir },
    );
    const storeText = fs.readFileSync(getTimelineStorePath(tmpDir), 'utf8');

    expect(persisted?.id).toBe('delegation-1');
    expect(storeText).toContain('delegation.started');
    expect(storeText).not.toContain('rawOutput');
    expect(storeText).not.toContain('secret');
  });
});
