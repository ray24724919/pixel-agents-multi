import { type ReactNode, useState } from 'react';

import { vscode } from '../../vscodeApi.js';
import {
  buildHandoffChecklistCopyModel,
  buildHandoffExecutionQueueSummary,
  buildHandoffExecutorStateModel,
  buildHandoffMergeReadiness,
  buildHandoffQueueOperatorSummary,
  buildHandoffQueueSummary,
  buildHandoffReviewChecklist,
  buildHandoffReviewRecommendedAction,
  buildHandoffStatusSelectModel,
  buildHandoffWorkflowLayout,
  buildWorkQueueRowDecisionModel,
  canCreateHandoffDispatchPrompt,
  canCreateHandoffWorkPackage,
  canLinkHandoffExecutionAgent,
  canUseHandoffWorkPackage,
  filterHandoffQueueItems,
  type HandoffArtifactLibraryItem,
  type HandoffArtifactLibraryState,
  type HandoffArtifactLocalStatus,
  handoffArtifactStatusActions,
  type HandoffDispatchPromptStatus,
  handoffDispatchPromptStatusLabel,
  type HandoffDispatchStatus,
  handoffDispatchStatusActions,
  type HandoffExecutionActionStatus,
  handoffExecutionActionStatusLabel,
  type HandoffExecutionStatus,
  handoffExecutionStatusActions,
  type HandoffExecutorStateModel,
  type HandoffQueueGroup,
  handoffQueueGroupLabel,
  type HandoffWorkPackageStatus,
  handoffWorkPackageStatusLabel,
  type WorkQueueRowDecisionModel,
} from '../handoffArtifactLibraryModel.js';
import { type HandoffDraftPageModel } from '../handoffDraftPageModel.js';
import { Button } from '../ui/Button.js';
import { copyTextToClipboard } from './formatters.js';
import {
  handoffAgentOptionLabel,
  handoffCopyStatusLabel,
  handoffDraftNoticeText,
  handoffExecutionDetailLabel,
  handoffExecutorStateToneClass,
  handoffLibraryStatusLabel,
  handoffMergeReadinessClass,
  handoffOpenStatusLabel,
  handoffQueueOperatorSummaryClass,
  handoffReviewChecklistClass,
  handoffStatusUpdateLabel,
  handoffWriteStatusLabel,
} from './handoffLabels.js';
import type {
  AgentSummary,
  HandoffOpenStatus,
  HandoffStatusUpdateStatus,
  HandoffWriteStatus,
} from './types.js';

