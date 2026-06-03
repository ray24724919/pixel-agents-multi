import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/Button.js';
import {
  CHARACTER_SITTING_OFFSET_PX,
  FUEL_COLOR_CRITICAL,
  FUEL_COLOR_DANGER,
  FUEL_COLOR_OK,
  FUEL_COLOR_WARN,
  FUEL_GAUGE_BG,
  FUEL_GAUGE_HEIGHT_PX,
  FUEL_GAUGE_WIDTH_PX,
  MAX_CONTEXT_TOKENS,
  TEAM_ROLE_COLOR,
  TOKEN_CRITICAL_THRESHOLD,
  TOKEN_DANGER_THRESHOLD,
  TOKEN_WARN_THRESHOLD,
  TOOL_OVERLAY_VERTICAL_OFFSET,
} from '../../constants.js';
import type {
  AgentLifecycleState,
  AgentRuntimeMetadata,
  SubagentCharacter,
} from '../../hooks/useExtensionMessages.js';
import { vscode } from '../../vscodeApi.js';
import { delegationVisualStatusLabel, delegationVisualWorkerLabel } from '../delegationVisual.js';
import { isCharacterSeated } from '../engine/characters.js';
import type { OfficeState } from '../engine/officeState.js';
import type { ToolActivity } from '../types.js';
import { TILE_SIZE } from '../types.js';

interface ToolOverlayProps {
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  agentLifecycleStatuses: Record<number, AgentLifecycleState>;
  agentRuntimeMetadata: Record<number, AgentRuntimeMetadata>;
  subagentCharacters: SubagentCharacter[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  onCloseAgent: (id: number) => void;
  alwaysShowOverlay: boolean;
}

/** Derive a short human-readable activity string from tools/status */
function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
): string {
  const tools = agentTools[agentId];
  if (tools && tools.length > 0) {
    // Find the latest non-done tool
    const activeTool = [...tools].reverse().find((t) => !t.done);
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval';
      return activeTool.status;
    }
    // All tools done but agent still active (mid-turn) — keep showing last tool status
    if (isActive) {
      const lastTool = tools[tools.length - 1];
      if (lastTool) return lastTool.status;
    }
  }

  return 'Idle';
}

function getFuelColor(ratio: number): string {
  if (ratio >= TOKEN_CRITICAL_THRESHOLD) return FUEL_COLOR_CRITICAL;
  if (ratio >= TOKEN_DANGER_THRESHOLD) return FUEL_COLOR_DANGER;
  if (ratio >= TOKEN_WARN_THRESHOLD) return FUEL_COLOR_WARN;
  return FUEL_COLOR_OK;
}

function getLifecycleDotColor(lifecycle?: AgentLifecycleState): string | null {
  if (!lifecycle || lifecycle.status === 'idle') return null;
  if (lifecycle.status === 'waiting_permission') return 'var(--color-status-permission)';
  if (lifecycle.status === 'completed') return 'var(--color-status-success)';
  if (lifecycle.status === 'error') return 'var(--color-status-error)';
  return 'var(--color-status-active)';
}

