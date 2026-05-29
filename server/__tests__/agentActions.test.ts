import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentState, ArchivedAgentRecord } from '../../src/types.js';

const archiveCodexThreadMock = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn(), registerCommand: vi.fn() },
  env: { openExternal: vi.fn() },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
      fsPath: [base.fsPath, ...segments].join('/'),
    }),
  },
  window: {
    createTerminal: vi.fn(),
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
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, fallback: boolean) => fallback),
      inspect: vi.fn(() => ({ key: 'codex.discoverAllCwds', defaultValue: false })),
    })),
    openTextDocument: vi.fn(),
    workspaceFolders: [{ name: 'project', uri: { fsPath: '/workspace/project' } }],
  },
}));

vi.mock('../../server/src/providers/file/codex/codex.js', () => ({
  archiveCodexThread: archiveCodexThreadMock,
  buildCodexLaunchCommand: vi.fn(),
  findCodexThreadById: vi.fn(),
  findLatestCodexThread: vi.fn(),
  findRecentCodexThreads: vi.fn(() => []),
}));

const { WORKSPACE_KEY_ARCHIVED_AGENTS } = await import('../../src/constants.js');
const { PixelAgentsViewProvider } = await import('../../src/PixelAgentsViewProvider.js');

type AgentAction = 'hide' | 'archive' | 'kill';

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 1,
    sessionId: 'session-1',
    terminalRef: {
      name: 'Pixel Agent #1',
      dispose: vi.fn(),
    } as unknown as import('vscode').Terminal,
    isExternal: false,
    providerId: 'claude',
    projectDir: '/workspace/project',
    jsonlFile: '/workspace/project/session-1.jsonl',
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
    agentName: 'Claude',
    projectName: 'project',
    ...overrides,
  };
}

function createProviderHarness(agent: AgentState): {
  provider: InstanceType<typeof PixelAgentsViewProvider>;
  webview: { postMessage: ReturnType<typeof vi.fn> };
  workspaceState: Map<string, unknown>;
  persistAgents: ReturnType<typeof vi.fn>;
} {
  const workspaceState = new Map<string, unknown>();
  const context = {
    workspaceState: {
      get: vi.fn((key: string, fallback: unknown) =>
        workspaceState.has(key) ? workspaceState.get(key) : fallback,
      ),
      update: vi.fn((key: string, value: unknown) => {
        if (value === undefined) {
          workspaceState.delete(key);
        } else {
          workspaceState.set(key, value);
        }
        return Promise.resolve();
      }),
    },
  };
  const webview = { postMessage: vi.fn() };
  const provider = Object.create(PixelAgentsViewProvider.prototype) as InstanceType<
    typeof PixelAgentsViewProvider
  >;
  provider.agents = new Map([[agent.id, agent]]);
  provider.knownJsonlFiles = new Set();
  provider.fileWatchers = new Map();
  provider.pollingTimers = new Map();
  provider.waitingTimers = new Map();
  provider.permissionTimers = new Map();
  provider.jsonlPollTimers = new Map();
  provider.webviewView = { webview } as unknown as import('vscode').WebviewView;
  const persistAgents = vi.fn();
  Object.assign(provider, {
    context,
    hookEventHandler: null,
    persistAgents,
  });
  return { provider, webview, workspaceState, persistAgents };
}

function runAction(
  provider: InstanceType<typeof PixelAgentsViewProvider>,
  id: number,
  action: AgentAction,
): void {
  (
    provider as unknown as {
      handleAgentAction: (agentId: number, agentAction: AgentAction) => void;
    }
  ).handleAgentAction(id, action);
}

function timelineKinds(webview: { postMessage: ReturnType<typeof vi.fn> }): string[] {
  return webview.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === 'agentTimelineEvent')
    .map((message) => message.event.kind as string);
}

describe('agent Hide / Archive / Kill actions', () => {
  beforeEach(() => {
    archiveCodexThreadMock.mockReset();
  });

  it('hide sets hidden, persists, and keeps the agent active', () => {
    const agent = makeAgent();
    const { provider, webview, persistAgents } = createProviderHarness(agent);

    runAction(provider, agent.id, 'hide');

    expect(agent.hidden).toBe(true);
    expect(provider.agents.has(agent.id)).toBe(true);
    expect(persistAgents).toHaveBeenCalledOnce();
    expect(agent.terminalRef?.dispose).not.toHaveBeenCalled();
    expect(archiveCodexThreadMock).not.toHaveBeenCalled();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'agentLifecycleHidden',
      id: agent.id,
      hidden: true,
    });
    expect(timelineKinds(webview)).toContain('action.hide');
  });

  it('archive removes the active agent and stores an archived record', () => {
    const agent = makeAgent({ agentName: 'Archive Me' });
    const { provider, webview, workspaceState } = createProviderHarness(agent);

    runAction(provider, agent.id, 'archive');

    expect(provider.agents.has(agent.id)).toBe(false);
    expect(agent.terminalRef?.dispose).not.toHaveBeenCalled();
    const archived = workspaceState.get(WORKSPACE_KEY_ARCHIVED_AGENTS) as ArchivedAgentRecord[];
    expect(archived).toHaveLength(1);
    expect(archived[0]).toMatchObject({
      id: agent.id,
      sessionId: agent.sessionId,
      jsonlFile: agent.jsonlFile,
      archived: true,
      archiveReason: 'archive',
      agentName: 'Archive Me',
    });
    expect(provider.knownJsonlFiles.has(agent.jsonlFile)).toBe(true);
    expect(webview.postMessage).toHaveBeenCalledWith({ type: 'agentArchived', id: agent.id });
    expect(timelineKinds(webview)).toContain('action.archive');
  });

  it('kill disposes the terminal, removes the agent, and archives Codex threads', () => {
    const agent = makeAgent({
      providerId: 'codex',
      sessionId: 'codex-thread-1',
      agentName: 'Codex',
    });
    const { provider, webview } = createProviderHarness(agent);

    runAction(provider, agent.id, 'kill');

    expect(agent.terminalRef?.dispose).toHaveBeenCalledOnce();
    expect(archiveCodexThreadMock).toHaveBeenCalledWith('codex-thread-1');
    expect(provider.agents.has(agent.id)).toBe(false);
    expect(webview.postMessage).toHaveBeenCalledWith({ type: 'agentClosed', id: agent.id });
    expect(timelineKinds(webview)).toContain('action.kill');
  });
});
