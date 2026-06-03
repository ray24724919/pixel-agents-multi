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
  | {
      kind: 'tokenUsage';
      inputTokens: number;
      outputTokens: number;
      details: CodexTokenUsageDetails;
      lastTokenUsage?: CodexTokenUsageDetails;
      rateLimits?: CodexRateLimitSnapshot[];
    }
  | {
      kind: 'codexSubagentSpawn';
      childThreadId: string;
      parentThreadId?: string;
      nickname?: string;
      role?: string;
      callId?: string;
    };

export interface CodexTokenUsageDetails {
  input: number;
  output: number;
  reasoningOutput: number;
  cacheRead: number;
  cacheWrite: number;
  artifactEstimate: number;
  estimated: boolean;
}

export interface CodexRateLimitSnapshot {
  name: 'primary' | 'secondary';
  usedPercent?: number;
  remainingPercent?: number;
  resetAtMs?: number;
  resetAfterSeconds?: number;
}

function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function stateDbPath(): string {
  return path.join(codexHome(), 'state_5.sqlite');
}

function sessionIndexPath(): string {
  return path.join(codexHome(), 'session_index.jsonl');
}

function trimTrailingPathSeparators(value: string): string {
  if (/^[A-Za-z]:[\\/]$/.test(value)) return value;
  if (/^\\\\[^\\]+\\[^\\]+[\\/]?$/.test(value)) {
    return value.replace(/[\\/]+$/, '\\');
  }
  return value.replace(/[\\/]+$/, '');
}

