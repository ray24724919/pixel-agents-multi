import { useEffect, useMemo, useRef, useState } from 'react';

import { vscode } from '../../vscodeApi.js';
import {
  buildCreateHandoffDispatchPromptMessage,
  buildCreateHandoffWorkPackageMessage,
  buildCreateHandoffWorkPackagePromptMessage,
  buildLaunchHandoffExecutorMessage,
  buildLinkHandoffExecutionAgentMessage,
  buildOpenHandoffArtifactMessage,
  buildOpenHandoffReportMessage,
  buildOpenHandoffWorkPackageMessage,
  buildRefreshHandoffCompletionMessage,
  buildUpdateHandoffArtifactStatusMessage,
  buildUpdateHandoffDispatchStatusMessage,
  buildUpdateHandoffExecutionStatusMessage,
  type HandoffArtifactLibraryItem,
  type HandoffArtifactLibraryState,
  handoffArtifactLibraryStateFromLoadedMessage,
  type HandoffArtifactLocalStatus,
  type HandoffDispatchPromptStatus,
  type HandoffDispatchStatus,
  type HandoffExecutionActionStatus,
  type HandoffExecutionStatus,
  type HandoffWorkPackageStatus,
  initialHandoffArtifactLibraryState,
  selectHandoffAutoRefreshTargets,
  shouldRefreshHandoffArtifactsForMessage,
} from '../handoffArtifactLibraryModel.js';
import {
  buildHandoffDraftPageModel,
  buildHandoffDraftWriteMessage,
} from '../handoffDraftPageModel.js';
import type { TimelinePageItem } from '../timelinePageModel.js';
import type { TimelineReplayState } from '../timelineReplayModel.js';
import { copyTextToClipboard } from './formatters.js';
import { handoffAgentOptionLabel, handoffExecutionAgentLabelFromMessage } from './handoffLabels.js';
import type {
  AgentSummary,
  HandoffOpenStatus,
  HandoffStatusUpdateStatus,
  HandoffWriteStatus,
} from './types.js';

/**
 * The handoff workflow state hub: draft preview/copy/write, the artifact library with its
 * status/dispatch/work-package/execution actions, and the webview message listener that resolves
 * each request id. Extracted verbatim from TimelineDashboard — the hook call order is unchanged,
 * so React semantics are identical.
 */
