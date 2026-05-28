export type PauseResumeMessage =
  | { type: 'agentPause'; id: number }
  | { type: 'agentResume'; id: number };

export function isPausedStatus(status: string | undefined): boolean {
  return status === 'paused';
}

export function pauseActionLabel(isPaused: boolean): 'Pause' | 'Resume' {
  return isPaused ? 'Resume' : 'Pause';
}

export function buildPauseResumeMessage(id: number, isPaused: boolean): PauseResumeMessage {
  return isPaused ? { type: 'agentResume', id } : { type: 'agentPause', id };
}
