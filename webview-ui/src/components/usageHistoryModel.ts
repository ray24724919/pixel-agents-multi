export type UsageHistoryRecordKind =
  | 'usage_delta'
  | 'artifact_estimate'
  | 'rate_limit_snapshot'
  | 'session_summary';
export type UsageHistoryTokenSource = 'exact_provider' | 'estimated_transcript' | 'mixed';
export type UsageHistoryArtifactSource = 'estimated_tool_payload' | 'none';
export type UsageHistoryAccuracy = 'none' | 'exact' | 'estimated' | 'mixed';
export type UsageHistoryRateLimitName = 'primary' | 'secondary';
export type UsageHistoryRateLimitSource = 'provider_exact' | 'estimated_window';
export type UsageHistoryModelSource = 'provider' | 'transcript' | 'unknown';
export type UsageHistoryTimeWindowId = 'today' | 'last_7_days';
export type UsageHistoryEmptyKind = 'no_records' | 'all_filtered_out' | 'no_usage';

export interface UsageHistoryRecordV1 {
  schemaVersion: 1;
  id: string;
  recordKind: UsageHistoryRecordKind;
  capturedAtMs: number;
  occurredAtMs?: number;
  bucketDateLocal?: string;
  provider: {
    id: string;
    label: string;
  };
  model?: {
    id?: string;
    displayName?: string;
    source: UsageHistoryModelSource;
  };
  project: {
    name: string;
    dir?: string;
    dirHash?: string;
  };
  agent: {
    id: number;
    name: string;
    teamName?: string;
    roleName?: string;
    leadAgentId?: number;
    hidden?: boolean;
    archived?: boolean;
  };
  session: {
    id?: string;
    transcriptPath?: string;
    threadId?: string;
    turnId?: string;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningOutputTokens: number;
    artifactOutputTokens: number;
  };
  totals: {
    providerInputTotal: number;
    providerOutputTotal: number;
    providerTotal: number;
    displayTotal: number;
  };
  accuracy: {
    tokenSource: UsageHistoryTokenSource;
    artifactSource: UsageHistoryArtifactSource;
    isDeltaFromSnapshot: boolean;
    evidence?: string;
  };
  apiProxyEstimate?: {
    currency: 'USD';
    inputRatePerMillion: number;
    outputRatePerMillion: number;
    inputProxy: number;
    outputProxy: number;
    totalProxy: number;
    rateSource: 'configured' | 'default';
    nonBillingLabel: 'API proxy estimate only';
    nonBillingNote?: 'Not actual subscription billing';
  };
  rateLimits?: UsageHistoryRecordRateLimit[];
}

export interface UsageHistoryRecordRateLimit {
  name: UsageHistoryRateLimitName;
  usedPercent?: number;
  remainingPercent?: number;
  resetAtMs?: number;
  resetAfterSeconds?: number;
  source: UsageHistoryRateLimitSource;
}

export interface UsageHistoryFilters {
  providerIds?: readonly string[];
  modelIds?: readonly string[];
  projectNames?: readonly string[];
  projectDirHashes?: readonly string[];
  agentIds?: readonly number[];
  sessionIds?: readonly string[];
  threadIds?: readonly string[];
  fromMs?: number;
  toMs?: number;
}

export interface UsageHistoryModelOptions {
  filters?: UsageHistoryFilters;
  includeRawPaths?: boolean;
  nowMs?: number;
}

export interface UsageHistoryTotals {
  recordCount: number;
  usageRecordCount: number;
  rateLimitRecordCount: number;
  inputTokens: number;
  outputTokens: number;
  providerInputTokens: number;
  providerOutputTokens: number;
  providerTokens: number;
  artifactOutputTokens: number;
  displayTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheTokens: number;
  reasoningOutputTokens: number;
  apiProxyEstimateUsd: number;
  exactRecordCount: number;
  estimatedRecordCount: number;
  mixedRecordCount: number;
  artifactRecordCount: number;
  accuracy: UsageHistoryAccuracy;
  firstActivityMs?: number;
  lastActivityMs?: number;
}

export interface UsageHistoryProviderSummary extends UsageHistoryTotals {
  providerId: string;
  label: string;
  share: number;
  latestRateLimits: UsageHistoryRateLimitSnapshot[];
}

export interface UsageHistoryModelSummary extends UsageHistoryTotals {
  modelId: string;
  label: string;
  source: UsageHistoryModelSource;
  providerIds: string[];
}

export interface UsageHistoryProjectSummary extends UsageHistoryTotals {
  projectKey: string;
  projectName: string;
  projectDirHash?: string;
  projectDir?: string;
  providerIds: string[];
  topAgentName?: string;
  topAgentTokens: number;
}