export function useHandoffWorkflow({
  agents,
  timelineEvents,
  replayState,
}: {
  agents: AgentSummary[];
  timelineEvents: TimelinePageItem[];
  replayState: TimelineReplayState;
}) {
  const [isHandoffPreviewOpen, setIsHandoffPreviewOpen] = useState(false);
  const [handoffCopyStatus, setHandoffCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [handoffWriteStatus, setHandoffWriteStatus] = useState<HandoffWriteStatus>('idle');
  const [handoffWrittenPath, setHandoffWrittenPath] = useState('');
  const [handoffWriteError, setHandoffWriteError] = useState('');
  const handoffWriteRequestIdRef = useRef('');
  const [handoffLibraryState, setHandoffLibraryState] = useState<HandoffArtifactLibraryState>(
    initialHandoffArtifactLibraryState,
  );
  const [handoffOpenStatus, setHandoffOpenStatus] = useState<HandoffOpenStatus>('idle');
  const [handoffOpenedPath, setHandoffOpenedPath] = useState('');
  const [handoffOpenError, setHandoffOpenError] = useState('');
  const handoffOpenRequestIdRef = useRef('');
  const [handoffStatusUpdateStatus, setHandoffStatusUpdateStatus] =
    useState<HandoffStatusUpdateStatus>('idle');
  const [handoffStatusUpdatedPath, setHandoffStatusUpdatedPath] = useState('');
  const [handoffStatusUpdateError, setHandoffStatusUpdateError] = useState('');
  const handoffStatusUpdateRequestIdRef = useRef('');
  const [handoffDispatchPromptStatus, setHandoffDispatchPromptStatus] =
    useState<HandoffDispatchPromptStatus>('idle');
  const [handoffDispatchBranchName, setHandoffDispatchBranchName] = useState('');
  const [handoffDispatchReportPath, setHandoffDispatchReportPath] = useState('');
  const [handoffDispatchPromptError, setHandoffDispatchPromptError] = useState('');
  const handoffDispatchPromptRequestIdRef = useRef('');
  const [handoffWorkPackageStatus, setHandoffWorkPackageStatus] =
    useState<HandoffWorkPackageStatus>('idle');
  const [handoffWorkPackagePath, setHandoffWorkPackagePath] = useState('');
  const [handoffWorkPackageBranchName, setHandoffWorkPackageBranchName] = useState('');
  const [handoffWorkPackageReportPath, setHandoffWorkPackageReportPath] = useState('');
  const [handoffWorkPackageError, setHandoffWorkPackageError] = useState('');
  const handoffWorkPackageRequestIdRef = useRef('');
  const [handoffExecutionActionStatus, setHandoffExecutionActionStatus] =
    useState<HandoffExecutionActionStatus>('idle');
  const [handoffExecutionAgentLabel, setHandoffExecutionAgentLabel] = useState('');
  const [handoffExecutionPackagePath, setHandoffExecutionPackagePath] = useState('');
  const [handoffExecutionError, setHandoffExecutionError] = useState('');
  const handoffExecutionRequestIdRef = useRef('');
  const handoffAutoRefreshSeenRef = useRef<Record<string, string>>({});
  const handoffPageModel = useMemo(
    () => buildHandoffDraftPageModel({ timelineEvents, replayState }),
    [timelineEvents, replayState],
  );
  const refreshHandoffArtifacts = () => {
    vscode.postMessage({ type: 'refreshHandoffArtifacts' });
  };

  useEffect(() => {
    if (!handoffPageModel.canCreate && isHandoffPreviewOpen) {
      setIsHandoffPreviewOpen(false);
    }
    setHandoffCopyStatus('idle');
    setHandoffWriteStatus('idle');
    setHandoffWrittenPath('');
    setHandoffWriteError('');
  }, [handoffPageModel, isHandoffPreviewOpen]);

  // ① handoff spine — close the feedback loop. When a linked executor settles (turn ended / idle), the
  // queue's completion is re-scanned automatically instead of waiting for a manual "Refresh" click.
  // Silent: posts the same message the button does but without the manual status flicker; the library
  // updates via the extension's handoffArtifactsLoaded rebroadcast. Loop-safe via the seen-signature
  // ref (selectHandoffAutoRefreshTargets only fires once per executor settle).
  useEffect(() => {
    const decision = selectHandoffAutoRefreshTargets(
      handoffLibraryState.items,
      agents,
      handoffAutoRefreshSeenRef.current,
    );
    handoffAutoRefreshSeenRef.current = decision.nextSeen;
    if (decision.paths.length === 0) return;
    const itemByPath = new Map(handoffLibraryState.items.map((item) => [item.relativePath, item]));
    for (const path of decision.paths) {
      const item = itemByPath.get(path);
      if (!item) continue;
      const requestId = `handoff-completion-auto-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const message = buildRefreshHandoffCompletionMessage(item, requestId);
      if (message) vscode.postMessage(message);
    }
  }, [handoffLibraryState.items, agents]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (typeof event.data !== 'object' || event.data === null) return;
      const message = event.data as Record<string, unknown>;
      if (message.type === 'handoffArtifactsLoaded') {
        setHandoffLibraryState(handoffArtifactLibraryStateFromLoadedMessage(message));
        return;
      }
      if (shouldRefreshHandoffArtifactsForMessage(message)) {
        refreshHandoffArtifacts();
      }
      if (
        message.type === 'handoffDraftWritten' &&
        message.requestId === handoffWriteRequestIdRef.current
      ) {
        setHandoffWriteStatus('written');
        setHandoffWrittenPath(
          typeof message.relativePath === 'string'
            ? message.relativePath
            : typeof message.path === 'string'
              ? message.path
              : '',
        );
        setHandoffWriteError('');
        return;
      }
      if (
        message.type === 'handoffDraftWriteFailed' &&
        message.requestId === handoffWriteRequestIdRef.current
      ) {
        setHandoffWriteStatus('failed');
        setHandoffWrittenPath('');
        setHandoffWriteError(
          typeof message.error === 'string' ? message.error : 'Could not write handoff draft.',
        );
        return;
      }
      if (
        message.type === 'handoffArtifactOpened' &&
        message.requestId === handoffOpenRequestIdRef.current
      ) {
        setHandoffOpenStatus('opened');
        setHandoffOpenedPath(
          typeof message.relativePath === 'string'
            ? message.relativePath
            : typeof message.path === 'string'
              ? message.path
              : '',
        );
        setHandoffOpenError('');
        return;
      }
      if (
        message.type === 'handoffArtifactOpenFailed' &&
        message.requestId === handoffOpenRequestIdRef.current
      ) {
        setHandoffOpenStatus('failed');
        setHandoffOpenedPath('');
        setHandoffOpenError(
          typeof message.error === 'string' ? message.error : 'Could not open handoff artifact.',
        );
        return;
      }
      if (
        message.type === 'handoffArtifactStatusUpdated' &&
        message.requestId === handoffStatusUpdateRequestIdRef.current
      ) {
        setHandoffStatusUpdateStatus('updated');
        setHandoffStatusUpdatedPath(
          typeof message.relativePath === 'string'
            ? message.relativePath
            : typeof message.path === 'string'
              ? message.path
              : '',
        );
        setHandoffStatusUpdateError('');
        return;
      }
      if (
        message.type === 'handoffArtifactStatusUpdateFailed' &&
        message.requestId === handoffStatusUpdateRequestIdRef.current
      ) {
        setHandoffStatusUpdateStatus('failed');
        setHandoffStatusUpdatedPath('');
        setHandoffStatusUpdateError(
          typeof message.error === 'string' ? message.error : 'Could not update handoff status.',
        );
        return;
      }
      if (
        message.type === 'handoffDispatchPromptCreated' &&
        message.requestId === handoffDispatchPromptRequestIdRef.current
      ) {
        const prompt = typeof message.prompt === 'string' ? message.prompt : '';
        const branchName = typeof message.branchName === 'string' ? message.branchName : '';
        const reportRelativePath =
          typeof message.reportRelativePath === 'string' ? message.reportRelativePath : '';
        if (!prompt.trim()) {
          setHandoffDispatchPromptStatus('failed');
          setHandoffDispatchBranchName(branchName);
          setHandoffDispatchReportPath(reportRelativePath);
          setHandoffDispatchPromptError('No dispatch prompt was returned.');
          return;
        }
        void copyTextToClipboard(prompt)
          .then(() => {
            setHandoffDispatchPromptStatus('copied');
            setHandoffDispatchBranchName(branchName);
            setHandoffDispatchReportPath(reportRelativePath);
            setHandoffDispatchPromptError('');
          })
          .catch(() => {
            setHandoffDispatchPromptStatus('failed');
            setHandoffDispatchBranchName(branchName);
            setHandoffDispatchReportPath(reportRelativePath);
            setHandoffDispatchPromptError('Clipboard copy failed.');
          });
        return;
      }
      if (
        message.type === 'handoffDispatchPromptFailed' &&
        message.requestId === handoffDispatchPromptRequestIdRef.current
      ) {
        setHandoffDispatchPromptStatus('failed');
        setHandoffDispatchBranchName('');
        setHandoffDispatchReportPath('');
        setHandoffDispatchPromptError(
          typeof message.error === 'string'
            ? message.error
            : 'Could not create handoff dispatch prompt.',
        );
        return;
      }
      if (
        message.type === 'handoffWorkPackageCreated' &&
        message.requestId === handoffWorkPackageRequestIdRef.current
      ) {
        setHandoffWorkPackageStatus('created');
        setHandoffWorkPackagePath(
          typeof message.packageRelativePath === 'string' ? message.packageRelativePath : '',
        );
        setHandoffWorkPackageBranchName(
          typeof message.branchName === 'string' ? message.branchName : '',
        );
        setHandoffWorkPackageReportPath(
          typeof message.reportRelativePath === 'string' ? message.reportRelativePath : '',
        );
        setHandoffWorkPackageError('');
        return;
      }
      if (
        message.type === 'handoffWorkPackageCreateFailed' &&
        message.requestId === handoffWorkPackageRequestIdRef.current
      ) {
        setHandoffWorkPackageStatus('failed');
        setHandoffWorkPackagePath('');
        setHandoffWorkPackageBranchName('');
        setHandoffWorkPackageReportPath('');
        setHandoffWorkPackageError(
          typeof message.error === 'string'
            ? message.error
            : 'Could not create handoff work package.',
        );
        return;
      }
      if (
        message.type === 'handoffWorkPackageOpened' &&
        message.requestId === handoffWorkPackageRequestIdRef.current
      ) {
        setHandoffWorkPackageStatus('opened');
        setHandoffWorkPackagePath(
          typeof message.packageRelativePath === 'string' ? message.packageRelativePath : '',
        );
        setHandoffWorkPackageError('');
        return;
      }
      if (
        message.type === 'handoffWorkPackageOpenFailed' &&
        message.requestId === handoffWorkPackageRequestIdRef.current
      ) {
        setHandoffWorkPackageStatus('failed');
        setHandoffWorkPackageError(
          typeof message.error === 'string' ? message.error : 'Could not open work package.',
        );
        return;
      }
      if (
        message.type === 'handoffWorkPackagePromptCreated' &&
        message.requestId === handoffWorkPackageRequestIdRef.current
      ) {
        const prompt = typeof message.prompt === 'string' ? message.prompt : '';
        const branchName = typeof message.branchName === 'string' ? message.branchName : '';
        const reportRelativePath =
          typeof message.reportRelativePath === 'string' ? message.reportRelativePath : '';
        const packageRelativePath =
          typeof message.packageRelativePath === 'string' ? message.packageRelativePath : '';
        if (!prompt.trim()) {
          setHandoffWorkPackageStatus('failed');
          setHandoffWorkPackagePath(packageRelativePath);
          setHandoffWorkPackageBranchName(branchName);
          setHandoffWorkPackageReportPath(reportRelativePath);
          setHandoffWorkPackageError('No work-package prompt was returned.');
          return;
        }
        void copyTextToClipboard(prompt)
          .then(() => {
            setHandoffWorkPackageStatus('copied');
            setHandoffWorkPackagePath(packageRelativePath);
            setHandoffWorkPackageBranchName(branchName);
            setHandoffWorkPackageReportPath(reportRelativePath);
            setHandoffWorkPackageError('');
          })
          .catch(() => {
            setHandoffWorkPackageStatus('failed');
            setHandoffWorkPackagePath(packageRelativePath);
            setHandoffWorkPackageBranchName(branchName);
            setHandoffWorkPackageReportPath(reportRelativePath);
            setHandoffWorkPackageError('Clipboard copy failed.');
          });
        return;
      }
      if (
        message.type === 'handoffWorkPackagePromptFailed' &&
        message.requestId === handoffWorkPackageRequestIdRef.current
      ) {
        setHandoffWorkPackageStatus('failed');
        setHandoffWorkPackageError(
          typeof message.error === 'string'
            ? message.error
            : 'Could not create work-package prompt.',
        );
        return;
      }
      if (
        message.type === 'handoffDispatchStatusUpdated' &&
        message.requestId === handoffWorkPackageRequestIdRef.current
      ) {
        setHandoffWorkPackageStatus('updated');
        setHandoffWorkPackagePath(
          typeof message.packageRelativePath === 'string' ? message.packageRelativePath : '',
        );
        setHandoffWorkPackageBranchName(
          typeof message.branchName === 'string' ? message.branchName : '',
        );
        setHandoffWorkPackageReportPath(
          typeof message.reportRelativePath === 'string' ? message.reportRelativePath : '',
        );
        setHandoffWorkPackageError('');
        return;
      }
      if (
        message.type === 'handoffDispatchStatusUpdateFailed' &&
        message.requestId === handoffWorkPackageRequestIdRef.current
      ) {
        setHandoffWorkPackageStatus('failed');
        setHandoffWorkPackageError(
          typeof message.error === 'string'
            ? message.error
            : 'Could not update work-package status.',
        );
        return;
      }
      if (
        message.type === 'handoffExecutionLinked' &&
        message.requestId === handoffExecutionRequestIdRef.current
      ) {
        setHandoffExecutionActionStatus('linked');
        setHandoffExecutionAgentLabel(handoffExecutionAgentLabelFromMessage(message));
        setHandoffExecutionPackagePath(
          typeof message.packageRelativePath === 'string' ? message.packageRelativePath : '',
        );
        setHandoffExecutionError('');
        return;
      }
      if (
        message.type === 'handoffExecutionLinkFailed' &&
        message.requestId === handoffExecutionRequestIdRef.current
      ) {
        setHandoffExecutionActionStatus('failed');
        setHandoffExecutionAgentLabel('');
        setHandoffExecutionPackagePath('');
        setHandoffExecutionError(
          typeof message.error === 'string' ? message.error : 'Could not link handoff execution.',
        );
        return;
      }
      if (
        message.type === 'handoffExecutionStatusUpdated' &&
        message.requestId === handoffExecutionRequestIdRef.current
      ) {
        setHandoffExecutionActionStatus('updated');
        setHandoffExecutionAgentLabel(handoffExecutionAgentLabelFromMessage(message));
        setHandoffExecutionPackagePath(
          typeof message.packageRelativePath === 'string' ? message.packageRelativePath : '',
        );
        setHandoffExecutionError('');
        return;
      }
      if (
        message.type === 'handoffExecutionStatusUpdateFailed' &&
        message.requestId === handoffExecutionRequestIdRef.current
      ) {
        setHandoffExecutionActionStatus('failed');
        setHandoffExecutionError(
          typeof message.error === 'string'
            ? message.error
            : 'Could not update handoff execution status.',
        );
        return;
      }
      if (
        message.type === 'handoffExecutorLaunched' &&
        message.requestId === handoffExecutionRequestIdRef.current
      ) {
        setHandoffExecutionActionStatus('launched');
        setHandoffExecutionAgentLabel(handoffExecutionAgentLabelFromMessage(message));
        setHandoffExecutionPackagePath(
          typeof message.packageRelativePath === 'string' ? message.packageRelativePath : '',
        );
        setHandoffExecutionError('');
        return;
      }
      if (
        message.type === 'handoffExecutorLaunchFailed' &&
        message.requestId === handoffExecutionRequestIdRef.current
      ) {
        setHandoffExecutionActionStatus('failed');
        setHandoffExecutionAgentLabel('');
        setHandoffExecutionPackagePath('');
        setHandoffExecutionError(
          typeof message.error === 'string' ? message.error : 'Could not launch executor.',
        );
        return;
      }
      if (
        message.type === 'handoffCompletionRefreshed' &&
        message.requestId === handoffExecutionRequestIdRef.current
      ) {
        setHandoffExecutionActionStatus('refreshed');
        setHandoffExecutionAgentLabel('');
        setHandoffExecutionPackagePath(
          typeof message.packageRelativePath === 'string'
            ? message.packageRelativePath
            : typeof message.reportRelativePath === 'string'
              ? message.reportRelativePath
              : '',
        );
        setHandoffExecutionError('');
        return;
      }
      if (
        message.type === 'handoffCompletionRefreshFailed' &&
        message.requestId === handoffExecutionRequestIdRef.current
      ) {
        setHandoffExecutionActionStatus('failed');
        setHandoffExecutionError(
          typeof message.error === 'string'
            ? message.error
            : 'Could not refresh handoff completion.',
        );
        return;
      }
      if (
        message.type === 'handoffReportOpened' &&
        message.requestId === handoffExecutionRequestIdRef.current
      ) {
        setHandoffExecutionActionStatus('report_opened');
        setHandoffExecutionAgentLabel('');
        setHandoffExecutionPackagePath(
          typeof message.reportRelativePath === 'string' ? message.reportRelativePath : '',
        );
        setHandoffExecutionError('');
        return;
      }
      if (
        message.type === 'handoffReportOpenFailed' &&
        message.requestId === handoffExecutionRequestIdRef.current
      ) {
        setHandoffExecutionActionStatus('failed');
        setHandoffExecutionError(
          typeof message.error === 'string' ? message.error : 'Could not open executor report.',
        );
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    refreshHandoffArtifacts();
  }, []);

  const createHandoffPreview = () => {
    if (!handoffPageModel.canCreate) return;
    setHandoffCopyStatus('idle');
    setIsHandoffPreviewOpen(true);
  };
  const copyHandoffMarkdown = () => {
    const markdown = handoffPageModel.draft?.markdown;
    if (!markdown) {
      setHandoffCopyStatus('failed');
      return;
    }
    void copyTextToClipboard(markdown)
      .then(() => setHandoffCopyStatus('copied'))
      .catch(() => setHandoffCopyStatus('failed'));
  };
  const writeHandoffDraft = () => {
    const requestId = `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = buildHandoffDraftWriteMessage(handoffPageModel, requestId);
    if (!message) {
      setHandoffWriteStatus('failed');
      setHandoffWriteError('No handoff draft is available to write.');
      return;
    }
    handoffWriteRequestIdRef.current = requestId;
    setIsHandoffPreviewOpen(true);
    setHandoffWriteStatus('writing');
    setHandoffWrittenPath('');
    setHandoffWriteError('');
    vscode.postMessage(message);
  };
  const openHandoffArtifact = (item: HandoffArtifactLibraryItem) => {
    const requestId = `handoff-open-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = buildOpenHandoffArtifactMessage(item, requestId);
    if (!message) {
      setHandoffOpenStatus('failed');
      setHandoffOpenError('No handoff artifact path is available.');
      return;
    }
    handoffOpenRequestIdRef.current = requestId;
    setHandoffOpenStatus('opening');
    setHandoffOpenedPath('');
    setHandoffOpenError('');
    vscode.postMessage(message);
  };
  const updateHandoffArtifactStatus = (
    item: HandoffArtifactLibraryItem,
    nextStatus: HandoffArtifactLocalStatus,
  ) => {
    const requestId = `handoff-status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = buildUpdateHandoffArtifactStatusMessage(item, nextStatus, requestId);
    if (!message) {
      setHandoffStatusUpdateStatus('failed');
      setHandoffStatusUpdateError('No handoff artifact status update is available.');
      return;
    }
    handoffStatusUpdateRequestIdRef.current = requestId;
    setHandoffStatusUpdateStatus('updating');
    setHandoffStatusUpdatedPath('');
    setHandoffStatusUpdateError('');
    vscode.postMessage(message);
  };
  const copyHandoffDispatchPrompt = (item: HandoffArtifactLibraryItem) => {
    const requestId = `handoff-dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = buildCreateHandoffDispatchPromptMessage(item, requestId);
    if (!message) {
      setHandoffDispatchPromptStatus('failed');
      setHandoffDispatchPromptError('No handoff artifact path is available for dispatch.');
      return;
    }
    handoffDispatchPromptRequestIdRef.current = requestId;
    setHandoffDispatchPromptStatus('creating');
    setHandoffDispatchBranchName('');
    setHandoffDispatchReportPath('');
    setHandoffDispatchPromptError('');
    vscode.postMessage(message);
  };
  const createHandoffWorkPackage = (item: HandoffArtifactLibraryItem) => {
    const requestId = `handoff-work-package-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = buildCreateHandoffWorkPackageMessage(item, requestId);
    if (!message) {
      setHandoffWorkPackageStatus('failed');
      setHandoffWorkPackageError('No reviewed handoff metadata is available for a work package.');
      return;
    }
    handoffWorkPackageRequestIdRef.current = requestId;
    setHandoffWorkPackageStatus('creating');
    setHandoffWorkPackagePath('');
    setHandoffWorkPackageBranchName('');
    setHandoffWorkPackageReportPath('');
    setHandoffWorkPackageError('');
    vscode.postMessage(message);
  };
  const openHandoffWorkPackage = (item: HandoffArtifactLibraryItem) => {
    const requestId = `handoff-work-open-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = buildOpenHandoffWorkPackageMessage(item, requestId);
    if (!message) {
      setHandoffWorkPackageStatus('failed');
      setHandoffWorkPackageError('No handoff work package is available to open.');
      return;
    }
    handoffWorkPackageRequestIdRef.current = requestId;
    setHandoffWorkPackageStatus('opening');
    setHandoffWorkPackagePath('');
    setHandoffWorkPackageError('');
    vscode.postMessage(message);
  };
  const copyHandoffWorkPackagePrompt = (item: HandoffArtifactLibraryItem) => {
    const requestId = `handoff-work-copy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = buildCreateHandoffWorkPackagePromptMessage(item, requestId);
    if (!message) {
      setHandoffWorkPackageStatus('failed');
      setHandoffWorkPackageError('Create a work package before copying its executor prompt.');
      return;
    }
    handoffWorkPackageRequestIdRef.current = requestId;
    setHandoffWorkPackageStatus('copying');
    setHandoffWorkPackagePath('');
    setHandoffWorkPackageBranchName('');
    setHandoffWorkPackageReportPath('');
    setHandoffWorkPackageError('');
    vscode.postMessage(message);
  };
  const updateHandoffDispatchStatus = (
    item: HandoffArtifactLibraryItem,
    nextStatus: HandoffDispatchStatus,
  ) => {
    const requestId = `handoff-work-status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = buildUpdateHandoffDispatchStatusMessage(item, nextStatus, requestId);
    if (!message) {
      setHandoffWorkPackageStatus('failed');
      setHandoffWorkPackageError('No handoff work-package status update is available.');
      return;
    }
    handoffWorkPackageRequestIdRef.current = requestId;
    setHandoffWorkPackageStatus('updating');
    setHandoffWorkPackagePath('');
    setHandoffWorkPackageError('');
    vscode.postMessage(message);
  };
  const linkHandoffExecutionAgent = (item: HandoffArtifactLibraryItem, agentId: number) => {
    const requestId = `handoff-execution-link-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const message = buildLinkHandoffExecutionAgentMessage(item, agentId, requestId);
    if (!message) {
      setHandoffExecutionActionStatus('failed');
      setHandoffExecutionError('Select a visible agent and create a work package first.');
      return;
    }
    const agent = agents.find((candidate) => candidate.id === agentId);
    handoffExecutionRequestIdRef.current = requestId;
    setHandoffExecutionActionStatus('linking');
    setHandoffExecutionAgentLabel(agent ? handoffAgentOptionLabel(agent) : `Agent #${agentId}`);
    setHandoffExecutionPackagePath(item.dispatchPackage?.packageRelativePath ?? '');
    setHandoffExecutionError('');
    vscode.postMessage(message);
  };
  const updateHandoffExecutionStatus = (
    item: HandoffArtifactLibraryItem,
    nextStatus: HandoffExecutionStatus,
  ) => {
    const requestId = `handoff-execution-status-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const message = buildUpdateHandoffExecutionStatusMessage(item, nextStatus, requestId);
    if (!message) {
      setHandoffExecutionActionStatus('failed');
      setHandoffExecutionError('Link an agent before updating handoff execution status.');
      return;
    }
    handoffExecutionRequestIdRef.current = requestId;
    setHandoffExecutionActionStatus('updating');
    setHandoffExecutionAgentLabel(
      item.dispatchPackage?.execution?.agentName ??
        (item.dispatchPackage?.execution?.agentId !== undefined
          ? `Agent #${item.dispatchPackage.execution.agentId}`
          : ''),
    );
    setHandoffExecutionPackagePath(item.dispatchPackage?.packageRelativePath ?? '');
    setHandoffExecutionError('');
    vscode.postMessage(message);
  };
  const launchHandoffExecutor = (
    item: HandoffArtifactLibraryItem,
    providerId: 'codex' | 'claude',
  ) => {
    const requestId = `handoff-executor-launch-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const message = buildLaunchHandoffExecutorMessage(item, requestId, providerId);
    if (!message) {
      setHandoffExecutionActionStatus('failed');
      setHandoffExecutionError('Create a work package before launching an executor.');
      return;
    }
    handoffExecutionRequestIdRef.current = requestId;
    setHandoffExecutionActionStatus('launching');
    setHandoffExecutionAgentLabel(providerId === 'claude' ? 'Claude executor' : 'Codex executor');
    setHandoffExecutionPackagePath(item.dispatchPackage?.packageRelativePath ?? '');
    setHandoffExecutionError('');
    vscode.postMessage(message);
  };
  const refreshHandoffCompletion = (item: HandoffArtifactLibraryItem) => {
    const requestId = `handoff-completion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = buildRefreshHandoffCompletionMessage(item, requestId);
    if (!message) {
      setHandoffExecutionActionStatus('failed');
      setHandoffExecutionError('Create a work package before refreshing completion.');
      return;
    }
    handoffExecutionRequestIdRef.current = requestId;
    setHandoffExecutionActionStatus('refreshing');
    setHandoffExecutionAgentLabel('');
    setHandoffExecutionPackagePath(item.dispatchPackage?.packageRelativePath ?? '');
    setHandoffExecutionError('');
    vscode.postMessage(message);
  };
  const openHandoffReport = (item: HandoffArtifactLibraryItem) => {
    const requestId = `handoff-report-open-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = buildOpenHandoffReportMessage(item, requestId);
    if (!message) {
      setHandoffExecutionActionStatus('failed');
      setHandoffExecutionError('No executor report is available to open.');
      return;
    }
    handoffExecutionRequestIdRef.current = requestId;
    setHandoffExecutionActionStatus('opening_report');
    setHandoffExecutionAgentLabel('');
    setHandoffExecutionPackagePath(item.completion?.reportRelativePath ?? '');
    setHandoffExecutionError('');
    vscode.postMessage(message);
  };

  return {
    isHandoffPreviewOpen,
    setIsHandoffPreviewOpen,
    handoffPageModel,
    handoffLibraryState,
    handoffCopyStatus,
    handoffWriteStatus,
    handoffWrittenPath,
    handoffWriteError,
    handoffOpenStatus,
    handoffOpenedPath,
    handoffOpenError,
    handoffStatusUpdateStatus,
    handoffStatusUpdatedPath,
    handoffStatusUpdateError,
    handoffDispatchPromptStatus,
    handoffDispatchBranchName,
    handoffDispatchReportPath,
    handoffDispatchPromptError,
    handoffWorkPackageStatus,
    handoffWorkPackagePath,
    handoffWorkPackageBranchName,
    handoffWorkPackageReportPath,
    handoffWorkPackageError,
    handoffExecutionActionStatus,
    handoffExecutionAgentLabel,
    handoffExecutionPackagePath,
    handoffExecutionError,
    refreshHandoffArtifacts,
    createHandoffPreview,
    copyHandoffMarkdown,
    writeHandoffDraft,
    openHandoffArtifact,
    updateHandoffArtifactStatus,
    copyHandoffDispatchPrompt,
    createHandoffWorkPackage,
    openHandoffWorkPackage,
    copyHandoffWorkPackagePrompt,
    updateHandoffDispatchStatus,
    linkHandoffExecutionAgent,
    updateHandoffExecutionStatus,
    launchHandoffExecutor,
    refreshHandoffCompletion,
    openHandoffReport,
  };
}
