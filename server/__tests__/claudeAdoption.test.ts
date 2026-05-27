import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentState } from '../../src/types.js';

vi.mock('vscode', () => ({
  window: {
    terminals: [],
  },
  workspace: {
    workspaceFolders: [],
  },
}));

const { adoptExternalSessionFromHook } = await import('../../src/fileWatcher.js');
const { processTranscriptLine } = await import('../../src/transcriptParser.js');

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
});
