import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCreateHandoffDispatchPromptMessage,
  buildCreateHandoffWorkPackageMessage,
  buildCreateHandoffWorkPackagePromptMessage,
  buildOpenHandoffArtifactMessage,
  buildOpenHandoffWorkPackageMessage,
  buildUpdateHandoffArtifactStatusMessage,
  buildUpdateHandoffDispatchStatusMessage,
  canCreateHandoffDispatchPrompt,
  canCreateHandoffWorkPackage,
  canUseHandoffWorkPackage,
  handoffArtifactLibraryStateFromLoadedMessage,
  handoffArtifactStatusActions,
  handoffDispatchPromptStatusLabel,
  handoffDispatchStatusActions,
  handoffWorkPackageStatusLabel,
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
        artifactId: '2026-06-04-1507-pixel-handoff',
        metadataRelativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.handoff.json',
        status: 'draft',
        createdAt: '2026-06-04T07:07:00.000Z',
        updatedAt: '2026-06-04T07:08:00.000Z',
        providerId: 'codex',
        projectName: 'Pixel Agents Multi',
        absolutePath: 'C:\\Users\\User\\secret.md',
      },
    ],
    loadedAtMs: 1_780_000_000_100,
  });

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0]?.displayTitle, 'Pixel handoff');
  assert.equal(state.items[0]?.artifactId, '2026-06-04-1507-pixel-handoff');
  assert.equal(
    state.items[0]?.metadataRelativePath,
    'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.handoff.json',
  );
  assert.equal(state.items[0]?.status, 'draft');
  assert.equal(state.items[0]?.statusLabel, 'Draft');
  assert.equal(state.items[0]?.providerId, 'codex');
  assert.equal(state.items[0]?.projectName, 'Pixel Agents Multi');
  assert.equal(
    state.items[0]?.relativePath,
    'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
  );
  assert.match(state.items[0]?.displayDetail ?? '', /1\.5 KB/);
  assert.match(state.items[0]?.displayDetail ?? '', /Draft/);
  assert.equal('absolutePath' in (state.items[0] ?? {}), false);
});

test('handoff artifact library model falls back for markdown-only handoffs', () => {
  const state = handoffArtifactLibraryStateFromLoadedMessage({
    type: 'handoffArtifactsLoaded',
    artifacts: [
      {
        relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
        filename: '2026-06-04-1507-pixel-handoff.md',
        modifiedAt: 1_780_000_000_000,
        sizeBytes: 512,
      },
    ],
    loadedAtMs: 1_780_000_000_100,
  });

  assert.equal(state.items[0]?.displayTitle, '2026-06-04-1507-pixel-handoff.md');
  assert.equal(state.items[0]?.statusLabel, 'Markdown only');
  assert.equal(state.items[0]?.artifactId, undefined);
  assert.match(state.items[0]?.displayDetail ?? '', /Markdown only/);
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
  assert.equal('metadataRelativePath' in message, false);
});

test('handoff artifact status actions expose local review workflow labels', () => {
  const actions = handoffArtifactStatusActions({
    artifactId: '2026-06-04-1507-pixel-handoff',
    metadataRelativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.handoff.json',
    status: 'draft',
  });

  assert.deepEqual(
    actions.map((action) => ({
      nextStatus: action.nextStatus,
      label: action.label,
      disabled: action.disabled,
    })),
    [
      { nextStatus: 'reviewed', label: 'Mark reviewed', disabled: false },
      { nextStatus: 'stale', label: 'Mark stale', disabled: false },
      { nextStatus: 'draft', label: 'Reset draft', disabled: true },
    ],
  );
});

test('handoff artifact status actions are disabled for markdown-only artifacts', () => {
  const actions = handoffArtifactStatusActions({ status: undefined });

  assert.equal(
    actions.every((action) => action.disabled),
    true,
  );
});

test('handoff artifact status update message sends only relative path and next status', () => {
  const message = buildUpdateHandoffArtifactStatusMessage(
    {
      relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
    },
    'reviewed',
    'status-1',
  );

  assert.ok(message);
  assert.deepEqual(message, {
    type: 'updateHandoffArtifactStatus',
    requestId: 'status-1',
    relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
    nextStatus: 'reviewed',
  });
  assert.equal('path' in message, false);
  assert.equal('absolutePath' in message, false);
  assert.equal('metadataRelativePath' in message, false);
});

