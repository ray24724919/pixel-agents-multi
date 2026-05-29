import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpBase: string;

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => tmpBase };
});

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
}));

const {
  codexProvider,
  parseCodexTranscriptLine,
  findLatestCodexThread,
  findCodexThreadById,
  findRecentCodexThreads,
  findCodexThreadsForCwd,
  buildCodexLaunchCommand,
  archiveCodexThread,
  extractCodexCdValues,
  findMatchingCodexProcesses,
  terminateCodexThreadProcess,
} = await import('../src/providers/file/codex/codex.js');

function codexLine(type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ type, payload });
}

describe('codexProvider', () => {
  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-codex-test-'));
    execFileSyncMock.mockReset();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('identity', () => {
    it('has id "codex"', () => {
      expect(codexProvider.id).toBe('codex');
    });

    it('has a displayName', () => {
      expect(codexProvider.displayName).toBe('Codex');
    });

    it('exposes file-provider capabilities', () => {
      expect(codexProvider.parseTranscriptLine).toBe(parseCodexTranscriptLine);
      expect(codexProvider.findLatestThread).toBe(findLatestCodexThread);
      expect(codexProvider.buildLaunchCommand).toBe(buildCodexLaunchCommand);
      expect(codexProvider.findThreadById).toBe(findCodexThreadById);
      expect(codexProvider.findRecentThreads).toBe(findRecentCodexThreads);
      expect(codexProvider.findThreadsForCwd).toBe(findCodexThreadsForCwd);
    });
  });

  describe('launch command', () => {
    it('finds the latest Codex thread and builds a launch command', () => {
      const codexHome = path.join(tmpBase, '.codex');
      const dbPath = path.join(codexHome, 'state_5.sqlite');
      const latestThread = path.join(codexHome, 'sessions', 'thread-latest.jsonl');
      fs.mkdirSync(path.dirname(latestThread), { recursive: true });
      fs.writeFileSync(dbPath, '');
      fs.writeFileSync(latestThread, JSON.stringify({ id: 'thread-latest' }) + '\n');
      execFileSyncMock.mockReturnValue(
        `thread-latest\t${latestThread}\t/workspace/project\tAnalyze integration\t1778544000000\t12345\tNavigator\tcodes\n`,
      );

      expect(findLatestCodexThread('/workspace/project', 1778540000000)).toEqual({
        id: 'thread-latest',
        rolloutPath: latestThread,
        cwd: '/workspace/project',
        title: 'Analyze integration',
        updatedAtMs: 1778544000000,
        tokensUsed: 12345,
        agentNickname: 'Navigator',
        agentRole: 'codes',
      });

      expect(execFileSyncMock).toHaveBeenCalledWith(
        'sqlite3',
        expect.arrayContaining(['-separator', '\t', dbPath]),
        expect.objectContaining({ encoding: 'utf-8' }),
      );

      expect(buildCodexLaunchCommand('/workspace/project')).toBe(
        "codex --cd '/workspace/project' --no-alt-screen",
      );
      expect(buildCodexLaunchCommand('/workspace/project', false, 'summarize tests')).toBe(
        "codex --cd '/workspace/project' --no-alt-screen 'summarize tests'",
      );
    });

    it('finds a Codex thread by id', () => {
      const codexHome = path.join(tmpBase, '.codex');
      const dbPath = path.join(codexHome, 'state_5.sqlite');
      const childThread = path.join(codexHome, 'sessions', 'thread-child.jsonl');
      fs.mkdirSync(path.dirname(childThread), { recursive: true });
      fs.writeFileSync(dbPath, '');
      fs.writeFileSync(childThread, JSON.stringify({ id: 'thread-child' }) + '\n');
      execFileSyncMock.mockReturnValue(
        `thread-child\t${childThread}\t/workspace/project\tReview tests\t1778545000000\t67890\tCurie\tworker\n`,
      );

      expect(findCodexThreadById('thread-child')).toEqual({
        id: 'thread-child',
        rolloutPath: childThread,
        cwd: '/workspace/project',
        title: 'Review tests',
        updatedAtMs: 1778545000000,
        tokensUsed: 67890,
        agentNickname: 'Curie',
        agentRole: 'worker',
      });

      expect(execFileSyncMock).toHaveBeenCalledWith(
        'sqlite3',
        expect.arrayContaining(['-separator', '\t', dbPath]),
        expect.objectContaining({ encoding: 'utf-8' }),
      );
    });

    it('finds Codex threads for a cwd', () => {
      const codexHome = path.join(tmpBase, '.codex');
      const dbPath = path.join(codexHome, 'state_5.sqlite');
      const threadA = path.join(codexHome, 'sessions', 'thread-a.jsonl');
      const threadB = path.join(codexHome, 'sessions', 'thread-b.jsonl');
      fs.mkdirSync(path.dirname(threadA), { recursive: true });
      fs.writeFileSync(dbPath, '');
      fs.writeFileSync(threadA, JSON.stringify({ id: 'thread-a' }) + '\n');
      fs.writeFileSync(threadB, JSON.stringify({ id: 'thread-b' }) + '\n');
      execFileSyncMock.mockReturnValue(
        [
          `thread-b\t${threadB}\t/workspace/project\tTitle B\t1778546000000\t2000\t\t`,
          `thread-a\t${threadA}\t/workspace/project\tTitle A\t1778545000000\t1000\t\t`,
        ].join('\n') + '\n',
      );

      expect(findCodexThreadsForCwd('/workspace/project', 2)).toEqual([
        {
          id: 'thread-b',
          rolloutPath: threadB,
          cwd: '/workspace/project',
          title: 'Title B',
          updatedAtMs: 1778546000000,
          tokensUsed: 2000,
          agentNickname: undefined,
          agentRole: undefined,
        },
        {
          id: 'thread-a',
          rolloutPath: threadA,
          cwd: '/workspace/project',
          title: 'Title A',
          updatedAtMs: 1778545000000,
          tokensUsed: 1000,
          agentNickname: undefined,
          agentRole: undefined,
        },
      ]);

      expect(execFileSyncMock).toHaveBeenCalledWith(
        'sqlite3',
        expect.arrayContaining(['-separator', '\t', dbPath]),
        expect.objectContaining({ encoding: 'utf-8' }),
      );
    });

    it('finds recent active Codex threads across cwd values', () => {
      const codexHome = path.join(tmpBase, '.codex');
      const dbPath = path.join(codexHome, 'state_5.sqlite');
      const threadA = path.join(codexHome, 'sessions', 'thread-a.jsonl');
      const threadB = path.join(codexHome, 'sessions', 'thread-b.jsonl');
      fs.mkdirSync(path.dirname(threadA), { recursive: true });
      fs.writeFileSync(dbPath, '');
      fs.writeFileSync(threadA, JSON.stringify({ id: 'thread-a' }) + '\n');
      fs.writeFileSync(threadB, JSON.stringify({ id: 'thread-b' }) + '\n');
      execFileSyncMock.mockReturnValue(
        [
          `thread-b\t${threadB}\t/workspace/b\tPlan work\t1778546000000\t2000\tPlanner\tworker`,
          `thread-a\t${threadA}\t/workspace/a\tAnalyze code\t1778545000000\t1000\t\t`,
        ].join('\n') + '\n',
      );

      expect(findRecentCodexThreads(2)).toEqual([
        {
          id: 'thread-b',
          rolloutPath: threadB,
          cwd: '/workspace/b',
          title: 'Plan work',
          updatedAtMs: 1778546000000,
          tokensUsed: 2000,
          agentNickname: 'Planner',
          agentRole: 'worker',
        },
        {
          id: 'thread-a',
          rolloutPath: threadA,
          cwd: '/workspace/a',
          title: 'Analyze code',
          updatedAtMs: 1778545000000,
          tokensUsed: 1000,
          agentNickname: undefined,
          agentRole: undefined,
        },
      ]);

      expect(execFileSyncMock).toHaveBeenCalledWith(
        'sqlite3',
        expect.arrayContaining(['-separator', '\t', dbPath]),
        expect.objectContaining({ encoding: 'utf-8' }),
      );
    });

    it('archives a Codex thread in the state database', () => {
      const codexHome = path.join(tmpBase, '.codex');
      const dbPath = path.join(codexHome, 'state_5.sqlite');
      fs.mkdirSync(codexHome, { recursive: true });
      fs.writeFileSync(dbPath, '');

      expect(archiveCodexThread('thread-to-archive')).toBe(true);

      expect(execFileSyncMock).toHaveBeenCalledWith(
        'sqlite3',
        [
          dbPath,
          "update threads set archived = 1, archived_at = strftime('%s','now') where id = 'thread-to-archive';",
        ],
        { stdio: ['ignore', 'ignore', 'ignore'] },
      );
    });

    it('extracts quoted and unquoted Codex --cd values', () => {
      expect(extractCodexCdValues('"C:\\bin\\codex.exe" --cd "C:\\workspace\\project"')).toEqual([
        'C:\\workspace\\project',
      ]);
      expect(extractCodexCdValues("codex --cd '/workspace/project' --no-alt-screen")).toEqual([
        '/workspace/project',
      ]);
      expect(extractCodexCdValues('codex --cd=/workspace/project')).toEqual(['/workspace/project']);
    });

    it('matches and terminates a unique Codex process by cwd on Windows', () => {
      const killProcessTree = vi.fn(() => true);

      expect(
        terminateCodexThreadProcess(
          {
            threadId: 'thread-a',
            cwd: 'C:\\workspace\\project',
            rolloutPath: 'C:\\Users\\User\\.codex\\sessions\\thread-a.jsonl',
          },
          {
            platform: 'win32',
            listProcesses: () => [
              {
                pid: 101,
                name: 'codex.exe',
                commandLine:
                  '"C:\\Users\\User\\AppData\\Local\\OpenAI\\Codex\\bin\\codex.exe" --cd "C:\\workspace\\project" --no-alt-screen',
              },
              {
                pid: 202,
                name: 'codex.exe',
                commandLine: '"C:\\Program Files\\Codex\\codex.exe" app-server --listen stdio://',
              },
            ],
            killProcessTree,
          },
        ),
      ).toEqual({
        terminated: true,
        reason: 'terminated',
        pid: 101,
        matchedCount: 1,
      });
      expect(killProcessTree).toHaveBeenCalledWith(101, 'win32');
    });

    it('refuses to terminate ambiguous Codex process matches', () => {
      const matches = findMatchingCodexProcesses(
        {
          threadId: 'thread-a',
          cwd: '/workspace/project',
          rolloutPath: '/home/user/.codex/sessions/thread-a.jsonl',
        },
        [
          {
            pid: 101,
            name: 'codex',
            commandLine: 'codex --cd /workspace/project --no-alt-screen',
          },
          {
            pid: 202,
            name: 'node',
            commandLine: 'node /usr/local/bin/codex --cd /workspace/project --no-alt-screen',
          },
        ],
        'linux',
      );
      const result = terminateCodexThreadProcess(
        {
          threadId: 'thread-a',
          cwd: '/workspace/project',
          rolloutPath: '/home/user/.codex/sessions/thread-a.jsonl',
        },
        {
          platform: 'linux',
          listProcesses: () => matches,
          killProcessTree: vi.fn(() => true),
        },
      );

      expect(matches.map((match) => match.pid)).toEqual([101, 202]);
      expect(result).toEqual({ terminated: false, reason: 'ambiguous-match', matchedCount: 2 });
    });
  });

  describe('parseCodexTranscriptLine', () => {
    it('normalizes function_call to toolStart', () => {
      const result = parseCodexTranscriptLine(
        codexLine('response_item', {
          type: 'function_call',
          call_id: 'call-1',
          name: 'shell',
          arguments: JSON.stringify({ command: 'npm test' }),
        }),
      );

      expect(result).toEqual({
        kind: 'toolStart',
        toolId: 'call-1',
        toolName: 'shell',
        input: { command: 'npm test' },
      });
    });

    it('normalizes function_call_output to toolEnd', () => {
      const result = parseCodexTranscriptLine(
        codexLine('response_item', {
          type: 'function_call_output',
          call_id: 'call-1',
          output: 'ok',
        }),
      );

      expect(result).toEqual({ kind: 'toolEnd', toolId: 'call-1' });
    });

    it('normalizes guardian_assessment in_progress to permissionRequest', () => {
      const result = parseCodexTranscriptLine(
        codexLine('event_msg', {
          type: 'guardian_assessment',
          status: 'in_progress',
        }),
      );

      expect(result).toEqual({ kind: 'permissionRequest' });
    });

    it('normalizes task_complete to turnEnd', () => {
      const result = parseCodexTranscriptLine(
        codexLine('event_msg', {
          type: 'task_complete',
        }),
      );

      expect(result).toEqual({ kind: 'turnEnd' });
    });

    it('normalizes collab_agent_spawn_end to codexSubagentSpawn', () => {
      const result = parseCodexTranscriptLine(
        codexLine('event_msg', {
          type: 'collab_agent_spawn_end',
          call_id: 'call-spawn',
          sender_thread_id: 'thread-parent',
          new_thread_id: 'thread-child',
          new_agent_nickname: 'Curie',
          new_agent_role: 'worker',
        }),
      );

      expect(result).toEqual({
        kind: 'codexSubagentSpawn',
        callId: 'call-spawn',
        parentThreadId: 'thread-parent',
        childThreadId: 'thread-child',
        nickname: 'Curie',
        role: 'worker',
      });
    });
  });
});