export function ToolOverlay({
  officeState,
  agents,
  agentTools,
  agentLifecycleStatuses,
  agentRuntimeMetadata,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  onCloseAgent,
  alwaysShowOverlay,
}: ToolOverlayProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const el = containerRef.current;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  const selectedId = officeState.selectedAgentId;
  const hoveredId = officeState.hoveredAgentId;

  // All character IDs
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)];

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id);
        if (!ch) return null;

        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        const isSub = ch.isSubagent;

        // Only show for hovered or selected agents (unless always-show is on)
        if (!alwaysShowOverlay && !isSelected && !isHovered) return null;

        // Position above character
        const sittingOffset = isCharacterSeated(ch) ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        const screenY =
          (deviceOffsetY + (ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET) * zoom) / dpr;

        // Get activity text
        const subHasPermission = isSub && ch.bubbleType === 'permission';
        let activityText: string;
        if (isSub) {
          if (subHasPermission) {
            activityText = 'Needs approval';
          } else {
            const sub = subagentCharacters.find((s) => s.id === id);
            activityText = sub ? sub.label : 'Subtask';
          }
        } else {
          activityText = ch.delegation?.isActive
            ? `${delegationVisualStatusLabel(ch.delegation)} / ${delegationVisualWorkerLabel(
                ch.delegation,
              )}`
            : (agentLifecycleStatuses[id]?.label ?? getActivityText(id, agentTools, ch.isActive));
        }

        // Determine dot color
        const tools = agentTools[id];
        const hasPermission = subHasPermission || tools?.some((t) => t.permissionWait && !t.done);
        const hasActiveTools = tools?.some((t) => !t.done);
        const isActive = ch.isActive;
        const lifecycle = isSub ? undefined : agentLifecycleStatuses[id];

        let dotColor: string | null = getLifecycleDotColor(lifecycle);
        if (!dotColor && hasPermission) {
          dotColor = 'var(--color-status-permission)';
        } else if (!dotColor && isActive && hasActiveTools) {
          dotColor = 'var(--color-status-active)';
        } else if (!dotColor && ch.delegation?.isActive) {
          dotColor = 'var(--color-status-active)';
        }
        const shouldPulse =
          ch.delegation?.isActive ||
          (isActive && !hasPermission && lifecycle?.status !== 'completed') ||
          lifecycle?.status === 'thinking' ||
          lifecycle?.status === 'tool_running';

        const isTeamAgent = !!ch.teamName;
        const conversationTitle = !isSub && !isTeamAgent ? ch.agentName || null : null;
        const teamRoleLabel = isTeamAgent ? (ch.isTeamLead ? 'LEAD' : ch.agentName || null) : null;
        const projectProviderLine = projectProviderDisplayName(ch.folderName, ch.providerId);
        const agentNameLine =
          conversationTitle ?? teamRoleLabel ?? (isSub ? 'Sub-agent' : `Agent #${id}`);
        const delegationLine =
          !isSub && ch.delegation && !ch.delegation.isActive
            ? `${delegationVisualStatusLabel(ch.delegation)} / ${delegationVisualWorkerLabel(
                ch.delegation,
              )}`
            : null;
        const totalTokens = ch.inputTokens + ch.outputTokens;
        const tokenRatio = totalTokens / MAX_CONTEXT_TOKENS;
        const hasExtraLines = !!(
          projectProviderLine ||
          agentNameLine ||
          delegationLine ||
          lifecycle?.detail
        );
        const metadata = agentRuntimeMetadata[id];
        const canOpenProject = !!metadata?.projectDir;
        const canOpenTranscript = !!metadata?.transcriptPath;
        const showActions = isSelected && !isSub && (canOpenProject || canOpenTranscript);

        return (
          <div
            key={id}
            className="absolute flex flex-col items-center -translate-x-1/2"
            style={{
              left: screenX,
              top: screenY - (hasExtraLines ? 34 : 28),
              pointerEvents: isSelected ? 'auto' : 'none',
              opacity: alwaysShowOverlay && !isSelected && !isHovered ? (isSub ? 0.5 : 0.75) : 1,
              zIndex: isSelected ? 42 : 41,
            }}
          >
            <div className="flex items-center border-border px-8 pt-2 pb-4 gap-5 pixel-panel whitespace-nowrap max-w-xs">
              <div className="flex flex-col gap-0 overflow-hidden">
                {projectProviderLine && (
                  <span
                    className="text-2xs leading-none overflow-hidden text-ellipsis block"
                    style={{ color: TEAM_ROLE_COLOR }}
                  >
                    {projectProviderLine}
                  </span>
                )}
                {agentNameLine && (
                  <span
                    className="overflow-hidden text-ellipsis block leading-none"
                    style={{
                      fontSize: '18px',
                      color: TEAM_ROLE_COLOR,
                      fontWeight: ch.isTeamLead ? 'bold' : undefined,
                    }}
                  >
                    {agentNameLine}
                  </span>
                )}
                <div className="flex min-w-0 items-center gap-4">
                  {dotColor && (
                    <span
                      className={`w-6 h-6 rounded-full shrink-0 ${
                        shouldPulse ? 'pixel-pulse' : ''
                      }`}
                      style={{ background: dotColor }}
                    />
                  )}
                  <span
                    className="overflow-hidden text-ellipsis block leading-none"
                    style={{
                      fontSize: isSub ? '20px' : '22px',
                      fontStyle: isSub ? 'italic' : undefined,
                    }}
                  >
                    {activityText}
                  </span>
                </div>
                {delegationLine && (
                  <span className="text-2xs leading-none overflow-hidden text-ellipsis block opacity-90">
                    {delegationLine}
                  </span>
                )}
                {lifecycle?.detail && (
                  <span className="text-2xs leading-none overflow-hidden text-ellipsis block opacity-85">
                    {lifecycle.detail}
                  </span>
                )}
              </div>
              {isSelected && !isSub && (
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  {showActions && (
                    <>
                      {canOpenProject && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            vscode.postMessage({ type: 'openAgentProject', id });
                          }}
                          title={metadata.projectDir}
                          className="px-4"
                        >
                          Project
                        </Button>
                      )}
                      {canOpenTranscript && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            vscode.postMessage({ type: 'openAgentTranscript', id });
                          }}
                          title={metadata.transcriptPath}
                          className="px-4"
                        >
                          Log
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseAgent(id);
                    }}
                    title="Close agent"
                    className="shrink-0 leading-none"
                  >
                    ×
                  </Button>
                </div>
              )}
            </div>
            {isTeamAgent && totalTokens > 0 && (
              <div
                style={{
                  width: FUEL_GAUGE_WIDTH_PX,
                  height: FUEL_GAUGE_HEIGHT_PX,
                  background: FUEL_GAUGE_BG,
                  marginTop: 2,
                }}
                title={`${Math.round(tokenRatio * 100)}% context used (${(totalTokens / 1000).toFixed(0)}k tokens)`}
              >
                <div
                  style={{
                    width: `${Math.min(tokenRatio * 100, 100)}%`,
                    height: '100%',
                    background: getFuelColor(tokenRatio),
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function projectProviderDisplayName(folderName?: string, providerId?: string): string {
  const provider = (providerId ?? 'claude').trim().toLowerCase();
  const project = folderName?.trim();
  return project ? `${project} (${provider})` : `(${provider})`;
}
