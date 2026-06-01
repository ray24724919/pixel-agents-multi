import { useEffect, useRef, useState } from 'react';

import { playDoneSound, playPermissionSound, setSoundEnabled } from '../notificationSound.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { setFloorSprites } from '../office/floorTiles.js';
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js';
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js';
import { setCharacterTemplates } from '../office/sprites/spriteData.js';
import { extractToolName } from '../office/toolUtils.js';
import type {
  OfficeLayout,
  TokenRateLimitSnapshot,
  TokenUsageDetails,
  ToolActivity,
} from '../office/types.js';
import { setWallSprites } from '../office/wallTiles.js';
import { vscode } from '../vscodeApi.js';
import { shouldRetainTimelineEventAfterAgentRemoval } from './timelineRetention.js';

export interface SubagentCharacter {
  id: number;
  parentAgentId: number;
  parentToolId: string;
  label: string;
}

export interface AgentEventTrace {
  event: string;
  at: number;
  detail?: string;
}

export type AgentLifecycleStatus =
  | 'idle'
  | 'thinking'
  | 'tool_running'
  | 'waiting_user'
  | 'waiting_permission'
  | 'paused'
  | 'completed'
  | 'error';

export interface AgentLifecycleState {
  id: number;
  status: AgentLifecycleStatus;
  label: string;
  detail?: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  toolName?: string;
  updatedAt: number;
}

export interface AgentLifecycleEvent extends AgentLifecycleState {
  receivedAt: number;
}

export interface AgentTimelineEvent {
  id: string;
  agentId: number;
  providerId?: string;
  projectName?: string;
  sessionId?: string;
  runId?: string;
  timestamp: number;
  kind: string;
  title: string;
  summary?: string;
  statusAfter?: AgentLifecycleStatus;
  severity?: 'info' | 'success' | 'warning' | 'error';
  source?: 'user' | 'agent' | 'tool' | 'system';
  visibility?: 'default' | 'verbose' | 'debug';
  payload?: unknown;
}

export interface AgentRuntimeMetadata {
  projectDir?: string;
  transcriptPath?: string;
}

interface FurnitureAsset {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

export interface WorkspaceFolder {
  name: string;
  path: string;
}

interface ExtensionMessageState {
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  agentLifecycleStatuses: Record<number, AgentLifecycleState>;
  agentLifecycleEvents: AgentLifecycleEvent[];
  agentTimelineEvents: AgentTimelineEvent[];
  agentRuntimeMetadata: Record<number, AgentRuntimeMetadata>;
  hiddenAgents: Record<number, boolean>;
  agentEventTrace: Record<number, AgentEventTrace[]>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  layoutReady: boolean;
  layoutWasReset: boolean;
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> };
  workspaceFolders: WorkspaceFolder[];
  codexProjects: WorkspaceFolder[];
  externalAssetDirectories: string[];
  lastSeenVersion: string;
  extensionVersion: string;
  watchAllSessions: boolean;
  setWatchAllSessions: (v: boolean) => void;
  alwaysShowLabels: boolean;
  hooksEnabled: boolean;
  setHooksEnabled: (v: boolean) => void;
  hooksInfoShown: boolean;
}

function saveAgentSeats(os: OfficeState): void {
  const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {};
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue;
    seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId };
  }
  vscode.postMessage({ type: 'saveAgentSeats', seats });
}