export function HandoffDraftPanel({
  model,
  isPreviewOpen,
  copyStatus,
  writeStatus,
  writtenPath,
  writeError,
  onCreate,
  onCopy,
  onWrite,
  onClose,
}: {
  model: HandoffDraftPageModel;
  isPreviewOpen: boolean;
  copyStatus: 'idle' | 'copied' | 'failed';
  writeStatus: HandoffWriteStatus;
  writtenPath: string;
  writeError: string;
  onCreate: () => void;
  onCopy: () => void;
  onWrite: () => void;
  onClose: () => void;
}) {
  const draft = model.draft;
  const notice = handoffDraftNoticeText(model);
  return (
    <section className="border border-border bg-bg">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-btn-bg p-4">
        <div className="min-w-0">
          <div className="text-sm uppercase tracking-wide text-accent-bright">Handoff Draft</div>
          <div className="mt-1 break-words text-xs text-text-muted">
            {model.sourceLabel} / {model.sourceDetail}
          </div>
          {notice && <div className="mt-2 text-xs text-status-permission">{notice}</div>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="border border-border bg-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted">
            Local only
          </span>
          <Button
            variant={model.canCreate ? 'default' : 'disabled'}
            size="sm"
            disabled={!model.canCreate}
            onClick={onCreate}
          >
            {isPreviewOpen ? 'Refresh Preview' : 'Create Handoff'}
          </Button>
        </div>
      </div>
      {isPreviewOpen && draft && (
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="min-w-0 text-xs uppercase tracking-wide text-text-muted">
            Markdown Preview
            <textarea
              className="mt-2 h-72 w-full resize-y border border-border bg-btn-bg p-3 font-mono text-xs normal-case tracking-normal text-text outline-none focus:border-accent"
              value={draft.markdown}
              readOnly
              spellCheck={false}
              aria-label="Handoff markdown preview"
            />
          </label>
          <div className="grid content-start gap-3 border border-border bg-btn-bg p-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-text-muted">Draft Scope</div>
              <div className="mt-2 break-words text-sm text-text">{draft.metadata.title}</div>
              <div className="mt-2 grid gap-1 text-xs text-text-muted">
                <span>{draft.metadata.providerId}</span>
                <span>{draft.metadata.project}</span>
                <span>
                  {draft.metadata.includedEventCount.toLocaleString()} highlighted /{' '}
                  {draft.metadata.eventCount.toLocaleString()} total events
                </span>
              </div>
            </div>
            <Button variant="default" size="sm" onClick={onCopy}>
              Copy Markdown
            </Button>
            <Button
              variant={!draft || writeStatus === 'writing' ? 'disabled' : 'default'}
              size="sm"
              disabled={!draft || writeStatus === 'writing'}
              onClick={onWrite}
            >
              {writeStatus === 'writing' ? 'Writing...' : 'Write to Repo'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close Preview
            </Button>
            <div
              className={`text-xs ${
                copyStatus === 'failed'
                  ? 'text-status-error'
                  : copyStatus === 'copied'
                    ? 'text-status-waiting'
                    : 'text-text-muted'
              }`}
            >
              {handoffCopyStatusLabel(copyStatus)}
            </div>
            <div
              className={`break-words text-xs ${
                writeStatus === 'failed'
                  ? 'text-status-error'
                  : writeStatus === 'written'
                    ? 'text-status-waiting'
                    : 'text-text-muted'
              }`}
            >
              {handoffWriteStatusLabel(writeStatus, writtenPath, writeError)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function HandoffArtifactLibraryPanel({
  agents,
  state,
  openStatus,
  openedPath,
  openError,
  statusUpdateStatus,
  statusUpdatedPath,
  statusUpdateError,
  dispatchPromptStatus,
  dispatchBranchName,
  dispatchReportPath,
  dispatchPromptError,
  workPackageStatus,
  workPackagePath,
  workPackageBranchName,
  workPackageReportPath,
  workPackageError,
  executionActionStatus,
  executionAgentLabel,
  executionPackagePath,
  executionError,
  onRefresh,
  onOpen,
  onUpdateStatus,
  onCopyDispatchPrompt,
  onCreateWorkPackage,
  onOpenWorkPackage,
  onCopyWorkPackagePrompt,
  onUpdateDispatchStatus,
  onLinkExecutionAgent,
  onUpdateExecutionStatus,
  onLaunchExecutor,
  onRefreshCompletion,
  onOpenReport,
}: {
  agents: AgentSummary[];
  state: HandoffArtifactLibraryState;
  openStatus: HandoffOpenStatus;
  openedPath: string;
  openError: string;
  statusUpdateStatus: HandoffStatusUpdateStatus;
  statusUpdatedPath: string;
  statusUpdateError: string;
  dispatchPromptStatus: HandoffDispatchPromptStatus;
  dispatchBranchName: string;
  dispatchReportPath: string;
  dispatchPromptError: string;
  workPackageStatus: HandoffWorkPackageStatus;
  workPackagePath: string;
  workPackageBranchName: string;
  workPackageReportPath: string;
  workPackageError: string;
  executionActionStatus: HandoffExecutionActionStatus;
  executionAgentLabel: string;
  executionPackagePath: string;
  executionError: string;
  onRefresh: () => void;
  onOpen: (item: HandoffArtifactLibraryItem) => void;
  onUpdateStatus: (
    item: HandoffArtifactLibraryItem,
    nextStatus: HandoffArtifactLocalStatus,
  ) => void;
  onCopyDispatchPrompt: (item: HandoffArtifactLibraryItem) => void;
  onCreateWorkPackage: (item: HandoffArtifactLibraryItem) => void;
  onOpenWorkPackage: (item: HandoffArtifactLibraryItem) => void;
  onCopyWorkPackagePrompt: (item: HandoffArtifactLibraryItem) => void;
  onUpdateDispatchStatus: (
    item: HandoffArtifactLibraryItem,
    nextStatus: HandoffDispatchStatus,
  ) => void;
  onLinkExecutionAgent: (item: HandoffArtifactLibraryItem, agentId: number) => void;
  onUpdateExecutionStatus: (
    item: HandoffArtifactLibraryItem,
    nextStatus: HandoffExecutionStatus,
  ) => void;
  onLaunchExecutor: (item: HandoffArtifactLibraryItem, providerId: 'codex' | 'claude') => void;
  onRefreshCompletion: (item: HandoffArtifactLibraryItem) => void;
  onOpenReport: (item: HandoffArtifactLibraryItem) => void;
}) {
  const [executionAgentSelections, setExecutionAgentSelections] = useState<Record<string, number>>(
    {},
  );
  const [queueGroup, setQueueGroup] = useState<HandoffQueueGroup>('all');
  const workPackageBusy =
    workPackageStatus === 'creating' ||
    workPackageStatus === 'opening' ||
    workPackageStatus === 'copying' ||
    workPackageStatus === 'updating';
  const executionBusy =
    executionActionStatus === 'linking' ||
    executionActionStatus === 'updating' ||
    executionActionStatus === 'launching' ||
    executionActionStatus === 'refreshing' ||
    executionActionStatus === 'opening_report';
  const executionSummary = buildHandoffExecutionQueueSummary(state.items);
  const queueSummary = buildHandoffQueueSummary(state.items, agents);
  const operatorSummary = buildHandoffQueueOperatorSummary(state.items, agents);
  const queueItems = filterHandoffQueueItems(state.items, queueGroup, agents);
  const selectedAgentIdForItem = (item: HandoffArtifactLibraryItem): number | undefined =>
    executionAgentSelections[item.relativePath] ??
    item.dispatchPackage?.execution?.agentId ??
    agents[0]?.id;
  const selectExecutionAgentForItem = (item: HandoffArtifactLibraryItem, agentId: number): void => {
    setExecutionAgentSelections((prev) => ({
      ...prev,
      [item.relativePath]: agentId,
    }));
  };
  const workflowLayout = buildHandoffWorkflowLayout(state.items);
  return (
    <section className="border border-border bg-bg">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-btn-bg p-4">
        <div className="min-w-0">
          <div className="text-sm uppercase tracking-wide text-accent-bright">Handoff Workflow</div>
          <div className="mt-1 break-words text-xs text-text-muted">
            Local handoff artifacts and package-backed executor work
          </div>
          <div className="mt-2 text-xs text-text-muted">{handoffLibraryStatusLabel(state)}</div>
        </div>
        <Button variant="default" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      <div className="grid gap-3 p-4">
        {workflowLayout.sectionOrder.map((section) =>
          section === 'work_queue' ? (
            <div key="work_queue" className="grid gap-3 border border-border bg-bg p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm uppercase tracking-wide text-accent-bright">
                    {workflowLayout.workQueue.title}
                  </div>
                  <div className="mt-1 break-words text-xs text-text-muted">
                    {workflowLayout.workQueue.description}
                  </div>
                  <div className="mt-1 break-words text-xs text-text-muted">
                    {queueSummary.totalPackages} package-backed handoffs /{' '}
                    {queueSummary.needsDispatch} needs dispatch / {queueSummary.activeWaiting}{' '}
                    active, waiting, or unknown / {queueSummary.reportReady} report ready /{' '}
                    {queueSummary.done} done
                  </div>
                  <div
                    className={`mt-2 flex max-w-2xl flex-wrap items-center justify-between gap-2 border bg-bg px-3 py-2 text-xs ${handoffQueueOperatorSummaryClass(
                      operatorSummary.status,
                    )}`}
                  >
                    <div className="min-w-0">
                      <div className="break-words uppercase tracking-wide">
                        {operatorSummary.label}
                      </div>
                      <div className="mt-1 break-words normal-case tracking-normal text-text-muted">
                        {operatorSummary.detail}
                      </div>
                    </div>
                    {operatorSummary.actionLabel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setQueueGroup(operatorSummary.targetGroup)}
                      >
                        {operatorSummary.actionLabel}
                      </Button>
                    )}
                  </div>
                </div>
                <label className="min-w-[180px] text-xs uppercase tracking-wide text-text-muted">
                  Work Group
                  <select
                    className="mt-1 h-8 w-full border border-border bg-bg px-2 text-xs normal-case tracking-normal text-text outline-none focus:border-accent"
                    value={queueGroup}
                    onChange={(event) =>
                      setQueueGroup(event.currentTarget.value as HandoffQueueGroup)
                    }
                  >
                    {(
                      [
                        'all',
                        'needs_dispatch',
                        'active_waiting',
                        'blocked',
                        'report_ready',
                        'done',
                      ] as HandoffQueueGroup[]
                    ).map((group) => (
                      <option key={group} value={group}>
                        {handoffQueueGroupLabel(group)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {executionSummary.dispatchPackageCount > 0 && (
                <div className="grid gap-2 border border-border bg-bg p-3 text-xs text-text-muted sm:grid-cols-4">
                  <div>
                    <div className="uppercase tracking-wide text-text">Work Packages</div>
                    <div>{executionSummary.dispatchPackageCount} packages</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wide text-text">Linked</div>
                    <div>{executionSummary.linkedPackageCount} linked agents</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wide text-text">Attention</div>
                    <div>
                      {executionSummary.blockedPackageCount} blocked /{' '}
                      {executionSummary.executionCounts.waiting} waiting
                    </div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wide text-text">Done</div>
                    <div>
                      {executionSummary.completedPackageCount} completed
                      {executionSummary.latestActivityLabel
                        ? ` / ${executionSummary.latestActivityLabel}`
                        : ''}
                    </div>
                  </div>
                </div>
              )}
              {queueItems.length === 0 ? (
                <div className="border border-border bg-btn-bg p-3 text-xs text-text-muted">
                  {queueSummary.totalPackages === 0
                    ? workflowLayout.workQueue.emptyState
                    : workflowLayout.workQueue.filteredEmptyState}
                </div>
              ) : (
                <div className="grid gap-2">
                  {queueItems.map((item) => {
                    const decision = buildWorkQueueRowDecisionModel(item, agents);
                    return (
                      <div
                        key={`queue-${item.relativePath}`}
                        className="grid gap-3 border border-border bg-btn-bg p-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(15rem,22rem)]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm text-text">{item.displayTitle}</span>
                            <span className="border border-border bg-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted">
                              {item.dispatchPackage?.statusLabel}
                            </span>
                            <span
                              className={`border bg-bg px-2 py-1 text-xs uppercase tracking-wide ${handoffExecutorStateToneClass(
                                decision.stageTone,
                              )}`}
                            >
                              {decision.stageLabel}
                            </span>
                            {decision.warningCount > 0 && (
                              <span className="border border-accent bg-bg px-2 py-1 text-xs uppercase tracking-wide text-accent-bright">
                                {decision.warningLabel}
                              </span>
                            )}
                          </div>
                          <WorkQueueDecisionStrip decision={decision} />
                          <div className="mt-1 truncate font-mono text-xs text-text-muted">
                            {item.review?.branchName ?? item.dispatchPackage?.branchName}
                          </div>
                          <div className="mt-1 truncate font-mono text-xs text-text-muted">
                            {item.dispatchPackage?.packageRelativePath}
                          </div>
                        </div>
                        <HandoffRowActions
                          agents={agents}
                          item={item}
                          selectedAgentId={selectedAgentIdForItem(item)}
                          openStatus={openStatus}
                          statusUpdateStatus={statusUpdateStatus}
                          dispatchPromptStatus={dispatchPromptStatus}
                          workPackageStatus={workPackageStatus}
                          workPackageBusy={workPackageBusy}
                          executionBusy={executionBusy}
                          decision={decision}
                          mode="workQueue"
                          onOpen={onOpen}
                          onUpdateStatus={onUpdateStatus}
                          onCopyDispatchPrompt={onCopyDispatchPrompt}
                          onCreateWorkPackage={onCreateWorkPackage}
                          onOpenWorkPackage={onOpenWorkPackage}
                          onCopyWorkPackagePrompt={onCopyWorkPackagePrompt}
                          onUpdateDispatchStatus={onUpdateDispatchStatus}
                          onSelectExecutionAgent={selectExecutionAgentForItem}
                          onLinkExecutionAgent={onLinkExecutionAgent}
                          onUpdateExecutionStatus={onUpdateExecutionStatus}
                          onLaunchExecutor={onLaunchExecutor}
                          onRefreshCompletion={onRefreshCompletion}
                          onOpenReport={onOpenReport}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div key="handoff_library" className="grid gap-3 border border-border bg-bg p-3">
              <div className="min-w-0">
                <div className="text-sm uppercase tracking-wide text-accent-bright">
                  {workflowLayout.handoffLibrary.title}
                </div>
                <div className="mt-1 break-words text-xs text-text-muted">
                  {workflowLayout.handoffLibrary.description}
                </div>
              </div>
              {state.unavailable ? (
                <div className="border border-status-error bg-btn-bg p-3 text-xs text-status-error">
                  {state.error ?? 'Handoff library is unavailable.'}
                </div>
              ) : state.items.length === 0 ? (
                <div className="border border-border bg-btn-bg p-3 text-xs text-text-muted">
                  {workflowLayout.handoffLibrary.emptyState}
                </div>
              ) : (
                <div className="grid gap-2">
                  {state.items.map((item) => {
                    const executorState = buildHandoffExecutorStateModel(item, agents);
                    return (
                      <div
                        key={item.relativePath}
                        className="grid gap-3 border border-border bg-btn-bg p-3 md:grid-cols-[minmax(16rem,1fr)_minmax(15rem,22rem)]"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="min-w-[120px] max-w-full truncate text-sm text-text">
                              {item.displayTitle}
                            </span>
                            <span className="shrink-0 border border-border bg-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted">
                              {item.statusLabel}
                            </span>
                            {item.review && (
                              <span className="shrink-0 border border-accent bg-bg px-2 py-1 text-xs uppercase tracking-wide text-accent-bright">
                                {item.review.statusLabel}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 break-words text-xs text-text-muted">
                            {item.displayDetail}
                          </div>
                          <HandoffExecutorStateCue state={executorState} />
                          {(item.dispatchPackage || item.completion || item.review) && (
                            <HandoffReviewCues item={item} />
                          )}
                          <div className="mt-1 truncate font-mono text-xs text-text-muted">
                            {item.relativePath}
                          </div>
                        </div>
                        <HandoffRowActions
                          agents={agents}
                          item={item}
                          selectedAgentId={selectedAgentIdForItem(item)}
                          openStatus={openStatus}
                          statusUpdateStatus={statusUpdateStatus}
                          dispatchPromptStatus={dispatchPromptStatus}
                          workPackageStatus={workPackageStatus}
                          workPackageBusy={workPackageBusy}
                          executionBusy={executionBusy}
                          onOpen={onOpen}
                          onUpdateStatus={onUpdateStatus}
                          onCopyDispatchPrompt={onCopyDispatchPrompt}
                          onCreateWorkPackage={onCreateWorkPackage}
                          onOpenWorkPackage={onOpenWorkPackage}
                          onCopyWorkPackagePrompt={onCopyWorkPackagePrompt}
                          onUpdateDispatchStatus={onUpdateDispatchStatus}
                          onSelectExecutionAgent={selectExecutionAgentForItem}
                          onLinkExecutionAgent={onLinkExecutionAgent}
                          onUpdateExecutionStatus={onUpdateExecutionStatus}
                          onLaunchExecutor={onLaunchExecutor}
                          onRefreshCompletion={onRefreshCompletion}
                          onOpenReport={onOpenReport}
                        />
                        {item.dispatchPackage && (
                          <div className="md:col-span-2">
                            <div className="min-w-0 truncate border-t border-border pt-2 text-xs text-text-muted">
                              {handoffExecutionDetailLabel(item, agents)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ),
        )}
        <div
          className={`break-words text-xs ${
            openStatus === 'failed'
              ? 'text-status-error'
              : openStatus === 'opened'
                ? 'text-status-waiting'
                : 'text-text-muted'
          }`}
        >
          {handoffOpenStatusLabel(openStatus, openedPath, openError)}
        </div>
        <div
          className={`break-words text-xs ${
            statusUpdateStatus === 'failed'
              ? 'text-status-error'
              : statusUpdateStatus === 'updated'
                ? 'text-status-waiting'
                : 'text-text-muted'
          }`}
        >
          {handoffStatusUpdateLabel(statusUpdateStatus, statusUpdatedPath, statusUpdateError)}
        </div>
        <div
          className={`break-words text-xs ${
            dispatchPromptStatus === 'failed'
              ? 'text-status-error'
              : dispatchPromptStatus === 'copied'
                ? 'text-status-waiting'
                : 'text-text-muted'
          }`}
        >
          {handoffDispatchPromptStatusLabel(
            dispatchPromptStatus,
            dispatchBranchName,
            dispatchReportPath,
            dispatchPromptError,
          )}
        </div>
        <div
          className={`break-words text-xs ${
            workPackageStatus === 'failed'
              ? 'text-status-error'
              : workPackageStatus === 'created' ||
                  workPackageStatus === 'opened' ||
                  workPackageStatus === 'copied' ||
                  workPackageStatus === 'updated'
                ? 'text-status-waiting'
                : 'text-text-muted'
          }`}
        >
          {handoffWorkPackageStatusLabel(
            workPackageStatus,
            workPackagePath,
            workPackageBranchName,
            workPackageReportPath,
            workPackageError,
          )}
        </div>
        <div
          className={`break-words text-xs ${
            executionActionStatus === 'failed'
              ? 'text-status-error'
              : executionActionStatus === 'linked' || executionActionStatus === 'updated'
                ? 'text-status-waiting'
                : 'text-text-muted'
          }`}
        >
          {handoffExecutionActionStatusLabel(
            executionActionStatus,
            executionAgentLabel,
            executionPackagePath,
            executionError,
          )}
        </div>
      </div>
    </section>
  );
}

type HandoffRowActionsProps = {
  agents: AgentSummary[];
  item: HandoffArtifactLibraryItem;
  selectedAgentId: number | undefined;
  mode?: 'library' | 'workQueue';
  decision?: WorkQueueRowDecisionModel;
  openStatus: HandoffOpenStatus;
  statusUpdateStatus: HandoffStatusUpdateStatus;
  dispatchPromptStatus: HandoffDispatchPromptStatus;
  workPackageStatus: HandoffWorkPackageStatus;
  workPackageBusy: boolean;
  executionBusy: boolean;
  onOpen: (item: HandoffArtifactLibraryItem) => void;
  onUpdateStatus: (
    item: HandoffArtifactLibraryItem,
    nextStatus: HandoffArtifactLocalStatus,
  ) => void;
  onCopyDispatchPrompt: (item: HandoffArtifactLibraryItem) => void;
  onCreateWorkPackage: (item: HandoffArtifactLibraryItem) => void;
  onOpenWorkPackage: (item: HandoffArtifactLibraryItem) => void;
  onCopyWorkPackagePrompt: (item: HandoffArtifactLibraryItem) => void;
  onUpdateDispatchStatus: (
    item: HandoffArtifactLibraryItem,
    nextStatus: HandoffDispatchStatus,
  ) => void;
  onSelectExecutionAgent: (item: HandoffArtifactLibraryItem, agentId: number) => void;
  onLinkExecutionAgent: (item: HandoffArtifactLibraryItem, agentId: number) => void;
  onUpdateExecutionStatus: (
    item: HandoffArtifactLibraryItem,
    nextStatus: HandoffExecutionStatus,
  ) => void;
  onLaunchExecutor: (item: HandoffArtifactLibraryItem, providerId: 'codex' | 'claude') => void;
  onRefreshCompletion: (item: HandoffArtifactLibraryItem) => void;
  onOpenReport: (item: HandoffArtifactLibraryItem) => void;
};

export function HandoffRowActions({
  agents,
  item,
  selectedAgentId,
  mode = 'library',
  decision,
  openStatus,
  statusUpdateStatus,
  dispatchPromptStatus,
  workPackageStatus,
  workPackageBusy,
  executionBusy,
  onOpen,
  onUpdateStatus,
  onCopyDispatchPrompt,
  onCreateWorkPackage,
  onOpenWorkPackage,
  onCopyWorkPackagePrompt,
  onUpdateDispatchStatus,
  onSelectExecutionAgent,
  onLinkExecutionAgent,
  onUpdateExecutionStatus,
  onLaunchExecutor,
  onRefreshCompletion,
  onOpenReport,
}: HandoffRowActionsProps) {
  const artifactActions = handoffArtifactStatusActions(item);
  const markReviewedAction = artifactActions.find((action) => action.nextStatus === 'reviewed');
  const maintenanceArtifactActions = artifactActions.filter(
    (action) => action.nextStatus !== 'reviewed',
  );
  const hasWorkPackage = canUseHandoffWorkPackage(item);
  const dispatchPromptDisabled =
    dispatchPromptStatus === 'creating' || !canCreateHandoffDispatchPrompt(item);
  const createWorkPackageDisabled = workPackageBusy || !canCreateHandoffWorkPackage(item);
  const openWorkPackageDisabled = workPackageStatus === 'opening' || !hasWorkPackage;
  const workPackagePromptDisabled = workPackageBusy || !hasWorkPackage;
  const launchDisabled = executionBusy || !hasWorkPackage;
  const refreshCompletionDisabled = executionBusy || !hasWorkPackage;
  const openReportDisabled = executionBusy || item.completion?.reportExists !== true;
  const linkAgentDisabled = executionBusy || !canLinkHandoffExecutionAgent(item, selectedAgentId);
  const dispatchStatusActions = item.dispatchPackage ? handoffDispatchStatusActions(item) : [];
  const executionStatusActions = item.dispatchPackage ? handoffExecutionStatusActions(item) : [];
  const currentDispatchStatus = item.dispatchPackage?.status;
  const currentExecutionStatus = item.dispatchPackage?.execution?.status ?? 'unknown';

  if (mode === 'workQueue' && decision) {
    const renderPrimaryAction = (): ReactNode => {
      if (decision.primaryActionKind === 'create_work_package') {
        return (
          <Button
            variant={createWorkPackageDisabled ? 'disabled' : 'default'}
            size="sm"
            disabled={createWorkPackageDisabled}
            onClick={() => onCreateWorkPackage(item)}
          >
            Create work package
          </Button>
        );
      }
      if (decision.primaryActionKind === 'launch_executor') {
        return (
          <>
            <Button
              variant={launchDisabled ? 'disabled' : 'default'}
              size="sm"
              disabled={launchDisabled}
              onClick={() => onLaunchExecutor(item, 'codex')}
            >
              Launch Codex
            </Button>
            <Button
              variant={launchDisabled ? 'disabled' : 'default'}
              size="sm"
              disabled={launchDisabled}
              onClick={() => onLaunchExecutor(item, 'claude')}
            >
              Launch Claude
            </Button>
          </>
        );
      }
      if (decision.primaryActionKind === 'inspect_terminal') {
        return (
          <Button
            variant={decision.primaryActionDisabled ? 'disabled' : 'default'}
            size="sm"
            disabled={decision.primaryActionDisabled}
            onClick={() => {
              if (decision.linkedAgentId !== undefined) {
                vscode.postMessage({ type: 'focusAgent', id: decision.linkedAgentId });
              }
            }}
          >
            Inspect terminal
          </Button>
        );
      }
      if (decision.primaryActionKind === 'refresh_completion') {
        return (
          <Button
            variant={refreshCompletionDisabled ? 'disabled' : 'default'}
            size="sm"
            disabled={refreshCompletionDisabled}
            onClick={() => onRefreshCompletion(item)}
          >
            Refresh report status
          </Button>
        );
      }
      if (decision.primaryActionKind === 'open_report') {
        return (
          <Button
            variant={openReportDisabled ? 'disabled' : 'default'}
            size="sm"
            disabled={openReportDisabled}
            onClick={() => onOpenReport(item)}
          >
            Open executor report
          </Button>
        );
      }
      if (decision.primaryActionKind === 'mark_reviewed') {
        const disabled =
          statusUpdateStatus === 'updating' ||
          markReviewedAction === undefined ||
          markReviewedAction.disabled;
        return (
          <Button
            variant={disabled ? 'disabled' : 'default'}
            size="sm"
            disabled={disabled}
            onClick={() => {
              if (markReviewedAction) onUpdateStatus(item, markReviewedAction.nextStatus);
            }}
          >
            Mark reviewed
          </Button>
        );
      }
      return (
        <Button variant="disabled" size="sm" disabled>
          {decision.primaryActionLabel}
        </Button>
      );
    };

    return (
      <div className="grid min-w-0 gap-2 md:justify-items-end">
        <HandoffActionGroup label="Next step" tone="primary">
          {renderPrimaryAction()}
          <span className="min-w-0 break-words text-xs text-text-muted">
            {decision.primaryActionDetail}
          </span>
        </HandoffActionGroup>
        <HandoffActionGroup label="Reference" tone="secondary">
          <Button
            variant={openStatus === 'opening' ? 'disabled' : 'ghost'}
            size="sm"
            disabled={openStatus === 'opening'}
            onClick={() => onOpen(item)}
          >
            Open handoff
          </Button>
          <Button
            variant={openWorkPackageDisabled ? 'disabled' : 'ghost'}
            size="sm"
            disabled={openWorkPackageDisabled}
            onClick={() => onOpenWorkPackage(item)}
          >
            Open work package
          </Button>
          <Button
            variant={dispatchPromptDisabled ? 'disabled' : 'ghost'}
            size="sm"
            disabled={dispatchPromptDisabled}
            onClick={() => onCopyDispatchPrompt(item)}
          >
            Copy handoff prompt
          </Button>
          <Button
            variant={workPackagePromptDisabled ? 'disabled' : 'ghost'}
            size="sm"
            disabled={workPackagePromptDisabled}
            onClick={() => onCopyWorkPackagePrompt(item)}
          >
            Copy work-package prompt
          </Button>
        </HandoffActionGroup>
        <HandoffActionGroup label="Executor" tone="secondary">
          {decision.primaryActionKind !== 'launch_executor' && (
            <>
              <Button
                variant={launchDisabled ? 'disabled' : 'ghost'}
                size="sm"
                disabled={launchDisabled}
                onClick={() => onLaunchExecutor(item, 'codex')}
              >
                Launch Codex
              </Button>
              <Button
                variant={launchDisabled ? 'disabled' : 'ghost'}
                size="sm"
                disabled={launchDisabled}
                onClick={() => onLaunchExecutor(item, 'claude')}
              >
                Launch Claude
              </Button>
            </>
          )}
          {decision.primaryActionKind !== 'refresh_completion' && (
            <Button
              variant={refreshCompletionDisabled ? 'disabled' : 'ghost'}
              size="sm"
              disabled={refreshCompletionDisabled}
              onClick={() => onRefreshCompletion(item)}
            >
              Refresh report status
            </Button>
          )}
          {decision.primaryActionKind !== 'open_report' && (
            <Button
              variant={openReportDisabled ? 'disabled' : 'ghost'}
              size="sm"
              disabled={openReportDisabled}
              onClick={() => onOpenReport(item)}
            >
              Open executor report
            </Button>
          )}
          <div className="flex min-w-[220px] flex-wrap items-center justify-end gap-2">
            <select
              className="h-8 max-w-[220px] border border-border bg-bg px-2 text-xs text-text outline-none focus:border-accent"
              value={String(selectedAgentId ?? '')}
              disabled={agents.length === 0 || executionBusy}
              onChange={(event) => {
                const agentId = Number.parseInt(event.currentTarget.value, 10);
                if (Number.isFinite(agentId)) onSelectExecutionAgent(item, agentId);
              }}
            >
              {agents.length === 0 ? (
                <option value="">No visible agents</option>
              ) : (
                agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {handoffAgentOptionLabel(agent)}
                  </option>
                ))
              )}
            </select>
            <Button
              variant={linkAgentDisabled ? 'disabled' : 'ghost'}
              size="sm"
              disabled={linkAgentDisabled}
              onClick={() => {
                if (selectedAgentId !== undefined) onLinkExecutionAgent(item, selectedAgentId);
              }}
            >
              Link agent
            </Button>
          </div>
        </HandoffActionGroup>
        <HandoffActionGroup label="Maintenance" tone="quiet">
          {maintenanceArtifactActions.map((action) => {
            const disabled = action.disabled || statusUpdateStatus === 'updating';
            return (
              <Button
                key={`artifact-${action.nextStatus}`}
                variant={disabled ? 'disabled' : 'ghost'}
                size="sm"
                disabled={disabled}
                onClick={() => onUpdateStatus(item, action.nextStatus)}
              >
                {action.label}
              </Button>
            );
          })}
          {currentDispatchStatus && (
            <HandoffStatusSelect
              label="Dispatch"
              value={currentDispatchStatus}
              actions={dispatchStatusActions}
              disabled={workPackageBusy}
              selectedLabel={item.dispatchPackage?.statusLabel ?? 'No dispatch status'}
              ariaLabel={`Set dispatch status for ${item.displayTitle}`}
              onChange={(nextStatus) => onUpdateDispatchStatus(item, nextStatus)}
            />
          )}
          <HandoffStatusSelect
            label="Execution"
            value={currentExecutionStatus}
            actions={executionStatusActions}
            disabled={executionBusy}
            selectedLabel={item.dispatchPackage?.execution?.statusLabel ?? 'No linked execution'}
            ariaLabel={`Set execution status for ${item.displayTitle}`}
            onChange={(nextStatus) => onUpdateExecutionStatus(item, nextStatus)}
          />
        </HandoffActionGroup>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-2 md:justify-items-end">
      <HandoffActionGroup label="Primary" tone="primary">
        {markReviewedAction && !markReviewedAction.disabled && (
          <Button
            variant={statusUpdateStatus === 'updating' ? 'disabled' : 'default'}
            size="sm"
            disabled={statusUpdateStatus === 'updating'}
            onClick={() => onUpdateStatus(item, markReviewedAction.nextStatus)}
          >
            {markReviewedAction.label}
          </Button>
        )}
        {item.dispatchPackage ? (
          <>
            <Button
              variant={launchDisabled ? 'disabled' : 'default'}
              size="sm"
              disabled={launchDisabled}
              onClick={() => onLaunchExecutor(item, 'codex')}
            >
              Launch Codex
            </Button>
            <Button
              variant={launchDisabled ? 'disabled' : 'default'}
              size="sm"
              disabled={launchDisabled}
              onClick={() => onLaunchExecutor(item, 'claude')}
            >
              Launch Claude
            </Button>
            <Button
              variant={refreshCompletionDisabled ? 'disabled' : 'ghost'}
              size="sm"
              disabled={refreshCompletionDisabled}
              onClick={() => onRefreshCompletion(item)}
            >
              Refresh report status
            </Button>
            <Button
              variant={openReportDisabled ? 'disabled' : 'default'}
              size="sm"
              disabled={openReportDisabled}
              onClick={() => onOpenReport(item)}
            >
              Open executor report
            </Button>
          </>
        ) : (
          <Button
            variant={createWorkPackageDisabled ? 'disabled' : 'default'}
            size="sm"
            disabled={createWorkPackageDisabled}
            onClick={() => onCreateWorkPackage(item)}
          >
            Create work package
          </Button>
        )}
      </HandoffActionGroup>
      <HandoffActionGroup label="Reference" tone="secondary">
        <Button
          variant={openStatus === 'opening' ? 'disabled' : 'ghost'}
          size="sm"
          disabled={openStatus === 'opening'}
          onClick={() => onOpen(item)}
        >
          Open handoff
        </Button>
        <Button
          variant={dispatchPromptDisabled ? 'disabled' : 'ghost'}
          size="sm"
          disabled={dispatchPromptDisabled}
          onClick={() => onCopyDispatchPrompt(item)}
        >
          Copy handoff prompt
        </Button>
        {item.dispatchPackage && (
          <>
            <Button
              variant={openWorkPackageDisabled ? 'disabled' : 'ghost'}
              size="sm"
              disabled={openWorkPackageDisabled}
              onClick={() => onOpenWorkPackage(item)}
            >
              Open work package
            </Button>
            <Button
              variant={workPackagePromptDisabled ? 'disabled' : 'ghost'}
              size="sm"
              disabled={workPackagePromptDisabled}
              onClick={() => onCopyWorkPackagePrompt(item)}
            >
              Copy work-package prompt
            </Button>
            <div className="flex min-w-[220px] flex-wrap items-center justify-end gap-2">
              <select
                className="h-8 max-w-[220px] border border-border bg-bg px-2 text-xs text-text outline-none focus:border-accent"
                value={String(selectedAgentId ?? '')}
                disabled={agents.length === 0 || executionBusy}
                onChange={(event) => {
                  const agentId = Number.parseInt(event.currentTarget.value, 10);
                  if (Number.isFinite(agentId)) onSelectExecutionAgent(item, agentId);
                }}
              >
                {agents.length === 0 ? (
                  <option value="">No visible agents</option>
                ) : (
                  agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {handoffAgentOptionLabel(agent)}
                    </option>
                  ))
                )}
              </select>
              <Button
                variant={linkAgentDisabled ? 'disabled' : 'ghost'}
                size="sm"
                disabled={linkAgentDisabled}
                onClick={() => {
                  if (selectedAgentId !== undefined) onLinkExecutionAgent(item, selectedAgentId);
                }}
              >
                Link agent
              </Button>
            </div>
          </>
        )}
      </HandoffActionGroup>
      <HandoffActionGroup label="Status" tone="quiet">
        {maintenanceArtifactActions.map((action) => {
          const disabled = action.disabled || statusUpdateStatus === 'updating';
          return (
            <Button
              key={`artifact-${action.nextStatus}`}
              variant={disabled ? 'disabled' : 'ghost'}
              size="sm"
              disabled={disabled}
              onClick={() => onUpdateStatus(item, action.nextStatus)}
            >
              {action.label}
            </Button>
          );
        })}
        {item.dispatchPackage && currentDispatchStatus && (
          <HandoffStatusSelect
            label="Dispatch"
            value={currentDispatchStatus}
            actions={dispatchStatusActions}
            disabled={workPackageBusy}
            selectedLabel={item.dispatchPackage.statusLabel}
            ariaLabel={`Set dispatch status for ${item.displayTitle}`}
            onChange={(nextStatus) => onUpdateDispatchStatus(item, nextStatus)}
          />
        )}
        {item.dispatchPackage && (
          <HandoffStatusSelect
            label="Execution"
            value={currentExecutionStatus}
            actions={executionStatusActions}
            disabled={executionBusy}
            selectedLabel={item.dispatchPackage.execution?.statusLabel ?? 'No linked execution'}
            ariaLabel={`Set execution status for ${item.displayTitle}`}
            onChange={(nextStatus) => onUpdateExecutionStatus(item, nextStatus)}
          />
        )}
      </HandoffActionGroup>
    </div>
  );
}

type HandoffStatusSelectAction<TStatus extends string> = {
  nextStatus: TStatus;
  label: string;
  disabled: boolean;
};

export function HandoffStatusSelect<TStatus extends string>({
  label,
  value,
  actions,
  disabled,
  selectedLabel,
  ariaLabel,
  onChange,
}: {
  label: string;
  value: TStatus;
  actions: HandoffStatusSelectAction<TStatus>[];
  disabled: boolean;
  selectedLabel: string;
  ariaLabel: string;
  onChange: (nextStatus: TStatus) => void;
}) {
  const model = buildHandoffStatusSelectModel(value, selectedLabel, actions, disabled);
  return (
    <label className="grid min-w-[150px] gap-1 text-[10px] uppercase tracking-wide text-text-muted">
      {label}
      <select
        className="h-8 w-full border border-border bg-bg px-2 text-xs normal-case tracking-normal text-text outline-none focus:border-accent disabled:bg-btn-bg disabled:text-text-muted"
        value={value}
        disabled={model.disabled}
        aria-label={ariaLabel}
        onChange={(event) => {
          const nextStatus = event.currentTarget.value as TStatus;
          const action = actions.find((candidate) => candidate.nextStatus === nextStatus);
          if (!action || action.disabled || disabled || nextStatus === value) return;
          onChange(nextStatus);
        }}
      >
        {model.options.map((action) => (
          <option key={action.value} value={action.value} disabled={action.disabled}>
            {action.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HandoffActionGroup({
  label,
  tone,
  children,
}: {
  label: string;
  tone: 'primary' | 'secondary' | 'quiet';
  children: ReactNode;
}) {
  const groupClass =
    tone === 'primary'
      ? 'border-accent bg-bg'
      : tone === 'secondary'
        ? 'border-border bg-bg'
        : 'border-border bg-btn-bg';
  const labelClass = tone === 'primary' ? 'text-accent-bright' : 'text-text-muted';
  return (
    <div className={`grid w-full gap-1 border p-2 ${groupClass}`}>
      <div className={`text-[10px] uppercase tracking-wide ${labelClass}`}>{label}</div>
      <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 md:justify-end">
        {children}
      </div>
    </div>
  );
}

export function WorkQueueDecisionStrip({ decision }: { decision: WorkQueueRowDecisionModel }) {
  return (
    <div className="mt-2 grid gap-2 border border-border bg-bg p-2">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={`shrink-0 border px-2 py-1 text-xs uppercase tracking-wide ${handoffExecutorStateToneClass(
                decision.stageTone,
              )}`}
            >
              {decision.stageLabel}
            </span>
            <span className="break-words text-xs text-text-muted">{decision.evidenceLine}</span>
          </div>
          <div className="mt-1 break-words text-xs text-text-muted">
            Next:{' '}
            <span
              className={decision.primaryActionDisabled ? 'text-text-muted' : 'text-accent-bright'}
            >
              {decision.primaryActionLabel}
            </span>
            <span> / {decision.primaryActionDetail}</span>
          </div>
        </div>
        <span
          className={`shrink-0 border bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide ${
            decision.warningCount > 0
              ? 'border-status-permission text-status-permission'
              : 'border-border text-text-muted'
          }`}
        >
          {decision.warningLabel}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        {decision.detailRows.map((row) => (
          <span
            key={`${row.label}:${row.value}`}
            className="shrink-0 border border-border bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted"
            title={`${row.label}: ${row.value}`}
          >
            {row.label}: {row.value}
          </span>
        ))}
      </div>
      <div className="break-words text-xs text-text-muted">{decision.secondarySummary}</div>
    </div>
  );
}

export function HandoffExecutorStateCue({
  state,
  compact = false,
}: {
  state: HandoffExecutorStateModel;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? 'mt-1' : 'mt-2'} flex min-w-0 flex-wrap items-center gap-1`}>
      {!compact && (
        <span
          className={`shrink-0 border bg-bg px-2 py-1 text-xs uppercase tracking-wide ${handoffExecutorStateToneClass(
            state.tone,
          )}`}
        >
          {state.label}
        </span>
      )}
      <span className="min-w-0 break-words text-xs text-text-muted">{state.detail}</span>
      <span className="shrink-0 text-xs text-accent-bright">{state.recommendedAction}</span>
    </div>
  );
}

export function HandoffReviewCues({ item }: { item: HandoffArtifactLibraryItem }) {
  const recommendation = buildHandoffReviewRecommendedAction(item);
  const checklist = buildHandoffReviewChecklist(item);
  const readiness = item.dispatchPackage ? buildHandoffMergeReadiness(item) : undefined;
  const checklistCopy = buildHandoffChecklistCopyModel(item);
  const firstWarning = item.review?.warnings[0];
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyManualChecklist = () => {
    if (checklistCopy.disabled || !checklistCopy.text) {
      setCopyStatus('failed');
      return;
    }
    void copyTextToClipboard(checklistCopy.text)
      .then(() => setCopyStatus('copied'))
      .catch(() => setCopyStatus('failed'));
  };
  return (
    <div className="mt-2 grid gap-2">
      <div className="break-words text-xs text-text-muted">
        Review:{' '}
        <span className={recommendation.disabled ? 'text-text-muted' : 'text-accent-bright'}>
          {recommendation.label}
        </span>
        <span> / {recommendation.detail}</span>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        {checklist.map((cue) => (
          <span
            key={cue.id}
            className={`shrink-0 border bg-bg px-2 py-1 text-xs uppercase tracking-wide ${handoffReviewChecklistClass(
              cue.state,
            )}`}
            title={`${cue.label}: ${cue.detail}`}
          >
            {cue.label}: {cue.detail}
          </span>
        ))}
      </div>
      {firstWarning && (
        <div className="break-words text-xs text-status-permission">Warning: {firstWarning}</div>
      )}
      {readiness && (
        <div className="grid gap-2 border border-border bg-bg p-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className={`shrink-0 border px-2 py-1 text-xs uppercase tracking-wide ${handoffMergeReadinessClass(
                    readiness.status,
                  )}`}
                >
                  {readiness.label}
                </span>
                <span className="break-words text-xs text-text-muted">{readiness.detail}</span>
              </div>
              <div className="mt-1 break-words text-xs text-text-muted">
                {readiness.recommendedStep}
              </div>
            </div>
            <Button
              variant={checklistCopy.canCopy ? 'ghost' : 'disabled'}
              size="sm"
              disabled={checklistCopy.disabled}
              onClick={copyManualChecklist}
            >
              {checklistCopy.actionLabel}
            </Button>
          </div>
          <div className="flex min-w-0 flex-wrap gap-1">
            <span className="shrink-0 border border-border bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted">
              Branch: {readiness.branchStatus}
            </span>
            <span className="shrink-0 border border-border bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted">
              Report: {readiness.reportStatus}
            </span>
            <span className="shrink-0 border border-border bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted">
              {readiness.validationStatus}
            </span>
            <span className="shrink-0 border border-border bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted">
              {readiness.warningCount} warnings
            </span>
          </div>
          {copyStatus !== 'idle' && (
            <div
              className={`text-xs ${
                copyStatus === 'copied' ? 'text-status-waiting' : 'text-status-error'
              }`}
            >
              {copyStatus === 'copied' ? checklistCopy.copiedLabel : 'Checklist copy failed.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
