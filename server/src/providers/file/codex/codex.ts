import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentEvent } from '../../../provider.js';

export const CODEX_PROVIDER_ID = 'codex';
export const CODEX_DISPLAY_NAME = 'Codex';
export const CODEX_TERMINAL_PREFIX = 'Codex';

export interface CodexThread {
  id: string;
  rolloutPath: string;
  cwd: string;
  title?: string;
  updatedAtMs: number;
  tokensUsed: number;
  agentNickname?: string;
  agentRole?: string;
}

export type CodexTranscriptEvent =
  | AgentEvent
  | { kind: 'permissionClear'; toolId?: string }
  | { kind: 'tokenUsage'; inputTokens: number; outputTokens: number }
  | {
      kind: 'codexSubagentSpawn';
      childThreadId: string;
      parentThreadId?: string;
      nickname?: string;
      role?: string;
      callId?: string;
    };

function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function stateDbPath(): string {
  return path.join(codexHome(), 'state_5.sqlite');
}

function sessionIndexPath(): string {
  return path.join(codexHome(), 'session_index.jsonl');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildCodexLaunchCommand(
  cwd: string,
  bypassApprovals = false,
  prompt?: string,
): string {
  const args = ['--cd', shellQuote(cwd), '--no-alt-screen'];
  if (bypassApprovals) {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  }
  if (prompt?.trim()) {
    args.push(shellQuote(prompt.trim()));
  }
  return `codex ${args.join(' ')}`;
}

function parseThreadRow(row: string): CodexThread | null {
  const [id, rolloutPath, cwd, title, updatedAtMs, tokensUsed, agentNickname, agentRole] =
    row.split('\t');
  if (!id || !rolloutPath || !cwd) return null;
  const indexedTitle = readCodexSessionIndexTitle(id);
  return {
    id,
    rolloutPath,
    cwd,
    title: indexedTitle ?? (title || undefined),
    updatedAtMs: Number(updatedAtMs) || 0,
    tokensUsed: Number(tokensUsed) || 0,
    agentNickname: agentNickname || undefined,
    agentRole: agentRole || undefined,
  };
}

let sessionIndexCache:
  | {
      mtimeMs: number;
      titles: Map<string, string>;
    }
  | undefined;

function readCodexSessionIndexTitle(threadId: string): string | undefined {
  const indexPath = sessionIndexPath();
  try {
    const stat = fs.statSync(indexPath);
    if (!sessionIndexCache || sessionIndexCache.mtimeMs !== stat.mtimeMs) {
      const titles = new Map<string, string>();
      const lines = fs.readFileSync(indexPath, 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line) as Record<string, unknown>;
          const id = typeof record.id === 'string' ? record.id : undefined;
          const threadName =
            typeof record.thread_name === 'string'
              ? record.thread_name
              : typeof record.title === 'string'
                ? record.title
                : undefined;
          const normalized = threadName?.replace(/\s+/g, ' ').trim();
          if (id && normalized) titles.set(id, normalized);
        } catch {
          /* ignore malformed index rows */
        }
      }
      sessionIndexCache = { mtimeMs: stat.mtimeMs, titles };
    }
    return sessionIndexCache.titles.get(threadId);
  } catch {
    return undefined;
  }
}

function queryCodexThread(sql: string): CodexThread | null {
  return queryCodexThreads(sql)[0] ?? null;
}