export interface UsageHistoryAgentSummary extends UsageHistoryTotals {
  agentId: number;
  agentName: string;
  teamName?: string;
  roleName?: string;
  providerIds: string[];
  sessionIds: string[];
}

export interface UsageHistorySessionSummary extends UsageHistoryTotals {
  sessionKey: string;
  sessionId?: string;
  threadId?: string;
  transcriptPath?: string;
  providerId: string;
  providerLabel: string;
  projectName: string;
  projectDirHash?: string;
  agentId: number;
  agentName: string;
}

export interface UsageHistoryLedgerRow extends UsageHistoryTotals {
  ledgerKey: string;
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  projectName: string;
  projectDirHash?: string;
  projectDir?: string;
  agentId: number;
  agentName: string;
  teamName?: string;
  roleName?: string;
  sessionId?: string;
  threadId?: string;
  transcriptPath?: string;
}

export interface UsageHistoryTimeWindowSummary extends UsageHistoryTotals {
  id: UsageHistoryTimeWindowId;
  label: string;
  fromMs: number;
  toMs: number;
}

export interface UsageHistoryTrendBucket extends UsageHistoryTotals {
  id: string;
  label: string;
  fromMs: number;
  toMs: number;
}

export interface UsageHistoryTrendSet {
  today: UsageHistoryTrendBucket[];
  last7Days: UsageHistoryTrendBucket[];
}

export interface UsageHistoryRateLimitSnapshot {
  providerId: string;
  providerLabel: string;
  recordId: string;
  capturedAtMs: number;
  occurredAtMs?: number;
  name: UsageHistoryRateLimitName;
  usedPercent?: number;
  remainingPercent?: number;
  resetAtMs?: number;
  resetAfterSeconds?: number;
  source: UsageHistoryRateLimitSource;
}

export interface UsageHistoryEmptyState {
  kind: UsageHistoryEmptyKind;
  title: string;
  detail: string;
  activeFilters: string[];
}

export type UsageHistoryExportColumn = (typeof USAGE_HISTORY_EXPORT_COLUMNS)[number];
export type UsageHistoryExportRow = Record<UsageHistoryExportColumn, string | number>;

export interface UsageHistoryExportData {
  schemaVersion: 1;
  redacted: boolean;
  nonBillingLabel: 'API proxy estimate only';
  nonBillingNote: 'Not actual subscription billing';
  rows: UsageHistoryExportRow[];
  csv: string;
}

export interface UsageHistoryModel {
  totals: UsageHistoryTotals;
  providers: UsageHistoryProviderSummary[];
  models: UsageHistoryModelSummary[];
  projects: UsageHistoryProjectSummary[];
  agents: UsageHistoryAgentSummary[];
  sessions: UsageHistorySessionSummary[];
  timeWindows: UsageHistoryTimeWindowSummary[];
  trends: UsageHistoryTrendSet;
  ledgerRows: UsageHistoryLedgerRow[];
  latestRateLimits: UsageHistoryRateLimitSnapshot[];
  exportData: UsageHistoryExportData;
  emptyState?: UsageHistoryEmptyState;
  activeFilters: string[];
  filteredRecordCount: number;
  sourceRecordCount: number;
}

interface NormalizedUsageHistoryRecord {
  eventMs: number;
  inputTokens: number;
  outputTokens: number;
  providerInputTokens: number;
  providerOutputTokens: number;
  providerTokens: number;
  artifactOutputTokens: number;
  displayTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheTokens: number;
  reasoningOutputTokens: number;
  apiProxyEstimateUsd: number;
  hasUsage: boolean;
  hasRateLimit: boolean;
  exactRecordCount: number;
  estimatedRecordCount: number;
  mixedRecordCount: number;
  artifactRecordCount: number;
  modelId: string;
  modelLabel: string;
  modelSource: UsageHistoryModelSource;
  sessionKey: string;
  projectKey: string;
}

interface UsageHistoryEntry {
  record: UsageHistoryRecordV1;
  normalized: NormalizedUsageHistoryRecord;
  index: number;
}

const USAGE_HISTORY_EXPORT_COLUMNS = [
  'occurred_at',
  'provider',
  'provider_label',
  'model',
  'project',
  'project_hash',
  'project_dir',
  'agent_id',
  'agent_name',
  'team',
  'role',
  'session_id',
  'thread_id',
  'transcript_path',
  'input_tokens',
  'output_tokens',
  'provider_input_tokens',
  'provider_output_tokens',
  'provider_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'reasoning_output_tokens',
  'artifact_output_tokens',
  'display_tokens',
  'token_source',
  'artifact_source',
  'api_proxy_estimate_usd',
  'non_billing_label',
  'non_billing_note',
  'last_activity',
] as const;

