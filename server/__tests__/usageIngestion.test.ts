import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TokenUsageDetails } from '../../src/tokenUsage.js';
import type { UsageIngestionSnapshotInput } from '../../src/usageIngestion.js';

const { ingestAgentUsageSnapshot, resetUsageIngestionStateForTests } =
  await import('../../src/usageIngestion.js');
const { UsageRecordKind, UsageTokenSource, readUsageRecords } =
  await import('../../src/usageStore.js');

describe('usage ingestion', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-usage-ingestion-'));
    resetUsageIngestionStateForTests();
  });

  afterEach(() => {
    resetUsageIngestionStateForTests();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends a first positive provider delta from a cumulative snapshot', () => {
    const result = ingestAgentUsageSnapshot({
      agent: makeAgent(),
      details: usageDetails({
        input: 10,
        output: 5,
        cacheRead: 3,
        cacheWrite: 2,
        reasoningOutput: 4,
      }),
      estimated: false,
      capturedAtMs: 1000,
      occurredAtMs: 900,
      evidence: 'source=test; event=codex_token_count',
      isDeltaFromSnapshot: true,
      storeOptions: { homeDir: tmpDir },
    });

    expect(result.records).toHaveLength(1);
    const records = readUsageRecords({ homeDir: tmpDir });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      recordKind: UsageRecordKind.USAGE_DELTA,
      capturedAtMs: 1000,
      occurredAtMs: 900,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
        reasoningOutputTokens: 4,
        artifactOutputTokens: 0,
      },
      accuracy: {
        tokenSource: UsageTokenSource.EXACT_PROVIDER,
        isDeltaFromSnapshot: true,
        evidence: 'source=test; event=codex_token_count',
      },
    });
    expect(records[0]?.project.dir).toBeUndefined();
    expect(records[0]?.project.dirHash).toMatch(/^sha256:/);
    expect(records[0]?.session.transcriptPath).toBeUndefined();
    expect(records[0]?.session.transcriptPathHash).toMatch(/^sha256:/);
  });

  it('does not append records for repeated identical snapshots', () => {
    const snapshot = {
      agent: makeAgent(),
      details: usageDetails({ input: 10, output: 5 }),
      estimated: false,
      evidence: 'source=test; event=repeat',
      isDeltaFromSnapshot: true,
      storeOptions: { homeDir: tmpDir },
    };

    ingestAgentUsageSnapshot(snapshot);
    const repeated = ingestAgentUsageSnapshot(snapshot);

    expect(repeated.records).toHaveLength(0);
    expect(readUsageRecords({ homeDir: tmpDir })).toHaveLength(1);
  });

  it('does not append a duplicate cumulative snapshot after module reload when the store already has it', () => {
    const snapshot = {
      agent: makeAgent({ sessionId: 's1' }),
      details: usageDetails({ input: 10, output: 5 }),
      estimated: false,
      evidence: 'source=test; event=reload',
      isDeltaFromSnapshot: true,
      storeOptions: { homeDir: tmpDir },
    };

    ingestAgentUsageSnapshot(snapshot);
    resetUsageIngestionStateForTests();
    const repeated = ingestAgentUsageSnapshot(snapshot);

    expect(repeated.records).toHaveLength(0);
    expect(readUsageRecords({ homeDir: tmpDir })).toHaveLength(1);
  });

  it('deduplicates the same provider session and transcript across different local agent ids', () => {
    const transcriptPath = 'C:\\Users\\User\\.codex\\projects\\repo\\stable-session.jsonl';
    ingestAgentUsageSnapshot({
      agent: makeAgent({ id: 1, sessionId: 'stable-session', jsonlFile: transcriptPath }),
      details: usageDetails({ input: 10, output: 5 }),
      estimated: false,
      evidence: 'source=test; event=first-agent',
      isDeltaFromSnapshot: true,
      storeOptions: { homeDir: tmpDir },
    });

    resetUsageIngestionStateForTests();
    const repeated = ingestAgentUsageSnapshot({
      agent: makeAgent({ id: 99, sessionId: 'stable-session', jsonlFile: transcriptPath }),
      details: usageDetails({ input: 10, output: 5 }),
      estimated: false,
      evidence: 'source=test; event=second-agent',
      isDeltaFromSnapshot: true,
      storeOptions: { homeDir: tmpDir },
    });

    expect(repeated.records).toHaveLength(0);
    expect(readUsageRecords({ homeDir: tmpDir })).toHaveLength(1);
  });

  it('appends only later positive provider deltas', () => {
    const agent = makeAgent();
    ingestAgentUsageSnapshot({
      agent,
      details: usageDetails({ input: 10, output: 5, cacheRead: 2 }),
      estimated: false,
      evidence: 'source=test; event=first',
      isDeltaFromSnapshot: true,
      storeOptions: { homeDir: tmpDir },
    });

    ingestAgentUsageSnapshot({
      agent,
      details: usageDetails({ input: 15, output: 7, cacheRead: 2, reasoningOutput: 3 }),
      estimated: false,
      evidence: 'source=test; event=later',
      isDeltaFromSnapshot: true,
      storeOptions: { homeDir: tmpDir },
    });

    const records = readUsageRecords({ homeDir: tmpDir });
    expect(records).toHaveLength(2);
    expect(records[1]?.usage).toMatchObject({
      inputTokens: 5,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningOutputTokens: 3,
      artifactOutputTokens: 0,
    });
  });

  it('appends only a positive delta after seeding previous totals from the store', () => {
    const agent = makeAgent({ sessionId: 'seeded-delta' });
    ingestAgentUsageSnapshot({
      agent,
      details: usageDetails({ input: 10, output: 5 }),
      estimated: false,
      evidence: 'source=test; event=seed-first',
      isDeltaFromSnapshot: true,
      storeOptions: { homeDir: tmpDir },
    });

    resetUsageIngestionStateForTests();
    const later = ingestAgentUsageSnapshot({
      agent,
      details: usageDetails({ input: 13, output: 7 }),
      estimated: false,
      evidence: 'source=test; event=seed-later',
      isDeltaFromSnapshot: true,
      storeOptions: { homeDir: tmpDir },
    });

    const records = readUsageRecords({ homeDir: tmpDir });
    expect(later.records).toHaveLength(1);
    expect(records).toHaveLength(2);
    expect(records[1]?.usage).toMatchObject({
      inputTokens: 3,
      outputTokens: 2,
      artifactOutputTokens: 0,
    });
  });

  it('keeps artifact estimates separate from provider usage', () => {
    const agent = makeAgent();
    ingestAgentUsageSnapshot({
      agent,
      details: usageDetails({ input: 100, output: 25 }),
      artifactOutputTokens: 40,
      estimated: false,
      evidence: 'source=test; event=provider_with_artifact',
      storeOptions: { homeDir: tmpDir },
    });

    const artifactOnly = ingestAgentUsageSnapshot({
      agent,
      details: usageDetails({ input: 100, output: 25 }),
      artifactOutputTokens: 60,
      estimated: false,
      evidence: 'source=test; event=artifact_delta',
      storeOptions: { homeDir: tmpDir },
    });

    const records = readUsageRecords({ homeDir: tmpDir });
    expect(records.map((record) => record.recordKind)).toEqual([
      UsageRecordKind.USAGE_DELTA,
      UsageRecordKind.ARTIFACT_ESTIMATE,
      UsageRecordKind.ARTIFACT_ESTIMATE,
    ]);
    expect(records[0]?.usage.artifactOutputTokens).toBe(0);
    expect(records[0]?.totals.providerTotal).toBe(125);
    expect(records[1]?.usage.artifactOutputTokens).toBe(40);
    expect(records[1]?.totals.providerTotal).toBe(0);
    expect(records[1]?.apiProxyEstimate).toBeUndefined();
    expect(artifactOnly.records).toHaveLength(1);
    expect(artifactOnly.records[0]?.usage.artifactOutputTokens).toBe(20);
  });

  it('deduplicates unchanged rate-limit snapshots and appends changed snapshots', () => {
    const agent = makeAgent();
    const first = {
      agent,
      rateLimits: [{ name: 'primary' as const, usedPercent: 50, resetAtMs: 2000 }],
      evidence: 'source=test; event=rate_limit',
      storeOptions: { homeDir: tmpDir },
    };

    ingestAgentUsageSnapshot(first);
    const repeated = ingestAgentUsageSnapshot(first);
    ingestAgentUsageSnapshot({
      ...first,
      rateLimits: [{ name: 'primary' as const, usedPercent: 75, resetAtMs: 2000 }],
    });

    const records = readUsageRecords({ homeDir: tmpDir });
    expect(repeated.records).toHaveLength(0);
    expect(records).toHaveLength(2);
    expect(
      records.every((record) => record.recordKind === UsageRecordKind.RATE_LIMIT_SNAPSHOT),
    ).toBe(true);
    expect(records[0]?.usage.inputTokens).toBe(0);
    expect(records[1]?.rateLimits?.[0]).toMatchObject({ name: 'primary', usedPercent: 75 });
  });

  it('swallows append failures without poisoning future retry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const snapshot = {
      agent: makeAgent({ sessionId: 'retry-session' }),
      details: usageDetails({ input: 1 }),
      estimated: false,
      evidence: 'source=test; event=append_failure',
      storeOptions: { homeDir: tmpDir },
    };

    const result = ingestAgentUsageSnapshot({
      ...snapshot,
      appendRecord: () => {
        throw new Error('append failed');
      },
    });

    expect(result.records).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Usage ingestion: failed to append usage_delta'),
    );
    expect(readUsageRecords({ homeDir: tmpDir })).toHaveLength(0);

    const retry = ingestAgentUsageSnapshot(snapshot);

    expect(retry.records).toHaveLength(1);
    expect(readUsageRecords({ homeDir: tmpDir })).toHaveLength(1);
  });
});

function makeAgent(
  overrides: Partial<UsageIngestionSnapshotInput['agent']> = {},
): UsageIngestionSnapshotInput['agent'] {
  return {
    id: 7,
    providerId: 'codex',
    projectDir: 'C:\\Users\\User\\repo',
    projectName: 'repo',
    folderName: 'repo',
    jsonlFile: 'C:\\Users\\User\\.codex\\projects\\repo\\session.jsonl',
    sessionId: 'session-1',
    agentName: 'Codex #7',
    teamName: 'Codex',
    leadAgentId: 1,
    hidden: false,
    ...overrides,
  };
}

function usageDetails(overrides: Partial<TokenUsageDetails> = {}): TokenUsageDetails {
  return {
    input: 0,
    output: 0,
    reasoningOutput: 0,
    cacheRead: 0,
    cacheWrite: 0,
    artifactEstimate: 0,
    estimated: false,
    ...overrides,
  };
}
