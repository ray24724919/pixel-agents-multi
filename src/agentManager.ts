import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { JSONL_POLL_INTERVAL_MS } from '../server/src/constants.js';
import {
  buildCodexLaunchCommand,
  codexPathKey,
  type CodexThread,
  findCodexThreadById,
  findLatestCodexThread,
} from '../server/src/providers/file/codex/codex.js';
import {
  TERMINAL_NAME_PREFIX,
  WORKSPACE_KEY_AGENT_SEATS,
  WORKSPACE_KEY_AGENTS,
} from './constants.js';
import {
  ensureProjectScan,
  readNewLines,
  reassignAgentToFile,
  startFileWatching,
} from './fileWatcher.js';
import { migrateAndLoadLayout } from './layoutPersistence.js';
import { postAgentLifecycleSnapshot, postAgentPaused } from './lifecycleStatus.js';
import { getExtensionConfigValue } from './settings.js';
import { cancelPermissionTimer, cancelWaitingTimer } from './timerManager.js';
import { readTokenUsageFromTranscript } from './tokenUsage.js';
import type { AgentState, PersistedAgent } from './types.js';

export const CLAUDE_CLI_MISSING_MESSAGE =
  'Claude Code CLI was not found. The Claude VS Code extension alone is not enough for Pixel Agents. Install the Claude CLI or configure the command path.';

