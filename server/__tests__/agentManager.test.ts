import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentState } from '../../src/types.js';

const createTerminalMock = vi.hoisted(() => vi.fn());
const showWarningMessageMock = vi.hoisted(() => vi.fn());
const spawnSyncMock = vi.hoisted(() => vi.fn());
const claudeCommandPathMock = vi.hoisted(() => ({ current: 'claude' }));
const buildCodexLaunchCommandMock = vi.hoisted(() => vi.fn());
const findLatestCodexThreadMock = vi.hoisted(() => vi.fn());
const ensureProjectScanMock = vi.hoisted(() => vi.fn());
const readNewLinesMock = vi.hoisted(() => vi.fn());
const reassignAgentToFileMock = vi.hoisted(() => vi.fn());
const startFileWatchingMock = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  window: {
    createTerminal: createTerminalMock,
    showWarningMessage: showWarningMessageMock,
    terminals: [],
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, fallback: string) =>
        key === 'claude.commandPath' ? claudeCommandPathMock.current : fallback,
      ),
    })),
    workspaceFolders: [{ uri: { fsPath: '/workspace/project' } }],
  },
}));

vi.mock('child_process', () => ({
  spawnSync: spawnSyncMock,
}));

vi.mock('../../server/src/providers/file/codex/codex.js', () => ({
  buildCodexLaunchCommand: buildCodexLaunchCommandMock,
  findCodexThreadById: vi.fn(),
  findLatestCodexThread: findLatestCodexThreadMock,
}));

vi.mock('../../src/fileWatcher.js', () => ({
  ensureProjectScan: ensureProjectScanMock,
  readNewLines: readNewLinesMock,
  reassignAgentToFile: reassignAgentToFileMock,
  startFileWatching: startFileWatchingMock,
}));

vi.mock('../../src/lifecycleStatus.js', () => ({
  postAgentLifecycleSnapshot: vi.fn(),
}));

vi.mock('../../src/timerManager.js', () => ({
  cancelPermissionTimer: vi.fn(),
  cancelWaitingTimer: vi.fn(),
}));

const { launchNewTerminal } = await import('../../src/agentManager.js');

function createLaunchHarness() {
  const agents = new Map<number, AgentState>();
  const webview = { postMessage: vi.fn() };
  const terminal = {
    name: 'Pixel Agent #1',
    show: vi.fn(),
    sendText: vi.fn(),
  };
  createTerminalMock.mockReturnValue(terminal);

  const jsonlPollTimers = new Map<number, ReturnType<typeof setInterval>>();
  const args = {
    nextAgentIdRef: { current: 1 },
    nextTerminalIndexRef: { current: 1 },
    agents,
    activeAgentIdRef: { current: null as number | null },
    knownJsonlFiles: new Set<string>(),
    fileWatchers: new Map<number, import('fs').FSWatcher>(),
    pollingTimers: new Map<number, ReturnType<typeof setInterval>>(),
    waitingTimers: new Map<number, ReturnType<typeof setTimeout>>(),
    permissionTimers: new Map<number, ReturnType<typeof setTimeout>>(),
    jsonlPollTimers,
    projectScanTimerRef: { current: null as ReturnType<typeof setInterval> | null },
    webview: webview as unknown as import('vscode').Webview,
    persistAgents: vi.fn(),
    terminal,
  };
  return args;
}

async function launchWith(
  harness: ReturnType<typeof createLaunchHarness>,
  providerId: 'claude' | 'codex' | undefined,
  prompt?: string,
) {
  await launchNewTerminal(
    harness.nextAgentIdRef,
    harness.nextTerminalIndexRef,
    harness.agents,
    harness.activeAgentIdRef,
    harness.knownJsonlFiles,
    harness.fileWatchers,
    harness.pollingTimers,
    harness.waitingTimers,
    harness.permissionTimers,
    harness.jsonlPollTimers,
    harness.projectScanTimerRef,
    harness.webview,
    harness.persistAgents,
    providerId,
    '/workspace/project',
    false,
    prompt,
  );
}