export function useExtensionMessages(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): ExtensionMessageState {
  const [agents, setAgents] = useState<number[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({});
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({});
  const [agentLifecycleStatuses, setAgentLifecycleStatuses] = useState<
    Record<number, AgentLifecycleState>
  >({});
  const [agentLifecycleEvents, setAgentLifecycleEvents] = useState<AgentLifecycleEvent[]>([]);
  const [agentTimelineEvents, setAgentTimelineEvents] = useState<AgentTimelineEvent[]>([]);
  const [agentRuntimeMetadata, setAgentRuntimeMetadata] = useState<
    Record<number, AgentRuntimeMetadata>
  >({});
  const [hiddenAgents, setHiddenAgents] = useState<Record<number, boolean>>({});
  const [agentEventTrace, setAgentEventTrace] = useState<Record<number, AgentEventTrace[]>>({});
  const [subagentTools, setSubagentTools] = useState<
    Record<number, Record<string, ToolActivity[]>>
  >({});
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [layoutWasReset, setLayoutWasReset] = useState(false);
  const [loadedAssets, setLoadedAssets] = useState<
    { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined
  >();
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([]);
  const [codexProjects, setCodexProjects] = useState<WorkspaceFolder[]>([]);
  const [externalAssetDirectories, setExternalAssetDirectories] = useState<string[]>([]);
  const [lastSeenVersion, setLastSeenVersion] = useState('');
  const [extensionVersion, setExtensionVersion] = useState('');
  const [watchAllSessions, setWatchAllSessions] = useState(false);
  const [alwaysShowLabels, setAlwaysShowLabels] = useState(false);
  const [hooksEnabled, setHooksEnabled] = useState(true);
  const [hooksInfoShown, setHooksInfoShown] = useState(true);

  // Track whether initial layout has been loaded (ref to avoid re-render)
  const layoutReadyRef = useRef(false);

  useEffect(() => {
    type PendingAgent = {
      id: number;
      palette?: number;
      hueShift?: number;
      seatId?: string;
      folderName?: string;
      agentName?: string;
      providerId?: string;
      projectDir?: string;
      transcriptPath?: string;
      initialActive?: boolean;
    };

    // Buffer agents from existingAgents until layout is loaded.
    let pendingAgents: PendingAgent[] = [];

    const addRestoredAgent = (os: OfficeState, p: PendingAgent) => {
      // Ignore persisted seatId during restore. Refresh should reshuffle agents
      // instead of reproducing stale stacked seating from a previous layout/run.
      os.addAgent(
        p.id,
        p.palette,
        p.hueShift,
        undefined,
        true,
        p.folderName,
        p.initialActive,
        true,
      );
      const ch = os.characters.get(p.id);
      if (ch) {
        ch.folderName = p.folderName;
        ch.agentName = p.agentName;
        ch.providerId = p.providerId;
      }
    };

    const queuePendingAgent = (p: PendingAgent) => {
      const index = pendingAgents.findIndex((existing) => existing.id === p.id);
      if (index >= 0) {
        pendingAgents[index] = p;
      } else {
        pendingAgents.push(p);
      }
    };

    const flushPendingAgents = (os: OfficeState) => {
      const agentsToAdd = pendingAgents;
      pendingAgents = [];
      for (const p of agentsToAdd) {
        addRestoredAgent(os, p);
      }
    };

    const handler = (e: MessageEvent) => {
      const msg = e.data;
      const os = getOfficeState();
      const traceAgentEvent = (id: number, eventName: string, detail?: string) => {
        setAgentEventTrace((prev) => {
          const list = prev[id] || [];
          return {
            ...prev,
            [id]: [{ event: eventName, detail, at: Date.now() }, ...list].slice(0, 8),
          };
        });
      };

      if (msg.type === 'layoutLoaded') {
        // Skip external layout updates while editor has unsaved changes
        if (layoutReadyRef.current && isEditDirty?.()) {
          console.log('[Webview] Skipping external layout update — editor has unsaved changes');
          return;
        }
        const rawLayout = msg.layout as OfficeLayout | null;
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null;
        if (layout) {
          os.rebuildFromLayout(layout);
          onLayoutLoaded?.(layout);
        } else {
          // Default layout — snapshot whatever OfficeState built
          onLayoutLoaded?.(os.getLayout());
        }
        // Add buffered agents now that layout (and seats) are correct.
        flushPendingAgents(os);
        layoutReadyRef.current = true;
        setLayoutReady(true);
        if (msg.wasReset) {
          setLayoutWasReset(true);
        }
        if (os.characters.size > 0) {
          saveAgentSeats(os);
        }
      } else if (msg.type === 'agentCreated') {
        const id = msg.id as number;
        const folderName = msg.folderName as string | undefined;
        const agentName = msg.agentName as string | undefined;
        const providerId = msg.providerId as string | undefined;
        const projectDir = msg.projectDir as string | undefined;
        const transcriptPath = msg.transcriptPath as string | undefined;
        const isTeammate = msg.isTeammate as boolean | undefined;
        const teammateName = msg.teammateName as string | undefined;
        const teammateParentId = msg.parentAgentId as number | undefined;
        const teamName = msg.teamName as string | undefined;
        setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setAgentRuntimeMetadata((prev) => ({
          ...prev,
          [id]: {
            projectDir: projectDir ?? prev[id]?.projectDir,
            transcriptPath: transcriptPath ?? prev[id]?.transcriptPath,
          },
        }));
        setHiddenAgents((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Don't auto-select teammates (keep focus on lead)
        if (!isTeammate) {
          setSelectedAgent(id);
        }
        if (isTeammate && teammateParentId !== undefined) {
          // Teammate: inherit parent's palette and workspace folderName (teammate runs
          // in the same workspace as the lead). Name shown via agentName (teamRoleLabel).
          const parentCh = os.characters.get(teammateParentId);
          const palette = parentCh ? parentCh.palette : undefined;
          const hueShift = parentCh ? parentCh.hueShift : undefined;
          os.addAgent(id, palette, hueShift, undefined, undefined, parentCh?.folderName);
          // Set team metadata on the character
          const ch = os.characters.get(id);
          if (ch) {
            ch.leadAgentId = teammateParentId;
            ch.teamName = teamName ?? parentCh?.teamName;
            ch.agentName = teammateName;
          }
        } else {
          os.addAgent(id, undefined, undefined, undefined, undefined, folderName);
          const ch = os.characters.get(id);
          if (ch) {
            ch.agentName = agentName;
            ch.providerId = providerId;
          }
        }
        saveAgentSeats(os);
      } else if (msg.type === 'agentClosed' || msg.type === 'agentArchived') {
        const id = msg.id as number;
        setAgents((prev) => prev.filter((a) => a !== id));
        setSelectedAgent((prev) => (prev === id ? null : prev));
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentStatuses((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentLifecycleStatuses((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentRuntimeMetadata((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setHiddenAgents((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentTimelineEvents((prev) =>
          prev.filter(
            (event) =>
              event.agentId !== id || shouldRetainTimelineEventAfterAgentRemoval(event.kind),
          ),
        );
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id);
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id));
        os.removeAgent(id);
      } else if (msg.type === 'agentMetadata') {
        const id = msg.id as number;
        const ch = os.characters.get(id);
        if (ch) {
          ch.folderName = msg.folderName as string | undefined;
          ch.agentName = msg.agentName as string | undefined;
          ch.providerId = msg.providerId as string | undefined;
        }
        setAgentRuntimeMetadata((prev) => ({
          ...prev,
          [id]: {
            projectDir: (msg.projectDir as string | undefined) ?? prev[id]?.projectDir,
            transcriptPath: (msg.transcriptPath as string | undefined) ?? prev[id]?.transcriptPath,
          },
        }));
      } else if (msg.type === 'existingAgents') {
        const incoming = msg.agents as number[];
        const meta = (msg.agentMeta || {}) as Record<
          number,
          { palette?: number; hueShift?: number; seatId?: string }
        >;
        const folderNames = (msg.folderNames || {}) as Record<number, string>;
        const agentNames = (msg.agentNames || {}) as Record<number, string>;
        const providerIds = (msg.providerIds || {}) as Record<number, string>;
        const projectDirs = (msg.projectDirs || {}) as Record<number, string>;
        const transcriptPaths = (msg.transcriptPaths || {}) as Record<number, string>;
        const incomingHiddenAgents = (msg.hiddenAgents || {}) as Record<number, boolean>;
        setHiddenAgents((prev) => {
          const next = { ...prev };
          for (const id of incoming) {
            if (incomingHiddenAgents[id]) {
              next[id] = true;
            } else {
              delete next[id];
            }
          }
          return next;
        });
        setAgentRuntimeMetadata((prev) => {
          const next = { ...prev };
          for (const id of incoming) {
            next[id] = {
              projectDir: projectDirs[id] ?? next[id]?.projectDir,
              transcriptPath: transcriptPaths[id] ?? next[id]?.transcriptPath,
            };
          }
          return next;
        });
        // Buffer agents — they'll be added in layoutLoaded after seats are built
        let restoredImmediately = false;
        for (const id of incoming) {
          const m = meta[id];
          const ch = os.characters.get(id);
          if (ch) {
            ch.folderName = folderNames[id];
            ch.agentName = agentNames[id];
            ch.providerId = providerIds[id];
          }
          const restoredAgent: PendingAgent = {
            id,
            palette: m?.palette,
            hueShift: m?.hueShift,
            seatId: m?.seatId,
            folderName: folderNames[id],
            agentName: agentNames[id],
            providerId: providerIds[id],
            projectDir: projectDirs[id],
            transcriptPath: transcriptPaths[id],
            initialActive: false,
          };
          if (layoutReadyRef.current) {
            addRestoredAgent(os, restoredAgent);
            restoredImmediately = true;
          } else {
            queuePendingAgent(restoredAgent);
          }
        }
        if (restoredImmediately) {
          saveAgentSeats(os);
        }
        setAgents((prev) => {
          const ids = new Set(prev);
          const merged = [...prev];
          for (const id of incoming) {
            if (!ids.has(id)) {
              merged.push(id);
            }
          }
          return merged.sort((a, b) => a - b);
        });
      } else if (msg.type === 'agentLifecycleHidden') {
        const id = msg.id as number;
        const hidden = msg.hidden as boolean;
        setHiddenAgents((prev) => {
          if (hidden) {
            return { ...prev, [id]: true };
          }
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (hidden) {
          setSelectedAgent((prev) => (prev === id ? null : prev));
          if (os.selectedAgentId === id) os.selectedAgentId = null;
          if (os.cameraFollowId === id) os.cameraFollowId = null;
          if (os.hoveredAgentId === id) os.hoveredAgentId = null;
        }
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id as number;
        const toolId = msg.toolId as string;
        const status = msg.status as string;
        traceAgentEvent(id, 'agentToolStart', status);
        const permissionActive = msg.permissionActive as boolean | undefined;
        setAgentTools((prev) => {
          const list = prev[id] || [];
          if (list.some((t) => t.toolId === toolId)) return prev;
          return {
            ...prev,
            [id]: [
              ...list,
              { toolId, status, done: false, permissionWait: permissionActive || false },
            ],
          };
        });
        const toolName = (msg.toolName as string | undefined) ?? extractToolName(status);
        os.setAgentTool(id, toolName);
        os.setAgentActive(id, true);
        // Don't clear the permission bubble if the hook already confirmed permission is needed
        if (!permissionActive) {
          os.clearPermissionBubble(id);
        }
        // Create sub-agent character for Task/Agent tool subtasks.
        // In tmux / inline teams mode, Agent tool has run_in_background=true -- those
        // are handled via the independent teammate path (onTeammateDetected), not here.
        // runInBackground gates them out so we don't create ghost sub-agents for them.
        //
        // Skip creation for synthetic hook-ids. Later SubagentStop/subagentClear use
        // the REAL tool id from JSONL; creating with a synthetic id would orphan the
        // sub-agent (mismatched keys). JSONL's agentToolStart (with real id) handles
        // creation in both hooks and heuristic modes -- ~500ms delay vs instant hook.
        const runInBackground = msg.runInBackground as boolean | undefined;
        if (
          (toolName === 'Task' || toolName === 'Agent') &&
          !runInBackground &&
          !toolId.startsWith('hook-')
        ) {
          const label = status.startsWith('Subtask:') ? status.slice('Subtask:'.length).trim() : '';
          const subId = os.addSubagent(id, toolId);
          setSubagentCharacters((prev) => {
            if (prev.some((s) => s.id === subId)) return prev;
            return [...prev, { id: subId, parentAgentId: id, parentToolId: toolId, label }];
          });
        }
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id as number;
        const toolId = msg.toolId as string;
        traceAgentEvent(id, 'agentToolDone', toolId);
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
          };
        });
      } else if (msg.type === 'agentToolsClear') {
        const id = msg.id as number;
        traceAgentEvent(id, 'agentToolsClear');
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Remove all sub-agent characters belonging to this agent.
        // Exception: team leads with inline teammates -- their sub-agents represent
        // real teammates and should only be removed by SubagentStop/subagentClear.
        const clearCh = os.characters.get(id);
        const hasInlineTeammates =
          clearCh?.teamName && clearCh?.isTeamLead && !clearCh?.teamUsesTmux;
        if (!hasInlineTeammates) {
          os.removeAllSubagents(id);
          setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id));
        }
        os.setAgentTool(id, null);
        os.setAgentActive(id, false);
        os.clearPermissionBubble(id);
      } else if (msg.type === 'agentSelected') {
        const id = msg.id as number;
        setSelectedAgent(id);
      } else if (msg.type === 'agentStatus') {
        const id = msg.id as number;
        const status = msg.status as string;
        traceAgentEvent(id, 'agentStatus', status);
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          }
          return { ...prev, [id]: status };
        });
        os.setAgentActive(id, status === 'active');
        if (status === 'waiting') {
          os.showWaitingBubble(id);
          playDoneSound();
        }
      } else if (msg.type === 'agentLifecycleStatus') {
        const lifecycle = {
          id: msg.id as number,
          status: msg.status as AgentLifecycleStatus,
          label: msg.label as string,
          detail: msg.detail as string | undefined,
          severity: msg.severity as AgentLifecycleState['severity'],
          toolName: msg.toolName as string | undefined,
          updatedAt: msg.updatedAt as number,
        };
        traceAgentEvent(
          lifecycle.id,
          'agentLifecycleStatus',
          [lifecycle.status, lifecycle.label, lifecycle.detail].filter(Boolean).join(' · '),
        );
        setAgentLifecycleStatuses((prev) => ({ ...prev, [lifecycle.id]: lifecycle }));
        setAgentLifecycleEvents((prev) =>
          [{ ...lifecycle, receivedAt: Date.now() }, ...prev].slice(0, 30),
        );
        if (lifecycle.status === 'thinking' || lifecycle.status === 'tool_running') {
          os.setAgentActive(lifecycle.id, true);
        } else if (lifecycle.status === 'paused') {
          os.clearPermissionBubble(lifecycle.id);
        } else if (
          lifecycle.status === 'completed' ||
          lifecycle.status === 'idle' ||
          lifecycle.status === 'waiting_user' ||
          lifecycle.status === 'error'
        ) {
          os.setAgentTool(lifecycle.id, null);
          os.setAgentActive(lifecycle.id, false);
        }
        if (lifecycle.status === 'completed') {
          window.setTimeout(() => {
            setAgentLifecycleStatuses((prev) => {
              const current = prev[lifecycle.id];
              if (!current || current.updatedAt !== lifecycle.updatedAt) return prev;
              os.setAgentTool(lifecycle.id, null);
              os.setAgentActive(lifecycle.id, false);
              return {
                ...prev,
                [lifecycle.id]: {
                  id: lifecycle.id,
                  status: 'idle',
                  label: 'Idle',
                  severity: 'info',
                  updatedAt: Date.now(),
                },
              };
            });
          }, 2500);
        }
      } else if (msg.type === 'agentTimelineEvent') {
        const raw = (msg.event ?? msg) as Partial<AgentTimelineEvent> & {
          agentId?: number | string;
          id?: string;
          timestamp?: number | string;
          type?: string;
          summary?: string;
          title?: string;
        };
        const agentId =
          typeof raw.agentId === 'string' ? Number.parseInt(raw.agentId, 10) : raw.agentId;
        if (typeof agentId === 'number' && Number.isFinite(agentId)) {
          const timestamp =
            typeof raw.timestamp === 'string'
              ? Date.parse(raw.timestamp)
              : typeof raw.timestamp === 'number'
                ? raw.timestamp
                : Date.now();
          const event: AgentTimelineEvent = {
            id: raw.id ?? `${agentId}-${timestamp}-${raw.kind ?? raw.type ?? 'event'}`,
            agentId,
            providerId: raw.providerId,
            projectName: raw.projectName,
            sessionId: raw.sessionId,
            runId: raw.runId,
            timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
            kind: raw.kind ?? raw.type ?? 'event',
            title: raw.title ?? raw.summary ?? raw.kind ?? raw.type ?? 'Event',
            summary: raw.summary,
            statusAfter: raw.statusAfter,
            severity: raw.severity,
            source: raw.source,
            visibility: raw.visibility,
            payload: raw.payload,
          };
          traceAgentEvent(event.agentId, 'agentTimelineEvent', `${event.kind} · ${event.title}`);
          setAgentTimelineEvents((prev) => [event, ...prev].slice(0, 120));
        }
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id as number;
        traceAgentEvent(id, 'agentToolPermission');
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          };
        });
        os.showPermissionBubble(id);
        playPermissionSound();
      } else if (msg.type === 'subagentToolPermission') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        // Show permission bubble on the sub-agent character
        const subId = os.getSubagentId(id, parentToolId);
        if (subId !== null) {
          os.showPermissionBubble(subId);
        }
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = msg.id as number;
        traceAgentEvent(id, 'agentToolPermissionClear');
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          const hasPermission = list.some((t) => t.permissionWait);
          if (!hasPermission) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          };
        });
        os.clearPermissionBubble(id);
        // Also clear permission bubbles on all sub-agent characters of this parent
        for (const [subId, meta] of os.subagentMeta) {
          if (meta.parentAgentId === id) {
            os.clearPermissionBubble(subId);
          }
        }
      } else if (msg.type === 'subagentToolStart') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        const toolId = msg.toolId as string;
        const status = msg.status as string;
        traceAgentEvent(id, 'subagentToolStart', status);
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {};
          const list = agentSubs[parentToolId] || [];
          if (list.some((t) => t.toolId === toolId)) return prev;
          return {
            ...prev,
            [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] },
          };
        });
        // Update sub-agent character's tool and active state (if already created by
        // agentToolStart via PreToolUse). The lookup uses the REAL parent tool id from
        // JSONL, which won't match the synthetic hook-id the sub-agent was created
        // with -- so this is a best-effort update for the heuristic (JSONL-driven) path.
        const subId = os.getSubagentId(id, parentToolId);
        if (subId !== null) {
          const subToolName = extractToolName(status);
          os.setAgentTool(subId, subToolName);
          os.setAgentActive(subId, true);
        }
      } else if (msg.type === 'subagentToolDone') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        const toolId = msg.toolId as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs) return prev;
          const list = agentSubs[parentToolId];
          if (!list) return prev;
          return {
            ...prev,
            [id]: {
              ...agentSubs,
              [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
            },
          };
        });
      } else if (msg.type === 'subagentClear') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        traceAgentEvent(id, 'subagentClear', parentToolId);
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs || !(parentToolId in agentSubs)) return prev;
          const next = { ...agentSubs };
          delete next[parentToolId];
          if (Object.keys(next).length === 0) {
            const outer = { ...prev };
            delete outer[id];
            return outer;
          }
          return { ...prev, [id]: next };
        });
        // Remove sub-agent character
        os.removeSubagent(id, parentToolId);
        setSubagentCharacters((prev) =>
          prev.filter((s) => !(s.parentAgentId === id && s.parentToolId === parentToolId)),
        );
      } else if (msg.type === 'characterSpritesLoaded') {
        const characters = msg.characters as Array<{
          down: string[][][];
          up: string[][][];
          right: string[][][];
        }>;
        console.log(`[Webview] Received ${characters.length} pre-colored character sprites`);
        setCharacterTemplates(characters);
      } else if (msg.type === 'floorTilesLoaded') {
        const sprites = msg.sprites as string[][][];
        console.log(`[Webview] Received ${sprites.length} floor tile patterns`);
        setFloorSprites(sprites);
      } else if (msg.type === 'wallTilesLoaded') {
        const sets = msg.sets as string[][][][];
        console.log(`[Webview] Received ${sets.length} wall tile set(s)`);
        setWallSprites(sets);
      } else if (msg.type === 'workspaceFolders') {
        const folders = msg.folders as WorkspaceFolder[];
        setWorkspaceFolders(folders);
      } else if (msg.type === 'codexProjects') {
        const projects = msg.projects as WorkspaceFolder[];
        setCodexProjects(projects);
      } else if (msg.type === 'settingsLoaded') {
        const soundOn = msg.soundEnabled as boolean;
        setSoundEnabled(soundOn);
        if (typeof msg.watchAllSessions === 'boolean') {
          setWatchAllSessions(msg.watchAllSessions as boolean);
        }
        if (typeof msg.alwaysShowLabels === 'boolean') {
          setAlwaysShowLabels(msg.alwaysShowLabels as boolean);
        }
        if (typeof msg.hooksEnabled === 'boolean') {
          setHooksEnabled(msg.hooksEnabled as boolean);
        }
        if (typeof msg.hooksInfoShown === 'boolean') {
          setHooksInfoShown(msg.hooksInfoShown as boolean);
        }
        if (Array.isArray(msg.externalAssetDirectories)) {
          setExternalAssetDirectories(msg.externalAssetDirectories as string[]);
        }
        if (typeof msg.lastSeenVersion === 'string') {
          setLastSeenVersion(msg.lastSeenVersion as string);
        }
        if (typeof msg.extensionVersion === 'string') {
          setExtensionVersion(msg.extensionVersion as string);
        }
      } else if (msg.type === 'externalAssetDirectoriesUpdated') {
        if (Array.isArray(msg.dirs)) {
          setExternalAssetDirectories(msg.dirs as string[]);
        }
      } else if (msg.type === 'furnitureAssetsLoaded') {
        try {
          const catalog = msg.catalog as FurnitureAsset[];
          const sprites = msg.sprites as Record<string, string[][]>;
          console.log(`📦 Webview: Loaded ${catalog.length} furniture assets`);
          // Build dynamic catalog immediately so getCatalogEntry() works when layoutLoaded arrives next
          buildDynamicCatalog({ catalog, sprites });
          setLoadedAssets({ catalog, sprites });
        } catch (err) {
          console.error(`❌ Webview: Error processing furnitureAssetsLoaded:`, err);
        }
      } else if (msg.type === 'agentTeamInfo') {
        const id = msg.id as number;
        os.setTeamInfo(
          id,
          msg.teamName as string | undefined,
          msg.agentName as string | undefined,
          msg.isTeamLead as boolean | undefined,
          msg.leadAgentId as number | undefined,
          msg.teamUsesTmux as boolean | undefined,
        );
      } else if (msg.type === 'agentTokenUsage') {
        const id = msg.id as number;
        traceAgentEvent(id, 'agentTokenUsage', `${msg.inputTokens ?? 0}/${msg.outputTokens ?? 0}`);
        const rateLimits = Array.isArray(msg.rateLimits)
          ? (msg.rateLimits as TokenRateLimitSnapshot[])
          : undefined;
        os.setAgentTokens(
          id,
          msg.inputTokens as number,
          msg.outputTokens as number,
          msg.estimated === true,
          (msg.artifactOutputTokens as number | undefined) ?? 0,
          msg.details as TokenUsageDetails | undefined,
          rateLimits?.find((limit) => limit.name === 'primary') ?? rateLimits?.[0],
        );
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'webviewReady' });
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getOfficeState]);

  return {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    agentLifecycleStatuses,
    agentLifecycleEvents,
    agentTimelineEvents,
    agentRuntimeMetadata,
    hiddenAgents,
    agentEventTrace,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
    codexProjects,
    externalAssetDirectories,
    lastSeenVersion,
    extensionVersion,
    watchAllSessions,
    setWatchAllSessions,
    alwaysShowLabels,
    hooksEnabled,
    setHooksEnabled,
    hooksInfoShown,
  };
}
