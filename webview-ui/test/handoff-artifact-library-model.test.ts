import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCreateHandoffDispatchPromptMessage,
  buildCreateHandoffWorkPackageMessage,
  buildCreateHandoffWorkPackagePromptMessage,
  buildHandoffChecklistCopyModel,
  buildHandoffExecutionQueueSummary,
  buildHandoffExecutorStateModel,
  buildHandoffMergeReadiness,
  buildHandoffQueueOperatorSummary,
  buildHandoffQueueSummary,
  buildHandoffReviewChecklist,
  buildHandoffReviewRecommendedAction,
  buildHandoffStatusSelectModel,
  buildLaunchHandoffExecutorMessage,
  buildLinkHandoffExecutionAgentMessage,
  buildOpenHandoffArtifactMessage,
  buildOpenHandoffReportMessage,
  buildOpenHandoffWorkPackageMessage,
  buildRefreshHandoffCompletionMessage,
  buildUpdateHandoffArtifactStatusMessage,
  buildUpdateHandoffDispatchStatusMessage,
  buildUpdateHandoffExecutionStatusMessage,
  canCreateHandoffDispatchPrompt,
  canCreateHandoffWorkPackage,
  canUseHandoffWorkPackage,
  filterHandoffQueueItems,
  handoffArtifactLibraryStateFromLoadedMessage,
  handoffArtifactStatusActions,
  handoffDispatchPromptStatusLabel,
  handoffDispatchStatusActions,
  handoffExecutionActionStatusLabel,
  handoffExecutionStatusActions,
  handoffQueueGroupForItem,
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

test('handoff artifact library model exposes execution metadata safely', () => {
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
          status: 'dispatched',
          createdAt: '2026-06-04T07:09:00.000Z',
          updatedAt: '2026-06-04T07:10:00.000Z',
          execution: {
            agentId: 12,
            agentName: 'Codex C:\\Users\\User\\secret',
            providerId: 'codex',
            projectName: 'Pixel Agents Multi',
            sessionId: 'session-abc',
            status: 'active',
            linkedAt: '2026-06-04T07:11:00.000Z',
            updatedAt: '2026-06-04T07:12:00.000Z',
            absolutePath: 'C:\\Users\\User\\private.jsonl',
          },
        },
      },
    ],
  });

  const execution = state.items[0]?.dispatchPackage?.execution;
  assert.equal(execution?.agentId, 12);
  assert.equal(execution?.status, 'active');
  assert.equal(execution?.statusLabel, 'Active');
  assert.match(execution?.agentName ?? '', /\[redacted path\]/);
  assert.match(state.items[0]?.displayDetail ?? '', /execution Active/);
  assert.equal('absolutePath' in (execution ?? {}), false);
});

test('handoff execution messages send only relative path agent id and status', () => {
  const item = {
    relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
    dispatchPackage: {
      packageRelativePath:
        'docs/roadmap/supervision/work-packages/handoffs/pixel-handoff-work-package.md',
      branchName: 'product/handoff-pixel-handoff',
      reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
      status: 'dispatched' as const,
      createdAt: '2026-06-04T07:09:00.000Z',
      updatedAt: '2026-06-04T07:10:00.000Z',
      execution: {
        agentId: 12,
        agentName: 'Codex executor',
        providerId: 'codex',
        linkedAt: '2026-06-04T07:11:00.000Z',
        updatedAt: '2026-06-04T07:12:00.000Z',
        status: 'active' as const,
        statusLabel: 'Active',
      },
      statusLabel: 'Dispatched',
    },
  };

  assert.deepEqual(buildLinkHandoffExecutionAgentMessage(item, 12, 'link-1'), {
    type: 'linkHandoffExecutionAgent',
    requestId: 'link-1',
    relativePath: item.relativePath,
    agentId: 12,
  });
  assert.deepEqual(buildUpdateHandoffExecutionStatusMessage(item, 'waiting', 'exec-status-1'), {
    type: 'updateHandoffExecutionStatus',
    requestId: 'exec-status-1',
    relativePath: item.relativePath,
    nextStatus: 'waiting',
  });
  assert.equal('providerId' in buildLinkHandoffExecutionAgentMessage(item, 12, 'link-2')!, false);
  assert.equal('agentName' in buildLinkHandoffExecutionAgentMessage(item, 12, 'link-3')!, false);
  assert.equal(buildLinkHandoffExecutionAgentMessage(item, 0, 'link-4'), undefined);
  assert.equal(
    buildUpdateHandoffExecutionStatusMessage(
      { ...item, dispatchPackage: { ...item.dispatchPackage, execution: undefined } },
      'waiting',
      'exec-status-2',
    ),
    undefined,
  );
});

test('handoff execution status actions and queue summary reflect package execution', () => {
  const items = [
    {
      relativePath: 'docs/agent-handoffs/ready.md',
      updatedAt: '2026-06-04T07:00:00.000Z',
      dispatchPackage: {
        packageRelativePath: 'docs/roadmap/supervision/work-packages/handoffs/ready.md',
        branchName: 'product/handoff-ready',
        reportRelativePath: 'docs/roadmap/supervision/reports/ready-executor-report.md',
        status: 'dispatched' as const,
        createdAt: '2026-06-04T07:00:00.000Z',
        updatedAt: '2026-06-04T07:10:00.000Z',
        execution: {
          agentId: 12,
          status: 'waiting' as const,
          linkedAt: '2026-06-04T07:11:00.000Z',
          updatedAt: '2026-06-04T07:12:00.000Z',
          statusLabel: 'Waiting',
        },
        statusLabel: 'Dispatched',
      },
    },
    {
      relativePath: 'docs/agent-handoffs/blocked.md',
      dispatchPackage: {
        packageRelativePath: 'docs/roadmap/supervision/work-packages/handoffs/blocked.md',
        branchName: 'product/handoff-blocked',
        reportRelativePath: 'docs/roadmap/supervision/reports/blocked-executor-report.md',
        status: 'blocked' as const,
        createdAt: '2026-06-04T08:00:00.000Z',
        updatedAt: '2026-06-04T08:10:00.000Z',
        statusLabel: 'Blocked',
      },
    },
  ];

  assert.deepEqual(
    handoffExecutionStatusActions(items[0]!).map((action) => ({
      nextStatus: action.nextStatus,
      disabled: action.disabled,
    })),
    [
      { nextStatus: 'active', disabled: false },
      { nextStatus: 'waiting', disabled: true },
      { nextStatus: 'completed', disabled: false },
      { nextStatus: 'blocked', disabled: false },
      { nextStatus: 'unknown', disabled: false },
    ],
  );
  const summary = buildHandoffExecutionQueueSummary(items);
  assert.equal(summary.dispatchPackageCount, 2);
  assert.equal(summary.linkedPackageCount, 1);
  assert.equal(summary.blockedPackageCount, 1);
  assert.equal(summary.dispatchCounts.dispatched, 1);
  assert.equal(summary.executionCounts.waiting, 1);
  assert.match(
    handoffExecutionActionStatusLabel(
      'linked',
      'Codex executor #12',
      'docs/roadmap/supervision/work-packages/handoffs/ready.md',
      '',
    ),
    /Codex executor #12/,
  );
});

