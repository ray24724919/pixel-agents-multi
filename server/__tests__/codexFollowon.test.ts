import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentState } from '../../src/types.js';
import type { CodexThread } from '../src/providers/file/codex/codex.js';

const createTerminalMock = vi.hoisted(() => vi.fn());
const terminalListMock = vi.hoisted(() => [] as Array<{ name: string }>);
const workspaceFoldersMock = vi.hoisted(() => [
  { name: 'project', uri: { fsPath: '/workspace/project' } },
]);
const discoverAllCwdsMock = vi.hoisted(() => ({
  current: undefined as boolean | undefined,
  inspectResult: {} as {
    globalValue?: boolean;
    workspaceValue?: boolean;
    workspaceFolderValue?: boolean;
    globalLanguageValue?: boolean;
    workspaceLanguageValue?: boolean;
    workspaceFolderLanguageValue?: boolean;
  },
}));
const buildCodexLaunchCommandMock = vi.hoisted(() => vi.fn());
const findCodexThreadByIdMock = vi.hoisted(() => vi.fn());
const findLatestCodexThreadMock = vi.hoisted(() => vi.fn());
const findRecentCodexThreadsMock = vi.hoisted(() => vi.fn());
const readNewLinesMock = vi.hoisted(() => vi.fn());
const startFileWatchingMock = vi.hoisted(() => vi.fn());
const fallbackLogMessage =
  '[Pixel Agents] Codex: no workspace folder and no user-spawned agents — adopting across all cwds (default fallback). Set pixel-agents-multi.codex.discoverAllCwds=false to disable.';

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
    terminals: terminalListMock,
  },
  workspace: {
    fs: { readFile: vi.fn() },
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, fallback: boolean) => discoverAllCwdsMock.current ?? fallback),
      inspect: vi.fn((_key: string) => ({
        key: 'codex.discoverAllCwds',
        defaultValue: false,
        ...discoverAllCwdsMock.inspectResult,
      })),
    })),
    openTextDocument: vi.fn(),
    workspaceFolders: workspaceFoldersMock,
  },
}));

vi.mock('../../server/src/providers/file/codex/codex.js', async () => {
  const actual = await vi.importActual<typeof import('../src/providers/file/codex/codex.js')>(
    '../src/providers/file/codex/codex.js',
  );
  return {
    ...actual,
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
        const details = {
          input: total.input_tokens ?? 0,
          output: total.output_tokens ?? 0,
          reasoningOutput: total.reasoning_output_tokens ?? 0,
          cacheRead: 0,
          cacheWrite: 0,
          artifactEstimate: 0,
          estimated: false,
        };
        return {
          kind: 'tokenUsage',
          inputTokens: details.input,
          outputTokens: details.output + details.reasoningOutput,
          details,
        };
      }
      return { kind: 'unknown' };
    },
  };
});

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

const { launchNewTerminal, reapDuplicateExternalAgents, restoreAgents } =
  await import('../../src/agentManager.js');
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

