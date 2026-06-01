import * as fs from 'fs';

export interface TokenUsageSummary {
  inputTokens: number;
  outputTokens: number;
  artifactOutputTokens: number;
  estimated: boolean;
  details: TokenUsageDetails;
  usageKey?: string;
  lastTokenUsage?: TokenUsageDetails;
  rateLimits?: TokenRateLimitSnapshot[];
}

export interface TokenUsageDetails {
  input: number;
  output: number;
  reasoningOutput: number;
  cacheRead: number;
  cacheWrite: number;
  artifactEstimate: number;
  estimated: boolean;
}

export interface TokenRateLimitSnapshot {
  name: 'primary' | 'secondary';
  usedPercent?: number;
  remainingPercent?: number;
  resetAtMs?: number;
  resetAfterSeconds?: number;
}

const CHARS_PER_TOKEN_ESTIMATE = 4;
const EMPTY_DETAILS: TokenUsageDetails = {
  input: 0,
  output: 0,
  reasoningOutput: 0,
  cacheRead: 0,
  cacheWrite: 0,
  artifactEstimate: 0,
  estimated: false,
};

export function estimateTokensFromText(value: unknown): number {
  if (typeof value !== 'string' || value.length === 0) return 0;
  return Math.ceil(value.length / CHARS_PER_TOKEN_ESTIMATE);
}

export function extractClaudeUsage(record: Record<string, unknown>): TokenUsageSummary | null {
  const usage = findUsageObject(record);
  if (usage) {
    const details = parseProviderTokenDetails(usage, false);
    const inputTokens = tokenDetailsInputTotal(details);
    const outputTokens = tokenDetailsOutputTotal(details);
    if (inputTokens > 0 || outputTokens > 0) {
      return {
        inputTokens,
        outputTokens,
        artifactOutputTokens: 0,
        estimated: false,
        details,
        usageKey: claudeUsageKey(record),
      };
    }
  }

  const estimated = estimateTokensFromClaudeRecord(record);
  if (estimated.inputTokens > 0 || estimated.outputTokens > 0) {
    return { ...estimated, artifactOutputTokens: 0, estimated: true };
  }

  return null;
}

export function extractCodexTokenCount(record: Record<string, unknown>): TokenUsageSummary | null {
  const payload = objectValue(record.payload);
  if (record.type !== 'event_msg' || payload?.type !== 'token_count') return null;
  const info = objectValue(payload.info);
  const total = objectValue(info?.total_token_usage);
  if (!total) return null;
  const details = parseCodexTokenDetails(total);
  const inputTokens = tokenDetailsInputTotal(details);
  const outputTokens = tokenDetailsOutputTotal(details);
  if (inputTokens === 0 && outputTokens === 0) return null;
  const last = objectValue(info?.last_token_usage);
  return {
    inputTokens,
    outputTokens,
    artifactOutputTokens: 0,
    estimated: false,
    details,
    lastTokenUsage: last ? parseCodexTokenDetails(last) : undefined,
    rateLimits: parseRateLimits(info?.rate_limits),
  };
}

export function readTokenUsageFromTranscript(
  filePath: string,
  providerId: string | undefined,
): TokenUsageSummary | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    let estimatedInputTokens = 0;
    let estimatedOutputTokens = 0;
    let artifactOutputTokens = 0;
    let exactDetails = emptyTokenUsageDetails(false);
    const keyedClaudeExactUsage = new Map<string, TokenUsageDetails>();
    const unkeyedClaudeExactUsage: TokenUsageDetails[] = [];
    let latestCodexUsage: TokenUsageSummary | null = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      artifactOutputTokens += estimateArtifactOutputTokens(record, providerId);

      if (providerId === 'codex') {
        const codexUsage = extractCodexTokenCount(record);
        if (codexUsage) {
          latestCodexUsage = codexUsage;
        }
        continue;
      }

      const claudeUsage = extractClaudeUsage(record);
      if (!claudeUsage) continue;
      if (claudeUsage.estimated) {
        estimatedInputTokens += claudeUsage.inputTokens;
        estimatedOutputTokens += claudeUsage.outputTokens;
      } else if (claudeUsage.usageKey) {
        keyedClaudeExactUsage.set(claudeUsage.usageKey, claudeUsage.details);
      } else {
        unkeyedClaudeExactUsage.push(claudeUsage.details);
      }
    }

    if (providerId === 'codex' && latestCodexUsage) {
      return withArtifactEstimate(latestCodexUsage, artifactOutputTokens);
    }

    for (const details of keyedClaudeExactUsage.values()) {
      exactDetails = addTokenUsageDetails(exactDetails, details);
    }
    for (const details of unkeyedClaudeExactUsage) {
      exactDetails = addTokenUsageDetails(exactDetails, details);
    }
    const inputTokens = tokenDetailsInputTotal(exactDetails);
    const outputTokens = tokenDetailsOutputTotal(exactDetails);
    if (inputTokens > 0 || outputTokens > 0) {
      return withArtifactEstimate(
        {
          inputTokens,
          outputTokens,
          artifactOutputTokens,
          estimated: false,
          details: exactDetails,
        },
        artifactOutputTokens,
      );
    }
    if (estimatedInputTokens > 0 || estimatedOutputTokens > 0 || artifactOutputTokens > 0) {
      const details = {
        ...emptyTokenUsageDetails(true),
        input: estimatedInputTokens,
        output: estimatedOutputTokens,
      };
      return {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        artifactOutputTokens,
        estimated: true,
        details: { ...details, artifactEstimate: artifactOutputTokens },
      };
    }
  } catch {
    return null;
  }
  return null;
}

