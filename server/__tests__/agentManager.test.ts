import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentState } from '../../src/types.js';

const createTerminalMock = vi.hoisted(() => vi.fn());
const showWarningMessageMock = vi.hoisted(() => vi.fn());
const spawnSyncMock = vi.hoisted(() => vi.fn());
const claudeCommandPathMock = vi.hoisted(() => ({ current: 'claude' }));
const codexCommandPathMock = vi.hoisted(() => ({ current: 'codex' }));
const buildCodexLaunchCommandMock = vi.hoisted(() => vi.fn());
const buildCodexLaunchArgsMock = vi.hoisted(() => vi.fn());
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
        key === 'claude.commandPath'
          ? claudeCommandPathMock.current
          : key === 'codex.commandPath'
            ? codexCommandPathMock.current
            : fallback,
      ),
    })),
    workspaceFolders: [{ uri: { fsPath: '/workspace/project' } }],
  },
}));

vi.mock('child_process', () => ({
  spawnSync: spawnSyncMock,
}));

vi.mock('../../server/src/providers/file/codex/codex.js', () => ({
  buildCodexLaunchArgs: buildCodexLaunchArgsMock,
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
  let originalLocalAppData: string | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'session-123') });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-agent-manager-'));
    originalLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = tmpDir;
    createTerminalMock.mockReset();
    showWarningMessageMock.mockReset();
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({ status: 0 });
    claudeCommandPathMock.current = 'claude';
    codexCommandPathMock.current = 'codex';
    buildCodexLaunchArgsMock.mockReset();
    buildCodexLaunchArgsMock.mockReturnValue([
      '--cd',
      '/workspace/project',
      '--no-alt-screen',
      'summarize tests',
    ]);
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
    if (originalLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = originalLocalAppData;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches Claude with the original session-id command and agent metadata', async () => {
    const harness = createLaunchHarness();

    await launchWith(harness, 'claude');

    expect(createTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Claude #1',
      }),
    );
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

  it('launches Codex without a handoff prompt through the existing Codex command builder', async () => {
    const harness = createLaunchHarness();

    await launchWith(harness, 'codex');

    expect(createTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Codex #1',
      }),
    );
    expect(buildCodexLaunchCommandMock).toHaveBeenCalledWith(
      '/workspace/project',
      false,
      undefined,
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

  it('passes Codex handoff prompts as shell arguments through a resolved executable path', async () => {
    const resolvedCodex =
      process.platform === 'win32' ? 'C:\\Tools\\codex.exe' : '/opt/codex/bin/codex';
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout:
        process.platform === 'win32'
          ? 'C:\\Tools\\codex\r\nC:\\Tools\\codex.exe\r\n'
          : '/opt/codex/bin/codex\n',
    });
    buildCodexLaunchArgsMock.mockReturnValue([
      '--cd',
      '/workspace/project',
      '--no-alt-screen',
      'handoff prompt with spaces',
    ]);
    const harness = createLaunchHarness();

    await launchWith(harness, 'codex', 'handoff prompt with spaces');

    expect(createTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Codex #1',
        shellPath: resolvedCodex,
        shellArgs: ['--cd', '/workspace/project', '--no-alt-screen', 'handoff prompt with spaces'],
      }),
    );
    expect(buildCodexLaunchArgsMock).toHaveBeenCalledWith(
      '/workspace/project',
      false,
      'handoff prompt with spaces',
    );
    expect(harness.terminal.sendText).not.toHaveBeenCalled();
    expect(harness.agents.get(1)?.providerId).toBe('codex');
  });

  it('does not create a Codex handoff executor agent when the CLI is missing', async () => {
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '' });
    const harness = createLaunchHarness();

    await launchWith(harness, 'codex', 'handoff executor prompt');

    expect(createTerminalMock).not.toHaveBeenCalled();
    expect(harness.agents.size).toBe(0);
    expect(harness.persistAgents).not.toHaveBeenCalled();
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'Codex CLI was not found. Install the Codex CLI or make sure the codex command is available before launching a handoff executor.',
    );
  });

  it('falls back to the local Windows Codex app install when PATH lookup misses', async () => {
    if (process.platform !== 'win32') return;
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '' });
    const codexDir = path.join(tmpDir, 'OpenAI', 'Codex', 'bin', 'version-1');
    const codexExe = path.join(codexDir, 'codex.exe');
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(codexExe, '');
    buildCodexLaunchArgsMock.mockReturnValue([
      '--cd',
      '/workspace/project',
      '--no-alt-screen',
      'handoff prompt',
    ]);
    const harness = createLaunchHarness();

    await launchWith(harness, 'codex', 'handoff prompt');

    expect(createTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Codex #1',
        shellPath: codexExe,
        shellArgs: ['--cd', '/workspace/project', '--no-alt-screen', 'handoff prompt'],
      }),
    );
    expect(harness.terminal.sendText).not.toHaveBeenCalled();
    expect(harness.agents.get(1)?.providerId).toBe('codex');
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
        name: 'Claude #1',
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
        name: 'Claude #1',
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
        name: 'Claude #1',
        shellPath: commandPath,
        shellArgs: ['--session-id', 'session-123', 'handoff prompt with spaces'],
      }),
    );
    expect(harness.terminal.sendText).not.toHaveBeenCalled();
    expect(harness.agents.get(1)?.providerId).toBe('claude');
  });
});
