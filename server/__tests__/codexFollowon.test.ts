import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentState } from '../../src/types.js';
import type { CodexThread } from '../src/providers/file/codex/codex.js';

const createTerminalMock = vi.hoisted(() => vi.fn());
const buildCodexLaunchCommandMock = vi.hoisted(() => vi.fn());
const findCodexThreadByIdMock = vi.hoisted(() => vi.fn());
const findLatestCodexThreadMock = vi.hoisted(() => vi.fn());
const findRecentCodexThreadsMock = vi.hoisted(() => vi.fn());
const readNewLinesMock = vi.hoisted(() => vi.fn());
const startFileWatchingMock = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn(), registerCommand: vi.fn() },
  env: { openExternal: vi.fn() },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
      fsPath: path.join(base.fsPath, ...segments),
    }),
  },
  window: {
    createTerminal: createTerminalMock,
    onDidChangeActiveTerminal: vi.fn(),
    onDidCloseTerminal: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showTextDocument: vi.fn(),
    showWarningMessage: vi.fn(),
    terminals: [],
  },
  workspace: {
    fs: { readFile: vi.fn() },
    openTextDocument: vi.fn(),
    workspaceFolders: [{ name: 'project', uri: { fsPath: '/workspace/project' } }],
  },
}));

vi.mock('../../server/src/providers/file/codex/codex.js', () => ({
  archiveCodexThread: vi.fn(),
  buildCodexLaunchCommand: buildCodexLaunchCommandMock,
  findCodexThreadById: findCodexThreadByIdMock,
  findLatestCodexThread: findLatestCodexThreadMock,
  findRecentCodexThreads: findRecentCodexThreadsMock,
  parseCodexTranscriptLine: (line: string) => {
    const record = JSON.parse(line) as {
      type?: string;
      payload?: { type?: string; info?: { total_token_usage?: Record<string, number> } };
    };
    const total = record.payload?.info?.total_token_usage;
    if (record.type === 'event_msg' && record.payload?.type === 'token_count' && total) {
      return {
        kind: 'tokenUsage',
        inputTokens: total.input_tokens ?? 0,
        outputTokens: (total.output_tokens ?? 0) + (total.reasoning_output_tokens ?? 0),
      };
    }
    return { kind: 'unknown' };
  },
}));

vi.mock('../../src/fileWatcher.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/fileWatcher.js')>(
    '../../src/fileWatcher.js',
  );
  return {
    ...actual,
    readNewLines: readNewLinesMock,
    startFileWatching: startFileWatchingMock,
  };
});

const { launchNewTerminal } = await import('../../src/agentManager.js');
const { getLiveCodexThreadIdsForSpawnedAgentCwds, PixelAgentsViewProvider } =
  await import('../../src/PixelAgentsViewProvider.js');
const { processTranscriptLine } = await import('../../src/transcriptParser.js');

function writeCodexTokenFile(filePath: string, inputTokens: number, outputTokens: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            reasoning_output_tokens: 0,
          },
        },
      },
    }) + '\n',
  );
}

function codexThread(id: string, rolloutPath: string, cwd: string): CodexThread {
  return {
    id,
    rolloutPath,
    cwd,
    title: id,
    updatedAtMs: Date.now(),
    tokensUsed: 0,
  };
}

