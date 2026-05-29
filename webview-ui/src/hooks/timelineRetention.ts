export function shouldRetainTimelineEventAfterAgentRemoval(kind: string): boolean {
  return kind.startsWith('action.');
}