test('handoff status select model marks an existing current action option', () => {
  const model = buildHandoffStatusSelectModel('waiting', 'Waiting', [
    { nextStatus: 'active', label: 'Mark active', disabled: false },
    { nextStatus: 'waiting', label: 'Mark waiting', disabled: true },
  ]);

  assert.equal(model.disabled, false);
  assert.deepEqual(model.options, [
    { value: 'active', label: 'Mark active', disabled: false, current: false },
    { value: 'waiting', label: 'Current: Waiting', disabled: true, current: true },
  ]);
});

test('handoff status select model keeps a missing current state visible', () => {
  const model = buildHandoffStatusSelectModel<'linked' | 'active' | 'waiting'>('linked', 'Linked', [
    { nextStatus: 'active', label: 'Mark active', disabled: false },
    { nextStatus: 'waiting', label: 'Mark waiting', disabled: false },
  ]);

  assert.equal(model.disabled, false);
  assert.deepEqual(model.options, [
    { value: 'linked', label: 'Current: Linked', disabled: true, current: true },
    { value: 'active', label: 'Mark active', disabled: false, current: false },
    { value: 'waiting', label: 'Mark waiting', disabled: false, current: false },
  ]);
});

test('handoff status select model disables everything while globally busy', () => {
  const model = buildHandoffStatusSelectModel(
    'active',
    'Active',
    [
      { nextStatus: 'active', label: 'Mark active', disabled: true },
      { nextStatus: 'waiting', label: 'Mark waiting', disabled: false },
    ],
    true,
  );

  assert.equal(model.disabled, true);
  assert.deepEqual(
    model.options.map((option) => option.disabled),
    [true, true],
  );
});

test('handoff status select model disables the select when no transition is available', () => {
  const model = buildHandoffStatusSelectModel('waiting', 'Waiting', [
    { nextStatus: 'active', label: 'Mark active', disabled: true },
    { nextStatus: 'waiting', label: 'Mark waiting', disabled: true },
  ]);

  assert.equal(model.disabled, true);
});

test('handoff status select model allows transitions from a non-transition current state', () => {
  const model = buildHandoffStatusSelectModel<'linked' | 'active' | 'waiting'>('linked', 'Linked', [
    { nextStatus: 'active', label: 'Mark active', disabled: false },
    { nextStatus: 'waiting', label: 'Mark waiting', disabled: true },
  ]);

  assert.equal(model.disabled, false);
  assert.equal(model.options[0]?.value, 'linked');
  assert.equal(model.options[1]?.disabled, false);
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
  assert.equal(shouldRefreshHandoffArtifactsForMessage({ type: 'handoffExecutionLinked' }), true);
  assert.equal(
    shouldRefreshHandoffArtifactsForMessage({ type: 'handoffExecutionStatusUpdated' }),
    true,
  );
  assert.equal(shouldRefreshHandoffArtifactsForMessage({ type: 'handoffExecutorLaunched' }), true);
  assert.equal(
    shouldRefreshHandoffArtifactsForMessage({ type: 'handoffCompletionRefreshed' }),
    true,
  );
});

test('handoff completion metadata is parsed and exposed without absolute paths', () => {
  const state = handoffArtifactLibraryStateFromLoadedMessage({
    type: 'handoffArtifactsLoaded',
    artifacts: [
      {
        relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
        filename: '2026-06-04-1507-pixel-handoff.md',
        modifiedAt: 1_780_000_000_000,
        sizeBytes: 1536,
        title: 'Pixel handoff',
        dispatchPackage: {
          packageRelativePath:
            'docs/roadmap/supervision/work-packages/handoffs/pixel-handoff-work-package.md',
          branchName: 'product/handoff-pixel-handoff',
          reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
          status: 'dispatched',
          createdAt: '2026-06-04T07:09:00.000Z',
          updatedAt: '2026-06-04T07:10:00.000Z',
        },
        completion: {
          reportExists: true,
          reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
          reportModifiedAt: 1_780_000_001_000,
          reportSizeBytes: 2048,
          branchName: 'product/handoff-pixel-handoff',
          branchExists: true,
          branchMergedToMain: false,
          checkedAt: '2026-06-04T07:11:00.000Z',
          absolutePath: 'C:\\Users\\User\\private.md',
        },
      },
    ],
  });

  const completion = state.items[0]?.completion;
  assert.equal(completion?.reportExists, true);
  assert.equal(completion?.branchExists, true);
  assert.equal(completion?.branchMergedToMain, false);
  assert.match(completion?.statusLabel ?? '', /Report ready/);
  assert.match(state.items[0]?.displayDetail ?? '', /Report ready/);
  assert.equal('absolutePath' in (completion ?? {}), false);
});

