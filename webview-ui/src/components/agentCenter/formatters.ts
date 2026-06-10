// Pure, dependency-free formatting/utility helpers extracted from AgentCenter.tsx so the cluster
// files can import them without reaching back into the monolithic surface component.

export function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return value.toLocaleString();
}

export function formatUsageOverviewMetricValue(value: number | string): string {
  return typeof value === 'number' ? compactNumber(value) : value;
}

export function formatProxyUsd(value: number): string {
  if (value <= 0) return '$0.0000';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function usageBarPercent(value: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(value > 0 ? 2 : 0, (value / total) * 100)) : 0;
}

export function formatRelative(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 2) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard copy failed');
}
