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

const {
  adoptExternalSessionFromHook,
  getClaudeCoworkSessionsRoot,
  isClaudeChatSession,
  scanClaudeCoworkSessions,
} = await import('../../src/fileWatcher.js');
const { clearClaudeCodeSessionMetadataCache, getClaudeCodeSessionsRoot } =
  await import('../../src/claudeCodeSessionMetadata.js');
const { PixelAgentsViewProvider } = await import('../../src/PixelAgentsViewProvider.js');
const { processTranscriptLine } = await import('../../src/transcriptParser.js');
const vscode = await import('vscode');

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
    vi.unstubAllEnvs();
    clearClaudeCodeSessionMetadataCache();
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

  it('does not adopt a Claude cowork / local-agent-mode sandbox session via the hook path', () => {
    // Cowork sandboxes inherit the global hook and fire it with a cwd/transcript under
    // .../Claude/local-agent-mode-sessions/.../local_<id>/outputs. They must never become agents here.
    const sandboxDir = path.join(
      tmpDir,
      'Claude',
      'local-agent-mode-sessions',
      'sess',
      'sub',
      'local_abc',
      'outputs',
    );
    fs.mkdirSync(sandboxDir, { recursive: true });
    const jsonlFile = path.join(sandboxDir, 'transcript.jsonl');
    fs.writeFileSync(
      jsonlFile,
      JSON.stringify({ type: 'attachment', sessionId: 'local_abc', cwd: sandboxDir }) + '\n',
    );
    const agents = new Map<number, AgentState>();

    adoptExternalSessionFromHook(
      'local_abc',
      jsonlFile,
      sandboxDir,
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

    expect(agents.size).toBe(0);
  });

  it('does not adopt a sandbox session reported by cwd alone (no transcript path)', () => {
    const sandboxCwd = path.join(
      tmpDir,
      'Claude',
      'local-agent-mode-sessions',
      'sess',
      'sub',
      'local_def',
      'outputs',
    );
    const agents = new Map<number, AgentState>();

    adoptExternalSessionFromHook(
      'local_def',
      undefined,
      sandboxCwd,
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

    expect(agents.size).toBe(0);
  });

  it('prefers an explicit Claude title over the first user message in the JSONL header', () => {
    const jsonlFile = path.join(tmpDir, 'session-2.jsonl');
    fs.writeFileSync(
      jsonlFile,
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'do something specific with this repository' }],
        },
      }) +
        '\n' +
        JSON.stringify({ type: 'attachment', sessionId: 'session-2', cwd: tmpDir }) +
        '\n' +
        JSON.stringify({ type: 'ai-title', sessionId: 'session-2', title: 'Repository review' }) +
        '\n',
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
    expect(agent?.agentName).toBe('Repository review');
    expect(agent?.claudeTitleResolved).toBe(true);
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCreated',
        agentName: 'Repository review',
      }),
    );
  });

  it('uses a user prompt as a provisional title and replaces it when an explicit title arrives', () => {
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
    expect(agent.claudeTitleResolved).toBe(false);
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentMetadata',
        agentName: 'please list the files in this directory',
      }),
    );

    processTranscriptLine(
      1,
      JSON.stringify({ type: 'ai-title', sessionId: 'session-3', title: 'Directory listing' }),
      agents,
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
    );

    expect(agent.agentName).toBe('Directory listing');
    expect(agent.claudeTitleResolved).toBe(true);
    expect(webview.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'agentMetadata',
        agentName: 'Directory listing',
      }),
    );
  });

  it('labels Claude Desktop Code sessions without prompt-derived names when no title exists yet', () => {
    const jsonlFile = path.join(tmpDir, 'session-desktop-code.jsonl');
    fs.writeFileSync(
      jsonlFile,
      JSON.stringify({
        type: 'queue-operation',
        operation: 'enqueue',
        sessionId: 'session-desktop-code',
        content: '先了解一下這個專案，我想使用 claude design',
      }) +
        '\n' +
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: '先了解一下這個專案，我想使用 claude design',
          },
          entrypoint: 'claude-desktop',
          promptSource: 'sdk',
          cwd: tmpDir,
          sessionId: 'session-desktop-code',
        }) +
        '\n' +
        JSON.stringify({
          type: 'attachment',
          entrypoint: 'claude-desktop',
          cwd: tmpDir,
          sessionId: 'session-desktop-code',
        }) +
        '\n',
    );
    const agents = new Map<number, AgentState>();
    const webview = { postMessage: vi.fn() };

    adoptExternalSessionFromHook(
      'session-desktop-code',
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
    expect(agent?.agentName).toBe('Claude Code');
    expect(agent?.claudeTitleResolved).toBe(false);
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCreated',
        agentName: 'Claude Code',
      }),
    );
  });

  it('uses the Claude Code desktop metadata title when adopting a desktop code session', () => {
    vi.stubEnv('APPDATA', tmpDir);
    const projectDir = path.join(tmpDir, 'animfy_gs1');
    fs.mkdirSync(projectDir, { recursive: true });
    const sessionId = 'session-desktop-code-title';
    writeClaudeCodeMetadata(tmpDir, {
      cliSessionId: sessionId,
      cwd: projectDir,
      title: 'Landing page redesign',
      lastActivityAt: 200,
    });
    const jsonlFile = path.join(tmpDir, `${sessionId}.jsonl`);
    fs.writeFileSync(
      jsonlFile,
      JSON.stringify({
        type: 'queue-operation',
        operation: 'enqueue',
        sessionId,
        content: 'first user prompt should not become the title',
      }) +
        '\n' +
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: 'first user prompt should not become the title',
          },
          entrypoint: 'claude-desktop',
          promptSource: 'sdk',
          cwd: projectDir,
          sessionId,
        }) +
        '\n',
    );
    const agents = new Map<number, AgentState>();
    const webview = { postMessage: vi.fn() };

    adoptExternalSessionFromHook(
      sessionId,
      jsonlFile,
      projectDir,
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
    expect(agent?.agentName).toBe('Landing page redesign');
    expect(agent?.claudeTitleResolved).toBe(true);
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCreated',
        agentName: 'Landing page redesign',
      }),
    );
  });

  it('does not derive a live Claude Desktop Code title from a prompt line', () => {
    const jsonlFile = path.join(tmpDir, 'session-live-desktop-code.jsonl');
    const agent = makeAgent(1, jsonlFile);
    const agents = new Map<number, AgentState>([[1, agent]]);
    const webview = { postMessage: vi.fn() };

    processTranscriptLine(
      1,
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: '先了解一下這個專案，我想使用 claude design',
        },
        entrypoint: 'claude-desktop',
        promptSource: 'sdk',
      }),
      agents,
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
    );

    expect(agent.agentName).toBe('Claude Code');
    expect(agent.claudeTitleResolved).toBe(false);
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentMetadata',
        agentName: 'Claude Code',
      }),
    );
  });

  it('updates a live Claude Desktop Code agent from Claude Code desktop metadata', () => {
    vi.stubEnv('APPDATA', tmpDir);
    const projectDir = path.join(tmpDir, 'animfy_gs1');
    fs.mkdirSync(projectDir, { recursive: true });
    const sessionId = 'session-live-desktop-code-title';
    writeClaudeCodeMetadata(tmpDir, {
      cliSessionId: sessionId,
      cwd: projectDir,
      title: 'Landing page redesign',
      lastActivityAt: 300,
    });
    const jsonlFile = path.join(tmpDir, `${sessionId}.jsonl`);
    const agent = {
      ...makeAgent(1, jsonlFile),
      projectDir,
      agentName: 'Claude Code',
      claudeTitleResolved: false,
    };
    const agents = new Map<number, AgentState>([[1, agent]]);
    const webview = { postMessage: vi.fn() };

    processTranscriptLine(
      1,
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: 'first user prompt should not become the title',
        },
        entrypoint: 'claude-desktop',
        promptSource: 'sdk',
        cwd: projectDir,
        sessionId,
      }),
      agents,
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
    );

    expect(agent.agentName).toBe('Landing page redesign');
    expect(agent.claudeTitleResolved).toBe(true);
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentMetadata',
        agentName: 'Landing page redesign',
      }),
    );
  });

  it('repairs a persisted Claude Desktop Code prompt-derived title on replay', () => {
    const jsonlFile = path.join(tmpDir, 'session-persisted-desktop-code.jsonl');
    const agent = {
      ...makeAgent(1, jsonlFile),
      agentName: '先了解一下這個專案，我想使用 claude design',
      claudeTitleResolved: true,
    };
    const agents = new Map<number, AgentState>([[1, agent]]);
    const webview = { postMessage: vi.fn() };

    processTranscriptLine(
      1,
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: '先了解一下這個專案，我想使用 claude design',
        },
        entrypoint: 'claude-desktop',
        promptSource: 'sdk',
      }),
      agents,
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
    );

    expect(agent.agentName).toBe('Claude Code');
    expect(agent.claudeTitleResolved).toBe(false);
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentMetadata',
        agentName: 'Claude Code',
      }),
    );
  });

  it('does not replace a Claude Cowork title with a transcript ai-title', () => {
    const jsonlFile = path.join(tmpDir, 'local_cowork_123.jsonl');
    const agent = {
      ...makeAgent(1, jsonlFile),
      sessionId: 'local_cowork_123',
      agentName: 'Cowork Lead',
      claudeTitleResolved: true,
    };
    const agents = new Map<number, AgentState>([[1, agent]]);
    const webview = { postMessage: vi.fn() };

    processTranscriptLine(
      1,
      JSON.stringify({
        type: 'ai-title',
        sessionId: 'local_cowork_123',
        title: 'Transcript title',
      }),
      agents,
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
    );

    expect(agent.agentName).toBe('Cowork Lead');
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentMetadata',
        agentName: 'Transcript title',
      }),
    );
  });

  it('deduplicates streamed Claude usage updates for the same request and message', () => {
    const jsonlFile = path.join(tmpDir, 'session-usage.jsonl');
    const agent = makeAgent(1, jsonlFile);
    const agents = new Map<number, AgentState>([[1, agent]]);
    const webview = { postMessage: vi.fn() };

    const firstUsage = {
      type: 'assistant',
      requestId: 'req-1',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'partial response' }],
        usage: {
          input_tokens: 10,
          output_tokens: 3,
          cache_read_input_tokens: 2,
        },
      },
    };
    const latestUsage = {
      type: 'assistant',
      requestId: 'req-1',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'complete response' }],
        usage: {
          input_tokens: 12,
          output_tokens: 5,
          cache_read_input_tokens: 4,
          cache_creation_input_tokens: 1,
        },
      },
    };

    processTranscriptLine(
      1,
      JSON.stringify(firstUsage),
      agents,
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
    );
    processTranscriptLine(
      1,
      JSON.stringify(latestUsage),
      agents,
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
    );

    expect(agent.inputTokens).toBe(17);
    expect(agent.outputTokens).toBe(5);
    expect(agent.tokenUsageDetails).toMatchObject({
      input: 12,
      output: 5,
      cacheRead: 4,
      cacheWrite: 1,
    });
    expect(webview.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'agentTokenUsage',
        inputTokens: 17,
        outputTokens: 5,
        estimated: false,
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
    expect(agents.get(1)?.agentName).toBe('W2B code reference');
    expect(agents.get(1)?.claudeTitleResolved).toBe(true);
    expect(isClaudeChatSession(coworkFile)).toBe(false);
  });

  it('resolves Claude Cowork roots for each desktop platform', () => {
    expect(
      getClaudeCodeSessionsRoot(
        { APPDATA: 'C:\\Users\\User\\AppData\\Roaming' },
        'win32',
        'C:\\Users\\User',
      ),
    ).toBe(path.join('C:\\Users\\User\\AppData\\Roaming', 'Claude', 'claude-code-sessions'));
    expect(getClaudeCodeSessionsRoot({}, 'darwin', '/Users/user')).toBe(
      path.join('/Users/user', 'Library', 'Application Support', 'Claude', 'claude-code-sessions'),
    );
    expect(
      getClaudeCodeSessionsRoot({ XDG_CONFIG_HOME: '/tmp/config' }, 'linux', '/home/user'),
    ).toBe(path.join('/tmp/config', 'Claude', 'claude-code-sessions'));

    expect(
      getClaudeCoworkSessionsRoot(
        { APPDATA: 'C:\\Users\\User\\AppData\\Roaming' },
        'win32',
        'C:\\Users\\User',
      ),
    ).toBe(path.join('C:\\Users\\User\\AppData\\Roaming', 'Claude', 'local-agent-mode-sessions'));
    expect(getClaudeCoworkSessionsRoot({}, 'darwin', '/Users/user')).toBe(
      path.join(
        '/Users/user',
        'Library',
        'Application Support',
        'Claude',
        'local-agent-mode-sessions',
      ),
    );
    expect(
      getClaudeCoworkSessionsRoot({ XDG_CONFIG_HOME: '/tmp/config' }, 'linux', '/home/user'),
    ).toBe(path.join('/tmp/config', 'Claude', 'local-agent-mode-sessions'));
  });

  it('adopts non-archived Claude Cowork sessions during global scans', () => {
    const root = path.join(tmpDir, 'Claude', 'local-agent-mode-sessions');
    const metadataDir = path.join(root, 'space-1', 'process-1');
    const sessionId = 'local_cowork_123';
    const sessionDir = path.join(metadataDir, sessionId);
    const projectDir = path.join(tmpDir, 'workspace-project');
    const outputDir = path.join(sessionDir, 'outputs');
    const auditPath = path.join(sessionDir, 'audit.jsonl');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(auditPath, JSON.stringify({ cwd: outputDir }) + '\n');
    fs.writeFileSync(
      path.join(metadataDir, `${sessionId}.json`),
      JSON.stringify({
        sessionId,
        title: 'Cowork Lead',
        userSelectedFolders: [projectDir],
        isArchived: false,
        isAgentCompleted: false,
      }),
    );

    const agents = new Map<number, AgentState>();
    const knownJsonlFiles = new Set<string>();
    const webview = { postMessage: vi.fn() };
    const persistAgents = vi.fn();

    scanClaudeCoworkSessions(
      [],
      knownJsonlFiles,
      { current: 1 },
      agents,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
      persistAgents,
      root,
    );

    const agent = agents.get(1);
    expect(agent?.sessionId).toBe(sessionId);
    expect(agent?.jsonlFile).toBe(auditPath);
    expect(agent?.projectDir).toBe(projectDir);
    expect(agent?.agentName).toBe('Cowork Lead');
    expect(knownJsonlFiles.has(auditPath)).toBe(true);
    expect(persistAgents).toHaveBeenCalledOnce();
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCreated',
        agentName: 'Cowork Lead',
        providerId: 'claude',
        projectDir,
        transcriptPath: auditPath,
      }),
    );
  });

  it('skips a Claude Cowork session that fails to re-base (no user folder) instead of adopting an "outputs" phantom', () => {
    const root = path.join(tmpDir, 'Claude', 'local-agent-mode-sessions');
    const metadataDir = path.join(root, 'space-1', 'process-1');
    const sessionId = 'local_cowork_orphan';
    const sessionDir = path.join(metadataDir, sessionId);
    const outputDir = path.join(sessionDir, 'outputs');
    const auditPath = path.join(sessionDir, 'audit.jsonl');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(auditPath, JSON.stringify({ cwd: outputDir }) + '\n');
    fs.writeFileSync(
      path.join(metadataDir, `${sessionId}.json`),
      JSON.stringify({
        sessionId,
        title: 'Orphan Cowork',
        userSelectedFolders: [], // no real project → projectDir falls back into the sandbox
        cwd: outputDir,
        isArchived: false,
        isAgentCompleted: false,
      }),
    );

    const agents = new Map<number, AgentState>();
    const knownJsonlFiles = new Set<string>();
    const webview = { postMessage: vi.fn() };
    const persistAgents = vi.fn();

    scanClaudeCoworkSessions(
      [],
      knownJsonlFiles,
      { current: 1 },
      agents,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
      persistAgents,
      root,
    );

    expect(agents.size).toBe(0);
    expect(persistAgents).not.toHaveBeenCalled();
    expect(webview.postMessage).not.toHaveBeenCalled();
  });

  it('refreshes existing Claude Cowork agents back to the selected project root', () => {
    const root = path.join(tmpDir, 'Claude', 'local-agent-mode-sessions');
    const metadataDir = path.join(root, 'space-1', 'process-1');
    const sessionId = 'local_cowork_123';
    const sessionDir = path.join(metadataDir, sessionId);
    const projectDir = path.join(tmpDir, 'workspace-project');
    const outputDir = path.join(sessionDir, 'outputs');
    const auditPath = path.join(sessionDir, 'audit.jsonl');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(auditPath, JSON.stringify({ cwd: outputDir }) + '\n');
    fs.writeFileSync(
      path.join(metadataDir, `${sessionId}.json`),
      JSON.stringify({
        sessionId,
        title: 'Cowork Lead',
        userSelectedFolders: [projectDir],
        isArchived: false,
        isAgentCompleted: false,
      }),
    );

    const agent = makeAgent(1, auditPath);
    agent.isExternal = true;
    agent.projectDir = outputDir;
    agent.projectName = 'outputs';
    agent.folderName = 'outputs';
    agent.agentName = 'Old Cowork';
    const agents = new Map<number, AgentState>([[1, agent]]);
    const knownJsonlFiles = new Set<string>([auditPath]);
    const webview = { postMessage: vi.fn() };
    const persistAgents = vi.fn();

    scanClaudeCoworkSessions(
      [],
      knownJsonlFiles,
      { current: 2 },
      agents,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      webview as unknown as import('vscode').Webview,
      persistAgents,
      root,
    );

    expect(agent.projectDir).toBe(projectDir);
    expect(agent.projectName).toBe('workspace-project');
    expect(agent.folderName).toBe('workspace-project');
    expect(agent.agentName).toBe('Cowork Lead');
    expect(persistAgents).toHaveBeenCalledOnce();
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentMetadata',
        id: 1,
        agentName: 'Cowork Lead',
        projectDir,
        transcriptPath: auditPath,
      }),
    );
  });

  it('workspace refresh discovers Claude Cowork sessions outside the current VS Code root', () => {
    vi.stubEnv('APPDATA', tmpDir);
    const workspaceRoot = path.join(tmpDir, 'pixel-agents-multi');
    const projectDir = path.join(tmpDir, 'animfy_gs1');
    const metadataDir = path.join(
      tmpDir,
      'Claude',
      'local-agent-mode-sessions',
      'space-1',
      'process-1',
    );
    const sessionId = 'local_cowork_global';
    const sessionDir = path.join(metadataDir, sessionId);
    const auditPath = path.join(sessionDir, 'audit.jsonl');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(auditPath, JSON.stringify({ cwd: path.join(sessionDir, 'outputs') }) + '\n');
    fs.writeFileSync(
      path.join(metadataDir, `${sessionId}.json`),
      JSON.stringify({
        sessionId,
        title: 'Global Cowork Lead',
        userSelectedFolders: [projectDir],
        isArchived: false,
        isAgentCompleted: false,
      }),
    );

    const webview = { postMessage: vi.fn() };
    const provider = Object.create(PixelAgentsViewProvider.prototype) as InstanceType<
      typeof PixelAgentsViewProvider
    >;
    Object.assign(provider, {
      agents: new Map<number, AgentState>(),
      knownJsonlFiles: new Set<string>(),
      nextAgentId: { current: 1 },
      fileWatchers: new Map(),
      pollingTimers: new Map(),
      waitingTimers: new Map(),
      permissionTimers: new Map(),
      webviewView: { webview },
      persistAgents: vi.fn(),
    });
    Object.assign(vscode.workspace, {
      workspaceFolders: [{ uri: { fsPath: workspaceRoot } }],
    });

    (
      provider as unknown as { scanClaudeWorkspaceThreads: (includeInactive?: boolean) => void }
    ).scanClaudeWorkspaceThreads();

    const agent = provider.agents.get(1);
    expect(agent?.sessionId).toBe(sessionId);
    expect(agent?.providerId).toBe('claude');
    expect(agent?.projectDir).toBe(projectDir);
    expect(agent?.agentName).toBe('Global Cowork Lead');
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agentCreated',
        providerId: 'claude',
        projectDir,
        transcriptPath: auditPath,
      }),
    );
  });
});

function copyFixture(name: string, tmpDir: string, targetName: string): string {
  const target = path.join(tmpDir, targetName);
  fs.copyFileSync(path.join(fixturesDir, name), target);
  return target;
}

function writeClaudeCodeMetadata(
  appDataRoot: string,
  metadata: {
    cliSessionId: string;
    cwd: string;
    title: string;
    lastActivityAt: number;
  },
): void {
  const metadataDir = path.join(
    appDataRoot,
    'Claude',
    'claude-code-sessions',
    'space-1',
    'process-1',
  );
  fs.mkdirSync(metadataDir, { recursive: true });
  fs.writeFileSync(
    path.join(metadataDir, `local_${metadata.cliSessionId}.json`),
    JSON.stringify({
      sessionId: `local_${metadata.cliSessionId}`,
      cliSessionId: metadata.cliSessionId,
      cwd: metadata.cwd,
      originCwd: metadata.cwd,
      title: metadata.title,
      isArchived: false,
      lastActivityAt: metadata.lastActivityAt,
    }),
  );
}
