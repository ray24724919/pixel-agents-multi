import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { GLOBAL_SCAN_ACTIVE_MAX_AGE_MS } from '../server/src/constants.js';
import type { HookEvent } from '../server/src/hookEventHandler.js';
import { HookEventHandler } from '../server/src/hookEventHandler.js';
import {
  archiveCodexThread,
  codexPathKey,
  type CodexThread,
  findCodexThreadById,
  findRecentCodexThreads,
  terminateCodexThreadProcess,
} from '../server/src/providers/file/codex/codex.js';
import {
  installHooks,
  uninstallHooks,
} from '../server/src/providers/hook/claude/claudeHookInstaller.js';
import { claudeProvider, copyHookScript } from '../server/src/providers/index.js';
import { PixelAgentsServer } from '../server/src/server.js';
import {
  getProjectDirPath,
  launchNewTerminal,
  persistAgents,
  removeAgent,
  restoreAgents,
  sendCurrentAgentStatuses,
  sendExistingAgents,
  sendLayout,
  setAgentPaused,
  syncCodexAgentMetadata,
} from './agentManager.js';
import type { LoadedAssets, LoadedCharacterSprites } from './assetLoader.js';
import {
  loadCharacterSprites,
  loadDefaultLayout,
  loadExternalCharacterSprites,
  loadFloorTiles,
  loadFurnitureAssets,
  loadWallTiles,
  mergeCharacterSprites,
  mergeLoadedAssets,
  sendAssetsToWebview,
  sendCharacterSpritesToWebview,
  sendFloorTilesToWebview,
  sendWallTilesToWebview,
} from './assetLoader.js';
import { readConfig, writeConfig } from './configPersistence.js';
import {
  CONFIG_SECTION,
  DISPLAY_NAME,
  EXTENSION_ID,
  GLOBAL_KEY_ALWAYS_SHOW_LABELS,
  GLOBAL_KEY_HOOKS_ENABLED,
  GLOBAL_KEY_HOOKS_INFO_SHOWN,
  GLOBAL_KEY_LAST_SEEN_VERSION,
  GLOBAL_KEY_SOUND_ENABLED,
  GLOBAL_KEY_WATCH_ALL_SESSIONS,
  LAYOUT_FILE_DIR,
  LAYOUT_REVISION_KEY,
  WORKSPACE_KEY_AGENT_SEATS,
  WORKSPACE_KEY_ARCHIVED_AGENTS,
} from './constants.js';
import {
  adoptExternalSessionFromHook,
  dismissedJsonlFiles,
  ensureProjectScan,
  isTrackedProjectDir,
  readClaudeSessionMetadata,
  readNewLines,
  reassignAgentToFile,
  scanClaudeCoworkSessions,
  scanClaudeRecentSessions,
  scanForTeammateFiles,
  seededMtimes,
  setTeammateRemovalCallback,
  setTeamProvider,
  startExternalSessionScanning,
  startFileWatching,
  startStaleExternalAgentCheck,
  syncClaudeAgentMetadata,
} from './fileWatcher.js';
import {
  buildHandoffArtifactMetadata,
  buildHandoffArtifactTarget,
  readHandoffArtifactMetadataForMarkdown,
  resolveHandoffArtifactOpenPath,
  scanHandoffArtifacts,
} from './handoffArtifacts.js';
import type { LayoutWatcher } from './layoutPersistence.js';
import { readLayoutFromFile, watchLayoutFile, writeLayoutToFile } from './layoutPersistence.js';
import { getExtensionConfigValue, isExtensionConfigExplicitlyConfigured } from './settings.js';
import { postAgentTimelineEvent } from './timelineEvents.js';
import {
  loadTimelineHistoryForWebview,
  persistTimelineEventForWebview,
} from './timelineHistoryBridge.js';
import { readTokenUsageFromTranscript } from './tokenUsage.js';
import {
  type CodexSubagentSpawn,
  setCodexSubagentSpawnHandler,
  setHookProvider,
} from './transcriptParser.js';
import type { AgentState, ArchivedAgentRecord } from './types.js';
import { loadUsageHistoryForWebview } from './usageHistoryBridge.js';
import { ingestAgentUsageSnapshot } from './usageIngestion.js';

export function getLiveCodexThreadIdsForSpawnedAgentCwds(
  agents: Map<number, AgentState>,
  threads: CodexThread[],
): Set<string> {
  const spawnedCwds = new Set<string>();
  for (const agent of agents.values()) {
    if (agent.providerId === 'codex' && !agent.isExternal && agent.projectDir) {
      const cwd = codexPathKey(agent.projectDir);
      if (cwd) spawnedCwds.add(cwd);
    }
  }

  const liveThreadIds = new Set<string>();
  for (const thread of threads) {
    const cwd = codexPathKey(thread.cwd);
    if (cwd && spawnedCwds.has(cwd)) {
      liveThreadIds.add(thread.id);
    }
  }
  return liveThreadIds;
}

export function getLiveCodexThreadIdsForAgentCwds(
  agents: Map<number, AgentState>,
  threads: CodexThread[],
): Set<string> {
  const agentCwds = new Set<string>();
  for (const agent of agents.values()) {
    if (agent.providerId === 'codex' && agent.leadAgentId === undefined && agent.projectDir) {
      const cwd = codexPathKey(agent.projectDir);
      if (cwd) agentCwds.add(cwd);
    }
  }

  const liveThreadIds = new Set<string>();
  for (const thread of threads) {
    const cwd = codexPathKey(thread.cwd);
    if (cwd && agentCwds.has(cwd)) {
      liveThreadIds.add(thread.id);
    }
  }
  return liveThreadIds;
}

function codexAgentMatchesThread(agent: AgentState, thread: CodexThread): boolean {
  if (agent.providerId !== 'codex') return false;
  if (agent.sessionId && agent.sessionId === thread.id) return true;
  const agentTranscript = codexPathKey(agent.jsonlFile);
  const threadTranscript = codexPathKey(thread.rolloutPath);
  return !!agentTranscript && !!threadTranscript && agentTranscript === threadTranscript;
}

function runtimeSourceForExtensionMode(mode: vscode.ExtensionMode): string {
  switch (mode) {
    case vscode.ExtensionMode.Development:
      return 'development';
    case vscode.ExtensionMode.Production:
      return 'production';
    case vscode.ExtensionMode.Test:
      return 'test';
    default:
      return 'unknown';
  }
}

function buildReleaseIdentity(context: vscode.ExtensionContext): {
  extensionId: string;
  displayName: string;
  packageVersion: string;
  dataRoot: string;
  buildCommit: string;
  runtimeSource: string;
} {
  const packageJson = context.extension.packageJSON as {
    publisher?: string;
    name?: string;
    displayName?: string;
    version?: string;
  };
  const extensionId =
    packageJson.publisher && packageJson.name
      ? `${packageJson.publisher}.${packageJson.name}`
      : EXTENSION_ID;
  return {
    extensionId,
    displayName: packageJson.displayName ?? DISPLAY_NAME,
    packageVersion: packageJson.version ?? 'unknown',
    dataRoot: `~/${LAYOUT_FILE_DIR}`,
    buildCommit: 'unknown',
    runtimeSource: runtimeSourceForExtensionMode(context.extensionMode),
  };
}

export class PixelAgentsViewProvider implements vscode.WebviewViewProvider {
  nextAgentId = { current: 1 };
  nextTerminalIndex = { current: 1 };
  agents = new Map<number, AgentState>();
  webviewView: vscode.WebviewView | undefined;

  // Per-agent timers
  fileWatchers = new Map<number, fs.FSWatcher>();
  pollingTimers = new Map<number, ReturnType<typeof setInterval>>();
  waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
  jsonlPollTimers = new Map<number, ReturnType<typeof setInterval>>();
  permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();

  // /clear detection: project-level scan for new JSONL files
  activeAgentId = { current: null as number | null };
  knownJsonlFiles = new Set<string>();
  projectScanTimer = { current: null as ReturnType<typeof setInterval> | null };

  // External session detection (VS Code extension panel, etc.)
  externalScanTimer: ReturnType<typeof setInterval> | null = null;
  codexExternalScanTimer: ReturnType<typeof setInterval> | null = null;
  staleCheckTimer: ReturnType<typeof setInterval> | null = null;

  // Global session scanning (opt-in "Watch All Sessions" toggle)
  watchAllSessions = { current: false };
  // Hooks enabled state (mutable ref for passing to scanners)
  hooksEnabled = { current: true };
  globalDismissedFiles = new Set<string>();

  // Bundled default layout (loaded from assets/default-layout.json)
  defaultLayout: Record<string, unknown> | null = null;

  // Root path of bundled assets (set once on first load)
  private assetsRoot: string | null = null;

  // Cross-window layout sync
  layoutWatcher: LayoutWatcher | null = null;

