import type { OfficeState } from '../office/engine/officeState.js';
import type { TokenRateLimitSnapshot } from '../office/types.js';
import { getProviderTokenSummaries } from './tokenCostSummaryModel.js';

interface TokenCostSummaryProps {
  agents: number[];
  officeState: OfficeState;
  compact?: boolean;
}

export function TokenCostSummary({ agents, officeState, compact = false }: TokenCostSummaryProps) {
  const summaries = getProviderTokenSummaries(agents, officeState);

  return (
    <div className={`pixel-panel ${compact ? 'p-3' : 'p-4'}`}>
      <div className={`grid gap-3 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-2'}`}>
        {summaries.map((summary) => (
          <div key={summary.providerId} className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-text-muted">{summary.label}</div>
            <div className={`mt-1 text-accent-bright ${compact ? 'text-lg' : 'text-xl'}`}>
              {formatCompact(summary.inputTokens + summary.outputTokens)} tokens /{' '}
              {formatCost(summary.totalCost)}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-text-muted">
              {summary.estimated ? 'Mixed exact/estimated' : 'Exact provider-reported'}
            </div>
            <div
              className={`mt-1 grid gap-x-4 gap-y-1 text-text ${compact ? 'text-xs' : 'text-sm'} sm:grid-cols-2`}
            >
              <span className="truncate">
                Input {formatCompact(summary.inputTokens)} / {formatCost(summary.inputCost)}
              </span>
              <span className="truncate">
                Output {formatCompact(summary.outputTokens)} / {formatCost(summary.outputCost)}
              </span>
              {summary.artifactOutputTokens > 0 && (
                <span className="truncate sm:col-span-2">
                  Artifact estimate {formatCompact(summary.artifactOutputTokens)} (not priced)
                </span>
              )}
              {summary.details.reasoningOutput > 0 && (
                <span className="truncate">
                  Reasoning {formatCompact(summary.details.reasoningOutput)}
                </span>
              )}
              {summary.details.cacheRead > 0 && (
                <span className="truncate">
                  Cache read {formatCompact(summary.details.cacheRead)}
                </span>
              )}
              {summary.details.cacheWrite > 0 && (
                <span className="truncate">
                  Cache write {formatCompact(summary.details.cacheWrite)}
                </span>
              )}
            </div>
            {!compact && (
              <div className="mt-1 text-xs text-text-muted">
                {summary.estimated
                  ? 'Includes estimated transcript or artifact tokens. '
                  : 'Provider-reported token totals. '}
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

function formatCost(value: number): string {
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}b`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return value.toLocaleString();
}