function unquoteCommandPath(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getClaudeCommandPath(): string {
  const configured = getExtensionConfigValue<string>('claude.commandPath', 'claude');
  return unquoteCommandPath(configured || 'claude') || 'claude';
}

function isPathLikeCommand(commandPath: string): boolean {
  return (
    path.isAbsolute(commandPath) ||
    commandPath.includes('/') ||
    commandPath.includes('\\') ||
    commandPath.includes(' ')
  );
}

function windowsExecutableCandidates(commandPath: string): string[] {
  if (path.extname(commandPath)) return [commandPath];
  const pathExt = process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD;.PS1';
  return pathExt
    .split(';')
    .map((ext) => ext.trim())
    .filter(Boolean)
    .map((ext) => `${commandPath}${ext.toLowerCase()}`);
}

function resolvePathLikeCommand(commandPath: string): string | null {
  const candidates =
    process.platform === 'win32' ? windowsExecutableCandidates(commandPath) : [commandPath];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveBareCommand(commandPath: string): string | null {
  try {
    const result =
      process.platform === 'win32'
        ? childProcess.spawnSync('where.exe', [commandPath], { stdio: 'ignore' })
        : childProcess.spawnSync('sh', ['-c', 'command -v "$1"', 'sh', commandPath], {
            stdio: 'ignore',
          });
    return result.status === 0 ? commandPath : null;
  } catch {
    return null;
  }
}

export function resolveClaudeCommand(commandPath = getClaudeCommandPath()): string | null {
  return isPathLikeCommand(commandPath)
    ? resolvePathLikeCommand(commandPath)
    : resolveBareCommand(commandPath);
}

function buildClaudeArgs(sessionId: string, bypassPermissions?: boolean): string[] {
  const args = ['--session-id', sessionId];
  if (bypassPermissions) {
    args.push('--dangerously-skip-permissions');
  }
  return args;
}

function buildClaudeLaunchCommand(commandPath: string, args: string[]): string {
  return [commandPath, ...args].join(' ');
}

export function getProjectDirPath(cwd?: string): string {
  // Fall back to home directory when no workspace folder is open.
  // This is the common case on Linux/macOS when VS Code is launched without a folder
  // (e.g. `code` with no arguments). This helper remains for Claude-style
  // transcript scanning; Codex agents are resolved from ~/.codex/state_5.sqlite.
  const workspacePath = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
  const dirName = workspacePath.replace(/[^a-zA-Z0-9-]/g, '-');
  const projectDir = path.join(os.homedir(), '.claude', 'projects', dirName);
  console.log(`[Pixel Agents] Terminal: Project dir: ${workspacePath} → ${dirName}`);

  // Verify the directory exists; if not, try fuzzy matching against existing dirs
  if (!fs.existsSync(projectDir)) {
    const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
    try {
      if (fs.existsSync(projectsRoot)) {
        const candidates = fs.readdirSync(projectsRoot);
        // Try case-insensitive match (handles Windows drive letter casing)
        const lowerDirName = dirName.toLowerCase();
        const match = candidates.find((c) => c.toLowerCase() === lowerDirName);
        if (match && match !== dirName) {
          const matchedDir = path.join(projectsRoot, match);
          console.log(
            `[Pixel Agents] Project dir not found, using case-insensitive match: ${dirName} → ${match}`,
          );
          return matchedDir;
        }
        if (!match) {
          console.warn(
            `[Pixel Agents] Project dir does not exist: ${projectDir}. ` +
              `Available dirs (${candidates.length}): ${candidates.slice(0, 5).join(', ')}${candidates.length > 5 ? '...' : ''}`,
          );
        }
      }
    } catch {
      // Ignore scan errors
    }
  }
  return projectDir;
}

export async function launchNewTerminal(
  nextAgentIdRef: { current: number },
  nextTerminalIndexRef: { current: number },
  agents: Map<number, AgentState>,
  activeAgentIdRef: { current: number | null },
  knownJsonlFiles: Set<string>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  projectScanTimerRef: { current: ReturnType<typeof setInterval> | null },
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
  providerId: 'claude' | 'codex' = 'claude',
  folderPath?: string,
  bypassPermissions?: boolean,
  prompt?: string,
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  // Use home directory as fallback cwd when no workspace is open (common on Linux/macOS).
  // This gives Codex a predictable --cd value, which is later matched against its
  // threads.cwd entry in ~/.codex/state_5.sqlite.
  const cwd = folderPath || folders?.[0]?.uri.fsPath || os.homedir();
  const isMultiRoot = !!(folders && folders.length > 1);

  const isClaude = providerId === 'claude';
  const configuredClaudeCommand = isClaude ? getClaudeCommandPath() : undefined;
  const resolvedClaudeCommand = configuredClaudeCommand
    ? resolveClaudeCommand(configuredClaudeCommand)
    : undefined;
  if (isClaude && !resolvedClaudeCommand) {
    vscode.window.showWarningMessage(CLAUDE_CLI_MISSING_MESSAGE);
    return;
  }

  const idx = nextTerminalIndexRef.current++;
  const sessionId = crypto.randomUUID();
  const claudeArgs = isClaude ? buildClaudeArgs(sessionId, bypassPermissions) : [];
  const launchClaudeDirectly =
    isClaude && !!configuredClaudeCommand && isPathLikeCommand(configuredClaudeCommand);
  const terminalOptions: vscode.TerminalOptions = launchClaudeDirectly
    ? {
        name: `${TERMINAL_NAME_PREFIX} #${idx}`,
        cwd,
        shellPath: resolvedClaudeCommand ?? undefined,
        shellArgs: claudeArgs,
      }
    : {
        name: `${TERMINAL_NAME_PREFIX} #${idx}`,
        cwd,
      };
  const terminal = vscode.window.createTerminal(terminalOptions);
  terminal.show();

  if (providerId === 'claude') {
    if (!launchClaudeDirectly) {
      terminal.sendText(buildClaudeLaunchCommand(configuredClaudeCommand ?? 'claude', claudeArgs));
    }

    const projectDir = getProjectDirPath(cwd);
    const expectedFile = path.join(projectDir, `${sessionId}.jsonl`);
    knownJsonlFiles.add(expectedFile);

    const id = nextAgentIdRef.current++;
    const folderName = isMultiRoot && cwd ? path.basename(cwd) : undefined;
    const projectName = path.basename(cwd);
    const agent: AgentState = {
      id,
      sessionId,
      terminalRef: terminal,
      isExternal: false,
      providerId: 'claude',
      projectDir,
      jsonlFile: expectedFile,
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
      lastDataAt: 0,
      linesProcessed: 0,
      seenUnknownRecordTypes: new Set(),
      folderName,
      projectName,
      hookDelivered: false,
      inputTokens: 0,
      outputTokens: 0,
      agentName: 'Claude',
    };

    agents.set(id, agent);
    activeAgentIdRef.current = id;
    persistAgents();
    console.log(`[Pixel Agents] Terminal: Agent ${id} - created for terminal ${terminal.name}`);
    webview?.postMessage({
      type: 'agentCreated',
      id,
      folderName: folderName ?? projectName,
      agentName: 'Claude',
      providerId: 'claude',
      projectDir,
      transcriptPath: agent.jsonlFile,
    });

    ensureProjectScan(
      projectDir,
      knownJsonlFiles,
      projectScanTimerRef,
      activeAgentIdRef,
      nextAgentIdRef,
      agents,
      fileWatchers,
      pollingTimers,
      waitingTimers,
      permissionTimers,
      webview,
      persistAgents,
    );

    const createdAt = Date.now();
    let pollCount = 0;
    console.log(`[Pixel Agents] Terminal: Agent ${id} - waiting for JSONL at ${agent.jsonlFile}`);
    const pollTimer = setInterval(() => {
      pollCount++;
      try {
        if (fs.existsSync(agent.jsonlFile)) {
          console.log(
            `[Pixel Agents] Terminal: Agent ${id} - found JSONL file ${path.basename(agent.jsonlFile)} (after ${pollCount}s)`,
          );
          clearInterval(pollTimer);
          jsonlPollTimers.delete(id);
          startFileWatching(
            id,
            agent.jsonlFile,
            agents,
            fileWatchers,
            pollingTimers,
            waitingTimers,
            permissionTimers,
            webview,
          );
          readNewLines(id, agents, waitingTimers, permissionTimers, webview);
        } else if (pollCount === 10) {
          const dirExists = fs.existsSync(projectDir);
          let dirContents = '';
          if (dirExists) {
            try {
              const files = fs.readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));
              dirContents =
                files.length > 0
                  ? `Dir has ${files.length} JSONL file(s): ${files.slice(0, 3).join(', ')}${files.length > 3 ? '...' : ''}`
                  : 'Dir exists but has no JSONL files';
            } catch {
              dirContents = 'Dir exists but unreadable';
            }
          } else {
            dirContents = 'Dir does not exist';
          }
          console.warn(
            `[Pixel Agents] Terminal: Agent ${id} - JSONL file not found after 10s. ` +
              `Expected: ${agent.jsonlFile}. ${dirContents}`,
          );
        } else if (pollCount > 10) {
          try {
            const trackedFiles = new Set(
              [...agents.values()].map((a) => path.resolve(a.jsonlFile)),
            );
            const candidates = fs
              .readdirSync(projectDir)
              .filter((f) => f.endsWith('.jsonl'))
              .map((f) => {
                const full = path.join(projectDir, f);
                return { file: full, mtime: fs.statSync(full).mtimeMs };
              })
              .filter((candidate) => {
                return (
                  !trackedFiles.has(path.resolve(candidate.file)) && candidate.mtime > createdAt
                );
              })
              .sort((a, b) => b.mtime - a.mtime);

            if (candidates.length > 0) {
              console.log(
                `[Pixel Agents] Terminal: Agent ${id} - /resume detected, reassigning to ${path.basename(candidates[0].file)}`,
              );
              clearInterval(pollTimer);
              jsonlPollTimers.delete(id);
              reassignAgentToFile(
                id,
                candidates[0].file,
                agents,
                fileWatchers,
                pollingTimers,
                waitingTimers,
                permissionTimers,
                webview,
                persistAgents,
              );
            }
          } catch {
            /* ignore scan errors */
          }
        }
      } catch {
        /* file may not exist yet */
      }
    }, JSONL_POLL_INTERVAL_MS);
    jsonlPollTimers.set(id, pollTimer);
    return;
  }

  terminal.sendText(buildCodexLaunchCommand(cwd, bypassPermissions ?? false, prompt));

  const projectDir = cwd;

  // Create agent immediately (before JSONL file exists)
  const id = nextAgentIdRef.current++;
  const folderName = isMultiRoot && cwd ? path.basename(cwd) : undefined;
  const projectName = path.basename(cwd);
  const agent: AgentState = {
    id,
    sessionId,
    terminalRef: terminal,
    isExternal: false,
    providerId: 'codex',
    projectDir,
    jsonlFile: '',
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
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    folderName,
    projectName,
    hookDelivered: false,
    inputTokens: 0,
    outputTokens: 0,
    agentName: 'Codex',
  };

  agents.set(id, agent);
  activeAgentIdRef.current = id;
  persistAgents();
  console.log(`[Pixel Agents] Terminal: Agent ${id} - created for terminal ${terminal.name}`);
  webview?.postMessage({
    type: 'agentCreated',
    id,
    folderName: folderName ?? projectName,
    agentName: 'Codex',
    providerId: 'codex',
    projectDir,
    transcriptPath: agent.jsonlFile,
  });

  void projectScanTimerRef;
  void activeAgentIdRef;
  void nextAgentIdRef;

  console.log(`[Pixel Agents] Terminal: Agent ${id} - waiting for Codex rollout in ${cwd}`);
  startCodexCwdPoll(
    id,
    cwd,
    agents,
    knownJsonlFiles,
    fileWatchers,
    pollingTimers,
    waitingTimers,
    permissionTimers,
    jsonlPollTimers,
    webview,
    persistAgents,
  );
}