const API_PROXY_NON_BILLING_LABEL = 'API proxy estimate only';
const NOT_ACTUAL_SUBSCRIPTION_BILLING = 'Not actual subscription billing';
const UNKNOWN_MODEL_ID = 'unknown';
const UNKNOWN_MODEL_LABEL = 'Unknown model';
const UNKNOWN_SESSION_KEY = 'unknown-session';
const HOURS_PER_DAY = 24;
const LAST_7_DAYS = 7;
const MS_PER_HOUR = 60 * 60 * 1_000;
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;

export function buildUsageHistoryModel(
  records: readonly UsageHistoryRecordV1[],
  options: UsageHistoryModelOptions = {},
): UsageHistoryModel {
  const includeRawPaths = options.includeRawPaths === true;
  const activeFilters = describeActiveFilters(options.filters);
  const entries = records.map((record, index) => ({
    record,
    normalized: normalizeRecord(record),
    index,
  }));
  const filteredEntries = entries.filter((entry) => matchesFilters(entry, options.filters));

  const totals = createUsageHistoryTotals();
  const providers = new Map<string, UsageHistoryProviderSummary>();
  const models = new Map<string, UsageHistoryModelSummary>();
  const projects = new Map<string, UsageHistoryProjectSummary>();
  const agents = new Map<string, UsageHistoryAgentSummary>();
  const sessions = new Map<string, UsageHistorySessionSummary>();
  const ledgerRows = new Map<string, UsageHistoryLedgerRow>();
  const latestRateLimitEntries = new Map<string, UsageHistoryEntry>();

  for (const entry of filteredEntries) {
    addNormalizedRecord(totals, entry.normalized);
    addProvider(providers, entry);
    addModel(models, entry);
    addProject(projects, entry, includeRawPaths);
    addAgent(agents, entry);
    addSession(sessions, entry, includeRawPaths);
    addLedgerRow(ledgerRows, entry, includeRawPaths);
    updateLatestRateLimitEntry(latestRateLimitEntries, entry);
  }

  finalizeUsageHistoryTotals(totals);
  const latestRateLimits = [...latestRateLimitEntries.values()]
    .flatMap((entry) => createRateLimitSnapshots(entry))
    .sort(compareRateLimitSnapshots);

  const providerSummaries = [...providers.values()]
    .map((provider) => {
      finalizeUsageHistoryTotals(provider);
      provider.share = shareOf(provider.providerTokens, totals.providerTokens);
      provider.latestRateLimits = latestRateLimits.filter(
        (snapshot) => snapshot.providerId === provider.providerId,
      );
      return provider;
    })
    .sort(compareTokenSummaries);

  const exportRows = filteredEntries
    .map((entry) => createExportRow(entry, includeRawPaths))
    .sort(compareExportRows);

  const model: UsageHistoryModel = {
    totals,
    providers: providerSummaries,
    models: finalizeGroupSummaries(models).sort(compareTokenSummaries),
    projects: finalizeGroupSummaries(projects).sort(compareTokenSummaries),
    agents: finalizeGroupSummaries(agents).sort(compareTokenSummaries),
    sessions: finalizeGroupSummaries(sessions).sort(compareTokenSummaries),
    timeWindows: buildTimeWindowSummaries(filteredEntries, options.nowMs ?? Date.now()),
    trends: buildTrendSets(filteredEntries, options.nowMs ?? Date.now()),
    ledgerRows: finalizeGroupSummaries(ledgerRows).sort(compareLedgerRows),
    latestRateLimits,
    exportData: {
      schemaVersion: 1,
      redacted: !includeRawPaths,
      nonBillingLabel: API_PROXY_NON_BILLING_LABEL,
      nonBillingNote: NOT_ACTUAL_SUBSCRIPTION_BILLING,
      rows: exportRows,
      csv: buildExportCsv(exportRows),
    },
    emptyState: createEmptyState(records.length, filteredEntries.length, totals, activeFilters),
    activeFilters,
    filteredRecordCount: filteredEntries.length,
    sourceRecordCount: records.length,
  };

  return model;
}

export function usageHistoryAccuracyLabel(accuracy: UsageHistoryAccuracy): string {
  if (accuracy === 'exact') return 'Exact provider-reported';
  if (accuracy === 'estimated') return 'Estimated only';
  if (accuracy === 'mixed') return 'Mixed exact/estimated';
  return 'No usage yet';
}

