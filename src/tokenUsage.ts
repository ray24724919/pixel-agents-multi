import * as fs from 'fs';

export interface TokenUsageSummary {
  inputTokens: number;
  outputTokens: number;
  artifactOutputTokens: number;
  estimated: boolean;
}

const CHARS_PER_TOKEN_ESTIMATE = 4;

export function estimateTokensFromText(value: unknown): number {
  if (typeof value !== 'string' || value.length === 0) return 0;
  return Math.ceil(value.length / CHARS_PER_TOKEN_ESTIMATE);
}

export function extractClaudeUsage(record: Record<string, unknown>): TokenUsageSummary | null {
  const usage = findUsageObject(record);
  if (usage) {
    const inputTokens =
      numberValue(usage.input_tokens) +
      numberValue(usage.cache_creation_input_tokens) +
      numberValue(usage.cache_read_input_tokens);
    const outputTokens = numberValue(usage.output_tokens);
    if (inputTokens > 0 || outputTokens > 0) {
      return { inputTokens, outputTokens, artifactOutputTokens: 0, estimated: false };
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
  const inputTokens = numberValue(total.input_tokens);
  const outputTokens =
    numberValue(total.output_tokens) + numberValue(total.reasoning_output_tokens);
  if (inputTokens === 0 && outputTokens === 0) return null;
  return { inputTokens, outputTokens, artifactOutputTokens: 0, estimated: false };
}

export function readTokenUsageFromTranscript(
  filePath: string,
  providerId: string | undefined,
): TokenUsageSummary | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedInputTokens = 0;
    let estimatedOutputTokens = 0;
    let artifactOutputTokens = 0;
    let sawExact = false;

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
          inputTokens = codexUsage.inputTokens;
          outputTokens = codexUsage.outputTokens;
          sawExact = true;
        }
        continue;
      }

      const claudeUsage = extractClaudeUsage(record);
      if (!claudeUsage) continue;
      if (claudeUsage.estimated) {
        estimatedInputTokens += claudeUsage.inputTokens;
        estimatedOutputTokens += claudeUsage.outputTokens;
      } else {
        inputTokens += claudeUsage.inputTokens;
        outputTokens += claudeUsage.outputTokens;
        sawExact = true;
      }
    }

    if (inputTokens > 0 || outputTokens > 0) {
      return { inputTokens, outputTokens, artifactOutputTokens, estimated: false };
    }
    if (estimatedInputTokens > 0 || estimatedOutputTokens > 0 || artifactOutputTokens > 0) {
      return {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        artifactOutputTokens,
        estimated: !sawExact,
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
    return {
      inputTokens: estimateTokensFromContent(record.message ?? record.content),
      outputTokens: 0,
      artifactOutputTokens: 0,
      estimated: true,
    };
  }
  if (record.type === 'assistant') {
    return {
      inputTokens: 0,
      outputTokens: estimateTokensFromContent(record.message ?? record.content),
      artifactOutputTokens: 0,
      estimated: true,
    };
  }
  return { inputTokens: 0, outputTokens: 0, artifactOutputTokens: 0, estimated: true };
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

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
