import { describe, expect, it, vi } from 'vitest';

import type { AgentState } from '../../src/types.js';

vi.mock('vscode', () => ({
  window: {
    createTerminal: vi.fn(),
    terminals: [],
  },
  workspace: {
    workspaceFolders: [],
  },
}));

const { setAgentPaused } = await import('../../src/agentManager.js');
const { postThinking } = await import('../../src/lifecycleStatus.js');

function createAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 1,
    sessionId: 'session-1',
    isExternal: false,
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
    ...overrides,
  };
}

function lifecycleStatuses(webview: { postMessage: ReturnType<typeof vi.fn> }) {
  return webview.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === 'agentLifecycleStatus');
}

describe('pause/resume lifecycle marker', () => {
  it('setAgentPaused(id, true) sets paused and posts paused lifecycle status', () => {
    const agent = createAgent();
    const agents = new Map([[agent.id, agent]]);
    const webview = { postMessage: vi.fn() };
    const persistAgents = vi.fn();

    setAgentPaused(agent.id, true, agents, webview as never, persistAgents);

    expect(agent.paused).toBe(true);
    expect(persistAgents).toHaveBeenCalledOnce();
    expect(lifecycleStatuses(webview).at(-1)).toMatchObject({
      id: agent.id,
      status: 'paused',
      label: 'Paused',
    });
  });

  it('setAgentPaused(id, false) clears paused and posts the current derived status', () => {
    const agent = createAgent({ paused: true });
    const agents = new Map([[agent.id, agent]]);
    const webview = { postMessage: vi.fn() };
    const persistAgents = vi.fn();

    setAgentPaused(agent.id, false, agents, webview as never, persistAgents);

    expect(agent.paused).toBeUndefined();
    expect(persistAgents).toHaveBeenCalledOnce();
    expect(lifecycleStatuses(webview).at(-1)).toMatchObject({
      id: agent.id,
      status: 'idle',
      label: 'Idle',
    });
  });

  it('postThinking emits paused while the agent is paused', () => {
    const agent = createAgent({ paused: true });
    const webview = { postMessage: vi.fn() };

    postThinking(webview as never, agent.id, agent);

    expect(lifecycleStatuses(webview).at(-1)).toMatchObject({
      id: agent.id,
      status: 'paused',
      label: 'Paused',
    });
  });

  it('postThinking emits thinking after resume clears the pause marker', () => {
    const agent = createAgent({ paused: true });
    const agents = new Map([[agent.id, agent]]);
    const webview = { postMessage: vi.fn() };

    setAgentPaused(agent.id, false, agents, webview as never, vi.fn());
    postThinking(webview as never, agent.id, agent);

    expect(lifecycleStatuses(webview).at(-1)).toMatchObject({
      id: agent.id,
      status: 'thinking',
      label: 'Thinking',
    });
  });
});