function findUsageObject(record: Record<string, unknown>): Record<string, unknown> | null {
  const message = objectValue(record.message);
  const messageUsage = objectValue(message?.usage);
  if (messageUsage) return messageUsage;
  const toolUseResult = objectValue(record.toolUseResult);
  const toolUsage = objectValue(toolUseResult?.usage);
  if (toolUsage) return toolUsage;
  return objectValue(record.usage);
}

function estimateTokensFromClaudeRecord(record: Record<string, unknown>): TokenUsageSummary {
  if (record.type === 'user') {
    const inputTokens = estimateTokensFromContent(record.message ?? record.content);
    return {
      inputTokens,
      outputTokens: 0,
      artifactOutputTokens: 0,
      estimated: true,
      details: { ...emptyTokenUsageDetails(true), input: inputTokens },
    };
  }
  if (record.type === 'assistant') {
    const outputTokens = estimateTokensFromContent(record.message ?? record.content);
    return {
      inputTokens: 0,
      outputTokens,
      artifactOutputTokens: 0,
      estimated: true,
      details: { ...emptyTokenUsageDetails(true), output: outputTokens },
    };
  }
  return {
    inputTokens: 0,
    outputTokens: 0,
    artifactOutputTokens: 0,
    estimated: true,
    details: emptyTokenUsageDetails(true),
  };
}

export function emptyTokenUsageDetails(estimated = false): TokenUsageDetails {
  return { ...EMPTY_DETAILS, estimated };
}

export function tokenDetailsInputTotal(details: TokenUsageDetails): number {
  return details.input + details.cacheRead + details.cacheWrite;
}

export function tokenDetailsOutputTotal(details: TokenUsageDetails): number {
  return details.output + details.reasoningOutput;
}

export function addTokenUsageDetails(
  a: TokenUsageDetails | undefined,
  b: TokenUsageDetails,
): TokenUsageDetails {
  const base = a ?? emptyTokenUsageDetails(b.estimated);
  return {
    input: base.input + b.input,
    output: base.output + b.output,
    reasoningOutput: base.reasoningOutput + b.reasoningOutput,
    cacheRead: base.cacheRead + b.cacheRead,
    cacheWrite: base.cacheWrite + b.cacheWrite,
    artifactEstimate: base.artifactEstimate + b.artifactEstimate,
    estimated: base.estimated || b.estimated,
  };
}

export function subtractTokenUsageDetails(
  a: TokenUsageDetails,
  b: TokenUsageDetails,
): TokenUsageDetails {
  return {
    input: a.input - b.input,
    output: a.output - b.output,
    reasoningOutput: a.reasoningOutput - b.reasoningOutput,
    cacheRead: a.cacheRead - b.cacheRead,
    cacheWrite: a.cacheWrite - b.cacheWrite,
    artifactEstimate: a.artifactEstimate - b.artifactEstimate,
    estimated: a.estimated || b.estimated,
  };
}

function withArtifactEstimate(
  usage: TokenUsageSummary,
  artifactOutputTokens: number,
): TokenUsageSummary {
  return {
    ...usage,
    artifactOutputTokens,
    details: { ...usage.details, artifactEstimate: artifactOutputTokens },
  };
}