test('handoff artifact dispatch prompt message sends only the repo-relative path', () => {
  const message = buildCreateHandoffDispatchPromptMessage(
    {
      relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
    },
    'dispatch-1',
  );

  assert.ok(message);
  assert.deepEqual(message, {
    type: 'createHandoffDispatchPrompt',
    requestId: 'dispatch-1',
    relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
  });
  assert.equal('path' in message, false);
  assert.equal('absolutePath' in message, false);
  assert.equal('prompt' in message, false);
});

test('handoff artifact dispatch prompt action requires a relative path', () => {
  assert.equal(
    canCreateHandoffDispatchPrompt({
      relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
    }),
    true,
  );
  assert.equal(canCreateHandoffDispatchPrompt({ relativePath: '' }), false);
});

test('handoff artifact dispatch prompt feedback includes branch and report names', () => {
  assert.equal(
    handoffDispatchPromptStatusLabel(
      'copied',
      'product/handoff-pixel-review',
      'docs/roadmap/supervision/reports/pixel-review-executor-report.md',
      '',
    ),
    'Dispatch prompt copied: product/handoff-pixel-review / docs/roadmap/supervision/reports/pixel-review-executor-report.md',
  );
  assert.match(
    handoffDispatchPromptStatusLabel('failed', '', '', 'Clipboard copy failed.'),
    /Clipboard copy failed/,
  );
});

