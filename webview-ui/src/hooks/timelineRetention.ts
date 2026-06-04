export function shouldRetainTimelineEventAfterAgentRemoval(kind: string): boolean {
  return (
    kind.startsWith('action.') || kind.startsWith('delegation.') || kind.startsWith('handoff.')
  );
}