function createUsageHistoryTotals(): UsageHistoryTotals {
  return {
    recordCount: 0,
    usageRecordCount: 0,
    rateLimitRecordCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    providerInputTokens: 0,
    providerOutputTokens: 0,
    providerTokens: 0,
    artifactOutputTokens: 0,
    displayTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheTokens: 0,
    reasoningOutputTokens: 0,
    apiProxyEstimateUsd: 0,
    exactRecordCount: 0,
    estimatedRecordCount: 0,
    mixedRecordCount: 0,
    artifactRecordCount: 0,
    accuracy: 'none',
  };
}

function normalizeRecord(record: UsageHistoryRecordV1): NormalizedUsageHistoryRecord {
  const inputTokens = positiveNumber(record.usage.inputTokens);
  const outputTokens = positiveNumber(record.usage.outputTokens);
  const cacheReadTokens = positiveNumber(record.usage.cacheReadTokens);
  const cacheWriteTokens = positiveNumber(record.usage.cacheWriteTokens);
  const reasoningOutputTokens = positiveNumber(record.usage.reasoningOutputTokens);
  const artifactOutputTokens = positiveNumber(record.usage.artifactOutputTokens);
  const fallbackProviderInputTokens = inputTokens + cacheReadTokens + cacheWriteTokens;
  const fallbackProviderOutputTokens = outputTokens + reasoningOutputTokens;
  const providerInputTokens =
    positiveNumber(record.totals.providerInputTotal) || fallbackProviderInputTokens;
  const providerOutputTokens =
    positiveNumber(record.totals.providerOutputTotal) || fallbackProviderOutputTokens;
  const providerTokens =
    positiveNumber(record.totals.providerTotal) || providerInputTokens + providerOutputTokens;
  const hasProviderUsage = providerTokens > 0;
  const hasArtifactUsage = artifactOutputTokens > 0;
  const estimatedByArtifact =
    hasArtifactUsage &&
    (record.recordKind === 'artifact_estimate' ||
      record.accuracy.artifactSource === 'estimated_tool_payload');

  return {
    eventMs: getRecordEventMs(record),
    inputTokens,
    outputTokens,
    providerInputTokens,
    providerOutputTokens,
    providerTokens,
    artifactOutputTokens,
    displayTokens: providerTokens + artifactOutputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheTokens: cacheReadTokens + cacheWriteTokens,
    reasoningOutputTokens,
    apiProxyEstimateUsd: positiveNumber(record.apiProxyEstimate?.totalProxy),
    hasUsage: providerTokens > 0 || artifactOutputTokens > 0,
    hasRateLimit: (record.rateLimits?.length ?? 0) > 0,
    exactRecordCount: hasProviderUsage && record.accuracy.tokenSource === 'exact_provider' ? 1 : 0,
    estimatedRecordCount:
      (hasProviderUsage && record.accuracy.tokenSource === 'estimated_transcript') ||
      estimatedByArtifact
        ? 1
        : 0,
    mixedRecordCount: hasProviderUsage && record.accuracy.tokenSource === 'mixed' ? 1 : 0,
    artifactRecordCount: hasArtifactUsage ? 1 : 0,
    modelId: record.model?.id ?? UNKNOWN_MODEL_ID,
    modelLabel: record.model?.displayName ?? record.model?.id ?? UNKNOWN_MODEL_LABEL,
    modelSource: record.model?.source ?? 'unknown',
    sessionKey: getSessionKey(record),
    projectKey: getProjectKey(record),
  };
}

function addNormalizedRecord(
  totals: UsageHistoryTotals,
  normalized: NormalizedUsageHistoryRecord,
): void {
  totals.recordCount += 1;
  if (normalized.hasUsage) totals.usageRecordCount += 1;
  if (normalized.hasRateLimit) totals.rateLimitRecordCount += 1;
  totals.inputTokens += normalized.inputTokens;
  totals.outputTokens += normalized.outputTokens;
  totals.providerInputTokens += normalized.providerInputTokens;
  totals.providerOutputTokens += normalized.providerOutputTokens;
  totals.providerTokens += normalized.providerTokens;
  totals.artifactOutputTokens += normalized.artifactOutputTokens;
  totals.displayTokens += normalized.displayTokens;
  totals.cacheReadTokens += normalized.cacheReadTokens;
  totals.cacheWriteTokens += normalized.cacheWriteTokens;
  totals.cacheTokens += normalized.cacheTokens;
  totals.reasoningOutputTokens += normalized.reasoningOutputTokens;
  totals.apiProxyEstimateUsd += normalized.apiProxyEstimateUsd;
  totals.exactRecordCount += normalized.exactRecordCount;
  totals.estimatedRecordCount += normalized.estimatedRecordCount;
  totals.mixedRecordCount += normalized.mixedRecordCount;
  totals.artifactRecordCount += normalized.artifactRecordCount;
  totals.firstActivityMs =
    totals.firstActivityMs === undefined
      ? normalized.eventMs
      : Math.min(totals.firstActivityMs, normalized.eventMs);
  totals.lastActivityMs =
    totals.lastActivityMs === undefined
      ? normalized.eventMs
      : Math.max(totals.lastActivityMs, normalized.eventMs);
}