function clearCodexTransientState(agent: AgentState): void {
  agent.activeToolIds.clear();
  agent.activeToolStatuses.clear();
  agent.activeToolNames.clear();
  agent.activeSubagentToolIds.clear();
  agent.activeSubagentToolNames.clear();
  agent.permissionSent = false;
  agent.hadToolsInTurn = false;
  agent.isWaiting = false;
  agent.lineBuffer = '';
}

function isCodexThreadTrackedByAnotherAgent(
  thread: CodexThread,
  agents: Map<number, AgentState>,
  currentAgentId: number,
): boolean {
  const threadTranscript = codexPathKey(thread.rolloutPath);
  for (const [id, agent] of agents) {
    if (id === currentAgentId || agent.providerId !== 'codex') continue;
    if (agent.sessionId && agent.sessionId === thread.id) return true;
    const agentTranscript = codexPathKey(agent.jsonlFile);
    if (agentTranscript && threadTranscript && agentTranscript === threadTranscript) return true;
  }
  return false;
}

export function startCodexCwdPoll(
  agentId: number,
  cwd: string,
  agents: Map<number, AgentState>,
  knownJsonlFiles: Set<string>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
): void {
  const existingTimer = jsonlPollTimers.get(agentId);
  if (existingTimer) {
    clearInterval(existingTimer);
  }

  let pollCount = 0;
  const pollTimer = setInterval(() => {
    pollCount++;
    const agent = agents.get(agentId);
    if (!agent) {
      clearInterval(pollTimer);
      jsonlPollTimers.delete(agentId);
      return;
    }

    try {
      const thread = findLatestCodexThread(cwd, 0);
      if (
        thread &&
        thread.id !== agent.sessionId &&
        !isCodexThreadTrackedByAnotherAgent(thread, agents, agentId)
      ) {
        const previousSessionId = agent.sessionId;
        const previousJsonlFile = agent.jsonlFile;
        const isInitialBind = !agent.jsonlFile;
        const previousInputTokens = agent.inputTokens;
        const previousOutputTokens = agent.outputTokens;

        agent.sessionId = thread.id;
        agent.jsonlFile = thread.rolloutPath;
        agent.projectDir = cwd;
        agent.projectName = path.basename(cwd);
        agent.folderName = agent.folderName ?? agent.projectName;
        agent.agentName = thread.title ?? thread.agentNickname ?? thread.agentRole ?? 'Codex';
        agent.codexInputTokenBase = isInitialBind ? 0 : previousInputTokens;
        agent.codexOutputTokenBase = isInitialBind ? 0 : previousOutputTokens;
        const transcriptUsage = isInitialBind
          ? readTokenUsageFromTranscript(thread.rolloutPath, 'codex')
          : null;
        const threadInputTokens =
          transcriptUsage?.inputTokens ?? (isInitialBind ? thread.tokensUsed : 0);
        const threadOutputTokens = transcriptUsage?.outputTokens ?? 0;
        agent.inputTokens = (agent.codexInputTokenBase ?? 0) + threadInputTokens;
        agent.outputTokens = (agent.codexOutputTokenBase ?? 0) + threadOutputTokens;
        agent.artifactOutputTokens =
          (agent.artifactOutputTokens ?? 0) + (transcriptUsage?.artifactOutputTokens ?? 0);
        if (transcriptUsage) {
          agent.tokenUsageDetails = transcriptUsage.details;
          agent.codexLastTokenUsage = transcriptUsage.lastTokenUsage;
          agent.codexRateLimits = transcriptUsage.rateLimits;
        }
        clearCodexTransientState(agent);
        cancelWaitingTimer(agentId, waitingTimers);
        cancelPermissionTimer(agentId, permissionTimers);
        knownJsonlFiles.add(thread.rolloutPath);
        persistAgents();
        webview?.postMessage({
          type: 'agentMetadata',
          id: agentId,
          folderName: agent.folderName ?? agent.projectName,
          agentName: agent.agentName,
          providerId: 'codex',
          projectDir: agent.projectDir,
          transcriptPath: agent.jsonlFile,
        });
        webview?.postMessage({
          type: 'agentTokenUsage',
          id: agentId,
          inputTokens: agent.inputTokens,
          outputTokens: agent.outputTokens,
          artifactOutputTokens: agent.artifactOutputTokens ?? 0,
          estimated: transcriptUsage?.estimated ?? false,
          details: agent.tokenUsageDetails,
          lastTokenUsage: agent.codexLastTokenUsage,
          rateLimits: agent.codexRateLimits,
        });
        if (previousJsonlFile) {
          fileWatchers.get(agentId)?.close();
          fileWatchers.delete(agentId);
          const filePollTimer = pollingTimers.get(agentId);
          if (filePollTimer) {
            clearInterval(filePollTimer);
          }
          pollingTimers.delete(agentId);
        }
        if (!isInitialBind) {
          try {
            agent.fileOffset = fs.statSync(thread.rolloutPath).size;
          } catch {
            agent.fileOffset = 0;
          }
          webview?.postMessage({ type: 'agentToolsClear', id: agentId });
          console.log(
            `[Pixel Agents] Codex: Agent ${agentId} - thread ${previousSessionId.slice(0, 8)} → ${thread.id.slice(0, 8)} (same cwd follow-on)`,
          );
        } else {
          console.log(
            `[Pixel Agents] Terminal: Agent ${agentId} - found Codex rollout ${path.basename(thread.rolloutPath)} (after ${pollCount}s)`,
          );
        }
        startFileWatching(
          agentId,
          agent.jsonlFile,
          agents,
          fileWatchers,
          pollingTimers,
          waitingTimers,
          permissionTimers,
          webview,
        );
        if (isInitialBind) {
          readNewLines(agentId, agents, waitingTimers, permissionTimers, webview);
        }
      } else if (!thread && agent.jsonlFile && !findCodexThreadById(agent.sessionId)) {
        fileWatchers.get(agentId)?.close();
        fileWatchers.delete(agentId);
        const filePollTimer = pollingTimers.get(agentId);
        if (filePollTimer) {
          clearInterval(filePollTimer);
        }
        pollingTimers.delete(agentId);
        clearCodexTransientState(agent);
        cancelWaitingTimer(agentId, waitingTimers);
        cancelPermissionTimer(agentId, permissionTimers);
        webview?.postMessage({ type: 'agentToolsClear', id: agentId });
        persistAgents();
      } else if (pollCount === 10 && !agent.jsonlFile) {
        console.warn(
          `[Pixel Agents] Terminal: Agent ${agentId} - Codex rollout not found after 10s for cwd ${cwd}`,
        );
      }
    } catch {
      /* state database or rollout file may not exist yet */
    }
  }, JSONL_POLL_INTERVAL_MS);
  jsonlPollTimers.set(agentId, pollTimer);
}

