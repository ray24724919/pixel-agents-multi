import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const {
  UsageDisplayLabel,
  UsageRecordKind,
  UsageTokenSource,
  appendUsageRecord,
  createArtifactEstimateRecord,
  createRateLimitSnapshotRecord,
  createUsageDeltaRecord,
  ensureUsageStoreDir,
  getUsageStorePath,
  hashUsagePath,
  readUsageRecords,
  redactUsagePath,
} = await import('../../src/usageStore.js');

describe('usage store foundation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-usage-store-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the local usage store directory under the expected path', () => {
    const storePath = getUsageStorePath(tmpDir);
    const storeDir = ensureUsageStoreDir({ homeDir: tmpDir });

    expect(storePath).toBe(path.join(tmpDir, '.pixel-agents', 'usage', 'usage-v1.jsonl'));
    expect(storeDir).toBe(path.dirname(storePath));
    expect(fs.existsSync(storeDir)).toBe(true);
  });

  it('appends and reads usage records as JSONL without raw paths by default', () => {
    const record = createUsageDeltaRecord({
      id: 'usage-1',
      capturedAtMs: 1000,
      occurredAtMs: 900,
      provider: { id: 'codex', label: 'Codex' },
      project: { name: 'pixel-agents', dir: 'C:\\Users\\User\\repo' },
      agent: { id: 7, name: 'Codex #7' },
      session: {
        id: 'session-1',
        transcriptPath: 'C:\\Users\\User\\.codex\\projects\\repo\\session.jsonl',
      },
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
        reasoningOutputTokens: 4,
      },
      tokenSource: UsageTokenSource.EXACT_PROVIDER,
      proxyRates: { inputRatePerMillion: 5, outputRatePerMillion: 30 },
    });

    appendUsageRecord(record, { homeDir: tmpDir });

    const records = readUsageRecords({ homeDir: tmpDir });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'usage-1',
      recordKind: UsageRecordKind.USAGE_DELTA,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
        reasoningOutputTokens: 4,
        artifactOutputTokens: 0,
      },
      totals: {
        providerInputTotal: 15,
        providerOutputTotal: 9,
        providerTotal: 24,
        displayTotal: 24,
      },
      labels: {
        tokenSource: UsageDisplayLabel.EXACT_PROVIDER,
        apiProxy: UsageDisplayLabel.API_PROXY,
        nonBilling: UsageDisplayLabel.NON_BILLING,
      },
    });
    expect(records[0]?.project.dir).toBeUndefined();
    expect(records[0]?.project.dirHash).toMatch(/^sha256:/);
    expect(records[0]?.session.transcriptPath).toBeUndefined();
    expect(records[0]?.session.transcriptPathHash).toMatch(/^sha256:/);
    expect(records[0]?.apiProxyEstimate?.nonBillingLabel).toBe(
      UsageDisplayLabel.API_PROXY,
    );
    expect(records[0]?.apiProxyEstimate?.subscriptionBillingLabel).toBe(
      UsageDisplayLabel.NON_BILLING,
    );
  });

  it('skips malformed lines while reading an append-only store', () => {
    const valid = createUsageDeltaRecord({
      id: 'usage-valid',
      capturedAtMs: 1000,
      provider: { id: 'claude', label: 'Claude' },
      project: { name: 'project' },
      agent: { id: 1, name: 'Claude #1' },
      usage: { inputTokens: 1 },
      tokenSource: UsageTokenSource.ESTIMATED_TRANSCRIPT,
    });
    const storePath = getUsageStorePath(tmpDir);
    ensureUsageStoreDir({ homeDir: tmpDir });
    fs.writeFileSync(
      storePath,
      [
        JSON.stringify(valid),
        'not-json',
        JSON.stringify({ schemaVersion: 1, id: 'missing-required-fields' }),
      ].join('\n') + '\n',
      'utf8',
    );

    const records = readUsageRecords({ homeDir: tmpDir });
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe('usage-valid');
  });

  it('creates stable redacted hashes for project and transcript paths', () => {
    const projectPath = 'C:\\Users\\User\\repo\\';
    const transcriptPath = 'C:\\Users\\User\\.codex\\projects\\repo\\session.jsonl';

    const projectHash = hashUsagePath(projectPath);
    const projectRedaction = redactUsagePath(projectPath, 'project');
    const transcriptRedaction = redactUsagePath(transcriptPath, 'transcript');

    expect(projectHash).toBe(hashUsagePath(projectPath));
    expect(projectRedaction).toEqual({
      hash: projectHash,
      redacted: `project:${projectHash}`,
    });
    expect(projectRedaction?.redacted).not.toContain('Users');
    if (!transcriptRedaction) throw new Error('Expected transcript path redaction');
    expect(transcriptRedaction?.redacted).toBe(`transcript:${transcriptRedaction.hash}`);
    expect(transcriptRedaction?.redacted).not.toContain('session.jsonl');
  });

  it('keeps artifact estimates separate from provider and proxy totals', () => {
    const usageRecord = createUsageDeltaRecord({
      id: 'usage-provider',
      capturedAtMs: 1000,
      provider: { id: 'codex', label: 'Codex' },
      project: { name: 'project' },
      agent: { id: 2, name: 'Codex #2' },
      usage: { inputTokens: 100, outputTokens: 25 },
      tokenSource: UsageTokenSource.EXACT_PROVIDER,
      proxyRates: { inputRatePerMillion: 5, outputRatePerMillion: 30 },
    });
    const artifactRecord = createArtifactEstimateRecord({
      id: 'artifact-estimate',
      capturedAtMs: 1001,
      provider: { id: 'codex', label: 'Codex' },
      project: { name: 'project' },
      agent: { id: 2, name: 'Codex #2' },
      artifactOutputTokens: 300,
    });

    expect(usageRecord.usage.artifactOutputTokens).toBe(0);
    expect(usageRecord.totals.providerTotal).toBe(125);
    expect(usageRecord.apiProxyEstimate?.totalProxy).toBeGreaterThan(0);
    expect(artifactRecord.recordKind).toBe(UsageRecordKind.ARTIFACT_ESTIMATE);
    expect(artifactRecord.usage.artifactOutputTokens).toBe(300);
    expect(artifactRecord.totals.providerTotal).toBe(0);
    expect(artifactRecord.totals.displayTotal).toBe(0);
    expect(artifactRecord.apiProxyEstimate).toBeUndefined();
    expect(artifactRecord.labels.artifact).toBe(UsageDisplayLabel.ARTIFACT);
  });

  it('creates rate-limit snapshot records without token usage', () => {
    const record = createRateLimitSnapshotRecord({
      id: 'rate-limit',
      capturedAtMs: 2000,
      provider: { id: 'codex', label: 'Codex' },
      project: { name: 'project' },
      agent: { id: 3, name: 'Codex #3' },
      rateLimits: [
        {
          name: 'primary',
          usedPercent: 82,
          resetAtMs: 3000,
        },
      ],
    });

    expect(record).toMatchObject({
      recordKind: UsageRecordKind.RATE_LIMIT_SNAPSHOT,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningOutputTokens: 0,
        artifactOutputTokens: 0,
      },
      totals: {
        providerInputTotal: 0,
        providerOutputTotal: 0,
        providerTotal: 0,
        displayTotal: 0,
      },
      rateLimits: [
        {
          name: 'primary',
          usedPercent: 82,
          resetAtMs: 3000,
          source: 'provider_exact',
        },
      ],
    });
    expect(record.labels.tokenSource).toBe(UsageDisplayLabel.EXACT_PROVIDER);
  });
});
