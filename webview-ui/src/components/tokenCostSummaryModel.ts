import type { OfficeState } from '../office/engine/officeState.js';
import type { TokenRateLimitSnapshot, TokenUsageDetails } from '../office/types.js';

export type ProviderId = 'codex' | 'claude';

export interface ProviderTokenSummary {
  providerId: ProviderId;
  label: string;
  inputTokens: number;
  outputTokens: number;
  artifactOutputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  estimated: boolean;
  details: TokenUsageDetails;
  codexRateLimit?: TokenRateLimitSnapshot;
  note: string;
}

const PROVIDER_RATES: Record<
  ProviderId,
  { label: string; inputRatePerMillion: number; outputRatePerMillion: number; note: string }
> = {
  codex: {
    label: 'Codex usage proxy',
    inputRatePerMillion: 5,
    outputRatePerMillion: 30,
    note: 'Proxy estimate only; subscription plans may not bill per token.',
  },
  claude: {
    label: 'Claude usage proxy',
    inputRatePerMillion: 5,
    outputRatePerMillion: 25,
    note: 'Proxy estimate only; subscription plans may not bill per token.',
  },
};

export function getProviderTokenSummaries(
  agents: number[],
  officeState: OfficeState,
): ProviderTokenSummary[] {
  return (['codex', 'claude'] as const).map((providerId) => {
    const rate = PROVIDER_RATES[providerId];
    const totals = agents.reduce(
      (sum, id) => {
        const ch = officeState.characters.get(id);
        if (!ch || (ch.providerId ?? 'claude') !== providerId) return sum;
        return {
          inputTokens: sum.inputTokens + ch.inputTokens,
          outputTokens: sum.outputTokens + ch.outputTokens,
          artifactOutputTokens: sum.artifactOutputTokens + (ch.artifactOutputTokens ?? 0),
          estimated:
            sum.estimated ||
            ch.tokenUsageEstimated === true ||
            ch.tokenUsageDetails?.estimated === true,
          details: addDetails(sum.details, ch.tokenUsageDetails),
          codexRateLimit: ch.codexRateLimit ?? sum.codexRateLimit,
        };
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        artifactOutputTokens: 0,
        estimated: false,
        details: emptyDetails(),
        codexRateLimit: undefined as TokenRateLimitSnapshot | undefined,
      },
    );
    const inputCost = estimateCost(totals.inputTokens, rate.inputRatePerMillion);
    const outputCost = estimateCost(totals.outputTokens, rate.outputRatePerMillion);
    return {
      providerId,
      label: rate.label,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      artifactOutputTokens: totals.artifactOutputTokens,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      estimated: totals.estimated,
      details: totals.details,
      codexRateLimit: totals.codexRateLimit,
      note: rate.note,
    };
  });
}

function emptyDetails(): TokenUsageDetails {
  return {
    input: 0,
    output: 0,
    reasoningOutput: 0,
    cacheRead: 0,
    cacheWrite: 0,
    artifactEstimate: 0,
    estimated: false,
  };
}

function addDetails(a: TokenUsageDetails, b: TokenUsageDetails | undefined): TokenUsageDetails {
  if (!b) return a;
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    reasoningOutput: a.reasoningOutput + b.reasoningOutput,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    artifactEstimate: a.artifactEstimate + b.artifactEstimate,
    estimated: a.estimated || b.estimated,
  };
}

function estimateCost(tokens: number, ratePerMillion: number): number {
  return (tokens / 1_000_000) * ratePerMillion;
}