export function removeAgent(
  agentId: number,
  agents: Map<number, AgentState>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  persistAgents: () => void,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;

  // Stop JSONL poll timer
  const jpTimer = jsonlPollTimers.get(agentId);
  if (jpTimer) {
    clearInterval(jpTimer);
  }
  jsonlPollTimers.delete(agentId);

  // Stop file watching
  fileWatchers.get(agentId)?.close();
  fileWatchers.delete(agentId);
  const pt = pollingTimers.get(agentId);
  if (pt) {
    clearInterval(pt);
  }
  pollingTimers.delete(agentId);

  // Cancel timers
  cancelWaitingTimer(agentId, waitingTimers);
  cancelPermissionTimer(agentId, permissionTimers);

  // Remove from maps
  agents.delete(agentId);
  persistAgents();
}

export function persistAgents(
  agents: Map<number, AgentState>,
  context: vscode.ExtensionContext,
): void {
  const persisted: PersistedAgent[] = [];
  for (const agent of agents.values()) {
    persisted.push({
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
    });
  }
  context.workspaceState.update(WORKSPACE_KEY_AGENTS, persisted);
}

export function restoreAgents(
  context: vscode.ExtensionContext,
  nextAgentIdRef: { current: number },
  nextTerminalIndexRef: { current: number },
  agents: Map<number, AgentState>,
  knownJsonlFiles: Set<string>,
  fileWatchers: Map<number, fs.FSWatcher>,
  pollingTimers: Map<number, ReturnType<typeof setInterval>>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
  projectScanTimerRef: { current: ReturnType<typeof setInterval> | null },
  activeAgentIdRef: { current: number | null },
  webview: vscode.Webview | undefined,
  doPersist: () => void,
): void {
  const persisted = context.workspaceState.get<PersistedAgent[]>(WORKSPACE_KEY_AGENTS, []);
  if (persisted.length === 0) return;

  const liveTerminals = vscode.window.terminals;
  let maxId = 0;
  let maxIdx = 0;
  let restoredProjectDir: string | null = null;

  for (const p of persisted) {
    // Skip agents already in the map — prevents duplicate file watchers on re-entry
    // (webviewReady fires on every panel focus, re-calling restoreAgents each time)
    if (agents.has(p.id)) {
      knownJsonlFiles.add(p.jsonlFile);
      continue;
    }

    let terminal: vscode.Terminal | undefined;
    const isExternal = p.isExternal ?? false;

    if (isExternal) {
      // External agents — restore if JSONL file still exists on disk
      try {
        if (!fs.existsSync(p.jsonlFile)) continue;
      } catch {
        continue;
      }
    } else {
      // Terminal agents — find matching terminal by name
      terminal = liveTerminals.find((t) => t.name === p.terminalName);
      if (!terminal) continue;
    }

    const agent: AgentState = {
      id: p.id,
      sessionId: p.sessionId || path.basename(p.jsonlFile, '.jsonl'),
      terminalRef: terminal,
      isExternal,
      providerId: p.providerId ?? 'claude',
      projectDir: p.projectDir,
      jsonlFile: p.jsonlFile,
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
      lastDataAt: 0,
      linesProcessed: 0,
      seenUnknownRecordTypes: new Set(),
      folderName: p.folderName,
      projectName: p.projectName,
      hookDelivered: false,
      paused: p.paused,
      hidden: p.hidden,
      inputTokens: 0,
      outputTokens: 0,
      claudeTitleResolved: p.claudeTitleResolved,
      codexInputTokenBase: p.codexInputTokenBase,
      codexOutputTokenBase: p.codexOutputTokenBase,
      teamName: p.teamName,
      agentName: p.agentName,
      isTeamLead: p.isTeamLead,
      leadAgentId: p.leadAgentId,
      teamUsesTmux: p.teamUsesTmux,
    };

    agents.set(p.id, agent);
    knownJsonlFiles.add(p.jsonlFile);
    if (isExternal) {
      console.log(
        `[Pixel Agents] Terminal: Agent ${p.id} - restored external → ${path.basename(p.jsonlFile)}`,
      );
    } else {
      console.log(
        `[Pixel Agents] Terminal: Agent ${p.id} - restored → terminal "${p.terminalName}"`,
      );
    }

    if (p.id > maxId) maxId = p.id;
    // Extract terminal index from names like "Codex #3"
    const match = p.terminalName.match(/#(\d+)$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (idx > maxIdx) maxIdx = idx;
    }

    restoredProjectDir = p.projectDir;

    if (agent.providerId === 'codex' && !agent.isExternal) {
      startCodexCwdPoll(
        p.id,
        agent.projectDir,
        agents,
        knownJsonlFiles,
        fileWatchers,
        pollingTimers,
        waitingTimers,
        permissionTimers,
        jsonlPollTimers,
        webview,
        doPersist,
      );
    }

    // Start file watching if JSONL exists, skipping to end of file
    try {
      if (fs.existsSync(p.jsonlFile)) {
        const stat = fs.statSync(p.jsonlFile);
        agent.fileOffset = stat.size;
        startFileWatching(
          p.id,
          p.jsonlFile,
          agents,
          fileWatchers,
          pollingTimers,
          waitingTimers,
          permissionTimers,
          webview,
        );
      } else if (agent.providerId !== 'codex') {
        // Poll for the file to appear
        const pollTimer = setInterval(() => {
          try {
            if (fs.existsSync(agent.jsonlFile)) {
              console.log(`[Pixel Agents] Terminal: Agent ${p.id} - found JSONL file`);
              clearInterval(pollTimer);
              jsonlPollTimers.delete(p.id);
              const stat = fs.statSync(agent.jsonlFile);
              agent.fileOffset = stat.size;
              startFileWatching(
                p.id,
                agent.jsonlFile,
                agents,
                fileWatchers,
                pollingTimers,
                waitingTimers,
                permissionTimers,
                webview,
              );
            }
          } catch {
            /* file may not exist yet */
          }
        }, JSONL_POLL_INTERVAL_MS);
        jsonlPollTimers.set(p.id, pollTimer);
      }
    } catch {
      /* ignore errors during restore */
    }
  }

  // After a short delay, remove restored terminal agents that never received data.
  // These are dead terminals restored by VS Code (e.g., after /clear or restart)
  // where Claude is no longer running.
  const restoredTerminalIds = [...agents.entries()]
    .filter(([, a]) => !a.isExternal && a.terminalRef && a.providerId !== 'codex')
    .map(([id]) => id);
  if (restoredTerminalIds.length > 0) {
    setTimeout(() => {
      for (const id of restoredTerminalIds) {
        const agent = agents.get(id);
        if (agent && !agent.isExternal && agent.linesProcessed === 0) {
          console.log(
            `[Pixel Agents] Terminal: Agent ${id} - removing restored agent, no data received`,
          );
          agent.terminalRef?.dispose();
          removeAgent(
            id,
            agents,
            fileWatchers,
            pollingTimers,
            waitingTimers,
            permissionTimers,
            jsonlPollTimers,
            doPersist,
          );
          webview?.postMessage({ type: 'agentClosed', id });
        }
      }
    }, 10_000); // 10 seconds grace period
  }

  // Advance counters past restored IDs
  if (maxId >= nextAgentIdRef.current) {
    nextAgentIdRef.current = maxId + 1;
  }
  if (maxIdx >= nextTerminalIndexRef.current) {
    nextTerminalIndexRef.current = maxIdx + 1;
  }

  // Re-persist cleaned-up list (removes entries whose terminals are gone)
  doPersist();

  // Start project scan for /clear detection
  if (restoredProjectDir) {
    ensureProjectScan(
      restoredProjectDir,
      knownJsonlFiles,
      projectScanTimerRef,
      activeAgentIdRef,
      nextAgentIdRef,
      agents,
      fileWatchers,
      pollingTimers,
      waitingTimers,
      permissionTimers,
      webview,
      doPersist,
    );
  }
}