function finalizeUsageHistoryTotals(totals: UsageHistoryTotals): void {
  totals.accuracy = getUsageHistoryAccuracy(totals);
}

function getUsageHistoryAccuracy(totals: UsageHistoryTotals): UsageHistoryAccuracy {
  if (totals.mixedRecordCount > 0) return 'mixed';
  if (totals.exactRecordCount > 0 && totals.estimatedRecordCount > 0) return 'mixed';
  if (totals.estimatedRecordCount > 0) return 'estimated';
  if (totals.exactRecordCount > 0) return 'exact';
  return 'none';
}

function addProvider(
  providers: Map<string, UsageHistoryProviderSummary>,
  entry: UsageHistoryEntry,
): void {
  const key = entry.record.provider.id;
  const provider =
    providers.get(key) ??
    ({
      ...createUsageHistoryTotals(),
      providerId: key,
      label: entry.record.provider.label || key,
      share: 0,
      latestRateLimits: [],
    } satisfies UsageHistoryProviderSummary);
  addNormalizedRecord(provider, entry.normalized);
  providers.set(key, provider);
}

function addModel(models: Map<string, UsageHistoryModelSummary>, entry: UsageHistoryEntry): void {
  const key = `${entry.record.provider.id}:${entry.normalized.modelId}`;
  const model =
    models.get(key) ??
    ({
      ...createUsageHistoryTotals(),
      modelId: entry.normalized.modelId,
      label: entry.normalized.modelLabel,
      source: entry.normalized.modelSource,
      providerIds: [],
    } satisfies UsageHistoryModelSummary);
  addUniqueText(model.providerIds, entry.record.provider.id);
  addNormalizedRecord(model, entry.normalized);
  models.set(key, model);
}

function addProject(
  projects: Map<string, UsageHistoryProjectSummary>,
  entry: UsageHistoryEntry,
  includeRawPaths: boolean,
): void {
  const project =
    projects.get(entry.normalized.projectKey) ??
    ({
      ...createUsageHistoryTotals(),
      projectKey: entry.normalized.projectKey,
      projectName: entry.record.project.name,
      projectDirHash: entry.record.project.dirHash,
      projectDir: includeRawPaths ? entry.record.project.dir : undefined,
      providerIds: [],
      topAgentTokens: 0,
    } satisfies UsageHistoryProjectSummary);
  addUniqueText(project.providerIds, entry.record.provider.id);
  addNormalizedRecord(project, entry.normalized);
  if (entry.normalized.displayTokens > project.topAgentTokens) {
    project.topAgentName = entry.record.agent.name;
    project.topAgentTokens = entry.normalized.displayTokens;
  }
  projects.set(entry.normalized.projectKey, project);
}

function addAgent(agents: Map<string, UsageHistoryAgentSummary>, entry: UsageHistoryEntry): void {
  const key = String(entry.record.agent.id);
  const agent =
    agents.get(key) ??
    ({
      ...createUsageHistoryTotals(),
      agentId: entry.record.agent.id,
      agentName: entry.record.agent.name,
      teamName: entry.record.agent.teamName,
      roleName: entry.record.agent.roleName,
      providerIds: [],
      sessionIds: [],
    } satisfies UsageHistoryAgentSummary);
  addUniqueText(agent.providerIds, entry.record.provider.id);
  if (entry.record.session.id) addUniqueText(agent.sessionIds, entry.record.session.id);
  addNormalizedRecord(agent, entry.normalized);
  agents.set(key, agent);
}

function addSession(
  sessions: Map<string, UsageHistorySessionSummary>,
  entry: UsageHistoryEntry,
  includeRawPaths: boolean,
): void {
  const session =
    sessions.get(entry.normalized.sessionKey) ??
    ({
      ...createUsageHistoryTotals(),
      sessionKey: entry.normalized.sessionKey,
      sessionId: entry.record.session.id,
      threadId: entry.record.session.threadId,
      transcriptPath: includeRawPaths ? entry.record.session.transcriptPath : undefined,
      providerId: entry.record.provider.id,
      providerLabel: entry.record.provider.label || entry.record.provider.id,
      projectName: entry.record.project.name,
      projectDirHash: entry.record.project.dirHash,
      agentId: entry.record.agent.id,
      agentName: entry.record.agent.name,
    } satisfies UsageHistorySessionSummary);
  addNormalizedRecord(session, entry.normalized);
  sessions.set(entry.normalized.sessionKey, session);
}