test('handoff completion review payload is parsed with safe labels and report cues', () => {
  const state = handoffArtifactLibraryStateFromLoadedMessage({
    type: 'handoffArtifactsLoaded',
    artifacts: [
      {
        relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
        filename: '2026-06-04-1507-pixel-handoff.md',
        modifiedAt: 1_780_000_000_000,
        sizeBytes: 1536,
        title: 'Pixel handoff',
        dispatchPackage: {
          packageRelativePath:
            'docs/roadmap/supervision/work-packages/handoffs/pixel-handoff-work-package.md',
          branchName: 'product/handoff-pixel-handoff',
          reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
          status: 'dispatched',
          createdAt: '2026-06-04T07:09:00.000Z',
          updatedAt: '2026-06-04T07:10:00.000Z',
        },
        review: {
          status: 'ready_to_merge',
          statusLabel: 'Ready to merge',
          nextActionLabel: 'Inspect branch',
          reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
          branchName: 'product/handoff-pixel-handoff',
          report: {
            title: 'Report C:\\Users\\User\\secret.md',
            hasSummary: true,
            hasFilesChanged: true,
            hasValidation: true,
            hasAcceptanceCriteria: false,
            hasDeviations: true,
            validationLines: ['npm run build passed', 'Raw prompt: do not leak'],
            changedFileLines: ['C:\\Users\\User\\private.ts'],
            riskLines: ['/home/user/private/transcript.jsonl'],
            truncated: false,
            rawBody: 'full report body',
          },
          git: {
            branchExists: true,
            branchMergedToMain: false,
            branchHeadSha: 'ABC1234567890',
            mainHeadSha: 'def1234567890',
            aheadCount: 2,
            behindCount: 0,
            absolutePath: 'C:\\Users\\User\\.git',
          },
          warnings: ['C:\\Users\\User\\warning.md'],
          checkedAt: '2026-06-04T07:11:00.000Z',
          absolutePath: 'C:\\Users\\User\\private.md',
        },
      },
    ],
  });

  const review = state.items[0]?.review;
  assert.equal(review?.status, 'ready_to_merge');
  assert.equal(review?.statusLabel, 'Ready to merge');
  assert.equal(review?.nextActionLabel, 'Inspect branch');
  assert.equal(review?.git?.branchHeadSha, 'abc1234567890');
  assert.equal(review?.git?.aheadCount, 2);
  assert.match(review?.report?.title ?? '', /\[redacted path\]/);
  assert.match(review?.report?.changedFileLines[0] ?? '', /\[redacted path\]/);
  assert.match(review?.report?.riskLines[0] ?? '', /\[redacted path\]/);
  assert.equal(JSON.stringify(review).includes('C:\\Users\\User'), false);
  assert.equal(JSON.stringify(review).includes('/home/user/private'), false);
  assert.equal(JSON.stringify(review).includes('full report body'), false);
  assert.match(state.items[0]?.displayDetail ?? '', /review Ready to merge/);
});

test('handoff completion review checklist summarizes report and branch cues', () => {
  const state = handoffArtifactLibraryStateFromLoadedMessage({
    type: 'handoffArtifactsLoaded',
    artifacts: [
      {
        relativePath: 'docs/agent-handoffs/review-checklist.md',
        filename: 'review-checklist.md',
        modifiedAt: 1_780_000_000_000,
        sizeBytes: 1536,
        dispatchPackage: {
          packageRelativePath:
            'docs/roadmap/supervision/work-packages/handoffs/review-checklist-work-package.md',
          branchName: 'product/handoff-review-checklist',
          reportRelativePath:
            'docs/roadmap/supervision/reports/review-checklist-executor-report.md',
          status: 'dispatched',
          createdAt: '2026-06-04T07:09:00.000Z',
          updatedAt: '2026-06-04T07:10:00.000Z',
        },
        completion: {
          reportExists: true,
          reportRelativePath:
            'docs/roadmap/supervision/reports/review-checklist-executor-report.md',
          branchName: 'product/handoff-review-checklist',
          branchExists: true,
          branchMergedToMain: false,
          checkedAt: '2026-06-04T07:11:00.000Z',
        },
        review: {
          status: 'needs_review',
          statusLabel: 'Needs review',
          nextActionLabel: 'Open report',
          reportRelativePath:
            'docs/roadmap/supervision/reports/review-checklist-executor-report.md',
          branchName: 'product/handoff-review-checklist',
          report: {
            hasSummary: true,
            hasFilesChanged: false,
            hasValidation: true,
            hasAcceptanceCriteria: true,
            hasDeviations: false,
            validationLines: ['npm run build passed'],
            changedFileLines: [],
            riskLines: [],
            truncated: false,
          },
          git: {
            branchExists: true,
            branchMergedToMain: false,
            aheadCount: 2,
            behindCount: 0,
          },
          warnings: ['Validation should be manually confirmed'],
          checkedAt: '2026-06-04T07:12:00.000Z',
        },
      },
    ],
  });

  const checklist = buildHandoffReviewChecklist(state.items[0]!);
  assert.deepEqual(
    checklist.map((item) => [item.id, item.state, item.detail]),
    [
      ['summary', 'ok', 'present'],
      ['files_changed', 'missing', 'missing'],
      ['validation', 'ok', 'present'],
      ['warnings', 'warning', '1 warning'],
      ['branch', 'warning', 'not merged / ahead 2 / behind 0'],
    ],
  );
});

test('handoff completion review recommendations map statuses to local review actions', () => {
  const base = {
    relativePath: 'docs/agent-handoffs/review-action.md',
    artifactId: 'review-action',
    metadataRelativePath: 'docs/agent-handoffs/review-action.handoff.json',
    status: 'draft',
    dispatchPackage: {
      packageRelativePath:
        'docs/roadmap/supervision/work-packages/handoffs/review-action-work-package.md',
      branchName: 'product/handoff-review-action',
      reportRelativePath: 'docs/roadmap/supervision/reports/review-action-executor-report.md',
      status: 'dispatched' as const,
      createdAt: '2026-06-04T07:09:00.000Z',
      updatedAt: '2026-06-04T07:10:00.000Z',
      statusLabel: 'Dispatched',
    },
    completion: {
      reportExists: true,
      reportRelativePath: 'docs/roadmap/supervision/reports/review-action-executor-report.md',
      branchName: 'product/handoff-review-action',
      branchExists: true,
      branchMergedToMain: false,
      checkedAt: '2026-06-04T07:11:00.000Z',
      statusLabel: 'Report ready / branch exists / not merged',
    },
  };
  const withReview = (
    status:
      | 'active'
      | 'blocked'
      | 'merged'
      | 'needs_report'
      | 'needs_review'
      | 'ready_to_merge'
      | 'unknown',
    reportExists = true,
  ) => ({
    ...base,
    completion: { ...base.completion, reportExists },
    review: {
      status,
      statusLabel: status,
      nextActionLabel: 'Next',
      warnings: [],
      checkedAt: '2026-06-04T07:12:00.000Z',
    },
  });

  assert.deepEqual(buildHandoffReviewRecommendedAction(withReview('merged')), {
    kind: 'mark_reviewed',
    label: 'Mark reviewed',
    disabled: false,
    detail: 'Branch is merged; close the local handoff review.',
  });
  assert.deepEqual(buildHandoffReviewRecommendedAction(withReview('ready_to_merge')), {
    kind: 'open_report',
    label: 'Inspect branch / open report',
    disabled: false,
    detail: 'Report is ready; inspect the branch manually before merge.',
  });
  assert.deepEqual(buildHandoffReviewRecommendedAction(withReview('needs_review')), {
    kind: 'open_report',
    label: 'Open report',
    disabled: false,
    detail: 'Review executor notes, validation, and changed-file cues.',
  });
  assert.deepEqual(buildHandoffReviewRecommendedAction(withReview('needs_report', false)), {
    kind: 'wait_for_report',
    label: 'Report missing',
    disabled: true,
    detail: 'Refresh after the executor writes its report.',
  });
  assert.deepEqual(
    buildHandoffReviewRecommendedAction(withReview('active')).kind,
    'refresh_completion',
  );
  assert.deepEqual(buildHandoffReviewRecommendedAction(withReview('blocked', false)), {
    kind: 'wait_for_report',
    label: 'Report missing',
    disabled: true,
    detail: 'No executor report is available yet.',
  });
  assert.equal(
    buildHandoffReviewRecommendedAction({ ...withReview('merged'), status: 'reviewed' }).disabled,
    true,
  );
});

