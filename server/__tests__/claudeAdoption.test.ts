import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentState } from '../../src/types.js';

const showChatSessionsMock = vi.hoisted(() => ({ current: false }));

vi.mock('vscode', () => ({
  window: {
    terminals: [],
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, fallback: boolean) =>
        key === 'claude.showChatSessions' ? showChatSessionsMock.current : fallback,
      ),
    })),
    workspaceFolders: [],
  },
}));

const { adoptExternalSessionFromHook, isClaudeChatSession } =
  await import('../../src/fileWatcher.js');
const { processTranscriptLine } = await import('../../src/transcriptParser.js');

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'claude-modes',
);

function makeAgent(id: number, jsonlFile: string): AgentState {
  return {
    id,
    sessionId: path.basename(jsonlFile, '.jsonl'),
    isExternal: false,
    providerId: 'claude',
    projectDir: path.dirname(jsonlFile),
    jsonlFile,
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
  };
}

describe('Claude adoption dedup and titles', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-claude-adoption-'));
    showChatSessionsMock.current = false;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not create a second Claude agent when a hook reports an already tracked JSONL', () => {
    const jsonlFile = path.join(tmpDir, 'session-1.jsonl');
    fs.writeFileSync(jsonlFile, '');
    const agents = new Map<number, AgentState>([[1, makeAgent(1, jsonlFile)]]);

    adoptExternalSessionFromHook(
      'session-1',
      jsonlFile,
      tmpDir,
      new Set<string>(),
      { current: 2 },
      agents,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      undefined,
      vi.fn(),
    );

    expect(agents.size).toBe(1);
    expect(agents.get(1)?.jsonlFile).toBe(jsonlFile);
  });

  it('derives a regular Claude agent title from the first user message in the JSONL header', () => {
    const jsonlFile = path.join(tmpDir, 'session-2.jsonl');
    fs.writeFileSync(
      jsonlFile,
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'do something specific with this repository' }],
        },
      }) + '\n',
    );
    const agents = new Map<number, AgentState>();
    const webview = { postMessage: vi.fn() };

    adoptExternalSessionFromHook(
      'session-2',
      jsonlFile,
      tmpDir,
      new Set<string>(),
      { current: 1 },
      agents,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
      vi.fn(),
    );

    const agent = agents.get(1);
    expect(agent?.agentName).toBe('do something specific with this repository'.slice(0, 40));
    expect(agent?.claudeTitleResolved).toBe(true);
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCreated',
        agentName: 'do something specific with this repository'.slice(0, 40),
      }),
    );
  });

  it('updates a placeholder Claude title when a later user message arrives', () => {
    const jsonlFile = path.join(tmpDir, 'session-3.jsonl');
    const agent = makeAgent(1, jsonlFile);
    const agents = new Map<number, AgentState>([[1, agent]]);
    const webview = { postMessage: vi.fn() };

    processTranscriptLine(
      1,
      JSON.stringify({
        type: 'user',
        role: 'user',
        content: 'please list the files in this directory',
      }),
      agents,
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
    );

    expect(agent.agentName).toBe('please list the files in this directory');
    expect(agent.claudeTitleResolved).toBe(true);
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentMetadata',
        agentName: 'please list the files in this directory',
      }),
    );
  });

  it('detects chat-mode JSONL headers without flagging code or cowork fixtures', () => {
    expect(isClaudeChatSession(path.join(fixturesDir, 'chat.jsonl'))).toBe(true);
    expect(isClaudeChatSession(path.join(fixturesDir, 'code.jsonl'))).toBe(false);
    expect(isClaudeChatSession(path.join(fixturesDir, 'cowork.jsonl'))).toBe(false);
    expect(
      isClaudeChatSession(path.join(fixturesDir, 'chat.jsonl'), {
        sessionId: 'cowork-session',
        projectName: 'Cowork Project',
        agentName: 'Cowork Lead',
      }),
    ).toBe(false);
  });

  it('does not adopt a Claude chat-mode JSONL when showChatSessions is false', () => {
    const jsonlFile = copyFixture('chat.jsonl', tmpDir, 'chat-session.jsonl');
    const agents = new Map<number, AgentState>();
    const webview = { postMessage: vi.fn() };
    const nextAgentId = { current: 1 };

    adoptExternalSessionFromHook(
      'chat-session',
      jsonlFile,
      tmpDir,
      new Set<string>(),
      nextAgentId,
      agents,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
      vi.fn(),
    );

    expect(agents.size).toBe(0);
    expect(nextAgentId.current).toBe(1);
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agentCreated' }),
    );
  });

  it('adopts a Claude chat-mode JSONL when showChatSessions is true', () => {
    showChatSessionsMock.current = true;
    const jsonlFile = copyFixture('chat.jsonl', tmpDir, 'chat-session.jsonl');
    const agents = new Map<number, AgentState>();
    const webview = { postMessage: vi.fn() };

    adoptExternalSessionFromHook(
      'chat-session',
      jsonlFile,
      tmpDir,
      new Set<string>(),
      { current: 1 },
      agents,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
      vi.fn(),
    );

    const agent = agents.get(1);
    expect(agent?.sessionId).toBe('chat-session');
    expect(agent?.jsonlFile).toBe(jsonlFile);
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agentCreated', providerId: 'claude' }),
    );
  });

  it('keeps Claude code and cowork sessions outside the chat filter', () => {
    const codeFile = copyFixture('code.jsonl', tmpDir, 'code-session.jsonl');
    const coworkFile = path.join(fixturesDir, 'cowork.jsonl');
    const agents = new Map<number, AgentState>();

    adoptExternalSessionFromHook(
      'code-session',
      codeFile,
      tmpDir,
      new Set<string>(),
      { current: 1 },
      agents,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      undefined,
      vi.fn(),
    );

    expect(agents.get(1)?.sessionId).toBe('code-session');
    expect(isClaudeChatSession(coworkFile)).toBe(false);
  });
});

function copyFixture(name: string, tmpDir: string, targetName: string): string {
  const target = path.join(tmpDir, targetName);
  fs.copyFileSync(path.join(fixturesDir, name), target);
  return target;
}
