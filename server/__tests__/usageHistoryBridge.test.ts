import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { loadUsageHistoryForWebview } = await import('../../src/usageHistoryBridge.js');
const { UsageTokenSource, createUsageDeltaRecord, getUsageStorePath } =
  await import('../../src/usageStore.js');

describe('usage history webview bridge', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-usage-history-bridge-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads persisted usage records into a webview-safe payload', () => {
    const record = createUsageDeltaRecord({
      id: 'usage-record-1',
      capturedAtMs: 1000,
      occurredAtMs: 900,
      provider: { id: 'codex', label: 'Codex' },
      project: { name: 'pixel-agents', dir: 'C:\\Users\\User\\repo' },
      agent: { id: 1, name: 'Codex #1' },
      session: {
        id: 'session-1',
        transcriptPath: 'C:\\Users\\User\\.codex\\projects\\repo\\session.jsonl',
      },
      usage: { inputTokens: 12, outputTokens: 8 },
      tokenSource: UsageTokenSource.EXACT_PROVIDER,
      includeRawPaths: true,
    });
    const storePath = getUsageStorePath(tmpDir);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, `${JSON.stringify(record)}\n`, 'utf8');

    const payload = loadUsageHistoryForWebview({ homeDir: tmpDir }, 1234);

    expect(payload).toMatchObject({
      type: 'usageHistoryLoaded',
      loadedAtMs: 1234,
    });
    expect(payload.unavailable).toBeUndefined();
    expect(payload.error).toBeUndefined();
    expect(payload.records).toHaveLength(1);
    expect(payload.records[0]?.id).toBe('usage-record-1');
    expect(payload.records[0]?.project.dir).toBeUndefined();
    expect(payload.records[0]?.project.dirHash).toMatch(/^sha256:/);
    expect(payload.records[0]?.session.transcriptPath).toBeUndefined();
    expect(payload.records[0]?.session.transcriptPathHash).toMatch(/^sha256:/);
  });

  it('returns an empty records payload when the usage store is missing', () => {
    const payload = loadUsageHistoryForWebview({ homeDir: tmpDir }, 2000);

    expect(payload).toEqual({
      type: 'usageHistoryLoaded',
      records: [],
      loadedAtMs: 2000,
    });
  });

  it('tolerates malformed JSONL lines through the existing store reader', () => {
    const valid = createUsageDeltaRecord({
      id: 'valid-record',
      capturedAtMs: 1000,
      provider: { id: 'claude', label: 'Claude' },
      project: { name: 'project' },
      agent: { id: 2, name: 'Claude #2' },
      usage: { outputTokens: 5 },
      tokenSource: UsageTokenSource.ESTIMATED_TRANSCRIPT,
    });
    const storePath = getUsageStorePath(tmpDir);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      `${JSON.stringify(valid)}\nnot-json\n${JSON.stringify({ schemaVersion: 1 })}\n`,
      'utf8',
    );

    const payload = loadUsageHistoryForWebview({ homeDir: tmpDir }, 3000);

    expect(payload.unavailable).toBeUndefined();
    expect(payload.records.map((record) => record.id)).toEqual(['valid-record']);
  });

  it('returns an unavailable payload instead of throwing when reading fails', () => {
    const storePath = path.join(tmpDir, 'usage-v1.jsonl');
    fs.mkdirSync(storePath, { recursive: true });

    const payload = loadUsageHistoryForWebview({ storePath }, 4000);

    expect(payload.type).toBe('usageHistoryLoaded');
    expect(payload.records).toEqual([]);
    expect(payload.loadedAtMs).toBe(4000);
    expect(payload.unavailable).toBe(true);
    expect(payload.error).toBeTruthy();
  });
});
