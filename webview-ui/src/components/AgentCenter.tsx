import { useMemo, useState } from 'react';

import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { vscode } from '../vscodeApi.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface AgentCenterProps {
  isOpen: boolean;
  onClose: () => void;
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  officeState: OfficeState;
  onCloseAgent: (id: number) => void;
}

export function AgentCenter({
  isOpen,
  onClose,
  agents,
  selectedAgent,
  agentTools,
  agentStatuses,
  officeState,
  onCloseAgent,
}: AgentCenterProps) {
  const [providerFilter, setProviderFilter] = useState<'all' | 'codex' | 'claude'>('all');
  const filteredAgents = useMemo(
    () =>
      agents.filter((id) => {
        if (providerFilter === 'all') return true;
        const providerId = officeState.characters.get(id)?.providerId ?? 'claude';
        return providerId === providerFilter;
      }),
    [agents, officeState, providerFilter],
  );
  const totalTokens = filteredAgents.reduce((sum, id) => {
    const ch = officeState.characters.get(id);
    return sum + (ch ? ch.inputTokens + ch.outputTokens : 0);
  }, 0);
  const minCost = estimateGpt55Cost(totalTokens, 'input');
  const maxCost = estimateGpt55Cost(totalTokens, 'output');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agent Center"
      className="w-[min(94vw,900px)] max-h-[82vh] overflow-hidden"
    >
      <div className="px-8 pb-8">
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="pixel-panel p-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-text-muted">Token meter</div>
                <div className="mt-1 text-2xl text-accent-bright">
                  {totalTokens.toLocaleString()} tokens
                </div>
              </div>
              <div className="text-right text-sm text-text-muted">
                <div>GPT-5.5 API estimate</div>
                <div className="text-text">
                  ${minCost.toFixed(4)} - ${maxCost.toFixed(4)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-text-muted">
              Range uses tracked tokens. Codex totals may not split input/output.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'codex', 'claude'] as const).map((provider) => (
              <Button
                key={provider}
                variant={providerFilter === provider ? 'active' : 'default'}
                size="sm"
                onClick={() => setProviderFilter(provider)}
              >
                {provider === 'all' ? 'All' : providerLabel(provider)}
              </Button>
            ))}
            <Button
              variant="default"
              size="sm"
              onClick={() => vscode.postMessage({ type: 'refreshAgents' })}
            >
              Refresh
            </Button>
          </div>
        </div>
        <div className="max-h-[58vh] overflow-auto border border-border">
          {filteredAgents.length === 0 ? (
            <div className="p-8 text-center text-text-muted">No agents yet</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredAgents.map((id) => (
                <AgentRow
                  key={id}
                  id={id}
                  isSelected={selectedAgent === id}
                  tools={agentTools[id] ?? []}
                  status={agentStatuses[id]}
                  officeState={officeState}
                  onCloseAgent={onCloseAgent}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AgentRow({
  id,
  isSelected,
  tools,
  status,
  officeState,
  onCloseAgent,
}: {
  id: number;
  isSelected: boolean;
  tools: ToolActivity[];
  status?: string;
  officeState: OfficeState;
  onCloseAgent: (id: number) => void;
}) {
  const ch = officeState.characters.get(id);
  const activeTool =
    tools.find((tool) => tool.permissionWait && !tool.done) ?? tools.find((tool) => !tool.done);
  const lastTool = tools.length > 0 ? tools[tools.length - 1] : undefined;
  const displayStatus = activeTool?.permissionWait
    ? 'needs approval'
    : (status ?? (ch?.isActive ? 'active' : 'waiting'));
  const activity =
    activeTool?.status ?? lastTool?.status ?? (displayStatus === 'waiting' ? 'Idle' : 'Working');
  const name = ch?.agentName ?? `Agent #${id}`;
  const project = ch?.folderName ?? 'Unknown project';
  const tokens = ch ? ch.inputTokens + ch.outputTokens : 0;
  const providerId = ch?.providerId ?? 'claude';

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-4 p-4 ${isSelected ? 'bg-active-bg' : 'bg-bg'}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <ProviderBadge providerId={providerId} />
          <span className="text-lg text-accent-bright truncate">{name}</span>
          <span className="text-xs text-text-muted">#{id}</span>
        </div>
        <div className="mt-1 text-sm text-text-muted truncate">{project}</div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusBadge status={displayStatus} />
          <span className="text-sm text-text truncate">{activity}</span>
          {tokens > 0 && (
            <span className="text-xs text-text-muted">{tokens.toLocaleString()} tokens</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => vscode.postMessage({ type: 'focusAgent', id })}
        >
          Focus
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onCloseAgent(id)}>
          Close
        </Button>
      </div>
    </div>
  );
}

function ProviderBadge({ providerId }: { providerId: string }) {
  return (
    <span className="border border-border bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted">
      {providerLabel(providerId)}
    </span>
  );
}

function providerLabel(providerId: string): string {
  if (providerId === 'codex') return 'Codex';
  if (providerId === 'claude') return 'Claude';
  return providerId;
}

function estimateGpt55Cost(tokens: number, kind: 'input' | 'output'): number {
  const ratePerMillion = kind === 'input' ? 5 : 30;
  return (tokens / 1_000_000) * ratePerMillion;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'needs approval'
      ? 'bg-status-permission'
      : status === 'active'
        ? 'bg-status-active'
        : 'bg-status-success';
  return (
    <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-text-muted">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      {status}
    </span>
  );
}