  // Pixel Agents Server (hook event reception)
  private pixelAgentsServer: PixelAgentsServer | null = null;
  // ServerConfig is not stored as a field; use this.pixelAgentsServer?.getConfig() if needed.
  private hookEventHandler: HookEventHandler | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.initHooks();
  }

  private get extensionUri(): vscode.Uri {
    return this.context.extensionUri;
  }

  private get webview(): vscode.Webview | undefined {
    return this.webviewView?.webview;
  }

  private postUsageHistoryLoaded(): void {
    const payload = loadUsageHistoryForWebview();
    if (payload.unavailable) {
      console.warn(`[Pixel Agents] Usage history unavailable: ${payload.error ?? 'unknown error'}`);
    }
    this.webview?.postMessage(payload);
  }

  private postTimelineHistoryLoaded(): void {
    const payload = loadTimelineHistoryForWebview();
    if (payload.unavailable) {
      console.warn(
        `[Pixel Agents] Timeline history unavailable: ${payload.error ?? 'unknown error'}`,
      );
    }
    this.webview?.postMessage(payload);
  }

  private persistTimelineEventFromWebview(event: unknown): void {
    try {
      persistTimelineEventForWebview(
        typeof event === 'object' && event !== null ? (event as Record<string, unknown>) : {},
      );
    } catch (error) {
      console.warn(
        `[Pixel Agents] Timeline history persist failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async writeHandoffDraftFromWebview(message: Record<string, unknown>): Promise<void> {
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    try {
      const markdown = typeof message.markdown === 'string' ? message.markdown : '';
      if (!markdown.trim()) {
        throw new Error('No handoff markdown was supplied.');
      }
      const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!repoRoot) {
        throw new Error('Open a repository workspace before writing a handoff draft.');
      }
      const nowMs = Date.now();
      const target = buildHandoffArtifactTarget(
        repoRoot,
        {
          project: message.project,
          agentName: message.agentName,
          title: message.title,
        },
        nowMs,
      );
      const metadata = buildHandoffArtifactMetadata(
        target,
        {
          title: message.title,
          providerId: message.providerId,
          projectName: message.project,
          agentName: message.agentName,
          sessionId: message.sessionId,
          runId: message.runId,
          status: 'draft',
        },
        nowMs,
      );
      await fs.promises.mkdir(path.dirname(target.absolutePath), { recursive: true });
      await fs.promises.writeFile(target.absolutePath, markdown, 'utf8');
      await fs.promises.writeFile(
        target.metadataAbsolutePath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target.absolutePath));
      await vscode.window.showTextDocument(doc, { preview: false });
      this.webview?.postMessage({
        type: 'handoffDraftWritten',
        requestId,
        path: target.relativePath,
        relativePath: target.relativePath,
        filename: target.filename,
        artifactId: metadata.artifactId,
        metadataRelativePath: target.metadataRelativePath,
        status: metadata.status,
      });
      this.postHandoffTimelineEvent('handoff.generated', target.relativePath, {
        ...message,
        filename: target.filename,
        artifactId: metadata.artifactId,
        artifactStatus: metadata.status,
      });
      this.postHandoffArtifactsLoaded();
      vscode.window.showInformationMessage(
        `Pixel Agents: Handoff draft written to ${target.relativePath}`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.webview?.postMessage({
        type: 'handoffDraftWriteFailed',
        requestId,
        error: errorMessage,
      });
      vscode.window.showErrorMessage(
        `Pixel Agents: Failed to write handoff draft: ${errorMessage}`,
      );
    }
  }

  private postHandoffArtifactsLoaded(): void {
    const loadedAtMs = Date.now();
    try {
      const repoRoot = this.getHandoffRepoRoot();
      if (!repoRoot) {
        throw new Error('Open a repository workspace before loading handoff artifacts.');
      }
      this.webview?.postMessage({
        type: 'handoffArtifactsLoaded',
        artifacts: scanHandoffArtifacts(repoRoot),
        loadedAtMs,
      });
    } catch (error) {
      this.webview?.postMessage({
        type: 'handoffArtifactsLoaded',
        artifacts: [],
        loadedAtMs,
        unavailable: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async openHandoffArtifactFromWebview(message: Record<string, unknown>): Promise<void> {
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    try {
      const repoRoot = this.getHandoffRepoRoot();
      if (!repoRoot) {
        throw new Error('Open a repository workspace before opening handoff artifacts.');
      }
      const target = resolveHandoffArtifactOpenPath(repoRoot, message.relativePath);
      if (!fs.existsSync(target.absolutePath) || !fs.statSync(target.absolutePath).isFile()) {
        throw new Error(`Handoff artifact does not exist: ${target.relativePath}`);
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target.absolutePath));
      await vscode.window.showTextDocument(doc, { preview: false });
      this.webview?.postMessage({
        type: 'handoffArtifactOpened',
        requestId,
        relativePath: target.relativePath,
        filename: target.filename,
      });
      const metadata = readHandoffArtifactMetadataForMarkdown(repoRoot, target.relativePath);
      this.postHandoffTimelineEvent('handoff.opened', target.relativePath, {
        filename: target.filename,
        artifactId: metadata?.artifactId,
        artifactStatus: metadata?.status,
        providerId: metadata?.providerId,
        project: metadata?.projectName,
        sessionId: metadata?.sessionId,
        runId: metadata?.runId,
      });
    } catch (error) {
      this.webview?.postMessage({
        type: 'handoffArtifactOpenFailed',
        requestId,
        relativePath: typeof message.relativePath === 'string' ? message.relativePath : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private postHandoffTimelineEvent(
    kind: 'handoff.generated' | 'handoff.opened',
    relativePath: string,
    metadata: Record<string, unknown> = {},
  ): void {
    const filename =
      typeof metadata.filename === 'string' && metadata.filename.trim()
        ? metadata.filename.trim()
        : path.posix.basename(relativePath);
    const artifactId = typeof metadata.artifactId === 'string' ? metadata.artifactId : undefined;
    const artifactStatus =
      typeof metadata.artifactStatus === 'string' ? metadata.artifactStatus : undefined;
    const summaryParts = [relativePath, artifactId, artifactStatus].filter(
      (part): part is string => typeof part === 'string' && part.trim().length > 0,
    );
    postAgentTimelineEvent(this.webview, {
      agentId: typeof metadata.agentId === 'number' ? metadata.agentId : 0,
      kind,
      title: kind === 'handoff.generated' ? 'Handoff generated' : 'Handoff opened',
      summary: `${filename} (${summaryParts.join(' / ')})`,
      severity: 'success',
      source: 'user',
      providerId: typeof metadata.providerId === 'string' ? metadata.providerId : undefined,
      projectName: typeof metadata.project === 'string' ? metadata.project : undefined,
      sessionId: typeof metadata.sessionId === 'string' ? metadata.sessionId : undefined,
      runId: typeof metadata.runId === 'string' ? metadata.runId : undefined,
      artifactId,
      artifactStatus,
    });
  }

  private getHandoffRepoRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private persistAgents = (): void => {
    persistAgents(this.agents, this.context);
  };

  private initHooks(): void {
    this.hookEventHandler = new HookEventHandler(
      this.agents,
      this.waitingTimers,
      this.permissionTimers,
      () => this.webview,
      claudeProvider,
      this.watchAllSessions,
    );

    // Register Claude's team provider (if present on the hook provider) with the file
    // watcher module + transcriptParser, plus the teammate removal callback.
    if (claudeProvider.team) {
      setTeamProvider(claudeProvider.team);
    }
    setHookProvider(claudeProvider);
    setCodexSubagentSpawnHandler((event) => this.adoptCodexSubagent(event));
    setTeammateRemovalCallback((id) => this.removeTeammate(id, 'team-config'));

    this.hookEventHandler.setLifecycleCallbacks({
      onExternalSessionDetected: (sessionId, transcriptPath, cwd) => {
        if (transcriptPath && this.isArchivedTranscriptPath(transcriptPath)) {
          this.knownJsonlFiles.add(transcriptPath);
          dismissedJsonlFiles.set(transcriptPath, Number.MAX_SAFE_INTEGER);
          return;
        }
        // Workspace filtering: only adopt if in a tracked project dir or Watch All Sessions is ON
        const projectDir = transcriptPath ? path.dirname(transcriptPath) : cwd;
        if (!isTrackedProjectDir(projectDir) && !this.watchAllSessions.current) {
          return; // Not our workspace and Watch All is OFF, ignore
        }
        adoptExternalSessionFromHook(
          sessionId,
          transcriptPath,
          cwd,
          this.knownJsonlFiles,
          this.nextAgentId,
          this.agents,
          this.fileWatchers,
          this.pollingTimers,
          this.waitingTimers,
          this.permissionTimers,
          this.webview,
          this.persistAgents,
          (agent) => this.registerAgentHook(agent),
        );
      },
      onSessionClear: (agentId, newSessionId, newTranscriptPath) => {
        if (newTranscriptPath) {
          this.knownJsonlFiles.add(newTranscriptPath);
          reassignAgentToFile(
            agentId,
            newTranscriptPath,
            this.agents,
            this.fileWatchers,
            this.pollingTimers,
            this.waitingTimers,
            this.permissionTimers,
            this.webview,
            this.persistAgents,
          );
        }
        // Update session mapping for future hook events
        const agent = this.agents.get(agentId);
        if (agent) {
          this.unregisterAgentHook(agent);
          agent.sessionId = newSessionId;
          this.registerAgentHook(agent);
        }
      },
      onSessionResume: (transcriptPath) => {
        if (this.isArchivedTranscriptPath(transcriptPath)) {
          this.knownJsonlFiles.add(transcriptPath);
          dismissedJsonlFiles.set(transcriptPath, Number.MAX_SAFE_INTEGER);
          return;
        }
        // Clear dismissals so --resume can re-adopt the file
        dismissedJsonlFiles.delete(transcriptPath);
        seededMtimes.delete(transcriptPath);
        this.knownJsonlFiles.delete(transcriptPath);
      },
      onTeammateDetected: (parentAgentId, sessionId, _agentType) => {
        const parentAgent = this.agents.get(parentAgentId);
        if (!parentAgent) return;
        scanForTeammateFiles(
          parentAgent.projectDir,
          sessionId,
          parentAgentId,
          this.nextAgentId,
          this.agents,
          this.fileWatchers,
          this.pollingTimers,
          this.waitingTimers,
          this.permissionTimers,
          this.webview,
          this.persistAgents,
          (agent) => this.registerAgentHook(agent),
        );
      },
      onTeammateRemoved: (teammateAgentId) => {
        this.removeTeammate(teammateAgentId, 'hooks');
      },
      onSessionEnd: (agentId) => {
        const agent = this.agents.get(agentId);
        if (!agent) return;
        // Dismiss the file so heuristic scanners don't re-adopt it
        seededMtimes.delete(agent.jsonlFile);
        dismissedJsonlFiles.set(agent.jsonlFile, Date.now());
        // If this is a team lead, remove its teammates
        if (agent.isTeamLead) {
          this.removeTeammates(agentId);
        }
        // External agents: remove immediately (no terminal to keep alive)
        if (agent.isExternal) {
          this.unregisterAgentHook(agent);
          removeAgent(
            agentId,
            this.agents,
            this.fileWatchers,
            this.pollingTimers,
            this.waitingTimers,
            this.permissionTimers,
            this.jsonlPollTimers,
            this.persistAgents,
          );
          this.webview?.postMessage({ type: 'agentClosed', id: agentId });
        }
      },
    });

    this.pixelAgentsServer = new PixelAgentsServer();
    this.pixelAgentsServer.onHookEvent((providerId, event) => {
      this.hookEventHandler?.handleEvent(providerId, event as HookEvent);
    });

    this.pixelAgentsServer
      .start()
      .then((config) => {
        // Server always starts regardless of hooks-enabled state.
        // It's the foundation for WebSocket transport and health monitoring.
        // Only hook installation/script-copy is gated by the toggle.
        const hooksEnabled = this.context.globalState.get<boolean>(GLOBAL_KEY_HOOKS_ENABLED, false);
        this.hooksEnabled.current = hooksEnabled;
        if (hooksEnabled) {
          installHooks();
          copyHookScript(this.context.extensionPath);
        }
        console.log(`[Pixel Agents] Server: ready on port ${config.port}`);
      })
      .catch((e) => {
        console.error(`[Pixel Agents] Failed to start server: ${e}`);
      });
  }

  private adoptCodexSubagent(event: CodexSubagentSpawn, attempt = 0): void {
    const parentAgent = this.agents.get(event.parentAgentId);
    if (!parentAgent || parentAgent.providerId !== 'codex') return;

    for (const agent of this.agents.values()) {
      if (agent.sessionId === event.childThreadId) return;
    }

    const childThread = findCodexThreadById(event.childThreadId);
    if (!childThread) {
      if (attempt < 20) {
        setTimeout(() => this.adoptCodexSubagent(event, attempt + 1), 500);
      }
      return;
    }
    if (this.knownJsonlFiles.has(childThread.rolloutPath)) return;

    const id = this.nextAgentId.current++;
    const teammateName =
      event.nickname ?? childThread.agentNickname ?? event.role ?? childThread.agentRole;
    const agent: AgentState = {
      id,
      sessionId: childThread.id,
      isExternal: true,
      projectDir: childThread.cwd || parentAgent.projectDir,
      jsonlFile: childThread.rolloutPath,
      fileOffset: 0,
      lineBuffer: '',
      activeToolIds: new Set(),
      activeToolStatuses: new Map(),
      activeToolNames: new Map(),
      activeSubagentToolIds: new Map(),
      activeSubagentToolNames: new Map(),
      backgroundAgentToolIds: new Set(),
      isWaiting: false,
      permissionSent: false,
      hadToolsInTurn: false,
      folderName: parentAgent.folderName,
      lastDataAt: Date.now(),
      linesProcessed: 0,
      seenUnknownRecordTypes: new Set(),
      hookDelivered: false,
      providerId: 'codex',
      inputTokens: 0,
      outputTokens: 0,
      teamName: parentAgent.teamName ?? 'Codex',
      agentName: teammateName,
      leadAgentId: parentAgent.id,
      teamUsesTmux: false,
    };

    this.agents.set(id, agent);
    this.knownJsonlFiles.add(childThread.rolloutPath);
    this.persistAgents();

    this.webview?.postMessage({
      type: 'agentCreated',
      id,
      isTeammate: true,
      teammateName,
      parentAgentId: parentAgent.id,
      teamName: agent.teamName,
      providerId: 'codex',
      projectDir: agent.projectDir,
      transcriptPath: agent.jsonlFile,
    });

    startFileWatching(
      id,
      childThread.rolloutPath,
      this.agents,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
      this.webview,
    );
    readNewLines(id, this.agents, this.waitingTimers, this.permissionTimers, this.webview);
  }

  private scanCodexWorkspaceThreads(): void {
    const threads = findRecentCodexThreads(50);
    const candidates = this.getAdoptionCandidates(threads);
    for (const thread of candidates) {
      const adopted = this.adoptCodexExternalThread(thread);
      if (adopted) {
        console.log(
          `[Pixel Agents] Codex: adopted external thread ${thread.id.slice(0, 8)} (${path.basename(thread.cwd)}/${path.basename(thread.rolloutPath)})`,
        );
      }
    }

    const topLevelThreadIds = getLiveCodexThreadIdsForAgentCwds(this.agents, threads);
    this.removeStaleCodexAgents(topLevelThreadIds);
    syncCodexAgentMetadata(this.agents, this.webview, this.persistAgents);
    this.webview?.postMessage({
      type: 'codexProjects',
      projects: this.getRecentCodexProjects(threads),
    });
  }

  private adoptCodexExternalThread(thread: CodexThread): AgentState | null {
    if (!thread.cwd) return null;
    for (const agent of this.agents.values()) {
      if (codexAgentMatchesThread(agent, thread)) {
        return null;
      }
    }

    let fileOffset = 0;
    try {
      fileOffset = fs.statSync(thread.rolloutPath).size;
    } catch {
      /* start from the beginning if stat fails */
    }

    const transcriptUsage = readTokenUsageFromTranscript(thread.rolloutPath, 'codex');
    const id = this.nextAgentId.current++;
    const projectName = path.basename(thread.cwd);
    const agentName = thread.title ?? thread.agentNickname ?? thread.agentRole ?? 'Codex';
    const agent: AgentState = {
      id,
      sessionId: thread.id,
      terminalRef: undefined,
      isExternal: true,
      providerId: 'codex',
      projectDir: thread.cwd,
      jsonlFile: thread.rolloutPath,
      fileOffset,
      lineBuffer: '',
      activeToolIds: new Set(),
      activeToolStatuses: new Map(),
      activeToolNames: new Map(),
      activeSubagentToolIds: new Map(),
      activeSubagentToolNames: new Map(),
      backgroundAgentToolIds: new Set(),
      isWaiting: false,
      permissionSent: false,
      hadToolsInTurn: false,
      folderName: projectName,
      projectName,
      lastDataAt: Date.now(),
      linesProcessed: 0,
      seenUnknownRecordTypes: new Set(),
      hookDelivered: false,
      inputTokens: transcriptUsage?.inputTokens ?? thread.tokensUsed,
      outputTokens: transcriptUsage?.outputTokens ?? 0,
      artifactOutputTokens: transcriptUsage?.artifactOutputTokens ?? 0,
      tokenUsageDetails: transcriptUsage?.details,
      codexLastTokenUsage: transcriptUsage?.lastTokenUsage,
      codexRateLimits: transcriptUsage?.rateLimits,
      agentName,
    };

    this.agents.set(id, agent);
    this.knownJsonlFiles.add(thread.rolloutPath);
    this.persistAgents();
    ingestAgentUsageSnapshot({
      agent,
      details: transcriptUsage?.details,
      inputTokens: transcriptUsage?.inputTokens ?? thread.tokensUsed,
      outputTokens: transcriptUsage?.outputTokens ?? 0,
      artifactOutputTokens: agent.artifactOutputTokens ?? 0,
      estimated: transcriptUsage?.estimated ?? false,
      rateLimits: agent.codexRateLimits,
      evidence: transcriptUsage
        ? 'source=PixelAgentsViewProvider; event=codex_external_adoption'
        : 'source=PixelAgentsViewProvider; event=codex_external_tokens_used',
      isDeltaFromSnapshot: true,
    });
    this.webview?.postMessage({
      type: 'agentCreated',
      id,
      isExternal: true,
      folderName: projectName,
      agentName,
      providerId: 'codex',
      projectDir: agent.projectDir,
      transcriptPath: agent.jsonlFile,
    });
    if (agent.inputTokens > 0 || agent.outputTokens > 0 || (agent.artifactOutputTokens ?? 0) > 0) {
      this.webview?.postMessage({
        type: 'agentTokenUsage',
        id,
        inputTokens: agent.inputTokens,
        outputTokens: agent.outputTokens,
        artifactOutputTokens: agent.artifactOutputTokens ?? 0,
        estimated: transcriptUsage?.estimated ?? false,
        details: agent.tokenUsageDetails,
        lastTokenUsage: agent.codexLastTokenUsage,
        rateLimits: agent.codexRateLimits,
      });
    }

    startFileWatching(
      id,
      agent.jsonlFile,
      this.agents,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
      this.webview,
    );
    return agent;
  }

  private getAdoptionCandidates(threads: CodexThread[]): CodexThread[] {
    const discoverAll = getExtensionConfigValue<boolean>('codex.discoverAllCwds', false);
    const discoverAllExplicitlyConfigured =
      isExtensionConfigExplicitlyConfigured<boolean>('codex.discoverAllCwds');
    let effectiveDiscoverAll = discoverAll;
    const allowedCwds = new Set<string>();
    if (!discoverAll) {
      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const cwd = codexPathKey(folder.uri.fsPath);
        if (cwd) allowedCwds.add(cwd);
      }
      for (const agent of this.agents.values()) {
        if (agent.providerId === 'codex' && !agent.isExternal && agent.projectDir) {
          const cwd = codexPathKey(agent.projectDir);
          if (cwd) allowedCwds.add(cwd);
        }
      }
    }
    if (!effectiveDiscoverAll && !discoverAllExplicitlyConfigured && allowedCwds.size === 0) {
      console.log(
        `[Pixel Agents] Codex: no workspace folder and no user-spawned agents — adopting across all cwds (default fallback). Set ${CONFIG_SECTION}.codex.discoverAllCwds=false to disable.`,
      );
      effectiveDiscoverAll = true;
    }

    const unboundSpawnedAgentCwdCounts = new Map<string, number>();
    const existingThreadIds = new Set<string>();
    const existingTranscriptPaths = new Set<string>();
    for (const agent of this.agents.values()) {
      if (agent.providerId !== 'codex') continue;
      if (!agent.isExternal && agent.projectDir && !agent.jsonlFile) {
        const cwd = codexPathKey(agent.projectDir);
        if (cwd)
          unboundSpawnedAgentCwdCounts.set(cwd, (unboundSpawnedAgentCwdCounts.get(cwd) ?? 0) + 1);
      }
      if (agent.sessionId) {
        existingThreadIds.add(agent.sessionId);
      }
      const transcriptPath = codexPathKey(agent.jsonlFile);
      if (transcriptPath) {
        existingTranscriptPaths.add(transcriptPath);
      }
    }

    const reservedThreadIds = new Set<string>();
    for (const thread of threads) {
      if (!thread.cwd) continue;
      const cwd = codexPathKey(thread.cwd);
      const transcriptPath = codexPathKey(thread.rolloutPath);
      if (!cwd) continue;
      const reserveCount = unboundSpawnedAgentCwdCounts.get(cwd) ?? 0;
      if (reserveCount <= 0) continue;
      if (existingThreadIds.has(thread.id)) continue;
      if (transcriptPath && existingTranscriptPaths.has(transcriptPath)) continue;
      if (!effectiveDiscoverAll && !allowedCwds.has(cwd)) continue;
      reservedThreadIds.add(thread.id);
      unboundSpawnedAgentCwdCounts.set(cwd, reserveCount - 1);
    }

    const candidates: CodexThread[] = [];
    for (const thread of threads) {
      if (!thread.cwd) continue;
      const cwd = codexPathKey(thread.cwd);
      const transcriptPath = codexPathKey(thread.rolloutPath);
      if (!cwd) continue;
      if (existingThreadIds.has(thread.id)) continue;
      if (transcriptPath && existingTranscriptPaths.has(transcriptPath)) continue;
      if (reservedThreadIds.has(thread.id)) continue;
      if (!effectiveDiscoverAll && !allowedCwds.has(cwd)) continue;
      candidates.push(thread);
    }
    return candidates;
  }

  private scanClaudeWorkspaceThreads(includeInactive = false): void {
    const workspaceRoots = this.getWorkspaceRoots();
    syncClaudeAgentMetadata(this.agents, this.webview);
    if (includeInactive) {
      this.removeClaudeAgentsOutsideWorkspace(workspaceRoots);
      this.removeInactiveClaudeExternalAgents();
    }
    // Cowork/local-agent-mode sessions are desktop-app workers, not VS Code workspace
    // transcripts. Show active Cowork agents globally so Refresh matches the room's
    // Codex external-thread behavior and the Windows "Codex 3 + Claude 1" baseline.
    scanClaudeCoworkSessions(
      [],
      this.knownJsonlFiles,
      this.nextAgentId,
      this.agents,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
      this.webview,
      this.persistAgents,
    );
    scanClaudeRecentSessions(
      this.knownJsonlFiles,
      this.nextAgentId,
      this.agents,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
      this.webview,
      this.persistAgents,
      {
        includeInactive: false,
        includeTrackedDirs: true,
        cwdRoots: workspaceRoots,
      },
    );
  }

  private getWorkspaceRoots(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  }

  private removeClaudeAgentsOutsideWorkspace(workspaceRoots: string[]): void {
    if (workspaceRoots.length === 0) return;
    for (const [id, agent] of [...this.agents]) {
      if ((agent.providerId ?? 'claude') !== 'claude' || !agent.isExternal || !agent.jsonlFile) {
        continue;
      }
      if (agent.jsonlFile.includes('local-agent-mode-sessions')) continue;
      const metadata = readClaudeSessionMetadata(
        agent.jsonlFile,
        agent.projectDir,
        agent.projectName ?? agent.folderName,
      );
      if (this.isCwdInWorkspace(metadata.cwd, workspaceRoots)) continue;

      console.log(`[Pixel Agents] Claude: removing out-of-workspace session ${agent.sessionId}`);
      this.removeTrackedAgent(id, true);
    }
  }

  private removeInactiveClaudeExternalAgents(): void {
    const now = Date.now();
    for (const [id, agent] of [...this.agents]) {
      if (
        (agent.providerId ?? 'claude') !== 'claude' ||
        !agent.isExternal ||
        agent.terminalRef ||
        !agent.jsonlFile
      ) {
        continue;
      }
      if (agent.jsonlFile.includes('local-agent-mode-sessions')) continue;
      try {
        const stat = fs.statSync(agent.jsonlFile);
        if (now - stat.mtimeMs <= GLOBAL_SCAN_ACTIVE_MAX_AGE_MS) continue;
      } catch {
        /* missing transcript is stale */
      }

      console.log(`[Pixel Agents] Claude: removing inactive CLI session ${agent.sessionId}`);
      this.removeTrackedAgent(id, true);
    }
  }

  private removeTrackedAgent(id: number, dismissTranscript: boolean): void {
    const agent = this.agents.get(id);
    if (!agent) return;
    if (dismissTranscript && agent.jsonlFile) {
      this.knownJsonlFiles.delete(agent.jsonlFile);
      dismissedJsonlFiles.set(agent.jsonlFile, Date.now());
    }
    this.unregisterAgentHook(agent);
    removeAgent(
      id,
      this.agents,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
      this.jsonlPollTimers,
      this.persistAgents,
    );
    this.webview?.postMessage({ type: 'agentClosed', id });
  }

  private buildArchivedAgentRecord(agent: AgentState): ArchivedAgentRecord {
    return {
      id: agent.id,
      sessionId: agent.sessionId,
      terminalName: agent.terminalRef?.name ?? '',
      isExternal: agent.isExternal || undefined,
      jsonlFile: agent.jsonlFile,
      projectDir: agent.projectDir,
      providerId: agent.providerId,
      paused: agent.paused,
      hidden: agent.hidden,
      claudeTitleResolved: agent.claudeTitleResolved,
      codexInputTokenBase: agent.codexInputTokenBase,
      codexOutputTokenBase: agent.codexOutputTokenBase,
      folderName: agent.folderName,
      projectName: agent.projectName,
      teamName: agent.teamName,
      agentName: agent.agentName,
      isTeamLead: agent.isTeamLead,
      leadAgentId: agent.leadAgentId,
      teamUsesTmux: agent.teamUsesTmux,
      archived: true,
      archivedAt: Date.now(),
      archiveReason: 'archive',
    };
  }

  private persistArchivedAgent(agent: AgentState): void {
    const record = this.buildArchivedAgentRecord(agent);
    const archivedAgents = this.context.workspaceState.get<ArchivedAgentRecord[]>(
      WORKSPACE_KEY_ARCHIVED_AGENTS,
      [],
    );
    const deduped = archivedAgents.filter((existing) => {
      if (record.providerId && existing.providerId !== record.providerId) return true;
      if (record.sessionId && existing.sessionId === record.sessionId) return false;
      return codexPathKey(existing.jsonlFile) !== codexPathKey(record.jsonlFile);
    });
    this.context.workspaceState.update(WORKSPACE_KEY_ARCHIVED_AGENTS, [...deduped, record]);
  }

  private seedArchivedAgentDismissals(): void {
    const archivedAgents = this.context.workspaceState.get<ArchivedAgentRecord[]>(
      WORKSPACE_KEY_ARCHIVED_AGENTS,
      [],
    );
    for (const agent of archivedAgents) {
      if (!agent.jsonlFile) continue;
      this.knownJsonlFiles.add(agent.jsonlFile);
      dismissedJsonlFiles.set(agent.jsonlFile, Number.MAX_SAFE_INTEGER);
    }
  }

  private isArchivedTranscriptPath(transcriptPath: string): boolean {
    const archivedAgents = this.context.workspaceState.get<ArchivedAgentRecord[]>(
      WORKSPACE_KEY_ARCHIVED_AGENTS,
      [],
    );
    const resolvedTranscript = codexPathKey(transcriptPath);
    return archivedAgents.some(
      (agent) => agent.jsonlFile && codexPathKey(agent.jsonlFile) === resolvedTranscript,
    );
  }

  private permanentlyDismissTranscript(agent: AgentState): void {
    if (!agent.jsonlFile) return;
    this.knownJsonlFiles.add(agent.jsonlFile);
    dismissedJsonlFiles.set(agent.jsonlFile, Number.MAX_SAFE_INTEGER);
  }

  private postActionTimeline(
    agent: AgentState,
    action: 'hide' | 'archive' | 'kill',
    summaryOverride?: string,
    titleOverride?: string,
  ): void {
    const titles = {
      hide: 'Agent hidden',
      archive: 'Agent archived',
      kill: 'Agent killed',
    };
    const summaries = {
      hide: 'Hidden from normal views; underlying process continues.',
      archive: 'Removed from active tracking and preserved in archived agents.',
      kill: 'Owned terminals are disposed; external Codex processes are terminated when safely matched.',
    };
    postAgentTimelineEvent(this.webview, {
      agentId: agent.id,
      kind: `action.${action}`,
      title: titleOverride ?? titles[action],
      summary: summaryOverride ?? summaries[action],
      severity: action === 'kill' ? 'warning' : 'info',
      providerId: agent.providerId,
      projectName: agent.projectName ?? agent.folderName,
    });
  }

  private handleAgentAction(id: number, action: 'hide' | 'archive' | 'kill'): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    if (action === 'hide') {
      agent.hidden = true;
      this.persistAgents();
      this.webview?.postMessage({ type: 'agentLifecycleHidden', id, hidden: true });
      this.postActionTimeline(agent, 'hide');
      return;
    }

    if (action === 'archive') {
      if (agent.providerId === 'codex') {
        archiveCodexThread(agent.sessionId);
      }
      this.persistArchivedAgent(agent);
      this.permanentlyDismissTranscript(agent);
      this.postActionTimeline(agent, 'archive');
      this.unregisterAgentHook(agent);
      removeAgent(
        id,
        this.agents,
        this.fileWatchers,
        this.pollingTimers,
        this.waitingTimers,
        this.permissionTimers,
        this.jsonlPollTimers,
        this.persistAgents,
      );
      this.webview?.postMessage({ type: 'agentArchived', id });
      return;
    }

    let killSummary: string | undefined;
    if (agent.terminalRef) {
      agent.terminalRef.dispose();
      if (agent.providerId === 'codex') {
        archiveCodexThread(agent.sessionId);
      }
      killSummary = 'Owned terminal disposed; agent removed from active tracking.';
    } else if (agent.providerId === 'codex') {
      const result = terminateCodexThreadProcess({
        threadId: agent.sessionId,
        cwd: agent.projectDir,
        rolloutPath: agent.jsonlFile,
      });
      if (result.terminated) {
        archiveCodexThread(agent.sessionId);
        killSummary = `External Codex process ${result.pid} terminated; agent removed from active tracking.`;
      } else {
        const warning = `Pixel Agents: Could not safely kill external Codex agent ${agent.sessionId} (${result.reason}). The agent remains active.`;
        this.postActionTimeline(
          agent,
          'kill',
          `External Codex process was not terminated (${result.reason}); agent remains active.`,
          'Kill failed',
        );
        console.warn(warning);
        vscode.window.showWarningMessage(warning);
        return;
      }
    } else {
      const warning = `Pixel Agents: Cannot kill external ${agent.providerId} agent without a terminal handle. The agent remains active.`;
      this.postActionTimeline(
        agent,
        'kill',
        `No safe process termination path is available for this external ${agent.providerId} agent; agent remains active.`,
        'Kill failed',
      );
      console.warn(warning);
      vscode.window.showWarningMessage(warning);
      return;
    }
    this.permanentlyDismissTranscript(agent);
    this.postActionTimeline(agent, 'kill', killSummary);
    this.unregisterAgentHook(agent);
    removeAgent(
      id,
      this.agents,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
      this.jsonlPollTimers,
      this.persistAgents,
    );
    this.webview?.postMessage({ type: 'agentClosed', id });
  }

  private async openAgentProject(id: number): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent?.projectDir) {
      vscode.window.showWarningMessage(
        'Pixel Agents: No project path is available for this agent.',
      );
      return;
    }
    await this.openProjectPath(agent.projectDir);
  }

  private async openProjectPath(projectDir: string | undefined): Promise<void> {
    if (!projectDir) {
      vscode.window.showWarningMessage('Pixel Agents: No project path is available.');
      return;
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(projectDir);
    } catch {
      vscode.window.showWarningMessage(`Pixel Agents: Project path does not exist: ${projectDir}`);
      return;
    }
    const projectPath = stat.isDirectory() ? projectDir : path.dirname(projectDir);
    try {
      const uri = vscode.Uri.file(projectPath);
      const currentFolders = vscode.workspace.workspaceFolders ?? [];
      const alreadyOpen = currentFolders.some((folder) => folder.uri.fsPath === projectPath);
      if (alreadyOpen) {
        await vscode.commands.executeCommand('revealFileInOS', uri);
        return;
      }
      await vscode.commands.executeCommand('vscode.openFolder', uri, false);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Pixel Agents: Failed to open project: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async openAgentTranscript(id: number): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent?.jsonlFile) {
      vscode.window.showWarningMessage(
        'Pixel Agents: No transcript path is available for this agent.',
      );
      return;
    }
    if (!fs.existsSync(agent.jsonlFile)) {
      vscode.window.showWarningMessage(
        `Pixel Agents: Transcript does not exist: ${agent.jsonlFile}`,
      );
      return;
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(agent.jsonlFile));
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  private closeAgent(id: number): void {
    this.handleAgentAction(id, 'kill');
  }

  private isCwdInWorkspace(cwd: string | undefined, workspaceRoots: string[]): boolean {
    if (!cwd) return false;
    const resolvedCwd = codexPathKey(cwd);
    if (!resolvedCwd) return false;
    return workspaceRoots.some((root) => {
      const resolvedRoot = codexPathKey(root);
      if (!resolvedRoot) return false;
      const separator = resolvedRoot.includes('\\') ? '\\' : path.sep;
      const rootPrefix = resolvedRoot.endsWith(separator)
        ? resolvedRoot
        : `${resolvedRoot}${separator}`;
      return resolvedCwd === resolvedRoot || resolvedCwd.startsWith(rootPrefix);
    });
  }

  private getRecentCodexProjects(threads = findRecentCodexThreads(50)): Array<{
    name: string;
    path: string;
  }> {
    const projects = new Map<string, { name: string; path: string }>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const cwd = codexPathKey(folder.uri.fsPath);
      if (cwd) projects.set(cwd, { name: folder.name, path: folder.uri.fsPath });
    }
    for (const thread of threads) {
      const cwd = codexPathKey(thread.cwd);
      if (!thread.cwd || !cwd || projects.has(cwd)) continue;
      projects.set(cwd, { name: path.basename(thread.cwd), path: thread.cwd });
    }
    return [...projects.values()];
  }

  private removeStaleCodexAgents(topLevelThreadIds: Set<string>): void {
    for (const [id, agent] of [...this.agents]) {
      if (agent.providerId !== 'codex' || !agent.jsonlFile) continue;
      const isTopLevelExternal = agent.isExternal && agent.leadAgentId === undefined;
      if (
        fs.existsSync(agent.jsonlFile) &&
        findCodexThreadById(agent.sessionId) &&
        (!isTopLevelExternal || topLevelThreadIds.has(agent.sessionId))
      ) {
        continue;
      }

      console.log(`[Pixel Agents] Codex: removing stale thread ${agent.sessionId}`);
      this.knownJsonlFiles.delete(agent.jsonlFile);
      removeAgent(
        id,
        this.agents,
        this.fileWatchers,
        this.pollingTimers,
        this.waitingTimers,
        this.permissionTimers,
        this.jsonlPollTimers,
        this.persistAgents,
      );
      this.webview?.postMessage({ type: 'agentClosed', id });
    }
  }

  /** Remove all teammates of a lead agent */
  /** Remove a single teammate agent (used by both hook callback and team config polling). */
  private removeTeammate(teammateAgentId: number, source: string): void {
    const agent = this.agents.get(teammateAgentId);
    if (!agent) return;
    console.log(`[Pixel Agents] Removing teammate ${teammateAgentId} (source: ${source})`);
    dismissedJsonlFiles.set(agent.jsonlFile, Date.now());
    this.unregisterAgentHook(agent);
    removeAgent(
      teammateAgentId,
      this.agents,
      this.fileWatchers,
      this.pollingTimers,
      this.waitingTimers,
      this.permissionTimers,
      this.jsonlPollTimers,
      this.persistAgents,
    );
    this.webview?.postMessage({ type: 'agentClosed', id: teammateAgentId });
  }

  private removeTeammates(leadId: number): void {
    const teammates: number[] = [];
    for (const [id, agent] of this.agents) {
      if (agent.leadAgentId === leadId) {
        teammates.push(id);
      }
    }
    for (const id of teammates) {
      const agent = this.agents.get(id);
      if (agent) {
        console.log(`[Pixel Agents] Removing teammate ${id} (lead ${leadId} closed)`);
        dismissedJsonlFiles.set(agent.jsonlFile, Date.now());
        this.unregisterAgentHook(agent);
        removeAgent(
          id,
          this.agents,
          this.fileWatchers,
          this.pollingTimers,
          this.waitingTimers,
          this.permissionTimers,
          this.jsonlPollTimers,
          this.persistAgents,
        );
        this.webview?.postMessage({ type: 'agentClosed', id });
      }
    }
  }

  /** Register an agent with the hook event handler for session->agent mapping.
   *  hookDelivered is NOT set here. It is set only in hookEventHandler.handleEvent()
   *  when an actual hook event arrives, preserving heuristic fallback for agents
   *  where hooks aren't working (older Claude, hooks not installed, etc.) */
  registerAgentHook(agent: AgentState): void {
    this.hookEventHandler?.registerAgent(agent.sessionId, agent.id);
  }

  /** Unregister an agent from the hook event handler */
  unregisterAgentHook(agent: AgentState): void {
    this.hookEventHandler?.unregisterAgent(agent.sessionId);
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.webviewView = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getWebviewContent(webviewView.webview, this.extensionUri);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'openAgent' || message.type === 'openClaude') {
        const prevAgentIds = new Set(this.agents.keys());
        const providerId =
          message.providerId === 'codex' || message.providerId === 'claude'
            ? message.providerId
            : 'claude';
        await launchNewTerminal(
          this.nextAgentId,
          this.nextTerminalIndex,
          this.agents,
          this.activeAgentId,
          this.knownJsonlFiles,
          this.fileWatchers,
          this.pollingTimers,
          this.waitingTimers,
          this.permissionTimers,
          this.jsonlPollTimers,
          this.projectScanTimer,
          this.webview,
          this.persistAgents,
          providerId,
          message.folderPath as string | undefined,
          message.bypassPermissions as boolean | undefined,
          message.prompt as string | undefined,
        );
        // Register newly created agent(s) with hook handler
        for (const [id, agent] of this.agents) {
          if (!prevAgentIds.has(id)) {
            this.registerAgentHook(agent);
          }
        }
      } else if (message.type === 'focusAgent') {
        const agent = this.agents.get(message.id);
        if (agent) {
          if (agent.terminalRef) {
            agent.terminalRef.show();
          } else if (agent.leadAgentId !== undefined) {
            // Teammate (tmux): focus the lead's terminal instead
            const lead = this.agents.get(agent.leadAgentId);
            if (lead?.terminalRef) {
              lead.terminalRef.show();
            }
          }
        }
      } else if (message.type === 'openAgentProject') {
        await this.openAgentProject(message.id as number);
      } else if (message.type === 'openProjectPath') {
        await this.openProjectPath(message.projectDir as string | undefined);
      } else if (message.type === 'openAgentTranscript') {
        await this.openAgentTranscript(message.id as number);
      } else if (message.type === 'closeAgent') {
        this.closeAgent(message.id as number);
      } else if (message.type === 'agentAction') {
        const action = message.action;
        if (action === 'hide' || action === 'archive' || action === 'kill') {
          this.handleAgentAction(message.id as number, action);
        }
      } else if (message.type === 'agentPause') {
        setAgentPaused(message.id as number, true, this.agents, this.webview, this.persistAgents);
      } else if (message.type === 'agentResume') {
        setAgentPaused(message.id as number, false, this.agents, this.webview, this.persistAgents);
      } else if (message.type === 'saveAgentSeats') {
        // Store seat assignments in a separate key (never touched by persistAgents)
        console.log(`[Pixel Agents] State: saveAgentSeats:`, JSON.stringify(message.seats));
        this.context.workspaceState.update(WORKSPACE_KEY_AGENT_SEATS, message.seats);
      } else if (message.type === 'refreshAgents') {
        this.scanClaudeWorkspaceThreads(true);
        this.scanCodexWorkspaceThreads();
        sendExistingAgents(this.agents, this.context, this.webview);
        sendCurrentAgentStatuses(this.agents, this.webview);
        this.postUsageHistoryLoaded();
        this.postTimelineHistoryLoaded();
        this.webview?.postMessage({ type: 'agentSeatsRefresh' });
      } else if (message.type === 'refreshUsageHistory') {
        this.postUsageHistoryLoaded();
      } else if (message.type === 'refreshTimelineHistory') {
        this.postTimelineHistoryLoaded();
      } else if (message.type === 'persistTimelineEvent') {
        this.persistTimelineEventFromWebview(message.event);
      } else if (message.type === 'refreshHandoffArtifacts') {
        this.postHandoffArtifactsLoaded();
      } else if (message.type === 'openHandoffArtifact') {
        await this.openHandoffArtifactFromWebview(
          typeof message === 'object' && message !== null
            ? (message as Record<string, unknown>)
            : {},
        );
      } else if (message.type === 'writeHandoffDraft') {
        await this.writeHandoffDraftFromWebview(
          typeof message === 'object' && message !== null
            ? (message as Record<string, unknown>)
            : {},
        );
      } else if (message.type === 'saveLayout') {
        this.layoutWatcher?.markOwnWrite();
        writeLayoutToFile(message.layout as Record<string, unknown>);
      } else if (message.type === 'setSoundEnabled') {
        this.context.globalState.update(GLOBAL_KEY_SOUND_ENABLED, message.enabled);
      } else if (message.type === 'setLastSeenVersion') {
        this.context.globalState.update(GLOBAL_KEY_LAST_SEEN_VERSION, message.version as string);
      } else if (message.type === 'setAlwaysShowLabels') {
        this.context.globalState.update(GLOBAL_KEY_ALWAYS_SHOW_LABELS, message.enabled);
      } else if (message.type === 'setHooksEnabled') {
        const enabled = message.enabled as boolean;
        this.context.globalState.update(GLOBAL_KEY_HOOKS_ENABLED, enabled);
        this.hooksEnabled.current = enabled;
        if (enabled) {
          installHooks();
          copyHookScript(this.context.extensionPath);
          console.log('[Pixel Agents] Hooks enabled by user');
        } else {
          uninstallHooks();
          console.log('[Pixel Agents] Hooks disabled by user');
        }
      } else if (message.type === 'setHooksInfoShown') {
        this.context.globalState.update(GLOBAL_KEY_HOOKS_INFO_SHOWN, true);
      } else if (message.type === 'setWatchAllSessions') {
        const enabled = message.enabled as boolean;
        this.context.globalState.update(GLOBAL_KEY_WATCH_ALL_SESSIONS, enabled);
        this.watchAllSessions.current = enabled;
        if (enabled) {
          // Clear only toggle-specific dismissals so global agents can be re-adopted
          for (const file of this.globalDismissedFiles) {
            dismissedJsonlFiles.delete(file);
          }
          this.globalDismissedFiles.clear();
        } else {
          // Remove all external agents not from the current workspace folders
          const workspaceDirs = new Set<string>();
          for (const folder of vscode.workspace.workspaceFolders ?? []) {
            workspaceDirs.add(folder.uri.fsPath);
            const dir = getProjectDirPath(folder.uri.fsPath);
            if (dir) workspaceDirs.add(dir);
          }
          const toRemove: number[] = [];
          for (const [id, agent] of this.agents) {
            if (agent.isExternal && !workspaceDirs.has(agent.projectDir)) {
              toRemove.push(id);
            }
          }
          for (const id of toRemove) {
            const agent = this.agents.get(id);
            if (agent) {
              dismissedJsonlFiles.set(agent.jsonlFile, Date.now());
              this.globalDismissedFiles.add(agent.jsonlFile);
              this.knownJsonlFiles.delete(agent.jsonlFile);
            }
            removeAgent(
              id,
              this.agents,
              this.fileWatchers,
              this.pollingTimers,
              this.waitingTimers,
              this.permissionTimers,
              this.jsonlPollTimers,
              this.persistAgents,
            );
            this.webview?.postMessage({ type: 'agentClosed', id });
          }
        }
      } else if (message.type === 'webviewReady') {
        restoreAgents(
          this.context,
          this.nextAgentId,
          this.nextTerminalIndex,
          this.agents,
          this.knownJsonlFiles,
          this.fileWatchers,
          this.pollingTimers,
          this.waitingTimers,
          this.permissionTimers,
          this.jsonlPollTimers,
          this.projectScanTimer,
          this.activeAgentId,
          this.webview,
          this.persistAgents,
        );
        // Register all restored agents with hook handler
        for (const agent of this.agents.values()) {
          this.registerAgentHook(agent);
        }
        // Send persisted settings to webview
        const soundEnabled = this.context.globalState.get<boolean>(GLOBAL_KEY_SOUND_ENABLED, true);
        const lastSeenVersion = this.context.globalState.get<string>(
          GLOBAL_KEY_LAST_SEEN_VERSION,
          '',
        );
        const extensionVersion =
          (this.context.extension.packageJSON as { version?: string }).version ?? '';
        const watchAllSessions = this.context.globalState.get<boolean>(
          GLOBAL_KEY_WATCH_ALL_SESSIONS,
          false,
        );
        const alwaysShowLabels = this.context.globalState.get<boolean>(
          GLOBAL_KEY_ALWAYS_SHOW_LABELS,
          false,
        );
        this.watchAllSessions.current = watchAllSessions;
        const hooksEnabled = this.context.globalState.get<boolean>(GLOBAL_KEY_HOOKS_ENABLED, false);
        const hooksInfoShown = this.context.globalState.get<boolean>(
          GLOBAL_KEY_HOOKS_INFO_SHOWN,
          false,
        );
        const config = readConfig();
        this.webview?.postMessage({
          type: 'settingsLoaded',
          soundEnabled,
          lastSeenVersion,
          extensionVersion,
          watchAllSessions,
          alwaysShowLabels,
          hooksEnabled,
          hooksInfoShown,
          externalAssetDirectories: config.externalAssetDirectories,
          buildIdentity: buildReleaseIdentity(this.context),
        });

        // Send workspace folders to webview (only when multi-root)
        const wsFolders = vscode.workspace.workspaceFolders;
        if (wsFolders && wsFolders.length > 1) {
          this.webview?.postMessage({
            type: 'workspaceFolders',
            folders: wsFolders.map((f) => ({ name: f.name, path: f.uri.fsPath })),
          });
        }
        this.webview?.postMessage({
          type: 'codexProjects',
          projects: this.getRecentCodexProjects(),
        });
        this.postUsageHistoryLoaded();
        this.postTimelineHistoryLoaded();
        this.postHandoffArtifactsLoaded();
        this.seedArchivedAgentDismissals();

        // Ensure project scan runs even with no restored agents (to adopt external terminals)
        const projectDir = getProjectDirPath();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        console.log(`[Pixel Agents] Debug: Platform: ${process.platform}, arch: ${process.arch}`);
        console.log('[Extension] workspaceRoot:', workspaceRoot);
        console.log('[Extension] projectDir:', projectDir);
        ensureProjectScan(
          projectDir,
          this.knownJsonlFiles,
          this.projectScanTimer,
          this.activeAgentId,
          this.nextAgentId,
          this.agents,
          this.fileWatchers,
          this.pollingTimers,
          this.waitingTimers,
          this.permissionTimers,
          this.webview,
          this.persistAgents,
          (agent) => this.registerAgentHook(agent),
          this.hooksEnabled,
        );

        this.scanClaudeWorkspaceThreads();
        this.scanCodexWorkspaceThreads();
        if (!this.codexExternalScanTimer) {
          this.codexExternalScanTimer = setInterval(() => {
            this.scanCodexWorkspaceThreads();
          }, 3000);
        }

        // Start external session scanning (detects VS Code extension panel sessions)
        if (!this.externalScanTimer) {
          this.externalScanTimer = startExternalSessionScanning(
            projectDir,
            this.knownJsonlFiles,
            this.nextAgentId,
            this.agents,
            this.fileWatchers,
            this.pollingTimers,
            this.waitingTimers,
            this.permissionTimers,
            this.jsonlPollTimers,
            this.webview,
            this.persistAgents,
            this.watchAllSessions,
            this.hooksEnabled,
          );

          // In multi-root workspaces, also scan project dirs for all other folders
          // so agents running in any workspace folder are discovered
          if (wsFolders && wsFolders.length > 1) {
            for (const folder of wsFolders) {
              const folderProjectDir = getProjectDirPath(folder.uri.fsPath);
              if (folderProjectDir && folderProjectDir !== projectDir) {
                console.log(
                  `[Pixel Agents] Registering additional project dir: ${folderProjectDir}`,
                );
                ensureProjectScan(
                  folderProjectDir,
                  this.knownJsonlFiles,
                  this.projectScanTimer,
                  this.activeAgentId,
                  this.nextAgentId,
                  this.agents,
                  this.fileWatchers,
                  this.pollingTimers,
                  this.waitingTimers,
                  this.permissionTimers,
                  this.webview,
                  this.persistAgents,
                  undefined,
                  this.hooksEnabled,
                );
              }
            }
          }
        }
        if (!this.staleCheckTimer) {
          this.staleCheckTimer = startStaleExternalAgentCheck(
            this.agents,
            this.knownJsonlFiles,
            this.fileWatchers,
            this.pollingTimers,
            this.waitingTimers,
            this.permissionTimers,
            this.jsonlPollTimers,
            this.webview,
            this.persistAgents,
            this.hooksEnabled,
          );
        }

        // Load furniture assets BEFORE sending layout
        (async () => {
          try {
            console.log('[Extension] Loading furniture assets...');
            const extensionPath = this.extensionUri.fsPath;
            console.log('[Extension] extensionPath:', extensionPath);

            // Check bundled location first: extensionPath/dist/assets/
            const bundledAssetsDir = path.join(extensionPath, 'dist', 'assets');
            let assetsRoot: string | null = null;
            if (fs.existsSync(bundledAssetsDir)) {
              console.log('[Extension] Found bundled assets at dist/');
              assetsRoot = path.join(extensionPath, 'dist');
            } else if (workspaceRoot) {
              // Fall back to workspace root (development or external assets)
              console.log('[Extension] Trying workspace for assets...');
              assetsRoot = workspaceRoot;
            }

            if (!assetsRoot) {
              console.log('[Extension] ⚠️  No assets directory found');
              if (this.webview) {
                sendLayout(this.context, this.webview, this.defaultLayout);
                // Send agent statuses AFTER layoutLoaded so characters exist when messages arrive
                sendCurrentAgentStatuses(this.agents, this.webview);
                this.startLayoutWatcher();
              }
              return;
            }

            console.log('[Extension] Using assetsRoot:', assetsRoot);
            this.assetsRoot = assetsRoot;

            // Load bundled default layout
            this.defaultLayout = loadDefaultLayout(assetsRoot);

            // Load character sprites (bundled + external)
            const charSprites = await this.loadAllCharacterSprites();
            if (charSprites && this.webview) {
              console.log(
                `[Extension] ${charSprites.characters.length} character sprites loaded, sending to webview`,
              );
              sendCharacterSpritesToWebview(this.webview, charSprites);
            }

            // Load floor tiles
            const floorTiles = await loadFloorTiles(assetsRoot);
            if (floorTiles && this.webview) {
              console.log('[Extension] Floor tiles loaded, sending to webview');
              sendFloorTilesToWebview(this.webview, floorTiles);
            }

            // Load wall tiles
            const wallTiles = await loadWallTiles(assetsRoot);
            if (wallTiles && this.webview) {
              console.log('[Extension] Wall tiles loaded, sending to webview');
              sendWallTilesToWebview(this.webview, wallTiles);
            }

            const assets = await this.loadAllFurnitureAssets();
            if (assets && this.webview) {
              console.log('[Extension] ✅ Assets loaded, sending to webview');
              sendAssetsToWebview(this.webview, assets);
            }
          } catch (err) {
            console.error('[Extension] ❌ Error loading assets:', err);
          }
          // Always send saved layout (or null for default)
          if (this.webview) {
            console.log('[Extension] Sending saved layout');
            sendLayout(this.context, this.webview, this.defaultLayout);
            // Send agent statuses AFTER layoutLoaded so characters exist when messages arrive
            sendCurrentAgentStatuses(this.agents, this.webview);
            this.startLayoutWatcher();
          }
        })();
        sendExistingAgents(this.agents, this.context, this.webview);
      } else if (message.type === 'requestDiagnostics') {
        // Send connection diagnostics for all agents to the Debug View
        const diagnostics: Array<Record<string, unknown>> = [];
        for (const [, agent] of this.agents) {
          let jsonlExists = false;
          let fileSize = 0;
          try {
            const stat = fs.statSync(agent.jsonlFile);
            jsonlExists = true;
            fileSize = stat.size;
          } catch {
            /* file doesn't exist */
          }
          diagnostics.push({
            id: agent.id,
            projectDir: agent.projectDir,
            projectDirExists: fs.existsSync(agent.projectDir),
            jsonlFile: agent.jsonlFile,
            jsonlExists,
            fileSize,
            fileOffset: agent.fileOffset,
            lastDataAt: agent.lastDataAt,
            linesProcessed: agent.linesProcessed,
          });
        }
        this.webview?.postMessage({ type: 'agentDiagnostics', agents: diagnostics });
      } else if (message.type === 'openSessionsFolder') {
        const sessionsDir = path.join(os.homedir(), '.codex', 'sessions');
        if (fs.existsSync(sessionsDir)) {
          vscode.env.openExternal(vscode.Uri.file(sessionsDir));
        }
      } else if (message.type === 'exportLayout') {
        const layout = readLayoutFromFile();
        if (!layout) {
          vscode.window.showWarningMessage('Pixel Agents: No saved layout to export.');
          return;
        }
        const uri = await vscode.window.showSaveDialog({
          filters: { 'JSON Files': ['json'] },
          defaultUri: vscode.Uri.file(path.join(os.homedir(), 'pixel-agents-layout.json')),
        });
        if (uri) {
          fs.writeFileSync(uri.fsPath, JSON.stringify(layout, null, 2), 'utf-8');
          vscode.window.showInformationMessage('Pixel Agents: Layout exported successfully.');
        }
      } else if (message.type === 'addExternalAssetDirectory') {
        const uris = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: 'Select Asset Directory',
        });
        if (!uris || uris.length === 0) return;
        const newPath = uris[0].fsPath;
        const cfg = readConfig();
        if (!cfg.externalAssetDirectories.includes(newPath)) {
          cfg.externalAssetDirectories.push(newPath);
          writeConfig(cfg);
        }
        await this.reloadAndSendCharacters();
        await this.reloadAndSendFurniture();
        this.webview?.postMessage({
          type: 'externalAssetDirectoriesUpdated',
          dirs: cfg.externalAssetDirectories,
        });
      } else if (message.type === 'removeExternalAssetDirectory') {
        const cfg = readConfig();
        cfg.externalAssetDirectories = cfg.externalAssetDirectories.filter(
          (d) => d !== (message.path as string),
        );
        writeConfig(cfg);
        await this.reloadAndSendCharacters();
        await this.reloadAndSendFurniture();
        this.webview?.postMessage({
          type: 'externalAssetDirectoriesUpdated',
          dirs: cfg.externalAssetDirectories,
        });
      } else if (message.type === 'importLayout') {
        const uris = await vscode.window.showOpenDialog({
          filters: { 'JSON Files': ['json'] },
          canSelectMany: false,
        });
        if (!uris || uris.length === 0) return;
        try {
          const raw = fs.readFileSync(uris[0].fsPath, 'utf-8');
          const imported = JSON.parse(raw) as Record<string, unknown>;
          if (imported.version !== 1 || !Array.isArray(imported.tiles)) {
            vscode.window.showErrorMessage('Pixel Agents: Invalid layout file.');
            return;
          }
          this.layoutWatcher?.markOwnWrite();
          writeLayoutToFile(imported);
          this.webview?.postMessage({ type: 'layoutLoaded', layout: imported });
          vscode.window.showInformationMessage('Pixel Agents: Layout imported successfully.');
        } catch {
          vscode.window.showErrorMessage('Pixel Agents: Failed to read or parse layout file.');
        }
      }
    });

    vscode.window.onDidChangeActiveTerminal((terminal) => {
      this.activeAgentId.current = null;
      if (!terminal) return;
      for (const [id, agent] of this.agents) {
        if (agent.terminalRef && agent.terminalRef === terminal) {
          this.activeAgentId.current = id;
          webviewView.webview.postMessage({ type: 'agentSelected', id });
          break;
        }
      }
    });

    vscode.window.onDidCloseTerminal((closed) => {
      for (const [id, agent] of this.agents) {
        if (agent.terminalRef && agent.terminalRef === closed) {
          if (this.activeAgentId.current === id) {
            this.activeAgentId.current = null;
          }
          // If this is a team lead, remove its teammates
          if (agent.isTeamLead) {
            this.removeTeammates(id);
          }
          // Dismiss JSONL so external scanner doesn't re-adopt it
          dismissedJsonlFiles.set(agent.jsonlFile, Date.now());
          this.unregisterAgentHook(agent);
          removeAgent(
            id,
            this.agents,
            this.fileWatchers,
            this.pollingTimers,
            this.waitingTimers,
            this.permissionTimers,
            this.jsonlPollTimers,
            this.persistAgents,
          );
          webviewView.webview.postMessage({ type: 'agentClosed', id });
        }
      }
    });
  }

  /** Export current saved layout as a versioned default-layout-{N}.json (dev utility) */
  exportDefaultLayout(): void {
    const layout = readLayoutFromFile();
    if (!layout) {
      vscode.window.showWarningMessage('Pixel Agents: No saved layout found.');
      return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Pixel Agents: No workspace folder found.');
      return;
    }
    const assetsDir = path.join(workspaceRoot, 'webview-ui', 'public', 'assets');

    // Find the next revision number
    let maxRevision = 0;
    if (fs.existsSync(assetsDir)) {
      for (const file of fs.readdirSync(assetsDir)) {
        const match = /^default-layout-(\d+)\.json$/.exec(file);
        if (match) {
          maxRevision = Math.max(maxRevision, parseInt(match[1], 10));
        }
      }
    }
    const nextRevision = maxRevision + 1;
    layout[LAYOUT_REVISION_KEY] = nextRevision;

    const targetPath = path.join(assetsDir, `default-layout-${nextRevision}.json`);
    const json = JSON.stringify(layout, null, 2);
    fs.writeFileSync(targetPath, json, 'utf-8');
    vscode.window.showInformationMessage(
      `Pixel Agents: Default layout exported as revision ${nextRevision} to ${targetPath}`,
    );
  }

  private async loadAllFurnitureAssets(): Promise<LoadedAssets | null> {
    if (!this.assetsRoot) return null;
    let assets = await loadFurnitureAssets(this.assetsRoot);
    const config = readConfig();
    for (const extraDir of config.externalAssetDirectories) {
      console.log('[Extension] Loading external assets from:', extraDir);
      const extra = await loadFurnitureAssets(extraDir);
      if (extra) {
        assets = assets ? mergeLoadedAssets(assets, extra) : extra;
      }
    }
    return assets;
  }

  private async loadAllCharacterSprites(): Promise<LoadedCharacterSprites | null> {
    if (!this.assetsRoot) return null;
    let chars = await loadCharacterSprites(this.assetsRoot);
    const config = readConfig();
    for (const extraDir of config.externalAssetDirectories) {
      console.log('[Extension] Loading external character sprites from:', extraDir);
      const extra = await loadExternalCharacterSprites(extraDir);
      if (extra) {
        chars = chars ? mergeCharacterSprites(chars, extra) : extra;
      }
    }
    return chars;
  }

  private async reloadAndSendFurniture(): Promise<void> {
    if (!this.assetsRoot || !this.webview) return;
    try {
      const assets = await this.loadAllFurnitureAssets();
      if (assets) {
        sendAssetsToWebview(this.webview, assets);
      }
    } catch (err) {
      console.error('[Extension] Error reloading furniture assets:', err);
    }
  }

  private async reloadAndSendCharacters(): Promise<void> {
    if (!this.assetsRoot || !this.webview) return;
    try {
      const chars = await this.loadAllCharacterSprites();
      if (chars) {
        sendCharacterSpritesToWebview(this.webview, chars);
      }
    } catch (err) {
      console.error('[Extension] Error reloading character sprites:', err);
    }
  }

  private startLayoutWatcher(): void {
    if (this.layoutWatcher) return;
    this.layoutWatcher = watchLayoutFile((layout) => {
      console.log('[Pixel Agents] External layout change — pushing to webview');
      this.webview?.postMessage({ type: 'layoutLoaded', layout });
    });
  }

  dispose() {
    this.pixelAgentsServer?.stop();
    this.pixelAgentsServer = null;
    this.hookEventHandler?.dispose();
    this.hookEventHandler = null;
    this.layoutWatcher?.dispose();
    this.layoutWatcher = null;
    for (const id of [...this.agents.keys()]) {
      removeAgent(
        id,
        this.agents,
        this.fileWatchers,
        this.pollingTimers,
        this.waitingTimers,
        this.permissionTimers,
        this.jsonlPollTimers,
        this.persistAgents,
      );
    }
    if (this.projectScanTimer.current) {
      clearInterval(this.projectScanTimer.current);
      this.projectScanTimer.current = null;
    }
    if (this.externalScanTimer) {
      clearInterval(this.externalScanTimer);
      this.externalScanTimer = null;
    }
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
  }
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const distPath = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  const indexPath = vscode.Uri.joinPath(distPath, 'index.html').fsPath;

  let html = fs.readFileSync(indexPath, 'utf-8');

  html = html.replace(/(href|src)="\.\/([^"]+)"/g, (_match, attr, filePath) => {
    const fileUri = vscode.Uri.joinPath(distPath, filePath);
    const cacheKey = fs.statSync(fileUri.fsPath).mtimeMs.toString(36);
    const webviewUri = webview.asWebviewUri(fileUri).with({ query: `v=${cacheKey}` });
    return `${attr}="${webviewUri}"`;
  });

  return html;
}
