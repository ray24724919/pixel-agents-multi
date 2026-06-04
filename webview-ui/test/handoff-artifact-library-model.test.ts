import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenHandoffArtifactMessage,
  handoffArtifactLibraryStateFromLoadedMessage,
  shouldRefreshHandoffArtifactsForMessage,
} from '../src/components/handoffArtifactLibraryModel.ts';

test('handoff artifact library model exposes an empty loaded state', () => {
  const state = handoffArtifactLibraryStateFromLoadedMessage({
    type: 'handoffArtifactsLoaded',
    artifacts: [],
    loadedAtMs: 100,
  });

  assert.equal(state.unavailable, false);
  assert.equal(state.loadedAtMs, 100);
  assert.deepEqual(state.items, []);
});

test('handoff artifact library model builds display items from safe metadata', () => {
  const state = handoffArtifactLibraryStateFromLoadedMessage({
    type: 'handoffArtifactsLoaded',
    artifacts: [
      {
        relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
        filename: '2026-06-04-1507-pixel-handoff.md',
        modifiedAt: 1_780_000_000_000,
        sizeBytes: 1536,
        title: 'Pixel handoff',
        absolutePath: 'C:\\Users\\User\\secret.md',
      },
    ],
    loadedAtMs: 1_780_000_000_100,
  });

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0]?.displayTitle, 'Pixel handoff');
  assert.equal(
    state.items[0]?.relativePath,
    'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
  );
  assert.match(state.items[0]?.displayDetail ?? '', /1\.5 KB/);
  assert.equal('absolutePath' in (state.items[0] ?? {}), false);
});

test('handoff artifact open message sends only the repo-relative path', () => {
  const message = buildOpenHandoffArtifactMessage(
    {
      relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
    },
    'open-1',
  );

  assert.ok(message);
  assert.deepEqual(message, {
    type: 'openHandoffArtifact',
    requestId: 'open-1',
    relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
  });
  assert.equal('path' in message, false);
  assert.equal('absolutePath' in message, false);
});

test('handoff artifact library refreshes after successful write acknowledgements', () => {
  assert.equal(shouldRefreshHandoffArtifactsForMessage({ type: 'handoffDraftWritten' }), true);
  assert.equal(shouldRefreshHandoffArtifactsForMessage({ type: 'handoffDraftWriteFailed' }), false);
});

test('handoff artifact library preserves unavailable errors without crashing', () => {
  const state = handoffArtifactLibraryStateFromLoadedMessage({
    type: 'handoffArtifactsLoaded',
    artifacts: [],
    loadedAtMs: 200,
    unavailable: true,
    error: 'Open a repository workspace before loading handoff artifacts.',
  });

  assert.equal(state.unavailable, true);
  assert.equal(state.error, 'Open a repository workspace before loading handoff artifacts.');
  assert.deepEqual(state.items, []);
});