function addLedgerRow(
  ledgerRows: Map<string, UsageHistoryLedgerRow>,
  entry: UsageHistoryEntry,
  includeRawPaths: boolean,
): void {
  const key = [
    entry.record.provider.id,
    entry.normalized.modelId,
    entry.normalized.projectKey,
    entry.record.agent.id,
    entry.normalized.sessionKey,
  ].join('\u0000');
  const row =
    ledgerRows.get(key) ??
    ({
      ...createUsageHistoryTotals(),
      ledgerKey: key,
      providerId: entry.record.provider.id,
      providerLabel: entry.record.provider.label || entry.record.provider.id,
      modelId: entry.normalized.modelId,
      modelLabel: entry.normalized.modelLabel,
      projectName: entry.record.project.name,
      projectDirHash: entry.record.project.dirHash,
      projectDir: includeRawPaths ? entry.record.project.dir : undefined,
      agentId: entry.record.agent.id,
      agentName: entry.record.agent.name,
      teamName: entry.record.agent.teamName,
      roleName: entry.record.agent.roleName,
      sessionId: entry.record.session.id,
      threadId: entry.record.session.threadId,
      transcriptPath: includeRawPaths ? entry.record.session.transcriptPath : undefined,
    } satisfies UsageHistoryLedgerRow);
  addNormalizedRecord(row, entry.normalized);
  ledgerRows.set(key, row);
}

function finalizeGroupSummaries<T extends UsageHistoryTotals>(groups: Map<string, T>): T[] {
  return [...groups.values()].map((group) => {
    finalizeUsageHistoryTotals(group);
    return group;
  });
}

function updateLatestRateLimitEntry(
  latestRateLimits: Map<string, UsageHistoryEntry>,
  entry: UsageHistoryEntry,
): void {
  if (!entry.record.rateLimits?.length) return;
  const key = entry.record.provider.id;
  const previous = latestRateLimits.get(key);
  if (!previous || entry.normalized.eventMs >= previous.normalized.eventMs) {
    latestRateLimits.set(key, entry);
  }
}

function createRateLimitSnapshots(entry: UsageHistoryEntry): UsageHistoryRateLimitSnapshot[] {
  return (entry.record.rateLimits ?? []).map((rateLimit) => ({
    providerId: entry.record.provider.id,
    providerLabel: entry.record.provider.label || entry.record.provider.id,
    recordId: entry.record.id,
    capturedAtMs: entry.record.capturedAtMs,
    occurredAtMs: entry.record.occurredAtMs,
    name: rateLimit.name,
    usedPercent: rateLimit.usedPercent,
    remainingPercent: rateLimit.remainingPercent,
    resetAtMs: rateLimit.resetAtMs,
    resetAfterSeconds: rateLimit.resetAfterSeconds,
    source: rateLimit.source,
  }));
}

function buildTimeWindowSummaries(
  entries: readonly UsageHistoryEntry[],
  nowMs: number,
): UsageHistoryTimeWindowSummary[] {
  const todayStartMs = startOfLocalDay(nowMs);
  const windows: UsageHistoryTimeWindowSummary[] = [
    {
      ...createUsageHistoryTotals(),
      id: 'today',
      label: 'Today',
      fromMs: todayStartMs,
      toMs: todayStartMs + MS_PER_DAY,
    },
    {
      ...createUsageHistoryTotals(),
      id: 'last_7_days',
      label: 'Last 7 days',
      fromMs: todayStartMs - (LAST_7_DAYS - 1) * MS_PER_DAY,
      toMs: todayStartMs + MS_PER_DAY,
    },
  ];

  for (const entry of entries) {
    for (const window of windows) {
      if (entry.normalized.eventMs >= window.fromMs && entry.normalized.eventMs < window.toMs) {
        addNormalizedRecord(window, entry.normalized);
      }
    }
  }

  for (const window of windows) {
    finalizeUsageHistoryTotals(window);
  }

  return windows;
}