test('handoff artifact library refreshes after successful write acknowledgements', () => {
  assert.equal(shouldRefreshHandoffArtifactsForMessage({ type: 'handoffDraftWritten' }), true);
  assert.equal(
    shouldRefreshHandoffArtifactsForMessage({ type: 'handoffArtifactStatusUpdated' }),
    true,
  );
  assert.equal(shouldRefreshHandoffArtifactsForMessage({ type: 'handoffDraftWriteFailed' }), false);
  assert.equal(
    shouldRefreshHandoffArtifactsForMessage({ type: 'handoffArtifactStatusUpdateFailed' }),
    false,
  );
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

test('handoff artifact library model exposes dispatch package metadata', () => {
  const state = handoffArtifactLibraryStateFromLoadedMessage({
    type: 'handoffArtifactsLoaded',
    artifacts: [
      {
        relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
        filename: '2026-06-04-1507-pixel-handoff.md',
        modifiedAt: 1_780_000_000_000,
        sizeBytes: 1536,
        title: 'Pixel handoff',
        artifactId: '2026-06-04-1507-pixel-handoff',
        metadataRelativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.handoff.json',
        status: 'reviewed',
        dispatchPackage: {
          packageRelativePath:
            'docs/roadmap/supervision/work-packages/handoffs/pixel-handoff-work-package.md',
          branchName: 'product/handoff-pixel-handoff',
          reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
          status: 'ready',
          createdAt: '2026-06-04T07:09:00.000Z',
          updatedAt: '2026-06-04T07:10:00.000Z',
          absolutePath: 'C:\\Users\\User\\secret.md',
        },
      },
    ],
    loadedAtMs: 1_780_000_000_100,
  });

  assert.equal(state.items[0]?.dispatchPackage?.status, 'ready');
  assert.equal(state.items[0]?.dispatchPackage?.statusLabel, 'Ready');
  assert.equal(
    state.items[0]?.dispatchPackage?.packageRelativePath,
    'docs/roadmap/supervision/work-packages/handoffs/pixel-handoff-work-package.md',
  );
  assert.match(state.items[0]?.displayDetail ?? '', /package Ready/);
  assert.equal('absolutePath' in (state.items[0]?.dispatchPackage ?? {}), false);
});

test('handoff work package create action requires sidecar metadata and no existing package', () => {
  const withMetadata = {
    relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
    artifactId: '2026-06-04-1507-pixel-handoff',
    metadataRelativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.handoff.json',
  };

  assert.equal(canCreateHandoffWorkPackage(withMetadata), true);
  assert.equal(
    canCreateHandoffWorkPackage({
      ...withMetadata,
      dispatchPackage: {
        packageRelativePath:
          'docs/roadmap/supervision/work-packages/handoffs/pixel-handoff-work-package.md',
        branchName: 'product/handoff-pixel-handoff',
        reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
        status: 'draft',
        createdAt: '2026-06-04T07:09:00.000Z',
        updatedAt: '2026-06-04T07:09:00.000Z',
        statusLabel: 'Draft package',
      },
    }),
    false,
  );
  assert.equal(canCreateHandoffWorkPackage({ relativePath: withMetadata.relativePath }), false);
});

test('handoff work package messages send only the handoff relative path and status', () => {
  const item = {
    relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
    artifactId: '2026-06-04-1507-pixel-handoff',
    metadataRelativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.handoff.json',
    dispatchPackage: {
      packageRelativePath:
        'docs/roadmap/supervision/work-packages/handoffs/pixel-handoff-work-package.md',
      branchName: 'product/handoff-pixel-handoff',
      reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
      status: 'draft' as const,
      createdAt: '2026-06-04T07:09:00.000Z',
      updatedAt: '2026-06-04T07:09:00.000Z',
      statusLabel: 'Draft package',
    },
  };

  assert.deepEqual(buildOpenHandoffWorkPackageMessage(item, 'open-work-1'), {
    type: 'openHandoffWorkPackage',
    requestId: 'open-work-1',
    relativePath: item.relativePath,
  });
  assert.deepEqual(buildCreateHandoffWorkPackagePromptMessage(item, 'copy-work-1'), {
    type: 'createHandoffWorkPackagePrompt',
    requestId: 'copy-work-1',
    relativePath: item.relativePath,
  });
  assert.deepEqual(buildUpdateHandoffDispatchStatusMessage(item, 'ready', 'status-work-1'), {
    type: 'updateHandoffDispatchStatus',
    requestId: 'status-work-1',
    relativePath: item.relativePath,
    nextStatus: 'ready',
  });
  assert.deepEqual(
    buildCreateHandoffWorkPackageMessage({ ...item, dispatchPackage: undefined }, 'create-work-1'),
    {
      type: 'createHandoffWorkPackage',
      requestId: 'create-work-1',
      relativePath: item.relativePath,
    },
  );
  assert.equal(
    'packageRelativePath' in buildOpenHandoffWorkPackageMessage(item, 'open-work-2')!,
    false,
  );
  assert.equal(
    'absolutePath' in buildCreateHandoffWorkPackagePromptMessage(item, 'copy-work-2')!,
    false,
  );
  assert.equal(
    'prompt' in buildUpdateHandoffDispatchStatusMessage(item, 'ready', 'status-work-2')!,
    false,
  );
});

test('handoff dispatch status actions disable the current package status', () => {
  const item = {
    relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
    dispatchPackage: {
      packageRelativePath:
        'docs/roadmap/supervision/work-packages/handoffs/pixel-handoff-work-package.md',
      branchName: 'product/handoff-pixel-handoff',
      reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
      status: 'blocked' as const,
      createdAt: '2026-06-04T07:09:00.000Z',
      updatedAt: '2026-06-04T07:09:00.000Z',
      statusLabel: 'Blocked',
    },
  };

  assert.equal(canUseHandoffWorkPackage(item), true);
  assert.deepEqual(
    handoffDispatchStatusActions(item).map((action) => ({
      nextStatus: action.nextStatus,
      label: action.label,
      disabled: action.disabled,
    })),
    [
      { nextStatus: 'ready', label: 'Mark ready', disabled: false },
      { nextStatus: 'dispatched', label: 'Mark dispatched', disabled: false },
      { nextStatus: 'completed', label: 'Mark completed', disabled: false },
      { nextStatus: 'blocked', label: 'Mark blocked', disabled: true },
      { nextStatus: 'draft', label: 'Reset draft', disabled: false },
    ],
  );
});

test('handoff work package feedback labels include generated branch and report names', () => {
  assert.match(
    handoffWorkPackageStatusLabel(
      'copied',
      'docs/roadmap/supervision/work-packages/handoffs/pixel-handoff-work-package.md',
      'product/handoff-pixel-handoff',
      'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
      '',
    ),
    /product\/handoff-pixel-handoff/,
  );
  assert.match(
    handoffWorkPackageStatusLabel('failed', '', '', '', 'Clipboard copy failed.'),
    /Clipboard copy failed/,
  );
});

test('handoff artifact library refreshes after work package mutations', () => {
  assert.equal(
    shouldRefreshHandoffArtifactsForMessage({ type: 'handoffWorkPackageCreated' }),
    true,
  );
  assert.equal(
    shouldRefreshHandoffArtifactsForMessage({ type: 'handoffDispatchStatusUpdated' }),
    true,
  );
  assert.equal(
    shouldRefreshHandoffArtifactsForMessage({ type: 'handoffWorkPackagePromptCreated' }),
    false,
  );
});