function parseProviderTokenDetails(
  usage: Record<string, unknown>,
  estimated: boolean,
): TokenUsageDetails {
  return {
    input: numberValue(usage.input_tokens),
    output: numberValue(usage.output_tokens),
    reasoningOutput:
      numberValue(usage.reasoning_output_tokens) +
      numberValue(objectValue(usage.output_tokens_details)?.reasoning_tokens),
    cacheRead:
      numberValue(usage.cache_read_input_tokens) +
      numberValue(usage.cached_input_tokens) +
      numberValue(objectValue(usage.input_tokens_details)?.cache_read_tokens),
    cacheWrite:
      numberValue(usage.cache_creation_input_tokens) +
      numberValue(usage.cache_write_input_tokens) +
      numberValue(objectValue(usage.input_tokens_details)?.cache_creation_tokens),
    artifactEstimate: 0,
    estimated,
  };
}

function parseCodexTokenDetails(usage: Record<string, unknown>): TokenUsageDetails {
  const details = parseProviderTokenDetails(usage, false);
  if (details.cacheRead > 0) {
    details.input = Math.max(0, details.input - details.cacheRead);
  }
  return details;
}

function claudeUsageKey(record: Record<string, unknown>): string | undefined {
  const message = objectValue(record.message);
  const requestId =
    stringValue(record.requestId) ??
    stringValue(record.request_id) ??
    stringValue(objectValue(record.request)?.id) ??
    stringValue(message?.requestId) ??
    stringValue(message?.request_id);
  const messageId =
    stringValue(message?.id) ??
    stringValue(record.messageId) ??
    stringValue(record.message_id) ??
    stringValue(record.id);
  if (requestId && messageId) return `${requestId}:${messageId}`;
  return messageId ? `message:${messageId}` : undefined;
}

function parseRateLimits(value: unknown): TokenRateLimitSnapshot[] | undefined {
  const record = objectValue(value);
  if (!record) return undefined;
  const out: TokenRateLimitSnapshot[] = [];
  for (const name of ['primary', 'secondary'] as const) {
    const limit = objectValue(record[name]);
    if (!limit) continue;
    const snapshot: TokenRateLimitSnapshot = { name };
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

export function estimateArtifactOutputTokens(
  record: Record<string, unknown>,
  providerId: string | undefined,
): number {
  if (providerId === 'codex') return estimateCodexArtifactOutputTokens(record);
  return estimateClaudeArtifactOutputTokens(record);
}

function estimateCodexArtifactOutputTokens(record: Record<string, unknown>): number {
  if (record.type !== 'response_item') return 0;
  const payload = objectValue(record.payload);
  if (payload?.type !== 'function_call') return 0;
  const name = typeof payload.name === 'string' ? payload.name : '';
  if (!isArtifactGeneratingTool(name)) return 0;
  return estimateTokensFromContent(payload.arguments);
}

function estimateClaudeArtifactOutputTokens(record: Record<string, unknown>): number {
  const message = objectValue(record.message);
  const content = message?.content ?? record.content;
  if (!Array.isArray(content)) return 0;

  let total = 0;
  for (const block of content) {
    const item = objectValue(block);
    if (!item || item.type !== 'tool_use') continue;
    const name = typeof item.name === 'string' ? item.name : '';
    if (!isArtifactGeneratingTool(name)) continue;
    total += estimateArtifactPayloadTokens(item.input);
  }
  return total;
}

function isArtifactGeneratingTool(name: string): boolean {
  return ['apply_patch', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name);
}

function estimateArtifactPayloadTokens(value: unknown): number {
  if (typeof value === 'string') return estimateTokensFromText(value);
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + estimateArtifactPayloadTokens(item), 0);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    let total = 0;
    for (const key of ['content', 'new_string', 'old_string', 'text', 'source']) {
      total += estimateTokensFromContent(record[key]);
    }
    total += estimateArtifactPayloadTokens(record.edits);
    total += estimateArtifactPayloadTokens(record.patch);
    return total;
  }
  return 0;
}

function estimateTokensFromContent(value: unknown): number {
  if (typeof value === 'string') return estimateTokensFromText(value);
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + estimateTokensFromContent(item), 0);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return estimateTokensFromText(record.text);
    if (typeof record.content === 'string' || Array.isArray(record.content)) {
      return estimateTokensFromContent(record.content);
    }
    if (typeof record.prompt === 'string') return estimateTokensFromText(record.prompt);
  }
  return 0;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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
