# W2-D Kill / Hide / Archive Report

## Summary

Implemented distinct Hide, Archive, and Kill semantics for active Pixel Agents, including hidden-agent filtering, archived-agent persistence, Codex SQLite archiving, Kill confirmation, and action timeline events.

## Implementation Choices

- Hide is implemented in `src/PixelAgentsViewProvider.ts` `handleAgentAction`: it sets `agent.hidden = true`, persists active agents, posts `agentLifecycleHidden`, and leaves the agent in the active `agents` map so polling/tool tracking continues.
- Hidden state is persisted through `AgentState.hidden` and `PersistedAgent.hidden` in `src/types.ts`, restored in `src/agentManager.ts`, and sent to the webview through `existingAgents.hiddenAgents`.
- The webview tracks hidden agents in `webview-ui/src/hooks/useExtensionMessages.ts`. `App.tsx` filters hidden characters out of the canvas unless the Agent Center "Show hidden" checkbox is enabled. `AgentCenter.tsx` applies the same filter to the roster and token summary.
- Archive is implemented in `src/PixelAgentsViewProvider.ts`: it stores an `ArchivedAgentRecord` under `pixel-agents.archivedAgents`, permanently seeds the transcript into known/dismissed tracking, stops watchers/timers via existing `removeAgent`, removes the agent from the active map, and posts `agentArchived`.
- Archive for Codex also calls `archiveCodexThread(agent.sessionId)`, so W2-A's Codex scanner will not re-adopt the thread because Codex queries already filter `archived = 0`.
- Archived transcript paths are also guarded during hook external-session detection and session resume so a later hook event does not undo Archive.
- Kill is implemented in `src/PixelAgentsViewProvider.ts`: it calls `agent.terminalRef?.dispose()`, archives Codex threads with `archiveCodexThread`, permanently dismisses the transcript, removes the active agent via `removeAgent`, and posts `agentClosed`.
- Kill can only terminate processes for agents where Pixel Agents has a VS Code terminal reference. For externally adopted agents without `terminalRef`, W2-D archives/dismisses/removes the agent but has no process handle to dispose.
- Kill confirmation is implemented in `webview-ui/src/App.tsx`: choosing Kill from the action modal switches to a confirmation view; only the confirmed Kill button posts `agentAction` with `action: "kill"`. Hide and Archive post immediately.
- Action timeline events reuse the existing `postAgentTimelineEvent` helper from `src/timelineEvents.ts`. New event kinds are `action.hide`, `action.archive`, and `action.kill`.
- `archiveCodexThread` already existed in `server/src/providers/file/codex/codex.ts`, so W2-D reused it unchanged. I added test coverage for its SQL call in `server/__tests__/codex.test.ts`.
- `agentManager.removeAgent` did not need an overload. Archive writes the archived record before calling `removeAgent`; then `removeAgent` persists the remaining active agents as before.
- Teammate/sub-agent scope: I removed the action-handler-level teammate removal so Hide, Archive, and Kill apply only to the selected agent. Existing hook/session-end teammate cleanup remains unchanged outside this action path.

## Tests

- Added `server/__tests__/agentActions.test.ts` for Hide, Archive, and Kill backend semantics.
- Added Codex archive helper coverage in `server/__tests__/codex.test.ts`.
- Added `webview-ui/test/agent-center-hidden.test.ts` for hidden-agent visibility with the Show hidden toggle.

## Verification

- `npm run build`: passed.
- `npm test`: passed.
- Webview tests: 7 passed.
- Server tests: 176 passed.
- Combined test count: 183 passed, meeting the `>= 168` requirement.

## Manual Verification

No VS Code Extension Host runtime verification was performed in this environment. The packaging/install/reload sequence and live process checks from the W2-D verification protocol remain for user-side manual validation.
