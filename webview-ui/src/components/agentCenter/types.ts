import type { TokenRateLimitSnapshot, TokenUsageDetails } from '../../office/types.js';
import type { AgentZone, AgentZoneSource } from '../../office/zoneUtils.js';
import type {
  AgentListItem,
  AgentListStatusFilter,
  AgentListStatusGroup,
} from '../agentCenterListModel.js';
import type { DelegationSummary } from '../delegationModel.js';

export type ProviderFilter = 'all' | 'codex' | 'claude';
export type StatusFilter = AgentListStatusFilter;
export type ProjectFilter = 'all' | string;
export type TeamFilter = 'all' | string;
export type UsagePane = 'overview' | 'live' | 'history';
export type HandoffWriteStatus = 'idle' | 'writing' | 'written' | 'failed';
export type HandoffOpenStatus = 'idle' | 'opening' | 'opened' | 'failed';
export type HandoffStatusUpdateStatus = 'idle' | 'updating' | 'updated' | 'failed';

export interface AgentSummary extends AgentListItem {
  id: number;
  name: string;
  project: string;
  providerId: string;
  status: string;
  statusGroup: AgentListStatusGroup;
  activity: string;
  detail?: string;
  tokens: number;
  updatedAt?: number;
  inputTokens: number;
  outputTokens: number;
  artifactOutputTokens: number;
  tokenUsageEstimated: boolean;
  tokenUsageDetails?: TokenUsageDetails;
  codexRateLimit?: TokenRateLimitSnapshot;
  delegation?: DelegationSummary;
  zone: AgentZone;
  zoneSource: AgentZoneSource;
  projectDir?: string;
  transcriptPath?: string;
  teamName?: string;
  roleName?: string;
  isTeamLead?: boolean;
  leadAgentId?: number;
  isPaused: boolean;
  hidden: boolean;
}

export interface ProjectSummary {
  project: string;
  projectDir?: string;
  agentCount: number;
  activeCount: number;
  waitingCount: number;
  needsMeCount: number;
  errorCount: number;
  tokens: number;
}

export interface TeamSummary {
  teamName: string;
  memberCount: number;
  leadAgentId?: number;
  leadName?: string;
  activeCount: number;
  needsMeCount: number;
  errorCount: number;
  tokens: number;
  projects: string[];
}

export interface AgentStateCounts {
  total: number;
  active: number;
  delegating: number;
  paused: number;
  waiting: number;
  needsMe: number;
  error: number;
  hidden: number;
}

export interface TimelineItem {
  id: string;
  timestamp: number;
  title: string;
  summary?: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
}