export function sendExistingAgents(
  agents: Map<number, AgentState>,
  context: vscode.ExtensionContext,
  webview: vscode.Webview | undefined,
): void {
  if (!webview) return;
  const agentIds: number[] = [];
  for (const id of agents.keys()) {
    agentIds.push(id);
  }
  agentIds.sort((a, b) => a - b);

  // Include persisted palette/seatId from separate key
  const agentMeta = context.workspaceState.get<
    Record<string, { palette?: number; seatId?: string }>
  >(WORKSPACE_KEY_AGENT_SEATS, {});

  // Include folderName and isExternal per agent
  const folderNames: Record<number, string> = {};
  const agentNames: Record<number, string> = {};
  const providerIds: Record<number, string> = {};
  const projectDirs: Record<number, string> = {};
  const transcriptPaths: Record<number, string> = {};
  const externalAgents: Record<number, boolean> = {};
  const hiddenAgents: Record<number, boolean> = {};
  for (const [id, agent] of agents) {
    refreshCodexAgentMetadata(agent);
    const projectLabel = agent.projectName ?? agent.folderName;
    if (projectLabel) {
      folderNames[id] = projectLabel;
    }
    if (agent.agentName) {
      agentNames[id] = agent.agentName;
    }
    providerIds[id] = agent.providerId ?? 'claude';
    if (agent.projectDir) {
      projectDirs[id] = agent.projectDir;
    }
    if (agent.jsonlFile) {
      transcriptPaths[id] = agent.jsonlFile;
    }
    if (agent.isExternal) {
      externalAgents[id] = true;
    }
    if (agent.hidden) {
      hiddenAgents[id] = true;
    }
  }
  console.log(
    `[Pixel Agents] sendExistingAgents: agents=${JSON.stringify(agentIds)}, meta=${JSON.stringify(agentMeta)}`,
  );

  webview.postMessage({
    type: 'existingAgents',
    agents: agentIds,
    agentMeta,
    folderNames,
    agentNames,
    providerIds,
    projectDirs,
    transcriptPaths,
    externalAgents,
    hiddenAgents,
  });
  // Note: sendCurrentAgentStatuses is called separately AFTER layoutLoaded
  // so that agentStatus/agentToolStart messages arrive after characters are created.
}

