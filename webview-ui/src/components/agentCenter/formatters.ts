// Pure formatting / className helpers extracted from AgentCenter.tsx so the cluster files can import
// them without reaching back into the monolithic surface component. Only types are imported, so this
// module stays runtime dependency-free.
import type { TimelineSeverity } from '../timelinePageModel.js';
import type { UsageAccuracy, UsageInsight } from '../usageIntelligenceModel.js';

export function severityDot(severity?: 'info' | 'success' | 'warning' | 'error'): string {
  if (severity === 'error') return 'bg-status-error';
  if (severity === 'warning') return 'bg-status-permission';
  if (severity === 'success') return 'bg-status-success';
  return 'bg-status-active';
}

export function timelineSeverityClass(severity: TimelineSeverity): string {
  if (severity === 'error') return 'border-status-error bg-bg text-status-error';
  if (severity === 'warning') return 'border-status-permission bg-bg text-status-permission';
  if (severity === 'success') return 'border-status-success bg-bg text-status-success';
  return 'border-status-active bg-bg text-status-active';
}

export function usageInsightClass(severity: UsageInsight['severity']): string {
  if (severity === 'error') return 'bg-bg border-l-4 border-l-status-error';
  if (severity === 'warning') return 'bg-bg border-l-4 border-l-status-permission';
  return 'bg-bg';
}

export function usageInsightDotClass(severity: UsageInsight['severity']): string {
  if (severity === 'error') return 'bg-status-error';
  if (severity === 'warning') return 'bg-status-permission';
  return 'bg-status-active';
}

export function usageAccuracyShort(accuracy: UsageAccuracy): string {
  if (accuracy === 'exact') return 'Exact';
  if (accuracy === 'estimated') return 'Estimated';
  if (accuracy === 'mixed') return 'Mixed';
  return 'None';
}

export function usageAccuracyClass(accuracy: UsageAccuracy): string {
  if (accuracy === 'exact') return 'border-status-success bg-btn-bg text-text';
  if (accuracy === 'estimated') return 'border-status-permission bg-btn-bg text-text';
  if (accuracy === 'mixed') return 'border-status-active bg-btn-bg text-text';
  return 'border-border bg-btn-bg text-text-muted';
}

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