function windowsLongPath(filePath: string): string {
  const normalized = filePath.replace(/\//g, '\\');
  if (normalized.startsWith('\\\\')) {
    return `\\\\?\\UNC\\${normalized.slice(2)}`;
  }
  return `\\\\?\\${normalized}`;
}

function setDiscoverAllCwds(value: boolean | undefined, explicit = false): void {
  discoverAllCwdsMock.current = value;
  discoverAllCwdsMock.inspectResult = explicit && value !== undefined ? { globalValue: value } : {};
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
    terminalListMock.length = 0;
    workspaceFoldersMock.splice(0, workspaceFoldersMock.length, {
      name: 'project',
      uri: { fsPath: '/workspace/project' },
    });
    setDiscoverAllCwds(undefined);
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
      'codex',
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

  it('does not rebind a spawned Codex agent to a same-cwd thread already tracked elsewhere', async () => {
    const threadAPath = path.join(tmpDir, 'thread-a.jsonl');
    const threadBPath = path.join(tmpDir, 'thread-b.jsonl');
    writeCodexTokenFile(threadAPath, 10, 2);
    writeCodexTokenFile(threadBPath, 5, 1);
    const threadA = codexThread('thread-a', threadAPath, '/workspace/project');
    const threadB = codexThread('thread-b', threadBPath, '/workspace/project');
    findLatestCodexThreadMock.mockReturnValueOnce(threadA).mockReturnValueOnce(threadB);

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
      'codex',
      '/workspace/project',
      false,
      undefined,
    );

    await vi.advanceTimersByTimeAsync(1000);
    agents.set(
      2,
      makeAgent(2, {
        sessionId: threadB.id,
        isExternal: true,
        projectDir: threadB.cwd,
        jsonlFile: threadB.rolloutPath,
      }),
    );

    await vi.advanceTimersByTimeAsync(1000);

    expect(agents.get(1)?.sessionId).toBe(threadA.id);
    expect(agents.get(1)?.jsonlFile).toBe(threadA.rolloutPath);
    expect(agents.get(2)?.sessionId).toBe(threadB.id);
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

  it('restores a Codex terminal agent and follows the latest cwd thread instead of removing it', async () => {
    const liveThreadPath = path.join(tmpDir, 'live-thread.jsonl');
    writeCodexTokenFile(liveThreadPath, 7, 3);
    terminalListMock.push({ name: 'Pixel Agent #3' });
    findLatestCodexThreadMock.mockReturnValue(
      codexThread('live-thread', liveThreadPath, '/workspace/project'),
    );
    findCodexThreadByIdMock.mockReturnValue(null);
    const agents = new Map<number, AgentState>();
    const webview = { postMessage: vi.fn() };
    const context = {
      workspaceState: {
        get: vi.fn(() => [
          {
            id: 3,
            sessionId: 'archived-thread',
            terminalName: 'Pixel Agent #3',
            isExternal: false,
            providerId: 'codex',
            jsonlFile: path.join(tmpDir, 'missing-old-thread.jsonl'),
            projectDir: '/workspace/project',
            agentName: 'Codex',
          },
        ]),
        update: vi.fn(),
      },
    } as unknown as import('vscode').ExtensionContext;

    restoreAgents(
      context,
      { current: 1 },
      { current: 1 },
      agents,
      new Set<string>(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      { current: null },
      { current: null },
      webview as unknown as import('vscode').Webview,
      vi.fn(),
    );

    expect(agents.has(3)).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    const agent = agents.get(3);
    expect(agent?.sessionId).toBe('live-thread');
    expect(agent?.jsonlFile).toBe(liveThreadPath);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(agents.has(3)).toBe(true);
  });

  it('adopts multiple external Codex top-level threads across cwd values without duplicates', () => {
    setDiscoverAllCwds(true, true);
    const provider = createProviderHarness();
    const olderPath = path.join(tmpDir, 'foo-older.jsonl');
    const latestPath = path.join(tmpDir, 'foo-latest.jsonl');
    const barPath = path.join(tmpDir, 'bar.jsonl');
    writeCodexTokenFile(olderPath, 1, 0);
    writeCodexTokenFile(latestPath, 5, 2);
    writeCodexTokenFile(barPath, 3, 1);
    const older = {
      ...codexThread('foo-older', olderPath, '/workspace/project'),
      updatedAtMs: Date.now() - 2000,
    };
    const latest = {
      ...codexThread('foo-latest', latestPath, '/workspace/project'),
      updatedAtMs: Date.now() - 1000,
    };
    const bar = codexThread('bar-thread', barPath, '/other/project');
    findRecentCodexThreadsMock.mockReturnValue([latest, older, bar]);
    findCodexThreadByIdMock.mockImplementation((id: string) => {
      if (id === latest.id) return latest;
      if (id === older.id) return older;
      if (id === bar.id) return bar;
      return null;
    });

    scanCodex(provider);

    expect(new Set([...provider.agents.values()].map((agent) => agent.sessionId))).toEqual(
      new Set(['foo-latest', 'foo-older', 'bar-thread']),
    );
    expect(
      new Map([...provider.agents.values()].map((agent) => [agent.sessionId, agent.projectDir])),
    ).toEqual(
      new Map([
        ['foo-latest', '/workspace/project'],
        ['foo-older', '/workspace/project'],
        ['bar-thread', '/other/project'],
      ]),
    );
    expect(provider.agents.size).toBe(3);

    scanCodex(provider);

    expect(provider.agents.size).toBe(3);
    expect(
      (provider.webviewView?.webview.postMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([message]) => message.type === 'agentCreated',
      ),
    ).toHaveLength(3);
  });

  it('syncs renamed Codex thread titles for tracked agents during workspace scans', () => {
    const provider = createProviderHarness();
    const threadPath = path.join(tmpDir, 'main-supervisor.jsonl');
    writeCodexTokenFile(threadPath, 1, 0);
    const renamedThread = {
      ...codexThread('thread-main-supervisor', threadPath, '/workspace/project'),
      title: 'Main Supervisor',
    };
    provider.agents.set(
      1,
      makeAgent(1, {
        sessionId: renamedThread.id,
        isExternal: true,
        projectDir: '/workspace/project',
        jsonlFile: threadPath,
        folderName: 'project',
        projectName: 'project',
        agentName: 'Old title',
      }),
    );
    provider.knownJsonlFiles.add(threadPath);
    findRecentCodexThreadsMock.mockReturnValue([renamedThread]);
    findCodexThreadByIdMock.mockImplementation((id: string) =>
      id === renamedThread.id ? renamedThread : null,
    );

    scanCodex(provider);

    expect(provider.agents.get(1)?.agentName).toBe('Main Supervisor');
    expect(provider.webviewView?.webview.postMessage).toHaveBeenCalledWith({
      type: 'agentMetadata',
      id: 1,
      folderName: 'project',
      agentName: 'Main Supervisor',
      providerId: 'codex',
      projectDir: '/workspace/project',
      projectName: 'project',
      transcriptPath: threadPath,
    });
    expect(
      (provider.webviewView?.webview.postMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([message]) => message.type === 'agentCreated',
      ),
    ).toHaveLength(0);
    expect(
      (provider as unknown as { persistAgents: ReturnType<typeof vi.fn> }).persistAgents,
    ).toHaveBeenCalled();
  });

  it('falls back to all cwd adoption with no workspace, no spawned agents, and default discoverAllCwds', () => {
    workspaceFoldersMock.splice(0, workspaceFoldersMock.length);
    setDiscoverAllCwds(undefined);
    const fooOlderPath = path.join(tmpDir, 'foo-older.jsonl');
    const fooLatestPath = path.join(tmpDir, 'foo-latest.jsonl');
    const barPath = path.join(tmpDir, 'bar.jsonl');
    writeCodexTokenFile(fooOlderPath, 1, 0);
    writeCodexTokenFile(fooLatestPath, 2, 0);
    writeCodexTokenFile(barPath, 3, 0);
    const fooOlder = {
      ...codexThread('foo-older', fooOlderPath, '/foo'),
      updatedAtMs: Date.now() - 2000,
    };
    const fooLatest = {
      ...codexThread('foo-latest', fooLatestPath, '/foo'),
      updatedAtMs: Date.now() - 1000,
    };
    const bar = codexThread('bar-thread', barPath, '/bar');
    findRecentCodexThreadsMock.mockReturnValue([fooOlder, fooLatest, bar]);
    findCodexThreadByIdMock.mockImplementation((id: string) => {
      if (id === fooOlder.id) return fooOlder;
      if (id === fooLatest.id) return fooLatest;
      if (id === bar.id) return bar;
      return null;
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const provider = createProviderHarness();
    scanCodex(provider);

    expect(logSpy).toHaveBeenCalledWith(fallbackLogMessage);
    logSpy.mockRestore();
    expect(new Set([...provider.agents.values()].map((agent) => agent.sessionId))).toEqual(
      new Set(['foo-older', 'foo-latest', 'bar-thread']),
    );
  });

  it('does not fall back when discoverAllCwds is explicitly false with no workspace', () => {
    workspaceFoldersMock.splice(0, workspaceFoldersMock.length);
    setDiscoverAllCwds(false, true);
    const fooPath = path.join(tmpDir, 'foo.jsonl');
    const barPath = path.join(tmpDir, 'bar.jsonl');
    writeCodexTokenFile(fooPath, 1, 0);
    writeCodexTokenFile(barPath, 1, 0);
    const foo = codexThread('foo-thread', fooPath, '/foo');
    const bar = codexThread('bar-thread', barPath, '/bar');
    findRecentCodexThreadsMock.mockReturnValue([foo, bar]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const provider = createProviderHarness();
    scanCodex(provider);

    expect(provider.agents.size).toBe(0);
    expect(logSpy).not.toHaveBeenCalledWith(fallbackLogMessage);
    logSpy.mockRestore();
  });

  it('keeps default workspace scope when workspace folders exist', () => {
    workspaceFoldersMock.splice(0, workspaceFoldersMock.length, {
      name: 'foo',
      uri: { fsPath: '/foo' },
    });
    setDiscoverAllCwds(undefined);
    const fooPath = path.join(tmpDir, 'foo.jsonl');
    const barPath = path.join(tmpDir, 'bar.jsonl');
    writeCodexTokenFile(fooPath, 1, 0);
    writeCodexTokenFile(barPath, 1, 0);
    const foo = codexThread('foo-thread', fooPath, '/foo');
    const bar = codexThread('bar-thread', barPath, '/bar');
    findRecentCodexThreadsMock.mockReturnValue([foo, bar]);
    findCodexThreadByIdMock.mockImplementation((id: string) => {
      if (id === foo.id) return foo;
      if (id === bar.id) return bar;
      return null;
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const provider = createProviderHarness();
    scanCodex(provider);

    expect([...provider.agents.values()].map((agent) => agent.projectDir)).toEqual(['/foo']);
    expect(logSpy).not.toHaveBeenCalledWith(fallbackLogMessage);
    logSpy.mockRestore();
  });

  it('uses workspace scope by default and discoverAllCwds when enabled', () => {
    workspaceFoldersMock.splice(0, workspaceFoldersMock.length, {
      name: 'foo',
      uri: { fsPath: '/foo' },
    });
    const fooPath = path.join(tmpDir, 'foo.jsonl');
    const barPath = path.join(tmpDir, 'bar.jsonl');
    writeCodexTokenFile(fooPath, 1, 0);
    writeCodexTokenFile(barPath, 1, 0);
    const foo = codexThread('foo-thread', fooPath, '/foo');
    const bar = codexThread('bar-thread', barPath, '/bar');
    findRecentCodexThreadsMock.mockReturnValue([foo, bar]);
    findCodexThreadByIdMock.mockImplementation((id: string) => {
      if (id === foo.id) return foo;
      if (id === bar.id) return bar;
      return null;
    });

    const defaultProvider = createProviderHarness();
    scanCodex(defaultProvider);
    expect([...defaultProvider.agents.values()].map((agent) => agent.projectDir)).toEqual(['/foo']);

    setDiscoverAllCwds(true, true);
    const discoverAllProvider = createProviderHarness();
    scanCodex(discoverAllProvider);
    expect(
      new Set([...discoverAllProvider.agents.values()].map((agent) => agent.projectDir)),
    ).toEqual(new Set(['/foo', '/bar']));
  });

  it('matches Windows namespaced Codex cwd values to plain workspace folders', () => {
    const plainCwd = 'C:\\Users\\User\\Documents\\raychen\\pixel-agents-multi';
    const namespacedCwd = `\\\\?\\${plainCwd}`;
    workspaceFoldersMock.splice(0, workspaceFoldersMock.length, {
      name: 'pixel-agents-multi',
      uri: { fsPath: plainCwd },
    });
    const threadPath = path.join(tmpDir, 'windows-cwd.jsonl');
    writeCodexTokenFile(threadPath, 1, 0);
    const thread = codexThread('windows-thread', threadPath, namespacedCwd);
    findRecentCodexThreadsMock.mockReturnValue([thread]);
    findCodexThreadByIdMock.mockReturnValue(thread);

    const provider = createProviderHarness();
    scanCodex(provider);

    expect([...provider.agents.values()].map((agent) => agent.sessionId)).toEqual([
      'windows-thread',
    ]);
  });

  it('does not duplicate an existing agent when the Codex rollout path uses a Windows namespace', () => {
    setDiscoverAllCwds(true, true);
    const provider = createProviderHarness();
    const existingPath = path.join(tmpDir, 'existing.jsonl');
    writeCodexTokenFile(existingPath, 1, 0);
    const existingThread = codexThread('existing-thread', existingPath, '/workspace/project');
    const duplicateThread = codexThread(
      'duplicate-thread',
      windowsLongPath(existingPath),
      '/workspace/project',
    );
    provider.agents.set(
      1,
      makeAgent(1, {
        sessionId: existingThread.id,
        isExternal: true,
        projectDir: '/workspace/project',
        jsonlFile: existingPath,
      }),
    );
    findRecentCodexThreadsMock.mockReturnValue([duplicateThread, existingThread]);
    findCodexThreadByIdMock.mockImplementation((id: string) => {
      if (id === existingThread.id) return existingThread;
      if (id === duplicateThread.id) return duplicateThread;
      return null;
    });

    scanCodex(provider);

    expect(provider.agents.size).toBe(1);
    expect(provider.agents.get(1)?.sessionId).toBe(existingThread.id);
    expect(
      (provider.webviewView?.webview.postMessage as ReturnType<typeof vi.fn>).mock.calls.some(
        ([message]) => message.type === 'agentCreated',
      ),
    ).toBe(false);
  });

  it('adopts same-cwd external Codex threads once the spawned agent is bound', () => {
    const provider = createProviderHarness();
    const threadPath = path.join(tmpDir, 'external.jsonl');
    const spawnedPath = path.join(tmpDir, 'spawned.jsonl');
    writeCodexTokenFile(threadPath, 1, 0);
    writeCodexTokenFile(spawnedPath, 1, 0);
    const thread = codexThread('external-thread', threadPath, '/workspace/project');
    const spawnedThread = codexThread('spawned-thread', spawnedPath, '/workspace/project');
    provider.agents.set(
      1,
      makeAgent(1, {
        sessionId: spawnedThread.id,
        isExternal: false,
        projectDir: '/workspace/project',
        jsonlFile: spawnedPath,
      }),
    );
    provider.nextAgentId.current = 2;
    findRecentCodexThreadsMock.mockReturnValue([thread, spawnedThread]);
    findCodexThreadByIdMock.mockImplementation((id: string) => {
      if (id === thread.id) return thread;
      if (id === spawnedThread.id) return spawnedThread;
      return null;
    });

    scanCodex(provider);

    expect(provider.agents.size).toBe(2);
    expect(provider.agents.get(1)?.isExternal).toBe(false);
    expect(new Set([...provider.agents.values()].map((agent) => agent.sessionId))).toEqual(
      new Set(['spawned-thread', 'external-thread']),
    );
  });

  it('adopts namespaced same-cwd Codex threads when the spawned plain-cwd agent is bound', () => {
    const provider = createProviderHarness();
    const plainCwd = 'C:\\Users\\User\\Documents\\raychen\\pixel-agents-multi';
    const namespacedCwd = `\\\\?\\${plainCwd}`;
    const threadPath = path.join(tmpDir, 'external-windows.jsonl');
    const spawnedPath = path.join(tmpDir, 'spawned-windows.jsonl');
    writeCodexTokenFile(threadPath, 1, 0);
    writeCodexTokenFile(spawnedPath, 1, 0);
    const thread = codexThread('external-windows-thread', threadPath, namespacedCwd);
    const spawnedThread = codexThread('spawned-windows-thread', spawnedPath, plainCwd);
    provider.agents.set(
      1,
      makeAgent(1, {
        sessionId: spawnedThread.id,
        isExternal: false,
        projectDir: plainCwd,
        jsonlFile: spawnedPath,
      }),
    );
    provider.nextAgentId.current = 2;
    findRecentCodexThreadsMock.mockReturnValue([thread, spawnedThread]);
    findCodexThreadByIdMock.mockImplementation((id: string) => {
      if (id === thread.id) return thread;
      if (id === spawnedThread.id) return spawnedThread;
      return null;
    });

    scanCodex(provider);

    expect(provider.agents.size).toBe(2);
    expect(provider.agents.get(1)?.sessionId).toBe(spawnedThread.id);
    expect(new Set([...provider.agents.values()].map((agent) => agent.sessionId))).toEqual(
      new Set([spawnedThread.id, thread.id]),
    );
  });

  it('reserves only the newest same-cwd Codex thread for an unbound spawned agent', () => {
    const provider = createProviderHarness();
    const olderPath = path.join(tmpDir, 'older-external.jsonl');
    const latestPath = path.join(tmpDir, 'latest-spawned.jsonl');
    writeCodexTokenFile(olderPath, 1, 0);
    writeCodexTokenFile(latestPath, 1, 0);
    const older = {
      ...codexThread('older-external-thread', olderPath, '/workspace/project'),
      updatedAtMs: Date.now() - 2000,
    };
    const latest = {
      ...codexThread('latest-spawned-thread', latestPath, '/workspace/project'),
      updatedAtMs: Date.now() - 1000,
    };
    provider.agents.set(
      1,
      makeAgent(1, {
        sessionId: 'launch-session',
        isExternal: false,
        projectDir: '/workspace/project',
        jsonlFile: '',
      }),
    );
    provider.nextAgentId.current = 2;
    findRecentCodexThreadsMock.mockReturnValue([latest, older]);
    findCodexThreadByIdMock.mockImplementation((id: string) => {
      if (id === older.id) return older;
      if (id === latest.id) return latest;
      return null;
    });

    scanCodex(provider);

    expect(provider.agents.size).toBe(2);
    expect(new Set([...provider.agents.values()].map((agent) => agent.sessionId))).toEqual(
      new Set(['launch-session', 'older-external-thread']),
    );
  });

  it('keeps multiple same-cwd external Codex agents bound to their own threads', async () => {
    const firstPath = path.join(tmpDir, 'first.jsonl');
    const secondPath = path.join(tmpDir, 'second.jsonl');
    const thirdPath = path.join(tmpDir, 'third.jsonl');
    writeCodexTokenFile(firstPath, 1, 0);
    writeCodexTokenFile(secondPath, 2, 0);
    writeCodexTokenFile(thirdPath, 3, 0);
    const first = codexThread('first-thread', firstPath, '/workspace/project');
    const second = codexThread('second-thread', secondPath, '/workspace/project');
    const third = codexThread('third-thread', thirdPath, '/workspace/project');
    findRecentCodexThreadsMock.mockReturnValue([first, second]);
    findCodexThreadByIdMock.mockImplementation((id: string) => {
      if (id === first.id) return first;
      if (id === second.id) return second;
      if (id === third.id) return third;
      return null;
    });
    findLatestCodexThreadMock.mockReturnValue(third);
    const provider = createProviderHarness();

    scanCodex(provider);
    expect(provider.agents.size).toBe(2);
    expect([...provider.agents.values()].map((agent) => agent.sessionId)).toEqual([
      'first-thread',
      'second-thread',
    ]);

    await vi.advanceTimersByTimeAsync(1000);
    expect([...provider.agents.values()].map((agent) => agent.sessionId)).toEqual([
      'first-thread',
      'second-thread',
    ]);
    expect(findLatestCodexThreadMock).not.toHaveBeenCalled();
  });
});

function createProviderHarness(): InstanceType<typeof PixelAgentsViewProvider> {
  const provider = Object.create(PixelAgentsViewProvider.prototype) as InstanceType<
    typeof PixelAgentsViewProvider
  >;
  provider.agents = new Map();
  provider.knownJsonlFiles = new Set();
  provider.fileWatchers = new Map();
  provider.pollingTimers = new Map();
  provider.waitingTimers = new Map();
  provider.permissionTimers = new Map();
  provider.jsonlPollTimers = new Map();
  provider.webviewView = {
    webview: { postMessage: vi.fn() },
  } as unknown as import('vscode').WebviewView;
  Object.assign(provider, {
    nextAgentId: { current: 1 },
    persistAgents: vi.fn(),
  });
  return provider;
}

function scanCodex(provider: InstanceType<typeof PixelAgentsViewProvider>): void {
  const providerWithPrivate = provider as unknown as { scanCodexWorkspaceThreads: () => void };
  providerWithPrivate.scanCodexWorkspaceThreads();
}

describe('reapDuplicateExternalAgents', () => {
  it('keeps one external agent per session and reaps same-session duplicates', () => {
    const agents = new Map<number, AgentState>([
      [1, makeAgent(1, { isExternal: true, sessionId: 'sess-dup', jsonlFile: '/t/dup.jsonl' })],
      [2, makeAgent(2, { isExternal: true, sessionId: 'sess-dup', jsonlFile: '/t/dup.jsonl' })],
      [3, makeAgent(3, { isExternal: true, sessionId: 'sess-uniq', jsonlFile: '/t/uniq.jsonl' })],
    ]);
    const webview = { postMessage: vi.fn() };

    reapDuplicateExternalAgents(
      agents,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
      vi.fn(),
    );

    expect(agents.size).toBe(2);
    expect(agents.has(3)).toBe(true); // distinct session untouched
    expect([agents.has(1), agents.has(2)].filter(Boolean).length).toBe(1); // exactly one dup survives
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'agentClosed',
      id: expect.any(Number),
    });
  });

  it('does not reap distinct external sessions or terminal agents', () => {
    const agents = new Map<number, AgentState>([
      [1, makeAgent(1, { isExternal: true, sessionId: 's1', jsonlFile: '/t/a.jsonl' })],
      [2, makeAgent(2, { isExternal: true, sessionId: 's2', jsonlFile: '/t/b.jsonl' })],
    ]);
    const webview = { postMessage: vi.fn() };

    reapDuplicateExternalAgents(
      agents,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
      vi.fn(),
    );

    expect(agents.size).toBe(2);
    expect(webview.postMessage).not.toHaveBeenCalled();
  });
});