function isWindowsPathLike(value: string): boolean {
  const normalized = value.replace(/\//g, '\\');
  return (
    /^\\\\\?\\/i.test(normalized) ||
    /^[A-Za-z]:\\/.test(normalized) ||
    /^\\\\[^\\]/.test(normalized)
  );
}

function stripWindowsLongPathPrefix(value: string): string {
  const normalized = value.replace(/\//g, '\\');
  if (/^\\\\\?\\UNC\\/i.test(normalized)) {
    return `\\\\${normalized.slice('\\\\?\\UNC\\'.length)}`;
  }
  if (/^\\\\\?\\/i.test(normalized)) {
    return normalized.slice('\\\\?\\'.length);
  }
  return normalized;
}

function toWindowsLongPath(value: string): string {
  const normalized = stripWindowsLongPathPrefix(value);
  if (/^\\\\[^\\]/.test(normalized)) {
    return `\\\\?\\UNC\\${normalized.slice(2)}`;
  }
  if (/^[A-Za-z]:\\/.test(normalized)) {
    return `\\\\?\\${normalized}`;
  }
  return normalized;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function codexPathKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (isWindowsPathLike(trimmed)) {
    return trimTrailingPathSeparators(
      path.win32.resolve(stripWindowsLongPathPrefix(trimmed)),
    ).toLowerCase();
  }
  return path.resolve(trimmed);
}

function codexCwdSqlPredicate(cwd: string): string {
  if (!isWindowsPathLike(cwd)) {
    return `cwd = ${sqlString(cwd)}`;
  }

  const plain = trimTrailingPathSeparators(path.win32.resolve(stripWindowsLongPathPrefix(cwd)));
  const variants = uniqueStrings(
    [plain, toWindowsLongPath(plain)].map((value) => value.toLowerCase()),
  );
  return `lower(cwd) in (${variants.map(sqlString).join(', ')})`;
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
  and ${codexCwdSqlPredicate(cwd)}
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
  and ${codexCwdSqlPredicate(cwd)}
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

export interface CodexProcessTerminationTarget {
  threadId: string;
  cwd?: string;
  rolloutPath?: string;
}

export interface CodexProcessCandidate {
  pid: number;
  parentPid?: number;
  name?: string;
  commandLine?: string;
  executablePath?: string;
}

export type CodexProcessTerminationReason =
  | 'terminated'
  | 'missing-target'
  | 'process-list-failed'
  | 'no-match'
  | 'ambiguous-match'
  | 'kill-failed';

export interface CodexProcessTerminationResult {
  terminated: boolean;
  reason: CodexProcessTerminationReason;
  pid?: number;
  matchedCount?: number;
}

interface CodexProcessTerminationOptions {
  platform?: NodeJS.Platform;
  listProcesses?: () => CodexProcessCandidate[];
  killProcessTree?: (pid: number, platform: NodeJS.Platform) => boolean;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeProcessPath(value: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return (codexPathKey(unquote(value)) ?? '').replace(/\\/g, '/');
  }
  const normalized = path.posix
    .normalize(unquote(value))
    .replace(/[\\/]+$/, '')
    .replace(/\\/g, '/');
  return normalized;
}

function normalizedTextIncludesPath(
  text: string,
  targetPath: string | undefined,
  platform: NodeJS.Platform,
): boolean {
  if (!targetPath) return false;
  const normalizedText = text.replace(/\\/g, '/');
  const normalizedTarget = normalizeProcessPath(targetPath, platform);
  return platform === 'win32'
    ? normalizedText.toLowerCase().includes(normalizedTarget)
    : normalizedText.includes(normalizedTarget);
}

function basenameFromCommandToken(value: string | undefined): string {
  if (!value) return '';
  return unquote(value).replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
}

function isCodexExecutableName(value: string | undefined): boolean {
  return ['codex', 'codex.exe', 'codex.js', 'codex.cjs', 'codex.mjs'].includes(
    basenameFromCommandToken(value),
  );
}

function isNodeExecutableName(value: string | undefined): boolean {
  return ['node', 'node.exe'].includes(basenameFromCommandToken(value));
}

function firstCommandToken(commandLine: string): string | undefined {
  const match = commandLine.trim().match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function commandLineHasCodexScript(commandLine: string): boolean {
  return /(?:^|\s|["'])(?:[A-Za-z]:)?[^"'\s]*[\\/](?:codex|codex\.(?:exe|js|cjs|mjs))(?:\s|["']|$)/i.test(
    commandLine,
  );
}

function isCodexCliProcess(candidate: CodexProcessCandidate): boolean {
  const commandLine = candidate.commandLine ?? '';
  const firstToken = firstCommandToken(commandLine);
  if (
    isCodexExecutableName(candidate.name) ||
    isCodexExecutableName(candidate.executablePath) ||
    isCodexExecutableName(firstToken)
  ) {
    return true;
  }
  return (
    (isNodeExecutableName(candidate.name) || isNodeExecutableName(firstToken)) &&
    commandLineHasCodexScript(commandLine)
  );
}

export function extractCodexCdValues(commandLine: string): string[] {
  const values: string[] = [];
  const cdArg = /(?:^|\s)--cd(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s"']+))/g;
  let match: RegExpExecArray | null;
  while ((match = cdArg.exec(commandLine))) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value) values.push(value);
  }
  return values;
}

export function findMatchingCodexProcesses(
  target: CodexProcessTerminationTarget,
  candidates: CodexProcessCandidate[],
  platform: NodeJS.Platform = process.platform,
): CodexProcessCandidate[] {
  const threadId = target.threadId.trim().toLowerCase();
  const cwd = target.cwd?.trim();
  return candidates.filter((candidate) => {
    if (!candidate.pid || !isCodexCliProcess(candidate)) return false;
    const commandLine = candidate.commandLine ?? '';
    if (threadId && commandLine.toLowerCase().includes(threadId)) return true;
    if (normalizedTextIncludesPath(commandLine, target.rolloutPath, platform)) return true;
    if (!cwd) return false;
    return extractCodexCdValues(commandLine).some(
      (value) => normalizeProcessPath(value, platform) === normalizeProcessPath(cwd, platform),
    );
  });
}

function numberField(value: unknown): number | undefined {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function parseWindowsProcessRecord(record: unknown): CodexProcessCandidate | null {
  if (typeof record !== 'object' || record === null) return null;
  const data = record as Record<string, unknown>;
  const pid = numberField(data.ProcessId);
  if (!pid) return null;
  return {
    pid,
    parentPid: numberField(data.ParentProcessId),
    name: stringField(data.Name),
    commandLine: stringField(data.CommandLine),
    executablePath: stringField(data.ExecutablePath),
  };
}

function listWindowsProcessCandidates(): CodexProcessCandidate[] {
  const script =
    "$ProgressPreference='SilentlyContinue'; " +
    'Get-CimInstance Win32_Process | ' +
    'Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath | ' +
    'ConvertTo-Json -Compress -Depth 2';
  const output = childProcess.execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf-8',
      maxBuffer: 5 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  const parsed = JSON.parse(output) as unknown;
  const records = Array.isArray(parsed) ? parsed : [parsed];
  return records
    .map(parseWindowsProcessRecord)
    .filter((candidate): candidate is CodexProcessCandidate => !!candidate);
}

function listPosixProcessCandidates(): CodexProcessCandidate[] {
  const output = childProcess.execFileSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], {
    encoding: 'utf-8',
    maxBuffer: 5 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return output
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => ({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      name: match[3],
      commandLine: match[4],
    }));
}

function listCodexProcessCandidates(platform: NodeJS.Platform): CodexProcessCandidate[] {
  return platform === 'win32' ? listWindowsProcessCandidates() : listPosixProcessCandidates();
}

function killCodexProcessTree(pid: number, platform: NodeJS.Platform): boolean {
  try {
    if (platform === 'win32') {
      childProcess.execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return true;
  } catch {
    return false;
  }
}

export function terminateCodexThreadProcess(
  target: CodexProcessTerminationTarget,
  options: CodexProcessTerminationOptions = {},
): CodexProcessTerminationResult {
  const hasTarget =
    !!target.threadId.trim() || !!target.cwd?.trim() || !!target.rolloutPath?.trim();
  if (!hasTarget) return { terminated: false, reason: 'missing-target' };

  const platform = options.platform ?? process.platform;
  let candidates: CodexProcessCandidate[];
  try {
    candidates = options.listProcesses?.() ?? listCodexProcessCandidates(platform);
  } catch {
    return { terminated: false, reason: 'process-list-failed' };
  }

  const matches = findMatchingCodexProcesses(target, candidates, platform);
  if (matches.length === 0) {
    return { terminated: false, reason: 'no-match', matchedCount: 0 };
  }
  if (matches.length > 1) {
    return { terminated: false, reason: 'ambiguous-match', matchedCount: matches.length };
  }

  const pid = matches[0].pid;
  const killed = options.killProcessTree
    ? options.killProcessTree(pid, platform)
    : killCodexProcessTree(pid, platform);
  return killed
    ? { terminated: true, reason: 'terminated', pid, matchedCount: 1 }
    : { terminated: false, reason: 'kill-failed', pid, matchedCount: 1 };
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function basename(value: unknown): string {
  return typeof value === 'string' ? path.basename(value) : '';
}

function safeCodexDelegateLabel(input: unknown): string {
  const data = objectValue(input);
  const raw = data?.agent_type ?? data?.agentRole ?? data?.role;
  if (typeof raw !== 'string') return 'worker';
  const label = raw.replace(/[^\w .-]/g, ' ').trim();
  return label || 'worker';
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
      return `Subtask: ${safeCodexDelegateLabel(input)}`;
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function isCodexSpawnAgentSuccessOutput(value: unknown): boolean {
  const output = objectValue(parseMaybeJson(value));
  const childThreadId = output?.agent_id ?? output?.agentId;
  return typeof childThreadId === 'string' && childThreadId.trim().length > 0;
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseCodexTokenUsage(value: unknown): CodexTokenUsageDetails {
  const usage = objectValue(value) ?? {};
  const cacheRead =
    numberValue(usage.cache_read_input_tokens) +
    numberValue(usage.cached_input_tokens) +
    numberValue(objectValue(usage.input_tokens_details)?.cache_read_tokens);
  return {
    input: Math.max(0, numberValue(usage.input_tokens) - cacheRead),
    output: numberValue(usage.output_tokens),
    reasoningOutput:
      numberValue(usage.reasoning_output_tokens) +
      numberValue(objectValue(usage.output_tokens_details)?.reasoning_tokens),
    cacheRead,
    cacheWrite:
      numberValue(usage.cache_creation_input_tokens) +
      numberValue(usage.cache_write_input_tokens) +
      numberValue(objectValue(usage.input_tokens_details)?.cache_creation_tokens),
    artifactEstimate: 0,
    estimated: false,
  };
}

function codexInputTotal(details: CodexTokenUsageDetails): number {
  return details.input + details.cacheRead + details.cacheWrite;
}

function codexOutputTotal(details: CodexTokenUsageDetails): number {
  return details.output + details.reasoningOutput;
}

function percentValue(value: unknown): number | undefined {
  const parsed = numberValue(value);
  if (parsed === 0 && value !== 0 && value !== '0') return undefined;
  if (parsed > 0 && parsed <= 1) return parsed * 100;
  return parsed;
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const parsed = numberValue(value);
  if (parsed <= 0) return undefined;
  return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
}

function parseCodexRateLimits(value: unknown): CodexRateLimitSnapshot[] | undefined {
  const record = objectValue(value);
  if (!record) return undefined;
  const out: CodexRateLimitSnapshot[] = [];
  for (const name of ['primary', 'secondary'] as const) {
    const limit = objectValue(record[name]);
    if (!limit) continue;
    const snapshot: CodexRateLimitSnapshot = { name };
    const usedPercent = percentValue(
      limit.used_percent ?? limit.usedPercent ?? limit.percent_used ?? limit.percentUsed,
    );
    const remainingPercent = percentValue(
      limit.remaining_percent ?? limit.remainingPercent ?? limit.percent_remaining,
    );
    if (usedPercent !== undefined) snapshot.usedPercent = usedPercent;
    if (remainingPercent !== undefined) snapshot.remainingPercent = remainingPercent;
    const resetAfterSeconds = numberValue(
      limit.reset_after_seconds ?? limit.resetAfterSeconds ?? limit.resets_in_seconds,
    );
    if (resetAfterSeconds > 0) snapshot.resetAfterSeconds = resetAfterSeconds;
    const resetAtMs = timestampMs(limit.reset_at_ms ?? limit.resetAtMs ?? limit.reset_at);
    if (resetAtMs !== undefined) snapshot.resetAtMs = resetAtMs;
    if (
      snapshot.usedPercent !== undefined ||
      snapshot.remainingPercent !== undefined ||
      snapshot.resetAfterSeconds !== undefined ||
      snapshot.resetAtMs !== undefined
    ) {
      out.push(snapshot);
    }
  }
  return out.length > 0 ? out : undefined;
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
      if (
        payloadType === 'function_call_output' &&
        isCodexSpawnAgentSuccessOutput(payload.output)
      ) {
        return null;
      }
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
      const details = parseCodexTokenUsage(info.total_token_usage);
      const inputTokens = codexInputTotal(details);
      const outputTokens = codexOutputTotal(details);
      return {
        kind: 'tokenUsage',
        inputTokens,
        outputTokens,
        details,
        lastTokenUsage: info.last_token_usage
          ? parseCodexTokenUsage(info.last_token_usage)
          : undefined,
        rateLimits: parseCodexRateLimits(info.rate_limits),
      };
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