test('handoff merge readiness maps review statuses to supervisor decisions', () => {
  const base = {
    relativePath: 'docs/agent-handoffs/merge-readiness.md',
    filename: 'merge-readiness.md',
    modifiedAt: 1_780_000_000_000,
    sizeBytes: 1024,
    displayTitle: 'Merge readiness',
    displayDetail: 'detail',
    statusLabel: 'Draft',
    dispatchPackage: {
      packageRelativePath:
        'docs/roadmap/supervision/work-packages/handoffs/merge-readiness-work-package.md',
      branchName: 'product/handoff-merge-readiness',
      reportRelativePath: 'docs/roadmap/supervision/reports/merge-readiness-executor-report.md',
      status: 'dispatched' as const,
      createdAt: '2026-06-04T07:09:00.000Z',
      updatedAt: '2026-06-04T07:10:00.000Z',
      statusLabel: 'Dispatched',
    },
    completion: {
      reportExists: true,
      reportRelativePath: 'docs/roadmap/supervision/reports/merge-readiness-executor-report.md',
      branchName: 'product/handoff-merge-readiness',
      branchExists: true,
      branchMergedToMain: false,
      checkedAt: '2026-06-04T07:11:00.000Z',
      statusLabel: 'Report ready / branch exists / not merged',
    },
  };
  const withReview = (
    status:
      | 'active'
      | 'blocked'
      | 'merged'
      | 'needs_report'
      | 'needs_review'
      | 'ready_to_merge'
      | 'unknown',
  ) => ({
    ...base,
    review: {
      status,
      statusLabel: status,
      nextActionLabel: 'Next',
      report: {
        hasSummary: true,
        hasFilesChanged: true,
        hasValidation: status !== 'needs_review',
        hasAcceptanceCriteria: true,
        hasDeviations: false,
        validationLines: [],
        changedFileLines: [],
        riskLines: [],
        truncated: false,
      },
      git: {
        branchExists: true,
        branchMergedToMain: status === 'merged',
        aheadCount: status === 'merged' ? 0 : 2,
        behindCount: 0,
      },
      warnings: status === 'blocked' ? ['Blocked by validation'] : [],
      checkedAt: '2026-06-04T07:12:00.000Z',
    },
  });

  assert.equal(buildHandoffMergeReadiness(withReview('merged')).status, 'already_merged');
  assert.equal(buildHandoffMergeReadiness(withReview('ready_to_merge')).status, 'ready_to_inspect');
  assert.equal(buildHandoffMergeReadiness(withReview('needs_review')).status, 'needs_review');
  assert.equal(buildHandoffMergeReadiness(withReview('needs_report')).status, 'needs_report');
  assert.equal(buildHandoffMergeReadiness(withReview('active')).status, 'active');
  assert.equal(buildHandoffMergeReadiness(withReview('blocked')).status, 'blocked');
  assert.equal(buildHandoffMergeReadiness(withReview('unknown')).status, 'unknown');
  assert.match(buildHandoffMergeReadiness(withReview('ready_to_merge')).branchStatus, /ahead 2/);
  assert.equal(
    buildHandoffMergeReadiness(withReview('blocked')).recommendedStep,
    'Open the report if available, then mark stale or re-dispatch manually.',
  );
});