function buildTrendSets(
  entries: readonly UsageHistoryEntry[],
  nowMs: number,
): UsageHistoryTrendSet {
  const todayStartMs = startOfLocalDay(nowMs);
  const today = Array.from({ length: HOURS_PER_DAY }, (_unused, hour) =>
    createTrendBucket(
      `today-${hour}`,
      `${formatLocalDate(todayStartMs)} ${pad2(hour)}:00`,
      todayStartMs + hour * MS_PER_HOUR,
      todayStartMs + (hour + 1) * MS_PER_HOUR,
    ),
  );
  const last7DaysStartMs = todayStartMs - (LAST_7_DAYS - 1) * MS_PER_DAY;
  const last7Days = Array.from({ length: LAST_7_DAYS }, (_unused, day) => {
    const fromMs = last7DaysStartMs + day * MS_PER_DAY;
    return createTrendBucket(
      `last-7-days-${day}`,
      formatLocalDate(fromMs),
      fromMs,
      fromMs + MS_PER_DAY,
    );
  });

  for (const entry of entries) {
    addEntryToTrendBuckets(entry, today);
    addEntryToTrendBuckets(entry, last7Days);
  }

  for (const bucket of [...today, ...last7Days]) {
    finalizeUsageHistoryTotals(bucket);
  }

  return { today, last7Days };
}

function createTrendBucket(
  id: string,
  label: string,
  fromMs: number,
  toMs: number,
): UsageHistoryTrendBucket {
  return {
    ...createUsageHistoryTotals(),
    id,
    label,
    fromMs,
    toMs,
  };
}

function addEntryToTrendBuckets(
  entry: UsageHistoryEntry,
  buckets: readonly UsageHistoryTrendBucket[],
): void {
  const bucket = buckets.find(
    (item) => entry.normalized.eventMs >= item.fromMs && entry.normalized.eventMs < item.toMs,
  );
  if (bucket) addNormalizedRecord(bucket, entry.normalized);
}

function createExportRow(
  entry: UsageHistoryEntry,
  includeRawPaths: boolean,
): UsageHistoryExportRow {
  const occurredAt = new Date(entry.normalized.eventMs).toISOString();
  return {
    occurred_at: occurredAt,
    provider: entry.record.provider.id,
    provider_label: entry.record.provider.label || entry.record.provider.id,
    model: entry.normalized.modelLabel,
    project: entry.record.project.name,
    project_hash: entry.record.project.dirHash ?? '',
    project_dir: includeRawPaths ? (entry.record.project.dir ?? '') : '',
    agent_id: entry.record.agent.id,
    agent_name: entry.record.agent.name,
    team: entry.record.agent.teamName ?? '',
    role: entry.record.agent.roleName ?? '',
    session_id: entry.record.session.id ?? '',
    thread_id: entry.record.session.threadId ?? '',
    transcript_path: includeRawPaths ? (entry.record.session.transcriptPath ?? '') : '',
    input_tokens: entry.normalized.inputTokens,
    output_tokens: entry.normalized.outputTokens,
    provider_input_tokens: entry.normalized.providerInputTokens,
    provider_output_tokens: entry.normalized.providerOutputTokens,
    provider_tokens: entry.normalized.providerTokens,
    cache_read_tokens: entry.normalized.cacheReadTokens,
    cache_write_tokens: entry.normalized.cacheWriteTokens,
    reasoning_output_tokens: entry.normalized.reasoningOutputTokens,
    artifact_output_tokens: entry.normalized.artifactOutputTokens,
    display_tokens: entry.normalized.displayTokens,
    token_source: entry.record.accuracy.tokenSource,
    artifact_source: entry.record.accuracy.artifactSource,
    api_proxy_estimate_usd: entry.normalized.apiProxyEstimateUsd,
    non_billing_label: API_PROXY_NON_BILLING_LABEL,
    non_billing_note: NOT_ACTUAL_SUBSCRIPTION_BILLING,
    last_activity: occurredAt,
  };
}

function buildExportCsv(rows: readonly UsageHistoryExportRow[]): string {
  return [
    USAGE_HISTORY_EXPORT_COLUMNS.join(','),
    ...rows.map((row) =>
      USAGE_HISTORY_EXPORT_COLUMNS.map((column) => csvValue(row[column])).join(','),
    ),
  ].join('\n');
}

function matchesFilters(
  entry: UsageHistoryEntry,
  filters: UsageHistoryFilters | undefined,
): boolean {
  if (!filters) return true;
  const record = entry.record;
  if (!matchesStringFilter(record.provider.id, filters.providerIds)) return false;
  if (!matchesStringFilter(entry.normalized.modelId, filters.modelIds)) return false;
  if (!matchesStringFilter(record.project.name, filters.projectNames)) return false;
  if (!matchesStringFilter(record.project.dirHash, filters.projectDirHashes)) return false;
  if (!matchesNumberFilter(record.agent.id, filters.agentIds)) return false;
  if (!matchesStringFilter(record.session.id, filters.sessionIds)) return false;
  if (!matchesStringFilter(record.session.threadId, filters.threadIds)) return false;
  if (filters.fromMs !== undefined && entry.normalized.eventMs < filters.fromMs) return false;
  if (filters.toMs !== undefined && entry.normalized.eventMs > filters.toMs) return false;
  return true;
}