function refreshCodexAgentMetadata(agent: AgentState): boolean {
  if (agent.providerId !== 'codex' || !agent.sessionId) return false;
  const thread = findCodexThreadById(agent.sessionId);
  if (!thread) return false;
  const agentName = thread.title ?? thread.agentNickname ?? thread.agentRole ?? agent.agentName;
  const projectName = thread.cwd ? path.basename(thread.cwd) : agent.projectName;
  const changed =
    agent.agentName !== agentName ||
    agent.projectDir !== thread.cwd ||
    agent.jsonlFile !== thread.rolloutPath ||
    agent.projectName !== projectName ||
    agent.folderName !== projectName;
  agent.agentName = agentName;
  agent.projectDir = thread.cwd;
  agent.jsonlFile = thread.rolloutPath;
  agent.projectName = projectName;
  agent.folderName = projectName;
  return changed;
}

const ACTIVE_FILE_MTIME_WINDOW_MS = 30_000;

export function sendCurrentAgentStatuses(
  agents: Map<number, AgentState>,
  webview: vscode.Webview | undefined,
): void {
  if (!webview) return;
  for (const [agentId, agent] of agents) {
    if (refreshCodexAgentMetadata(agent)) {
      webview.postMessage({
        type: 'agentMetadata',
        id: agentId,
        folderName: agent.projectName ?? agent.folderName,
        agentName: agent.agentName,
        providerId: agent.providerId,
        projectDir: agent.projectDir,
        transcriptPath: agent.jsonlFile,
      });
    }
    // Re-send active tools
    for (const [toolId, status] of agent.activeToolStatuses) {
      const toolName = agent.activeToolNames.get(toolId) ?? '';
      webview.postMessage({
        type: 'agentToolStart',
        id: agentId,
        toolId,
        status,
        toolName,
      });
    }
    // Re-send waiting status
    if (agent.isWaiting) {
      webview.postMessage({
        type: 'agentStatus',
        id: agentId,
        status: 'waiting',
      });
    } else if (isTranscriptRecentlyActive(agent)) {
      webview.postMessage({
        type: 'agentStatus',
        id: agentId,
        status: 'active',
      });
    }
    // Re-send team metadata
    if (agent.teamName) {
      webview.postMessage({
        type: 'agentTeamInfo',
        id: agentId,
        teamName: agent.teamName,
        agentName: agent.agentName,
        isTeamLead: agent.isTeamLead,
        leadAgentId: agent.leadAgentId,
        teamUsesTmux: agent.teamUsesTmux,
      });
    }
    // Re-send cached token usage immediately. Full transcript scans can be very
    // large, so they are deferred to keep the panel responsive on open.
    if (agent.inputTokens > 0 || agent.outputTokens > 0 || (agent.artifactOutputTokens ?? 0) > 0) {
      webview.postMessage({
        type: 'agentTokenUsage',
        id: agentId,
        inputTokens: agent.inputTokens,
        outputTokens: agent.outputTokens,
        artifactOutputTokens: agent.artifactOutputTokens ?? 0,
        estimated: agent.tokenUsageDetails?.estimated ?? false,
        details: agent.tokenUsageDetails,
        lastTokenUsage: agent.codexLastTokenUsage,
        rateLimits: agent.codexRateLimits,
      });
    }
    scheduleTokenUsageRefresh(agent, webview);
    postAgentLifecycleSnapshot(webview, agent);
  }
}

