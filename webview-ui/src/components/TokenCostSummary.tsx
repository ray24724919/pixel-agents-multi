import type { OfficeState } from '../office/engine/officeState.js';
import type { TokenRateLimitSnapshot, TokenUsageDetails } from '../office/types.js';

type ProviderId = 'codex' | 'claude';

interface TokenCostSummaryProps {
  agents: number[];
  officeState: OfficeState;
  compact?: boolean;
}

interface ProviderTokenSummary {
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
    label: 'Codex GPT-5.5 API proxy',
    inputRatePerMillion: 5,
    outputRatePerMillion: 30,
    note: 'Subscription usage shown as API-priced proxy.',
  },
  claude: {
    label: 'Claude Opus 4.7 API proxy',
    inputRatePerMillion: 5,
    outputRatePerMillion: 25,
    note: 'Subscription usage shown as API-priced proxy.',
  },
};

export function TokenCostSummary({ agents, officeState, compact = false }: TokenCostSummaryProps) {
  const summaries = getProviderTokenSummaries(agents, officeState);

  return (
    <div className={`pixel-panel ${compact ? 'p-3' : 'p-4'}`}>
      <div className={`grid gap-3 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-2'}`}>
        {summaries.map((summary) => (
          <div key={summary.providerId} className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-text-muted">{summary.label}</div>
            <div className={`mt-1 text-accent-bright ${compact ? 'text-lg' : 'text-xl'}`}>
              {formatCompact(summary.inputTokens + summary.outputTokens)} tokens ·{' '}
              {formatCost(summary.totalCost)}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-text-muted">
              {summary.estimated ? 'Estimated usage' : 'Exact usage'}
            </div>
            <div
              className={`mt-1 grid gap-x-4 gap-y-1 text-text ${compact ? 'text-xs' : 'text-sm'} sm:grid-cols-2`}
            >
              <span className="truncate">
                In {formatCompact(summary.inputTokens)} · {formatCost(summary.inputCost)}
              </span>
              <span className="truncate">
                Out {formatCompact(summary.outputTokens)} · {formatCost(summary.outputCost)}
              </span>
              <span className="truncate sm:col-span-2">
                Artifact {formatCompact(summary.artifactOutputTokens)} est.
              </span>
              {summary.details.reasoningOutput > 0 && (
                <span className="truncate">
                  Reasoning {formatCompact(summary.details.reasoningOutput)}
                </span>
              )}
              {(summary.details.cacheRead > 0 || summary.details.cacheWrite > 0) && (
                <span className="truncate">
                  Cache {formatCompact(summary.details.cacheRead + summary.details.cacheWrite)}
                </span>
              )}
            </div>
            {!compact && (
              <div className="mt-1 text-xs text-text-muted">
                {summary.estimated ? 'Some tokens are estimated. ' : 'Provider exact usage. '}
                {summary.note}
                {summary.codexRateLimit ? ` ${formatCodexRateLimit(summary.codexRateLimit)}` : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function getProviderTokenSummaries(
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
          estimated: sum.estimated || ch.tokenUsageEstimated === true,
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

function formatCodexRateLimit(limit: TokenRateLimitSnapshot): string {
  const percent =
    limit.usedPercent !== undefined
      ? `${Math.round(limit.usedPercent)}% quota used`
      : limit.remainingPercent !== undefined
        ? `${Math.round(limit.remainingPercent)}% quota remaining`
        : 'quota snapshot available';
  const reset = rateLimitResetText(limit);
  return reset ? `Codex ${percent}; resets ${reset}.` : `Codex ${percent}.`;
}

function rateLimitResetText(limit: TokenRateLimitSnapshot): string | undefined {
  let seconds: number | undefined;
  if (limit.resetAfterSeconds !== undefined) {
    seconds = limit.resetAfterSeconds;
  } else if (limit.resetAtMs !== undefined) {
    seconds = Math.max(0, Math.round((limit.resetAtMs - Date.now()) / 1000));
  }
  if (seconds === undefined) return undefined;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function estimateCost(tokens: number, ratePerMillion: number): number {
  return (tokens / 1_000_000) * ratePerMillion;
}

function formatCost(value: number): string {
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}b`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return value.toLocaleString();
}