function matchesStringFilter(
  value: string | undefined,
  allowed: readonly string[] | undefined,
): boolean {
  return !allowed?.length || (value !== undefined && allowed.includes(value));
}

function matchesNumberFilter(value: number, allowed: readonly number[] | undefined): boolean {
  return !allowed?.length || allowed.includes(value);
}

function describeActiveFilters(filters: UsageHistoryFilters | undefined): string[] {
  if (!filters) return [];
  const activeFilters: string[] = [];
  pushTextFilter(activeFilters, 'provider', filters.providerIds);
  pushTextFilter(activeFilters, 'model', filters.modelIds);
  pushTextFilter(activeFilters, 'project', filters.projectNames);
  pushTextFilter(activeFilters, 'project hash', filters.projectDirHashes);
  if (filters.agentIds?.length) activeFilters.push(`agent:${filters.agentIds.join(',')}`);
  pushTextFilter(activeFilters, 'session', filters.sessionIds);
  pushTextFilter(activeFilters, 'thread', filters.threadIds);
  if (filters.fromMs !== undefined)
    activeFilters.push(`from:${new Date(filters.fromMs).toISOString()}`);
  if (filters.toMs !== undefined) activeFilters.push(`to:${new Date(filters.toMs).toISOString()}`);
  return activeFilters;
}

function pushTextFilter(
  activeFilters: string[],
  label: string,
  values: readonly string[] | undefined,
): void {
  if (values?.length) activeFilters.push(`${label}:${values.join(',')}`);
}

function createEmptyState(
  sourceRecordCount: number,
  filteredRecordCount: number,
  totals: UsageHistoryTotals,
  activeFilters: readonly string[],
): UsageHistoryEmptyState | undefined {
  if (sourceRecordCount === 0) {
    return {
      kind: 'no_records',
      title: 'No usage history yet',
      detail: 'Usage history appears after normalized local records are connected.',
      activeFilters: [...activeFilters],
    };
  }
  if (filteredRecordCount === 0) {
    return {
      kind: 'all_filtered_out',
      title: 'All usage history filtered out',
      detail:
        'No records match the active provider, model, project, agent, session, or time window filters.',
      activeFilters: [...activeFilters],
    };
  }
  if (totals.displayTokens === 0 && totals.rateLimitRecordCount === 0) {
    return {
      kind: 'no_usage',
      title: 'No token usage in this view',
      detail:
        'The current record scope has no provider tokens, artifact estimates, or quota snapshots.',
      activeFilters: [...activeFilters],
    };
  }
  return undefined;
}

function getRecordEventMs(record: UsageHistoryRecordV1): number {
  return finiteNumber(record.occurredAtMs) ?? finiteNumber(record.capturedAtMs) ?? 0;
}

function getSessionKey(record: UsageHistoryRecordV1): string {
  return (
    record.session.id ??
    record.session.threadId ??
    record.session.transcriptPath ??
    UNKNOWN_SESSION_KEY
  );
}

function getProjectKey(record: UsageHistoryRecordV1): string {
  return `${record.project.name}\u0000${record.project.dirHash ?? ''}`;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatLocalDate(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function positiveNumber(value: number | undefined): number {
  return Math.max(finiteNumber(value) ?? 0, 0);
}

function finiteNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function addUniqueText(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function compareTokenSummaries(a: UsageHistoryTotals, b: UsageHistoryTotals): number {
  return (
    b.displayTokens - a.displayTokens ||
    b.providerTokens - a.providerTokens ||
    (b.lastActivityMs ?? 0) - (a.lastActivityMs ?? 0)
  );
}

function compareLedgerRows(a: UsageHistoryLedgerRow, b: UsageHistoryLedgerRow): number {
  return (
    b.displayTokens - a.displayTokens ||
    b.providerTokens - a.providerTokens ||
    (b.lastActivityMs ?? 0) - (a.lastActivityMs ?? 0) ||
    a.agentName.localeCompare(b.agentName, undefined, { sensitivity: 'base', numeric: true })
  );
}

function compareRateLimitSnapshots(
  a: UsageHistoryRateLimitSnapshot,
  b: UsageHistoryRateLimitSnapshot,
): number {
  return (
    a.providerId.localeCompare(b.providerId, undefined, { sensitivity: 'base', numeric: true }) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  );
}

function compareExportRows(a: UsageHistoryExportRow, b: UsageHistoryExportRow): number {
  return (
    String(a.occurred_at).localeCompare(String(b.occurred_at)) ||
    String(a.provider).localeCompare(String(b.provider)) ||
    Number(a.agent_id) - Number(b.agent_id)
  );
}

function shareOf(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

function csvValue(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