function makeAgent(id: number, overrides: Partial<AgentState>): AgentState {
  return {
    id,
    sessionId: `thread-${id}`,
    isExternal: false,
    providerId: 'codex',
    projectDir: '/workspace/project',
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
    hookDelivered: false,
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

describe('Codex thread follow-on', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'launch-session') });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-codex-followon-'));
    createTerminalMock.mockReset();
    createTerminalMock.mockReturnValue({
      name: 'Pixel Agent #1',
      show: vi.fn(),
      sendText: vi.fn(),
    });
    buildCodexLaunchCommandMock.mockReset();
    buildCodexLaunchCommandMock.mockReturnValue('codex --cd /workspace/project --no-alt-screen');
    findCodexThreadByIdMock.mockReset();
    findLatestCodexThreadMock.mockReset();
    findRecentCodexThreadsMock.mockReset();
    readNewLinesMock.mockReset();
    startFileWatchingMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('switches a spawned Codex agent to the newest same-cwd thread and keeps cumulative tokens', async () => {
    const threadAPath = path.join(tmpDir, 'thread-a.jsonl');
    const threadBPath = path.join(tmpDir, 'thread-b.jsonl');
    writeCodexTokenFile(threadAPath, 10, 2);
    writeCodexTokenFile(threadBPath, 5, 1);
    findLatestCodexThreadMock
      .mockReturnValueOnce(codexThread('thread-a', threadAPath, '/workspace/project'))
      .mockReturnValueOnce(codexThread('thread-b', threadBPath, '/workspace/project'));

    const agents = new Map<number, AgentState>();
    const webview = { postMessage: vi.fn() };
    await launchNewTerminal(
      { current: 1 },
      { current: 1 },
      agents,
      { current: null },
      new Set<string>(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      { current: null },
      webview as unknown as import('vscode').Webview,
      vi.fn(),
      '/workspace/project',
      false,
      undefined,
    );

    await vi.advanceTimersByTimeAsync(1000);
    const agent = agents.get(1);
    expect(agent?.sessionId).toBe('thread-a');
    expect(agent?.inputTokens).toBe(10);
    expect(agent?.outputTokens).toBe(2);

    agent!.activeToolIds.add('tool-1');
    agent!.activeToolStatuses.set('tool-1', 'Running tool');
    agent!.activeToolNames.set('tool-1', 'shell');
    agent!.permissionSent = true;
    agent!.hadToolsInTurn = true;
    agent!.isWaiting = true;
    agent!.inputTokens = 100;
    agent!.outputTokens = 20;

    await vi.advanceTimersByTimeAsync(1000);

    expect(agent?.sessionId).toBe('thread-b');
    expect(agent?.jsonlFile).toBe(threadBPath);
    expect(agent?.fileOffset).toBe(fs.statSync(threadBPath).size);
    expect(agent?.activeToolIds.size).toBe(0);
    expect(agent?.permissionSent).toBe(false);
    expect(agent?.hadToolsInTurn).toBe(false);
    expect(agent?.isWaiting).toBe(false);
    expect(agent?.codexInputTokenBase).toBe(100);
    expect(agent?.codexOutputTokenBase).toBe(20);

    processTranscriptLine(
      1,
      fs.readFileSync(threadBPath, 'utf8').trim(),
      agents,
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
    );
    expect(agent?.inputTokens).toBe(105);
    expect(agent?.outputTokens).toBe(21);
  });

  it('does not treat external Codex threads as live unless their cwd has a spawned agent', () => {
    const agents = new Map<number, AgentState>();
    const threadX = codexThread('thread-x', '/tmp/x.jsonl', '/workspace/project');
    const threadY = codexThread('thread-y', '/tmp/y.jsonl', '/other/project');

    expect(getLiveCodexThreadIdsForSpawnedAgentCwds(agents, [threadX, threadY])).toEqual(new Set());

    agents.set(1, makeAgent(1, { isExternal: false, projectDir: '/workspace/project' }));
    expect(getLiveCodexThreadIdsForSpawnedAgentCwds(agents, [threadX, threadY])).toEqual(
      new Set(['thread-x']),
    );
  });

  it('keeps stale cleanup scoped to cwds with a user-spawned Codex agent', () => {
    const provider = Object.create(PixelAgentsViewProvider.prototype) as InstanceType<
      typeof PixelAgentsViewProvider
    >;
    const webview = { postMessage: vi.fn() };
    provider.agents = new Map();
    provider.knownJsonlFiles = new Set();
    provider.fileWatchers = new Map();
    provider.pollingTimers = new Map();
    provider.waitingTimers = new Map();
    provider.permissionTimers = new Map();
    provider.jsonlPollTimers = new Map();
    provider.webviewView = { webview } as unknown as import('vscode').WebviewView;
    Object.assign(provider, { persistAgents: vi.fn() });

    const cwdXPath = path.join(tmpDir, 'thread-x.jsonl');
    const cwdYPath = path.join(tmpDir, 'thread-y.jsonl');
    writeCodexTokenFile(cwdXPath, 1, 0);
    writeCodexTokenFile(cwdYPath, 1, 0);
    provider.agents.set(
      1,
      makeAgent(1, {
        sessionId: 'thread-x',
        isExternal: false,
        projectDir: '/workspace/project',
        jsonlFile: cwdXPath,
      }),
    );
    provider.agents.set(
      2,
      makeAgent(2, {
        sessionId: 'thread-y',
        isExternal: true,
        projectDir: '/other/project',
        jsonlFile: cwdYPath,
      }),
    );
    findCodexThreadByIdMock.mockImplementation((id: string) => {
      if (id === 'thread-x') return codexThread('thread-x', cwdXPath, '/workspace/project');
      if (id === 'thread-y') return codexThread('thread-y', cwdYPath, '/other/project');
      return null;
    });

    const providerWithPrivate = provider as unknown as {
      removeStaleCodexAgents: (threadIds: Set<string>) => void;
    };
    providerWithPrivate.removeStaleCodexAgents(new Set(['thread-x']));

    expect(provider.agents.has(1)).toBe(true);
    expect(provider.agents.has(2)).toBe(false);
    expect(webview.postMessage).toHaveBeenCalledWith({ type: 'agentClosed', id: 2 });
  });
});
