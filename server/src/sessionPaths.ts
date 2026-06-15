/**
 * Claude.ai "cowork" / local-agent-mode spawns sandbox Claude Code sessions under
 * `<appData>/Claude/local-agent-mode-sessions/<session>/<sub>/local_<id>/outputs`. Each sandbox inherits
 * the user's global `~/.claude/settings.json` (and therefore the Pixel Agents hook), so it fires hooks at
 * the server and would otherwise be adopted as a phantom external agent whose project key is the sandbox
 * cwd and whose displayName is the cwd basename "outputs".
 *
 * These are internal Claude machinery, not the user's projects. The RAW adoption paths — the hook adopter
 * (`adoptExternalSessionFromHook`), the hook event handler, and persisted-agent restore — must reject
 * them. The LEGITIMATE cowork experience is served separately by the metadata-driven cowork scanner
 * (`scanClaudeCoworkSessions`), which re-bases onto the real user-selected project; that path must NOT use
 * this predicate, or it would break cowork support (see server/__tests__/claudeAdoption.test.ts).
 */
export const LOCAL_AGENT_MODE_SESSIONS_SEGMENT = 'local-agent-mode-sessions';

/** True when a cwd / transcript / jsonl path lives inside a Claude local-agent-mode (cowork) sandbox. */
export function isLocalAgentModeSandboxPath(p: string | undefined | null): boolean {
  return typeof p === 'string' && p.toLowerCase().includes(LOCAL_AGENT_MODE_SESSIONS_SEGMENT);
}
