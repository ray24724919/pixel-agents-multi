import type { OfficeState } from '../office/engine/officeState.js';

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
            </div>
            {!compact && (
              <div className="mt-1 text-xs text-text-muted">
                {summary.estimated ? 'Some tokens are estimated. ' : ''}
                {summary.note}
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
        };
      },
      { inputTokens: 0, outputTokens: 0, artifactOutputTokens: 0, estimated: false },
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
      note: rate.note,
    };
  });
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
