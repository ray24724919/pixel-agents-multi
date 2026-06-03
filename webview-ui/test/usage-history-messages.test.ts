import assert from 'node:assert/strict';
import test from 'node:test';

import { usageHistoryStateFromLoadedMessage } from '../src/hooks/usageHistoryMessages.ts';

test('usageHistoryLoaded messages are stored as webview usage history state', () => {
  const state = usageHistoryStateFromLoadedMessage({
    type: 'usageHistoryLoaded',
    loadedAtMs: 1234,
    records: [
      {
        schemaVersion: 1,
        id: 'usage-1',
        recordKind: 'usage_delta',
        capturedAtMs: 1000,
        provider: { id: 'codex', label: 'Codex' },
        project: { name: 'pixel-agents', dirHash: 'sha256:abc123' },
        agent: { id: 1, name: 'Codex #1' },
        session: { id: 'session-1', threadId: 'thread-1' },
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningOutputTokens: 0,
          artifactOutputTokens: 0,
        },
        totals: {
          providerInputTotal: 10,
          providerOutputTotal: 5,
          providerTotal: 15,
          displayTotal: 15,
        },
        accuracy: {
          tokenSource: 'exact_provider',
          artifactSource: 'none',
          isDeltaFromSnapshot: true,
        },
      },
    ],
  });

  assert.equal(state.loadedAtMs, 1234);
  assert.equal(state.unavailable, false);
  assert.equal(state.error, undefined);
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0]?.id, 'usage-1');
});

test('usageHistoryLoaded unavailable payloads keep visible error state', () => {
  const state = usageHistoryStateFromLoadedMessage({
    type: 'usageHistoryLoaded',
    records: [],
    loadedAtMs: 2000,
    unavailable: true,
    error: 'EACCES: permission denied',
  });

  assert.equal(state.loadedAtMs, 2000);
  assert.equal(state.unavailable, true);
  assert.equal(state.error, 'EACCES: permission denied');
  assert.deepEqual(state.records, []);
});
