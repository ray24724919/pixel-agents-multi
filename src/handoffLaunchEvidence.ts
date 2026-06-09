import * as fs from 'fs';

import {
  HANDOFF_LAUNCH_EVIDENCE_POLL_MS,
  HANDOFF_LAUNCH_EVIDENCE_TIMEOUT_MS,
} from './constants.js';
import type { AgentState } from './types.js';

export type HandoffExecutorLaunchEvidence =
  | 'codex-rollout-lines'
  | 'codex-rollout-file'
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

function hasNonEmptyTranscript(jsonlFile: string, fsImpl: HandoffLaunchEvidenceFs): boolean {
  if (!jsonlFile) return false;
  try {
    return fsImpl.existsSync(jsonlFile) && fsImpl.statSync(jsonlFile).size > 0;
  } catch {
    return false;
  }
}

export function getHandoffExecutorLaunchEvidence(
  providerId: 'claude' | 'codex',
  agent: Pick<AgentState, 'hookDelivered' | 'jsonlFile' | 'linesProcessed'>,
  fsImpl: HandoffLaunchEvidenceFs = fs,
): HandoffExecutorLaunchEvidence | undefined {
  if (providerId === 'codex') {
    // Codex has no hook channel. The only truthful "the session actually started" signal is a
    // bound rollout transcript: startCodexCwdPoll sets agent.jsonlFile (and replaces the
    // placeholder sessionId) once a real ~/.codex thread appears in the launch cwd. Until then
    // the terminal may be sitting on an auth/permission prompt or have errored out, so we report
    // no evidence and let the caller time out rather than mark the handoff active on a guess.
    if (agent.linesProcessed > 0) return 'codex-rollout-lines';
    return hasNonEmptyTranscript(agent.jsonlFile, fsImpl) ? 'codex-rollout-file' : undefined;
  }
  if (agent.linesProcessed > 0) return 'claude-transcript-lines';
  if (agent.hookDelivered) return 'claude-hook';
  return hasNonEmptyTranscript(agent.jsonlFile, fsImpl) ? 'claude-transcript-file' : undefined;
}

export async function waitForHandoffExecutorLaunchConfirmation(
  providerId: 'claude' | 'codex',
  agent: Pick<AgentState, 'hookDelivered' | 'jsonlFile' | 'linesProcessed'>,
  options: HandoffLaunchEvidenceOptions = {},
): Promise<HandoffExecutorLaunchConfirmation> {
  const timeoutMs = options.timeoutMs ?? HANDOFF_LAUNCH_EVIDENCE_TIMEOUT_MS;
  const pollMs = options.pollMs ?? HANDOFF_LAUNCH_EVIDENCE_POLL_MS;
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
