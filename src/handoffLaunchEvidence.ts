import * as fs from 'fs';

import {
  HANDOFF_CLAUDE_LAUNCH_EVIDENCE_POLL_MS,
  HANDOFF_CLAUDE_LAUNCH_EVIDENCE_TIMEOUT_MS,
} from './constants.js';
import type { AgentState } from './types.js';

export type HandoffExecutorLaunchEvidence =
  | 'codex-terminal'
  | 'claude-hook'
  | 'claude-transcript-file'
  | 'claude-transcript-lines';

export interface HandoffExecutorLaunchConfirmation {
  confirmed: boolean;
  evidence?: HandoffExecutorLaunchEvidence;
}

interface HandoffLaunchEvidenceFs {
  existsSync(path: string): boolean;
  statSync(path: string): { size: number };
}

export interface HandoffLaunchEvidenceOptions {
  timeoutMs?: number;
  pollMs?: number;
  fsImpl?: HandoffLaunchEvidenceFs;
  sleep?: (ms: number) => Promise<void>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getHandoffExecutorLaunchEvidence(
  providerId: 'claude' | 'codex',
  agent: Pick<AgentState, 'hookDelivered' | 'jsonlFile' | 'linesProcessed'>,
  fsImpl: HandoffLaunchEvidenceFs = fs,
): HandoffExecutorLaunchEvidence | undefined {
  if (providerId === 'codex') return 'codex-terminal';
  if (agent.linesProcessed > 0) return 'claude-transcript-lines';
  if (agent.hookDelivered) return 'claude-hook';
  if (!agent.jsonlFile) return undefined;
  try {
    if (fsImpl.existsSync(agent.jsonlFile) && fsImpl.statSync(agent.jsonlFile).size > 0) {
      return 'claude-transcript-file';
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function waitForHandoffExecutorLaunchConfirmation(
  providerId: 'claude' | 'codex',
  agent: Pick<AgentState, 'hookDelivered' | 'jsonlFile' | 'linesProcessed'>,
  options: HandoffLaunchEvidenceOptions = {},
): Promise<HandoffExecutorLaunchConfirmation> {
  const timeoutMs = options.timeoutMs ?? HANDOFF_CLAUDE_LAUNCH_EVIDENCE_TIMEOUT_MS;
  const pollMs = options.pollMs ?? HANDOFF_CLAUDE_LAUNCH_EVIDENCE_POLL_MS;
  const fsImpl = options.fsImpl ?? fs;
  const sleep = options.sleep ?? delay;
  const deadline = Date.now() + Math.max(0, timeoutMs);

  while (true) {
    const evidence = getHandoffExecutorLaunchEvidence(providerId, agent, fsImpl);
    if (evidence) return { confirmed: true, evidence };
    if (Date.now() >= deadline) return { confirmed: false };
    await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
  }
}