describe('launchNewTerminal provider dispatch', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'session-123') });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-agent-manager-'));
    createTerminalMock.mockReset();
    showWarningMessageMock.mockReset();
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({ status: 0 });
    claudeCommandPathMock.current = 'claude';
    buildCodexLaunchCommandMock.mockReset();
    buildCodexLaunchCommandMock.mockReturnValue('codex --cd /workspace/project --no-alt-screen');
    findLatestCodexThreadMock.mockReset();
    ensureProjectScanMock.mockReset();
    readNewLinesMock.mockReset();
    reassignAgentToFileMock.mockReset();
    startFileWatchingMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches Claude with the original session-id command and agent metadata', async () => {
    const harness = createLaunchHarness();

    await launchWith(harness, 'claude');

    expect(harness.terminal.sendText).toHaveBeenCalledWith('claude --session-id session-123');
    const agent = harness.agents.get(1);
    expect(agent?.providerId).toBe('claude');
    expect(agent?.sessionId).toBe('session-123');
    expect(agent?.jsonlFile).toBe(
      path.join(os.homedir(), '.claude', 'projects', '-workspace-project', 'session-123.jsonl'),
    );
    expect(ensureProjectScanMock).toHaveBeenCalledOnce();
    expect(harness.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCreated',
        id: 1,
        agentName: 'Claude',
        providerId: 'claude',
        transcriptPath: agent?.jsonlFile,
      }),
    );
  });

  it('launches Codex through the existing Codex command builder', async () => {
    const harness = createLaunchHarness();

    await launchWith(harness, 'codex', 'summarize tests');

    expect(buildCodexLaunchCommandMock).toHaveBeenCalledWith(
      '/workspace/project',
      false,
      'summarize tests',
    );
    expect(harness.terminal.sendText).toHaveBeenCalledWith(
      'codex --cd /workspace/project --no-alt-screen',
    );
    expect(harness.agents.get(1)?.providerId).toBe('codex');
    expect(harness.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCreated',
        id: 1,
        agentName: 'Codex',
        providerId: 'codex',
      }),
    );
    expect(ensureProjectScanMock).not.toHaveBeenCalled();
  });

  it('defaults to Claude when providerId is omitted', async () => {
    const harness = createLaunchHarness();

    await launchWith(harness, undefined);

    expect(harness.terminal.sendText).toHaveBeenCalledWith('claude --session-id session-123');
    expect(harness.agents.get(1)?.providerId).toBe('claude');
  });

  it('does not create a Claude terminal or agent when the configured CLI is missing', async () => {
    spawnSyncMock.mockReturnValue({ status: 1 });
    const harness = createLaunchHarness();

    await launchWith(harness, 'claude', 'handoff executor prompt');

    expect(createTerminalMock).not.toHaveBeenCalled();
    expect(harness.agents.size).toBe(0);
    expect(harness.persistAgents).not.toHaveBeenCalled();
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'Claude Code CLI was not found. The Claude VS Code extension alone is not enough for Pixel Agents. Install the Claude CLI or configure the command path.',
    );
  });

  it('launches configured Claude paths with spaces directly through terminal options', async () => {
    const commandDir = path.join(tmpDir, 'Claude CLI');
    const commandPath = path.join(commandDir, 'claude.cmd');
    fs.mkdirSync(commandDir, { recursive: true });
    fs.writeFileSync(commandPath, '');
    claudeCommandPathMock.current = commandPath;
    const harness = createLaunchHarness();

    await launchWith(harness, 'claude');

    expect(createTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shellPath: commandPath,
        shellArgs: ['--session-id', 'session-123'],
      }),
    );
    expect(harness.terminal.sendText).not.toHaveBeenCalled();
    expect(harness.agents.get(1)?.providerId).toBe('claude');
  });

  it('passes Claude handoff prompts as the final shell argument without sendText shell concatenation', async () => {
    const harness = createLaunchHarness();

    await launchWith(harness, 'claude', 'read docs/roadmap/supervision/work-packages/handoff.md');

    expect(createTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shellPath: 'claude',
        shellArgs: [
          '--session-id',
          'session-123',
          'read docs/roadmap/supervision/work-packages/handoff.md',
        ],
      }),
    );
    expect(harness.terminal.sendText).not.toHaveBeenCalled();
    expect(harness.agents.get(1)?.providerId).toBe('claude');
  });

  it('passes prompts to configured Claude paths with spaces as the final shell argument', async () => {
    const commandDir = path.join(tmpDir, 'Claude CLI');
    const commandPath = path.join(commandDir, 'claude.cmd');
    fs.mkdirSync(commandDir, { recursive: true });
    fs.writeFileSync(commandPath, '');
    claudeCommandPathMock.current = commandPath;
    const harness = createLaunchHarness();

    await launchWith(harness, 'claude', 'handoff prompt with spaces');

    expect(createTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shellPath: commandPath,
        shellArgs: ['--session-id', 'session-123', 'handoff prompt with spaces'],
      }),
    );
    expect(harness.terminal.sendText).not.toHaveBeenCalled();
    expect(harness.agents.get(1)?.providerId).toBe('claude');
  });
});
