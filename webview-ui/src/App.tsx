import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { toMajorMinor } from './changelogData.js';
import { AgentCenter } from './components/AgentCenter.js';
import { BottomToolbar } from './components/BottomToolbar.js';
import { ChangelogModal } from './components/ChangelogModal.js';
import { DebugView } from './components/DebugView.js';
import { EditActionBar } from './components/EditActionBar.js';
import { MigrationNotice } from './components/MigrationNotice.js';
import { buildPauseResumeMessage } from './components/pauseResume.js';
import { SettingsModal } from './components/SettingsModal.js';
import { Tooltip } from './components/Tooltip.js';
import { Modal } from './components/ui/Modal.js';
import { VersionIndicator } from './components/VersionIndicator.js';
import { ZoomControls } from './components/ZoomControls.js';
import { useEditorActions } from './hooks/useEditorActions.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useExtensionMessages } from './hooks/useExtensionMessages.js';
import { OfficeCanvas } from './office/components/OfficeCanvas.js';
import { RoomTokenCostSummary } from './office/components/RoomTokenCostSummary.js';
import { RoomZoneOverlay } from './office/components/RoomZoneOverlay.js';
import { RoomZoneStatus } from './office/components/RoomZoneStatus.js';
import { ToolOverlay } from './office/components/ToolOverlay.js';
import { EditorState } from './office/editor/editorState.js';
import { EditorToolbar } from './office/editor/EditorToolbar.js';
import { OfficeState } from './office/engine/officeState.js';
import { isRotatable } from './office/layout/furnitureCatalog.js';
import { EditTool } from './office/types.js';
import { isBrowserRuntime } from './runtime.js';
import { vscode } from './vscodeApi.js';

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null };
const editorState = new EditorState();

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}