export function setAgentPaused(
  agentId: number,
  paused: boolean,
  agents: Map<number, AgentState>,
  webview: vscode.Webview | undefined,
  persistAgents: () => void,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;

  agent.paused = paused || undefined;
  persistAgents();
  if (paused) {
    postAgentPaused(webview, agentId);
    return;
  }
  postAgentLifecycleSnapshot(webview, agent);
}

function isTranscriptRecentlyActive(agent: AgentState): boolean {
  if (!agent.jsonlFile) return false;
  try {
    const stat = fs.statSync(agent.jsonlFile);
    return Date.now() - stat.mtimeMs < ACTIVE_FILE_MTIME_WINDOW_MS;
  } catch {
    return false;
  }
}

function scheduleTokenUsageRefresh(agent: AgentState, webview: vscode.Webview): void {
  if (!agent.jsonlFile) return;
  setTimeout(() => {
    const transcriptUsage = readTokenUsageFromTranscript(agent.jsonlFile, agent.providerId);
    if (!transcriptUsage) return;
    agent.inputTokens = (agent.codexInputTokenBase ?? 0) + transcriptUsage.inputTokens;
    agent.outputTokens = (agent.codexOutputTokenBase ?? 0) + transcriptUsage.outputTokens;
    agent.artifactOutputTokens = transcriptUsage.artifactOutputTokens;
    agent.tokenUsageDetails = transcriptUsage.details;
    agent.codexLastTokenUsage = transcriptUsage.lastTokenUsage;
    agent.codexRateLimits = transcriptUsage.rateLimits;
    webview.postMessage({
      type: 'agentTokenUsage',
      id: agent.id,
      inputTokens: agent.inputTokens,
      outputTokens: agent.outputTokens,
      artifactOutputTokens: agent.artifactOutputTokens ?? 0,
      estimated: transcriptUsage.estimated,
      details: agent.tokenUsageDetails,
      lastTokenUsage: agent.codexLastTokenUsage,
      rateLimits: agent.codexRateLimits,
    });
  }, 250);
}

export function sendLayout(
  context: vscode.ExtensionContext,
  webview: vscode.Webview | undefined,
  defaultLayout?: Record<string, unknown> | null,
): void {
  if (!webview) return;
  const result = migrateAndLoadLayout(context, defaultLayout);
  webview.postMessage({
    type: 'layoutLoaded',
    layout: result?.layout ?? null,
    wasReset: result?.wasReset ?? false,
  });
}