function queryCodexThreads(sql: string): CodexThread[] {
  const db = stateDbPath();
  if (!fs.existsSync(db)) return [];

  try {
    const out = childProcess.execFileSync('sqlite3', ['-separator', '\t', db, sql], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .trim()
      .split('\n')
      .map(parseThreadRow)
      .filter((thread): thread is CodexThread => !!thread && fs.existsSync(thread.rolloutPath));
  } catch {
    return [];
  }
}

export function findLatestCodexThread(cwd: string, sinceMs = 0): CodexThread | null {
  const sql = `
select id, rollout_path, cwd, coalesce(title, ''), updated_at_ms, coalesce(tokens_used, 0), coalesce(agent_nickname, ''), coalesce(agent_role, '')
from threads
where archived = 0
  and cwd = ${sqlString(cwd)}
  and coalesce(created_at_ms, 0) >= ${Math.floor(sinceMs)}
order by coalesce(created_at_ms, 0) desc, coalesce(updated_at_ms, 0) desc, id desc
limit 1;`;

  return queryCodexThread(sql);
}

export function findCodexThreadById(threadId: string): CodexThread | null {
  const sql = `
select id, rollout_path, cwd, coalesce(title, ''), updated_at_ms, coalesce(tokens_used, 0), coalesce(agent_nickname, ''), coalesce(agent_role, '')
from threads
where archived = 0
  and id = ${sqlString(threadId)}
limit 1;`;

  return queryCodexThread(sql);
}

export function findRecentCodexThreads(limit = 50): CodexThread[] {
  const sql = `
select id, rollout_path, cwd, coalesce(title, ''), updated_at_ms, coalesce(tokens_used, 0), coalesce(agent_nickname, ''), coalesce(agent_role, '')
from threads
where archived = 0
  and source not like ${sqlString('{"subagent"%')}
order by coalesce(updated_at_ms, 0) desc, coalesce(created_at_ms, 0) desc, id desc
limit ${Math.max(1, Math.floor(limit))};`;

  return queryCodexThreads(sql);
}

export function findCodexThreadsForCwd(cwd: string, limit = 10): CodexThread[] {
  const sql = `
select id, rollout_path, cwd, coalesce(title, ''), updated_at_ms, coalesce(tokens_used, 0), coalesce(agent_nickname, ''), coalesce(agent_role, '')
from threads
where archived = 0
  and cwd = ${sqlString(cwd)}
  and source not like ${sqlString('{"subagent"%')}
order by coalesce(updated_at_ms, 0) desc, coalesce(created_at_ms, 0) desc, id desc
limit ${Math.max(1, Math.floor(limit))};`;

  return queryCodexThreads(sql);
}

export function archiveCodexThread(threadId: string): boolean {
  const db = stateDbPath();
  if (!fs.existsSync(db)) return false;

  try {
    childProcess.execFileSync(
      'sqlite3',
      [
        db,
        `update threads set archived = 1, archived_at = strftime('%s','now') where id = ${sqlString(threadId)};`,
      ],
      { stdio: ['ignore', 'ignore', 'ignore'] },
    );
    return true;
  } catch {
    return false;
  }
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function basename(value: unknown): string {
  return typeof value === 'string' ? path.basename(value) : '';
}

export function formatCodexToolStatus(toolName: string, input?: unknown): string {
  const data =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  switch (toolName) {
    case 'exec_command':
    case 'shell': {
      const cmd =
        typeof data.cmd === 'string'
          ? data.cmd
          : typeof data.command === 'string'
            ? data.command
            : '';
      return cmd ? `Running: ${cmd.slice(0, 60)}` : 'Running command';
    }
    case 'apply_patch':
      return 'Editing files';
    case 'view_image':
      return `Viewing ${basename(data.path)}`;
    case 'web_search':
    case 'web_search_call':
      return 'Searching the web';
    case 'tool_search':
    case 'tool_search_call':
      return 'Searching tools';
    case 'spawn_agent':
      return 'Spawning agent';
    case 'read_mcp_resource':
      return 'Reading resource';
    default:
      return toolName ? `Using ${toolName}` : 'Working';
  }
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function callId(payload: Record<string, unknown>): string | undefined {
  const raw = payload.call_id ?? payload.callId ?? payload.id ?? payload.target_item_id;
  return typeof raw === 'string' ? raw : undefined;
}

export function parseCodexTranscriptLine(line: string): CodexTranscriptEvent | null {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  const payload =
    typeof record.payload === 'object' && record.payload !== null
      ? (record.payload as Record<string, unknown>)
      : {};
  const outerType = record.type;
  const payloadType = payload.type;

  if (outerType === 'response_item') {
    if (
      payloadType === 'function_call' ||
      payloadType === 'custom_tool_call' ||
      payloadType === 'tool_search_call' ||
      payloadType === 'web_search_call' ||
      payloadType === 'image_generation_call'
    ) {
      const name = typeof payload.name === 'string' ? payload.name : String(payloadType);
      const input = parseMaybeJson(payload.arguments ?? payload.input);
      return {
        kind: 'toolStart',
        toolId: callId(payload) ?? `${name}-${Date.now()}`,
        toolName: name,
        input,
      };
    }

    if (
      payloadType === 'function_call_output' ||
      payloadType === 'custom_tool_call_output' ||
      payloadType === 'tool_search_output'
    ) {
      return { kind: 'toolEnd', toolId: callId(payload) ?? 'unknown' };
    }

    if (payloadType === 'reasoning') {
      return {
        kind: 'progress',
        toolId: callId(payload) ?? 'codex-reasoning',
        data: { label: 'Thinking' },
      };
    }

    if (payloadType === 'message' && payload.role === 'assistant') {
      return {
        kind: 'progress',
        toolId: callId(payload) ?? 'codex-response',
        data: { label: 'Responding' },
      };
    }
  }

  if (outerType === 'event_msg') {
    if (payloadType === 'collab_agent_spawn_end') {
      const childThreadId = payload.new_thread_id;
      if (typeof childThreadId !== 'string' || !childThreadId) return null;
      const parentThreadId = payload.sender_thread_id;
      const nickname = payload.new_agent_nickname;
      const role = payload.new_agent_role;
      return {
        kind: 'codexSubagentSpawn',
        childThreadId,
        parentThreadId: typeof parentThreadId === 'string' ? parentThreadId : undefined,
        nickname: typeof nickname === 'string' ? nickname : undefined,
        role: typeof role === 'string' ? role : undefined,
        callId: callId(payload),
      };
    }
    if (payloadType === 'task_started') {
      return { kind: 'userTurn' };
    }
    if (payloadType === 'token_count') {
      const info =
        typeof payload.info === 'object' && payload.info !== null
          ? (payload.info as Record<string, unknown>)
          : {};
      const total =
        typeof info.total_token_usage === 'object' && info.total_token_usage !== null
          ? (info.total_token_usage as Record<string, unknown>)
          : {};
      const inputTokens =
        typeof total.input_tokens === 'number' && Number.isFinite(total.input_tokens)
          ? total.input_tokens
          : 0;
      const outputTokens =
        (typeof total.output_tokens === 'number' && Number.isFinite(total.output_tokens)
          ? total.output_tokens
          : 0) +
        (typeof total.reasoning_output_tokens === 'number' &&
        Number.isFinite(total.reasoning_output_tokens)
          ? total.reasoning_output_tokens
          : 0);
      return { kind: 'tokenUsage', inputTokens, outputTokens };
    }
    if (
      payloadType === 'task_complete' ||
      payloadType === 'turn_aborted' ||
      payloadType === 'error'
    ) {
      return { kind: 'turnEnd' };
    }
    if (
      payloadType === 'exec_command_end' ||
      payloadType === 'patch_apply_end' ||
      payloadType === 'mcp_tool_call_end'
    ) {
      return { kind: 'toolEnd', toolId: callId(payload) ?? 'unknown' };
    }
    if (payloadType === 'dynamic_tool_call_request') {
      const name = typeof payload.name === 'string' ? payload.name : 'dynamic_tool';
      return {
        kind: 'toolStart',
        toolId: callId(payload) ?? `${name}-${Date.now()}`,
        toolName: name,
        input: payload.input,
      };
    }
    if (payloadType === 'dynamic_tool_call_response') {
      return { kind: 'toolEnd', toolId: callId(payload) ?? 'unknown' };
    }
    if (payloadType === 'guardian_assessment') {
      const status = payload.status;
      if (status === 'in_progress') return { kind: 'permissionRequest' };
      if (status === 'approved') return { kind: 'permissionClear', toolId: callId(payload) };
    }
  }

  return null;
}

export const codexProvider = {
  id: CODEX_PROVIDER_ID,
  displayName: CODEX_DISPLAY_NAME,
  terminalNamePrefix: CODEX_TERMINAL_PREFIX,
  buildLaunchCommand: buildCodexLaunchCommand,
  findLatestThread: findLatestCodexThread,
  findThreadById: findCodexThreadById,
  findRecentThreads: findRecentCodexThreads,
  findThreadsForCwd: findCodexThreadsForCwd,
  parseTranscriptLine: parseCodexTranscriptLine,
  formatToolStatus: formatCodexToolStatus,
};