function App() {
  // Browser runtime (dev or static dist): dispatch mock messages after the
  // useExtensionMessages listener has been registered.
  useEffect(() => {
    if (isBrowserRuntime) {
      void import('./browserMock.js').then(({ dispatchMockMessages }) => dispatchMockMessages());
    }
  }, []);

  const editor = useEditorActions(getOfficeState, editorState);

  const isEditDirty = useCallback(
    () => editor.isEditMode && editor.isDirty,
    [editor.isEditMode, editor.isDirty],
  );

  const {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    agentLifecycleStatuses,
    agentLifecycleEvents,
    agentTimelineEvents,
    agentRuntimeMetadata,
    agentEventTrace,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
    codexProjects,
    externalAssetDirectories,
    lastSeenVersion,
    extensionVersion,
    watchAllSessions,
    setWatchAllSessions,
    alwaysShowLabels,
    hooksEnabled,
    setHooksEnabled,
    hooksInfoShown,
  } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty);

  // Show migration notice once layout reset is detected
  const [migrationNoticeDismissed, setMigrationNoticeDismissed] = useState(false);
  const showMigrationNotice = layoutWasReset && !migrationNoticeDismissed;

  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAgentCenterOpen, setIsAgentCenterOpen] = useState(false);
  const [isHooksInfoOpen, setIsHooksInfoOpen] = useState(false);
  const [hooksTooltipDismissed, setHooksTooltipDismissed] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [alwaysShowOverlay, setAlwaysShowOverlay] = useState(false);
  const [agentProviderFilter, setAgentProviderFilter] = useState<'all' | 'codex' | 'claude'>('all');
  const [pendingCloseAgentId, setPendingCloseAgentId] = useState<number | null>(null);

  const currentMajorMinor = toMajorMinor(extensionVersion);

  const handleWhatsNewDismiss = useCallback(() => {
    vscode.postMessage({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  const handleOpenChangelog = useCallback(() => {
    setIsChangelogOpen(true);
    vscode.postMessage({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  // Sync alwaysShowOverlay from persisted settings
  useEffect(() => {
    setAlwaysShowOverlay(alwaysShowLabels);
  }, [alwaysShowLabels]);

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), []);
  const handleToggleAlwaysShowOverlay = useCallback(() => {
    setAlwaysShowOverlay((prev) => {
      const newVal = !prev;
      vscode.postMessage({ type: 'setAlwaysShowLabels', enabled: newVal });
      return newVal;
    });
  }, []);

  const handleSelectAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'focusAgent', id });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0);
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  );

  const handleCloseAgent = useCallback((id: number) => {
    setPendingCloseAgentId(id);
  }, []);

  const handleClick = useCallback((agentId: number) => {
    // If clicked agent is a sub-agent, focus the parent's terminal instead
    const os = getOfficeState();
    const meta = os.subagentMeta.get(agentId);
    const focusId = meta ? meta.parentAgentId : agentId;
    vscode.postMessage({ type: 'focusAgent', id: focusId });
  }, []);

  const officeState = getOfficeState();
  const agentProviderKey = [...officeState.characters]
    .map(([id, ch]) => `${id}:${ch.providerId ?? 'claude'}`)
    .join('|');
  const visibleAgentIds = useMemo(() => {
    void agentProviderKey;
    const ids = new Set<number>();
    for (const [id, ch] of officeState.characters) {
      const providerId = ch.providerId ?? 'claude';
      if (agentProviderFilter === 'all' || providerId === agentProviderFilter) {
        ids.add(id);
      }
    }
    return ids;
  }, [agentProviderFilter, agentProviderKey, officeState]);
  const visibleAgents = useMemo(
    () => agents.filter((id) => visibleAgentIds.has(id)),
    [agents, visibleAgentIds],
  );
  const visibleSubagentCharacters = useMemo(
    () => subagentCharacters.filter((subagent) => visibleAgentIds.has(subagent.id)),
    [subagentCharacters, visibleAgentIds],
  );

  useEffect(() => {
    if (officeState.selectedAgentId !== null && !visibleAgentIds.has(officeState.selectedAgentId)) {
      officeState.selectedAgentId = null;
    }
    if (officeState.cameraFollowId !== null && !visibleAgentIds.has(officeState.cameraFollowId)) {
      officeState.cameraFollowId = null;
    }
    if (officeState.hoveredAgentId !== null && !visibleAgentIds.has(officeState.hoveredAgentId)) {
      officeState.hoveredAgentId = null;
    }
  }, [officeState, visibleAgentIds]);

  // Force dependency on editorTickForKeyboard to propagate keyboard-triggered re-renders
  void editorTickForKeyboard;

  // Show "Press R to rotate" hint when a rotatable item is selected or being placed
  const showRotateHint =
    editor.isEditMode &&
    (() => {
      if (editorState.selectedFurnitureUid) {
        const item = officeState
          .getLayout()
          .furniture.find((f) => f.uid === editorState.selectedFurnitureUid);
        if (item && isRotatable(item.type)) return true;
      }
      if (
        editorState.activeTool === EditTool.FURNITURE_PLACE &&
        isRotatable(editorState.selectedFurnitureType)
      ) {
        return true;
      }
      return false;
    })();
  const agentNames = agents
    .map((id) => officeState.characters.get(id)?.agentName)
    .filter((name): name is string => !!name)
    .join('|');
  const pendingCloseCharacter =
    pendingCloseAgentId === null ? undefined : officeState.characters.get(pendingCloseAgentId);

  if (!layoutReady) {
    return <div className="w-full h-full flex items-center justify-center ">Loading...</div>;
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      data-testid="pixel-agents-root"
      data-agent-count={agents.length}
      data-agent-names={agentNames}
    >
      <OfficeCanvas
        officeState={officeState}
        visibleAgentIds={visibleAgentIds}
        onClick={handleClick}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
      />

      {!isDebugMode ? (
        <>
          <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />

          {!editor.isEditMode && (
            <RoomTokenCostSummary
              officeState={officeState}
              agents={agents}
              containerRef={containerRef}
              zoom={editor.zoom}
              panRef={editor.panRef}
            />
          )}

          {editor.isEditMode && (
            <>
              <RoomZoneOverlay
                officeState={officeState}
                containerRef={containerRef}
                zoom={editor.zoom}
                panRef={editor.panRef}
              />
              <RoomZoneStatus officeState={officeState} />
            </>
          )}

          {/* Vignette overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'var(--vignette)' }}
          />

          {editor.isEditMode && editor.isDirty && (
            <EditActionBar editor={editor} editorState={editorState} />
          )}

          {showRotateHint && (
            <div
              className="absolute left-1/2 -translate-x-1/2 z-11 bg-accent-bright text-white text-sm py-3 px-8 rounded-none border-2 border-accent shadow-pixel pointer-events-none whitespace-nowrap"
              style={{ top: editor.isDirty ? 64 : 8 }}
            >
              Rotate (R)
            </div>
          )}

          {editor.isEditMode &&
            (() => {
              const selUid = editorState.selectedFurnitureUid;
              const selColor = selUid
                ? (officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null)
                : null;
              return (
                <EditorToolbar
                  activeTool={editorState.activeTool}
                  selectedTileType={editorState.selectedTileType}
                  selectedFurnitureType={editorState.selectedFurnitureType}
                  selectedZone={editorState.selectedZone}
                  selectedFurnitureUid={selUid}
                  selectedFurnitureColor={selColor}
                  floorColor={editorState.floorColor}
                  wallColor={editorState.wallColor}
                  selectedWallSet={editorState.selectedWallSet}
                  onToolChange={editor.handleToolChange}
                  onTileTypeChange={editor.handleTileTypeChange}
                  onFloorColorChange={editor.handleFloorColorChange}
                  onWallColorChange={editor.handleWallColorChange}
                  onWallSetChange={editor.handleWallSetChange}
                  onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
                  onFurnitureTypeChange={editor.handleFurnitureTypeChange}
                  onZoneChange={editor.handleZoneChange}
                  loadedAssets={loadedAssets}
                />
              );
            })()}

          <ToolOverlay
            officeState={officeState}
            agents={visibleAgents}
            agentTools={agentTools}
            agentLifecycleStatuses={agentLifecycleStatuses}
            agentRuntimeMetadata={agentRuntimeMetadata}
            subagentCharacters={visibleSubagentCharacters}
            containerRef={containerRef}
            zoom={editor.zoom}
            panRef={editor.panRef}
            onCloseAgent={handleCloseAgent}
            alwaysShowOverlay={alwaysShowOverlay}
          />
        </>
      ) : (
        <DebugView
          agents={visibleAgents}
          selectedAgent={selectedAgent}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          agentLifecycleStatuses={agentLifecycleStatuses}
          agentLifecycleEvents={agentLifecycleEvents}
          agentEventTrace={agentEventTrace}
          subagentTools={subagentTools}
          officeState={officeState}
          onSelectAgent={handleSelectAgent}
          onCloseAgent={handleCloseAgent}
        />
      )}

      {/* Hooks first-run tooltip */}
      {!hooksInfoShown && !hooksTooltipDismissed && (
        <Tooltip
          title="Instant Detection Active"
          position="top-right"
          onDismiss={() => {
            setHooksTooltipDismissed(true);
            vscode.postMessage({ type: 'setHooksInfoShown' });
          }}
        >
          <span className="text-sm text-text leading-none">
            Your agents now respond in real-time.{' '}
            <span
              className="text-accent cursor-pointer underline"
              onClick={() => {
                setIsHooksInfoOpen(true);
                setHooksTooltipDismissed(true);
                vscode.postMessage({ type: 'setHooksInfoShown' });
              }}
            >
              View more
            </span>
          </span>
        </Tooltip>
      )}

      {/* Hooks info modal */}
      <Modal
        isOpen={isHooksInfoOpen}
        onClose={() => setIsHooksInfoOpen(false)}
        title="Instant Detection is ON"
        zIndex={52}
      >
        <div className="text-base text-text px-10" style={{ lineHeight: 1.4 }}>
          <p className="mb-8">Your Pixel Agents office now reacts in real-time:</p>
          <ul className="mb-8 pl-18 list-disc m-0">
            <li className="text-sm mb-2">Permission prompts appear instantly</li>
            <li className="text-sm mb-2">Turn completions detected the moment they happen</li>
            <li className="text-sm mb-2">Sound notifications play immediately</li>
          </ul>
          <p className="mb-12 text-text-muted">
            This works through Codex event listeners that notify Pixel Agents whenever something
            happens in your coding sessions.
          </p>
          <div className="text-center">
            <button
              onClick={() => setIsHooksInfoOpen(false)}
              className="py-4 px-20 text-lg bg-accent text-white border-2 border-accent rounded-none cursor-pointer shadow-pixel"
            >
              Got it
            </button>
          </div>
          <p className="mt-8 text-xs text-text-muted text-center">
            To disable, go to Settings {'>'} Instant Detection
          </p>
        </div>
      </Modal>

      <BottomToolbar
        isEditMode={editor.isEditMode}
        onOpenAgent={editor.handleOpenAgent}
        onToggleEditMode={editor.handleToggleEditMode}
        onToggleAgentCenter={() => setIsAgentCenterOpen((v) => !v)}
        isSettingsOpen={isSettingsOpen}
        onToggleSettings={() => setIsSettingsOpen((v) => !v)}
        workspaceFolders={workspaceFolders}
        codexProjects={codexProjects}
        agentProviderFilter={agentProviderFilter}
        onAgentProviderFilterChange={setAgentProviderFilter}
      />

      <VersionIndicator
        currentVersion={extensionVersion}
        lastSeenVersion={lastSeenVersion}
        onDismiss={handleWhatsNewDismiss}
        onOpenChangelog={handleOpenChangelog}
      />

      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
        currentVersion={extensionVersion}
      />

      <AgentCenter
        isOpen={isAgentCenterOpen}
        onClose={() => setIsAgentCenterOpen(false)}
        agents={agents}
        selectedAgent={selectedAgent}
        agentTools={agentTools}
        agentStatuses={agentStatuses}
        agentLifecycleStatuses={agentLifecycleStatuses}
        agentLifecycleEvents={agentLifecycleEvents}
        agentTimelineEvents={agentTimelineEvents}
        agentRuntimeMetadata={agentRuntimeMetadata}
        officeState={officeState}
        onCloseAgent={handleCloseAgent}
        onPauseAgent={(id) => vscode.postMessage(buildPauseResumeMessage(id, false))}
        onResumeAgent={(id) => vscode.postMessage(buildPauseResumeMessage(id, true))}
      />

      <Modal
        isOpen={pendingCloseAgentId !== null}
        onClose={() => setPendingCloseAgentId(null)}
        title="Agent actions"
        zIndex={54}
      >
        <div className="px-10 pb-8">
          <p className="text-base text-text">
            Choose what to do with{' '}
            <span className="text-accent-bright">
              {pendingCloseCharacter?.agentName ?? `Agent #${pendingCloseAgentId ?? ''}`}
            </span>
            .
          </p>
          {pendingCloseCharacter?.folderName && (
            <p className="mt-2 text-sm text-text-muted">{pendingCloseCharacter.folderName}</p>
          )}
          <div className="mt-5 grid gap-3 text-sm text-text-muted">
            <p>
              Hide removes only the visual agent for now. It can appear again after refresh if the
              session is still active.
            </p>
            <p>
              Archive removes it from the active roster. Codex threads are archived; Claude
              transcripts are dismissed from tracking.
            </p>
            <p>Kill closes the linked VS Code terminal when available.</p>
          </div>
          <div className="mt-8 flex flex-wrap justify-end gap-3">
            <button
              className="border-2 border-border bg-btn-bg px-12 py-3 text-text"
              onClick={() => setPendingCloseAgentId(null)}
            >
              Cancel
            </button>
            {(['hide', 'archive', 'kill'] as const).map((action) => (
              <button
                key={action}
                className={`border-2 px-12 py-3 text-white ${
                  action === 'kill'
                    ? 'border-danger bg-danger'
                    : action === 'archive'
                      ? 'border-accent bg-accent'
                      : 'border-border bg-btn-bg text-text'
                }`}
                onClick={() => {
                  if (pendingCloseAgentId !== null) {
                    vscode.postMessage({ type: 'agentAction', id: pendingCloseAgentId, action });
                  }
                  setPendingCloseAgentId(null);
                }}
              >
                {action[0].toUpperCase() + action.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDebugMode={isDebugMode}
        onToggleDebugMode={handleToggleDebugMode}
        alwaysShowOverlay={alwaysShowOverlay}
        onToggleAlwaysShowOverlay={handleToggleAlwaysShowOverlay}
        externalAssetDirectories={externalAssetDirectories}
        watchAllSessions={watchAllSessions}
        onToggleWatchAllSessions={() => {
          const newVal = !watchAllSessions;
          setWatchAllSessions(newVal);
          vscode.postMessage({ type: 'setWatchAllSessions', enabled: newVal });
        }}
        hooksEnabled={hooksEnabled}
        onToggleHooksEnabled={() => {
          const newVal = !hooksEnabled;
          setHooksEnabled(newVal);
          vscode.postMessage({ type: 'setHooksEnabled', enabled: newVal });
        }}
      />

      {showMigrationNotice && (
        <MigrationNotice onDismiss={() => setMigrationNoticeDismissed(true)} />
      )}
    </div>
  );
}

export default App;