test('handoff checklist copy model matches readiness-specific labels and titles', () => {
  const base = {
    relativePath: 'docs/agent-handoffs/checklist-copy.md',
    filename: 'checklist-copy.md',
    modifiedAt: 1_780_000_000_000,
    sizeBytes: 1024,
    displayTitle: 'Checklist copy',
    displayDetail: 'detail',
    statusLabel: 'Draft',
    dispatchPackage: {
      packageRelativePath:
        'docs/roadmap/supervision/work-packages/handoffs/checklist-copy-work-package.md',
      branchName: 'product/handoff-checklist-copy',
      reportRelativePath: 'docs/roadmap/supervision/reports/checklist-copy-executor-report.md',
      status: 'dispatched' as const,
      createdAt: '2026-06-04T07:09:00.000Z',
      updatedAt: '2026-06-04T07:10:00.000Z',
      statusLabel: 'Dispatched',
    },
    completion: {
      reportExists: true,
      reportRelativePath: 'docs/roadmap/supervision/reports/checklist-copy-executor-report.md',
      branchName: 'product/handoff-checklist-copy',
      branchExists: true,
      branchMergedToMain: false,
      checkedAt: '2026-06-04T07:11:00.000Z',
      statusLabel: 'Report ready / branch exists / not merged',
    },
  };
  const withReview = (
    status:
      | 'active'
      | 'blocked'
      | 'merged'
      | 'needs_report'
      | 'needs_review'
      | 'ready_to_merge'
      | 'unknown',
  ) => ({
    ...base,
    review: {
      status,
      statusLabel: status,
      nextActionLabel: 'Next',
      report: {
        hasSummary: true,
        hasFilesChanged: true,
        hasValidation: status !== 'needs_review',
        hasAcceptanceCriteria: true,
        hasDeviations: false,
        validationLines: [],
        changedFileLines: [],
        riskLines: [],
        truncated: false,
      },
      git: {
        branchExists: true,
        branchMergedToMain: status === 'merged',
        aheadCount: status === 'merged' ? 0 : 1,
        behindCount: 0,
      },
      warnings: status === 'blocked' ? ['Blocked by validation'] : [],
      checkedAt: '2026-06-04T07:12:00.000Z',
    },
  });

  const mergeModel = buildHandoffChecklistCopyModel(withReview('ready_to_merge'));
  assert.equal(mergeModel.actionLabel, 'Copy merge checklist');
  assert.equal(mergeModel.copiedLabel, 'Merge checklist copied.');
  assert.match(mergeModel.text ?? '', /# Manual Merge Checklist: Checklist copy/);

  const reviewModel = buildHandoffChecklistCopyModel(withReview('needs_review'));
  assert.equal(reviewModel.actionLabel, 'Copy review checklist');
  assert.equal(reviewModel.copiedLabel, 'Review checklist copied.');
  assert.match(reviewModel.text ?? '', /# Manual Review Checklist: Checklist copy/);
  assert.equal(reviewModel.text?.includes('Manual Merge Checklist'), false);

  const blockerModel = buildHandoffChecklistCopyModel(withReview('blocked'));
  assert.equal(blockerModel.actionLabel, 'Copy blocker checklist');
  assert.equal(blockerModel.copiedLabel, 'Blocker checklist copied.');
  assert.match(blockerModel.text ?? '', /# Manual Blocker Checklist: Checklist copy/);
  assert.match(
    blockerModel.text ?? '',
    /Pixel Agents does not run git checkout, merge, push, rebase, reset, stash, or clean/,
  );
  assert.equal(blockerModel.text?.includes('If approved, merge'), false);

  const activeModel = buildHandoffChecklistCopyModel(withReview('active'));
  assert.equal(activeModel.actionLabel, 'Copy status checklist');
  assert.equal(activeModel.copiedLabel, 'Status checklist copied.');
  assert.match(activeModel.text ?? '', /# Manual Status Checklist: Checklist copy/);
  assert.equal(activeModel.text?.includes('Manual Merge Checklist'), false);
  assert.equal(activeModel.text?.includes('Manual merge review'), false);

  const needsReportModel = buildHandoffChecklistCopyModel(withReview('needs_report'));
  assert.equal(needsReportModel.actionLabel, 'Copy status checklist');
  assert.match(needsReportModel.text ?? '', /# Manual Status Checklist: Checklist copy/);

  const closeoutModel = buildHandoffChecklistCopyModel(withReview('merged'));
  assert.equal(closeoutModel.actionLabel, 'Copy closeout checklist');
  assert.match(closeoutModel.text ?? '', /# Manual Closeout Checklist: Checklist copy/);

  const noPackageModel = buildHandoffChecklistCopyModel({
    ...withReview('ready_to_merge'),
    dispatchPackage: undefined,
  });
  assert.equal(noPackageModel.disabled, true);
  assert.equal(noPackageModel.canCopy, false);
  assert.equal(noPackageModel.text, undefined);
});

test('handoff checklist copy model uses safe repo-relative fields only', () => {
  const state = handoffArtifactLibraryStateFromLoadedMessage({
    type: 'handoffArtifactsLoaded',
    artifacts: [
      {
        relativePath: 'docs/agent-handoffs/safe-checklist.md',
        filename: 'safe-checklist.md',
        modifiedAt: 1_780_000_000_000,
        sizeBytes: 1536,
        title: 'Safe checklist',
        dispatchPackage: {
          packageRelativePath:
            'docs/roadmap/supervision/work-packages/handoffs/safe-checklist-work-package.md',
          branchName: 'product/handoff-safe-checklist',
          reportRelativePath: 'docs/roadmap/supervision/reports/safe-checklist-executor-report.md',
          status: 'completed',
          createdAt: '2026-06-04T07:09:00.000Z',
          updatedAt: '2026-06-04T07:10:00.000Z',
        },
        completion: {
          reportExists: true,
          reportRelativePath: 'docs/roadmap/supervision/reports/safe-checklist-executor-report.md',
          branchName: 'product/handoff-safe-checklist',
          branchExists: true,
          branchMergedToMain: false,
          checkedAt: '2026-06-04T07:11:00.000Z',
          absolutePath: 'C:\\Users\\User\\private-report.md',
        },
        review: {
          status: 'ready_to_merge',
          statusLabel: 'Ready to merge',
          nextActionLabel: 'Inspect branch',
          reportRelativePath: 'docs/roadmap/supervision/reports/safe-checklist-executor-report.md',
          branchName: 'product/handoff-safe-checklist',
          report: {
            title: 'C:\\Users\\User\\private-report.md',
            hasSummary: true,
            hasFilesChanged: true,
            hasValidation: true,
            hasAcceptanceCriteria: true,
            hasDeviations: false,
            validationLines: ['Raw prompt: hidden request'],
            changedFileLines: ['C:\\Users\\User\\private.ts'],
            riskLines: ['tool output: hidden output'],
            truncated: false,
            rawBody: 'full report body should not leak',
          },
          git: {
            branchExists: true,
            branchMergedToMain: false,
            branchHeadSha: 'abcdef1234567890',
            mainHeadSha: '1234567890abcdef',
            aheadCount: 1,
            behindCount: 0,
            absolutePath: 'C:\\Users\\User\\.git',
          },
          warnings: ['C:\\Users\\User\\warning.md'],
          checkedAt: '2026-06-04T07:12:00.000Z',
          absolutePath: 'C:\\Users\\User\\private-review.md',
        },
      },
    ],
  });

  const copyModel = buildHandoffChecklistCopyModel(state.items[0]!);
  const checklist = copyModel.text;
  assert.equal(copyModel.disabled, false);
  assert.ok(checklist);
  assert.match(checklist, /Manual Merge Checklist: Safe checklist/);
  assert.match(checklist, /docs\/agent-handoffs\/safe-checklist\.md/);
  assert.match(checklist, /product\/handoff-safe-checklist/);
  assert.match(
    checklist,
    /Pixel Agents does not run git checkout, merge, push, rebase, reset, stash, or clean/,
  );
  assert.equal(checklist.includes('C:\\Users\\User'), false);
  assert.equal(checklist.includes('full report body'), false);
  assert.equal(checklist.includes('hidden request'), false);
  assert.equal(checklist.includes('hidden output'), false);
});

test('handoff queue grouping prefers completion review status when available', () => {
  const base = {
    filename: 'handoff.md',
    modifiedAt: 1_780_000_000_000,
    sizeBytes: 512,
    displayTitle: 'Handoff',
    displayDetail: 'detail',
    statusLabel: 'Draft',
    dispatchPackage: {
      packageRelativePath: 'docs/roadmap/supervision/work-packages/handoffs/handoff.md',
      branchName: 'product/handoff-review',
      reportRelativePath: 'docs/roadmap/supervision/reports/review-executor-report.md',
      status: 'dispatched' as const,
      createdAt: '2026-06-04T07:09:00.000Z',
      updatedAt: '2026-06-04T07:10:00.000Z',
      statusLabel: 'Dispatched',
    },
  };
  const reportReady = {
    ...base,
    relativePath: 'docs/agent-handoffs/report.md',
    review: {
      status: 'needs_review' as const,
      statusLabel: 'Needs review',
      nextActionLabel: 'Open report',
      warnings: [],
      checkedAt: '2026-06-04T07:11:00.000Z',
    },
  };
  const merged = {
    ...base,
    relativePath: 'docs/agent-handoffs/merged.md',
    review: {
      status: 'merged' as const,
      statusLabel: 'Merged',
      nextActionLabel: 'Mark reviewed',
      warnings: [],
      checkedAt: '2026-06-04T07:12:00.000Z',
    },
  };

  assert.equal(handoffQueueGroupForItem(reportReady), 'report_ready');
  assert.equal(handoffQueueGroupForItem(merged), 'done');
  assert.deepEqual(buildHandoffQueueSummary([reportReady, merged]), {
    totalPackages: 2,
    needsDispatch: 0,
    activeWaiting: 0,
    blocked: 0,
    reportReady: 1,
    done: 1,
  });
  assert.deepEqual(
    filterHandoffQueueItems([merged, reportReady], 'report_ready').map((item) => item.relativePath),
    ['docs/agent-handoffs/report.md'],
  );
});

test('handoff executor, completion, and report messages send only safe identifiers', () => {
  const item = {
    relativePath: 'docs/agent-handoffs/2026-06-04-1507-pixel-handoff.md',
    dispatchPackage: {
      packageRelativePath:
        'docs/roadmap/supervision/work-packages/handoffs/pixel-handoff-work-package.md',
      branchName: 'product/handoff-pixel-handoff',
      reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
      status: 'dispatched' as const,
      createdAt: '2026-06-04T07:09:00.000Z',
      updatedAt: '2026-06-04T07:10:00.000Z',
      statusLabel: 'Dispatched',
    },
    completion: {
      reportExists: true,
      reportRelativePath: 'docs/roadmap/supervision/reports/pixel-handoff-executor-report.md',
      branchName: 'product/handoff-pixel-handoff',
      checkedAt: '2026-06-04T07:11:00.000Z',
      statusLabel: 'Report ready / branch exists / not merged',
    },
  };

  assert.deepEqual(buildLaunchHandoffExecutorMessage(item, 'launch-1', 'claude'), {
    type: 'launchHandoffExecutor',
    requestId: 'launch-1',
    relativePath: item.relativePath,
    providerId: 'claude',
  });
  assert.deepEqual(buildLaunchHandoffExecutorMessage(item, 'launch-2', 'bad-provider'), {
    type: 'launchHandoffExecutor',
    requestId: 'launch-2',
    relativePath: item.relativePath,
    providerId: 'codex',
  });
  assert.deepEqual(buildRefreshHandoffCompletionMessage(item, 'refresh-1'), {
    type: 'refreshHandoffCompletion',
    requestId: 'refresh-1',
    relativePath: item.relativePath,
  });
  assert.deepEqual(buildOpenHandoffReportMessage(item, 'report-1'), {
    type: 'openHandoffReport',
    requestId: 'report-1',
    relativePath: item.relativePath,
  });
  assert.equal('prompt' in buildLaunchHandoffExecutorMessage(item, 'launch-3')!, false);
  assert.equal('absolutePath' in buildRefreshHandoffCompletionMessage(item, 'refresh-2')!, false);
  assert.equal(
    buildOpenHandoffReportMessage(
      { relativePath: item.relativePath, completion: { ...item.completion, reportExists: false } },
      'report-2',
    ),
    undefined,
  );
});

test('handoff queue summary and filters group package supervision states', () => {
  const base = {
    relativePath: 'docs/agent-handoffs/base.md',
    filename: 'base.md',
    modifiedAt: 1_780_000_000_000,
    sizeBytes: 512,
    displayTitle: 'Base',
    displayDetail: 'Base detail',
    statusLabel: 'Draft',
  };
  const items = [
    {
      ...base,
      relativePath: 'docs/agent-handoffs/draft.md',
      dispatchPackage: {
        packageRelativePath: 'docs/roadmap/supervision/work-packages/handoffs/draft.md',
        branchName: 'product/handoff-draft',
        reportRelativePath: 'docs/roadmap/supervision/reports/draft-executor-report.md',
        status: 'ready' as const,
        createdAt: '2026-06-04T07:00:00.000Z',
        updatedAt: '2026-06-04T07:01:00.000Z',
        statusLabel: 'Ready',
      },
    },
    {
      ...base,
      relativePath: 'docs/agent-handoffs/active.md',
      dispatchPackage: {
        packageRelativePath: 'docs/roadmap/supervision/work-packages/handoffs/active.md',
        branchName: 'product/handoff-active',
        reportRelativePath: 'docs/roadmap/supervision/reports/active-executor-report.md',
        status: 'dispatched' as const,
        createdAt: '2026-06-04T07:00:00.000Z',
        updatedAt: '2026-06-04T07:02:00.000Z',
        statusLabel: 'Dispatched',
        execution: {
          agentId: 12,
          linkedAt: '2026-06-04T07:01:00.000Z',
          updatedAt: '2026-06-04T07:02:00.000Z',
          status: 'waiting' as const,
          statusLabel: 'Waiting',
        },
      },
    },
    {
      ...base,
      relativePath: 'docs/agent-handoffs/report.md',
      dispatchPackage: {
        packageRelativePath: 'docs/roadmap/supervision/work-packages/handoffs/report.md',
        branchName: 'product/handoff-report',
        reportRelativePath: 'docs/roadmap/supervision/reports/report-executor-report.md',
        status: 'dispatched' as const,
        createdAt: '2026-06-04T07:00:00.000Z',
        updatedAt: '2026-06-04T07:03:00.000Z',
        statusLabel: 'Dispatched',
      },
      completion: {
        reportExists: true,
        reportRelativePath: 'docs/roadmap/supervision/reports/report-executor-report.md',
        branchName: 'product/handoff-report',
        checkedAt: '2026-06-04T07:04:00.000Z',
        statusLabel: 'Report ready / branch exists / not merged',
      },
    },
    {
      ...base,
      relativePath: 'docs/agent-handoffs/done.md',
      dispatchPackage: {
        packageRelativePath: 'docs/roadmap/supervision/work-packages/handoffs/done.md',
        branchName: 'product/handoff-done',
        reportRelativePath: 'docs/roadmap/supervision/reports/done-executor-report.md',
        status: 'completed' as const,
        createdAt: '2026-06-04T07:00:00.000Z',
        updatedAt: '2026-06-04T07:05:00.000Z',
        statusLabel: 'Completed',
      },
    },
  ];

  const summary = buildHandoffQueueSummary(items);
  assert.deepEqual(summary, {
    totalPackages: 4,
    needsDispatch: 1,
    activeWaiting: 1,
    blocked: 0,
    reportReady: 1,
    done: 1,
  });
  assert.equal(handoffQueueGroupForItem(items[2]!), 'report_ready');
  assert.deepEqual(
    filterHandoffQueueItems(items, 'report_ready').map((item) => item.relativePath),
    ['docs/agent-handoffs/report.md'],
  );
  assert.equal(
    filterHandoffQueueItems(items, 'all')[0]?.relativePath,
    'docs/agent-handoffs/report.md',
  );
});

test('handoff executor state model reads live executor states symmetrically', () => {
  const item = handoffQueuePackageItem('docs/agent-handoffs/active.md', 'dispatched', 'active');
  const codex = buildHandoffExecutorStateModel(item, [
    executorAgentSnapshot(12, 'codex', 'active', 'Running validation'),
  ]);
  const claude = buildHandoffExecutorStateModel(item, [
    executorAgentSnapshot(12, 'claude', 'active', 'Running validation'),
  ]);
  const waiting = buildHandoffExecutorStateModel(item, [
    executorAgentSnapshot(12, 'claude', 'needs_me', 'Needs approval'),
  ]);
  const blocked = buildHandoffExecutorStateModel(item, [
    executorAgentSnapshot(12, 'codex', 'error', 'Launch failed'),
  ]);

  assert.equal(codex.state, 'active');
  assert.equal(claude.state, 'active');
  assert.equal(codex.nextActionKind, claude.nextActionKind);
  assert.equal(waiting.state, 'waiting');
  assert.equal(waiting.shouldInspectTerminal, true);
  assert.equal(blocked.state, 'blocked');
  assert.equal(blocked.shouldInspectTerminal, true);
});

test('handoff executor state model keeps report and completion signals strongest', () => {
  const completion = {
    reportExists: true,
    reportRelativePath: 'docs/roadmap/supervision/reports/report-executor-report.md',
    branchName: 'product/handoff-report',
    checkedAt: '2026-06-04T07:04:00.000Z',
    statusLabel: 'Report ready / branch exists / not merged',
  };
  const reportReady = buildHandoffExecutorStateModel(
    handoffQueuePackageItem('docs/agent-handoffs/report.md', 'dispatched', 'active', completion, {
      status: 'needs_review',
      statusLabel: 'Needs review',
      nextActionLabel: 'Open report',
      warnings: [],
      checkedAt: '2026-06-04T07:05:00.000Z',
    }),
    [executorAgentSnapshot(12, 'codex', 'active', 'Still running')],
  );
  const completed = buildHandoffExecutorStateModel(
    handoffQueuePackageItem('docs/agent-handoffs/merged.md', 'dispatched', 'active', completion, {
      status: 'merged',
      statusLabel: 'Merged',
      nextActionLabel: 'Mark reviewed',
      warnings: [],
      checkedAt: '2026-06-04T07:05:00.000Z',
    }),
    [executorAgentSnapshot(12, 'claude', 'active', 'Still running')],
  );

  assert.equal(reportReady.state, 'report_ready');
  assert.equal(reportReady.canOpenReport, true);
  assert.equal(reportReady.nextActionKind, 'open_report');
  assert.equal(completed.state, 'completed');
  assert.equal(completed.nextActionKind, 'mark_reviewed');
});

test('handoff executor state model marks missing linked agents as stale unknown', () => {
  const item = handoffQueuePackageItem('docs/agent-handoffs/stale.md', 'dispatched', 'active');
  const state = buildHandoffExecutorStateModel(item, []);

  assert.equal(state.state, 'stale_unknown');
  assert.match(state.detail, /not visible/);
  assert.equal(state.shouldInspectTerminal, true);
  assert.equal(handoffQueueGroupForItem(item, []), 'active_waiting');
});

test('handoff queue all-group sorting uses live executor state', () => {
  const blockedByLiveAgent = handoffQueuePackageItem(
    'docs/agent-handoffs/live-blocked.md',
    'dispatched',
    'active',
  );
  const reportReady = handoffQueuePackageItem(
    'docs/agent-handoffs/report-ready.md',
    'dispatched',
    undefined,
    {
      reportExists: true,
      reportRelativePath: 'docs/roadmap/supervision/reports/report-ready-executor-report.md',
      branchName: 'product/handoff-report-ready',
      checkedAt: '2026-06-04T07:04:00.000Z',
      statusLabel: 'Report ready / branch exists / not merged',
    },
  );
  const agents = [executorAgentSnapshot(12, 'claude', 'error', 'Permission failed')];

  assert.equal(handoffQueueGroupForItem(blockedByLiveAgent, agents), 'blocked');
  assert.deepEqual(
    filterHandoffQueueItems([reportReady, blockedByLiveAgent], 'all', agents).map(
      (item) => item.relativePath,
    ),
    ['docs/agent-handoffs/live-blocked.md', 'docs/agent-handoffs/report-ready.md'],
  );
});

test('handoff executor state model redacts unsafe live labels', () => {
  const item = handoffQueuePackageItem('docs/agent-handoffs/safe.md', 'dispatched', 'active');
  const state = buildHandoffExecutorStateModel(item, [
    {
      id: 12,
      name: 'C:\\Users\\User\\secret-agent.md',
      providerId: 'codex',
      project: 'C:\\Users\\User\\pixel-agents-multi',
      status: 'active',
      statusGroup: 'active',
      activity: 'raw prompt: steal this token',
      detail: 'tool output: sk-secret1234567890 from C:\\Users\\User\\secret.txt',
      isPaused: false,
      hidden: false,
    },
  ]);
  const displayed = [
    state.label,
    state.detail,
    state.recommendedAction,
    state.agentLabel,
    state.providerLabel,
  ].join(' ');

  assert.doesNotMatch(displayed, /C:\\Users\\User/);
  assert.doesNotMatch(displayed, /steal this token/);
  assert.doesNotMatch(displayed, /sk-secret1234567890/);
  assert.match(displayed, /\[redacted/);
});

test('handoff queue operator summary prioritizes blocked packages over other groups', () => {
  const summary = buildHandoffQueueOperatorSummary([
    handoffQueuePackageItem('docs/agent-handoffs/report.md', 'dispatched', undefined, {
      reportExists: true,
      reportRelativePath: 'docs/roadmap/supervision/reports/report-executor-report.md',
      branchName: 'product/handoff-report',
      checkedAt: '2026-06-04T07:04:00.000Z',
      statusLabel: 'Report ready / branch exists / not merged',
    }),
    handoffQueuePackageItem('docs/agent-handoffs/active.md', 'dispatched', 'waiting'),
    handoffQueuePackageItem('docs/agent-handoffs/ready.md', 'ready'),
    handoffQueuePackageItem('docs/agent-handoffs/blocked.md', 'blocked'),
  ]);

  assert.equal(summary.status, 'warning');
  assert.equal(summary.targetGroup, 'blocked');
  assert.equal(summary.actionLabel, 'Show blocked');
  assert.equal(summary.label, '1 blocked package needs attention');
  assert.match(summary.detail, /Open blockers/);
});

test('handoff queue operator summary prioritizes report ready when there are no blockers', () => {
  const summary = buildHandoffQueueOperatorSummary([
    handoffQueuePackageItem('docs/agent-handoffs/active.md', 'dispatched', 'active'),
    handoffQueuePackageItem('docs/agent-handoffs/report-a.md', 'dispatched', undefined, {
      reportExists: true,
      reportRelativePath: 'docs/roadmap/supervision/reports/report-a-executor-report.md',
      branchName: 'product/handoff-report-a',
      checkedAt: '2026-06-04T07:04:00.000Z',
      statusLabel: 'Report ready / branch exists / not merged',
    }),
    handoffQueuePackageItem('docs/agent-handoffs/report-b.md', 'completed', undefined, undefined, {
      status: 'needs_review',
      statusLabel: 'Needs review',
      nextActionLabel: 'Open report',
      warnings: [],
      checkedAt: '2026-06-04T07:05:00.000Z',
    }),
  ]);

  assert.equal(summary.status, 'ready');
  assert.equal(summary.targetGroup, 'report_ready');
  assert.equal(summary.actionLabel, 'Show report ready');
  assert.equal(summary.label, '2 reports ready for review');
});

test('handoff queue operator summary prioritizes active waiting when no reports are ready', () => {
  const summary = buildHandoffQueueOperatorSummary([
    handoffQueuePackageItem('docs/agent-handoffs/waiting.md', 'dispatched', 'waiting'),
    handoffQueuePackageItem('docs/agent-handoffs/linked.md', 'dispatched', 'linked'),
    handoffQueuePackageItem('docs/agent-handoffs/ready.md', 'ready'),
  ]);

  assert.equal(summary.status, 'active');
  assert.equal(summary.targetGroup, 'active_waiting');
  assert.equal(summary.actionLabel, 'Show active / waiting / unknown');
  assert.equal(summary.label, '2 packages active, waiting, or unknown');
});

test('handoff queue operator summary points to needs dispatch for draft and ready packages', () => {
  const summary = buildHandoffQueueOperatorSummary([
    handoffQueuePackageItem('docs/agent-handoffs/draft.md', 'draft'),
    handoffQueuePackageItem('docs/agent-handoffs/ready.md', 'ready'),
  ]);

  assert.equal(summary.status, 'idle');
  assert.equal(summary.targetGroup, 'needs_dispatch');
  assert.equal(summary.actionLabel, 'Show needs dispatch');
  assert.equal(summary.label, '2 packages need dispatch');
  assert.match(summary.detail, /Launch or link an executor/);
});

test('handoff queue operator summary handles done and empty states usefully', () => {
  const doneSummary = buildHandoffQueueOperatorSummary([
    handoffQueuePackageItem('docs/agent-handoffs/done-a.md', 'completed'),
    handoffQueuePackageItem('docs/agent-handoffs/done-b.md', 'dispatched', 'completed'),
  ]);
  const emptySummary = buildHandoffQueueOperatorSummary([{}]);

  assert.equal(doneSummary.status, 'done');
  assert.equal(doneSummary.targetGroup, 'done');
  assert.equal(doneSummary.actionLabel, 'Show done');
  assert.equal(doneSummary.label, '2 packages done');
  assert.equal(emptySummary.status, 'idle');
  assert.equal(emptySummary.targetGroup, 'all');
  assert.equal(emptySummary.actionLabel, '');
  assert.match(emptySummary.label, /No package-backed handoffs/);
});

function executorAgentSnapshot(
  id: number,
  providerId: string,
  statusGroup: string,
  activity: string,
) {
  return {
    id,
    name: `${providerId} executor`,
    providerId,
    project: 'Pixel Agents Multi',
    status: statusGroup,
    statusGroup,
    activity,
    isPaused: false,
    hidden: false,
  };
}

function handoffQueuePackageItem(
  relativePath: string,
  dispatchStatus: 'draft' | 'ready' | 'dispatched' | 'completed' | 'blocked',
  executionStatus?: 'linked' | 'active' | 'waiting' | 'completed' | 'blocked' | 'unknown',
  completion?: {
    reportExists: boolean;
    reportRelativePath: string;
    branchName: string;
    checkedAt: string;
    statusLabel: string;
  },
  review?: {
    status:
      | 'not_ready'
      | 'active'
      | 'blocked'
      | 'needs_report'
      | 'needs_review'
      | 'ready_to_merge'
      | 'merged'
      | 'unknown';
    statusLabel: string;
    nextActionLabel: string;
    warnings: string[];
    checkedAt: string;
  },
) {
  const filename = relativePath.split('/').pop() ?? 'handoff.md';
  return {
    relativePath,
    filename,
    modifiedAt: 1_780_000_000_000,
    sizeBytes: 512,
    displayTitle: filename,
    displayDetail: 'Queue package fixture',
    statusLabel: 'Draft',
    ...(completion ? { completion } : {}),
    ...(review ? { review } : {}),
    dispatchPackage: {
      packageRelativePath: relativePath.replace(
        'docs/agent-handoffs/',
        'docs/roadmap/supervision/work-packages/handoffs/',
      ),
      branchName: `product/handoff-${filename.replace(/\.md$/, '')}`,
      reportRelativePath: `docs/roadmap/supervision/reports/${filename.replace(
        /\.md$/,
        '-executor-report.md',
      )}`,
      status: dispatchStatus,
      createdAt: '2026-06-04T07:00:00.000Z',
      updatedAt: '2026-06-04T07:01:00.000Z',
      statusLabel: dispatchStatus,
      ...(executionStatus
        ? {
            execution: {
              agentId: 12,
              linkedAt: '2026-06-04T07:00:00.000Z',
              updatedAt: '2026-06-04T07:01:00.000Z',
              status: executionStatus,
              statusLabel: executionStatus,
            },
          }
        : {}),
    },
  };
}
