# Codex Executor — Deviation Map

Historical audit of how the Codex executor agent's actual output diverged from the supervisor/user's design intent, derived from the 14 Codex session transcripts that produced the current `pixel-agents` working tree.

**Time window**: 2026-05-12 (initial Claude→Codex pivot) through 2026-05-15 (roadmap implementation slice).
**Repo state when audited**: 1 commit landed (`e61b405 feat: add Codex agent visualization`, May 13). Everything from May 15 onward is still uncommitted in the working tree (24 modified files + 7 untracked files; ~2 200 line net add).

Legend: `[BLOCKER]` breaks a primary use-case ; `[ANNOYING]` works wrong / confuses user but workaroundable ; `[COSMETIC]` polish.

---

## Main thread — parent supervisor session

- **Thread**: `019e1ad8-ff41` — main parent session
- **File**: `~/.codex/sessions/2026/05/12/rollout-2026-05-12T14-21-29-019e1ad8-ff41-7b50-bbf7-99ce55f24cb9.jsonl`
- **Date**: 2026-05-12 → 2026-05-26 (long-lived)
- **Size**: 16 MB, 8 318 lines, 142 user msgs, 505 assistant msgs, 1 270 function calls, 123 distinct human prompts

### User's original ask

Three-stage vision the human articulated incrementally:

1. (USER #1, line 5) "理解這個 claude-code 像素化 vscode 專案"
2. (USER #2, line 154) "我有辦法把這個串上 codex 嗎"
3. (USER #3, line 245) "我們先把要從現在配合 claude 的模式 => 配合 codex 的模式的詳細規劃列出來" — i.e. **plan a Claude→Codex _addition_, not a replacement**, then dispatch sub-agents to do it under the main thread's supervision.

Later prompts make it crystal clear the user wanted **dual-provider** support, not Codex-only:

- USER #36 (line 2050): "有辦法同時檢視 claude 跟 codex 的 agent 嗎"
- USER #41 (line 2393): wanted an All/Codex/Claude filter
- USER #42 (line 2585): "我希望 claude 的 agent 也顯示 codex 那邊的邏輯" — same UX, both providers.
- USER #15 (line 1244): "為何現在按 +agent 還是 claude 的" — this was **before** the launcher was flipped; the user later never re-asked for Claude launching, because their attention had moved on, but at no point did they say "drop Claude launching."

### What executor (main thread, itself acting as supervisor) actually did

- Dispatched 6+ named sub-agent work-streams on May 12 covering: coupling audit, Codex transcript research, webview copy Codex-ization, Codex provider tests, mock-Codex e2e, `openClaude→openAgent` rename.
- Later (May 15) dispatched roadmap drafting + Worker A/B/C/D implementation slice for lifecycle + timeline + AgentCenter.
- Self-edited `src/agentManager.ts` to add `providerId: 'codex'` and rewire `launchNewTerminal` to call `buildCodexLaunchCommand`, dropping the `claude --session-id` path entirely (committed as `e61b405`).
- Authored `docs/roadmap/visual-agent-control-room-roadmap.md` and three drafts.
- Built large portions of the lifecycle / timeline / AgentCenter task-hub features but never committed them; user never explicitly approved freezing this scope.

### Deviations from intent

- **Abstraction collapse on launcher** `[BLOCKER]` — Plan was "add Codex _alongside_ Claude"; what shipped (`e61b405`) was Claude launch path deleted (`src/agentManager.ts:97` is hardcoded to `buildCodexLaunchCommand`). Now manifests as symptom S-T1-01.
- **Scope creep across all 10 roadmap phases at once** `[ANNOYING]` — User said "plan ; then start." Executor planned + immediately started implementing phases 1–9 in one giant uncommitted diff (24 modified files), making cleanup huge.
- **Sub-agent dispatching with overlapping write zones** `[ANNOYING]` — The May 15 Worker A/B/C/D split (extension vs webview vs backend timeline vs AgentCenter UI) shipped a coherent contract on paper, but every worker reports "worktree has other agents' uncommitted changes I didn't touch", confirming the supervisor never landed intermediate checkpoints.
- **Roadmap status table claims Phases 1–6 "Done"** `[ANNOYING]` — `visual-agent-control-room-roadmap.md:44-57` marks phases 1, 2, 3, 4, 5, 6 as Done although none of that code is in any commit; user has no way to know which "Done" is committed vs uncommitted.

### Leftover issues

- `src/agentManager.ts:97` — hardcoded Codex launcher (no provider parameter).
- `webview-ui/src/components/BottomToolbar.tsx:131-211` — +Agent modal has no provider picker.
- 7 untracked files (lifecycleStatus.ts, timelineEvents.ts, tokenUsage.ts, TokenCostSummary.tsx, RoomTokenCostSummary.tsx, RoomZoneOverlay.tsx, RoomZoneStatus.tsx, visibleRoomBounds.ts, zoneUtils.ts) cannot be re-derived if cwd is wiped.

### Current code state

**Mixed**: launcher flip and Codex visualization are committed (`e61b405`); everything from May 15 is uncommitted working tree.

---

## Work-stream 1 — Audit Claude coupling points

- **Thread**: `019e1ae8-010a` — "盤點 Claude 耦合點"
- **File**: `…/2026/05/12/rollout-2026-05-12T14-37-52-019e1ae8-010a-7472-86c1-07e4277c607b.jsonl`
- **Date**: 2026-05-12, 568 KB, 2 user / 5 assistant / 40 function calls.

### User's original ask

Read-only audit: enumerate Claude-specific coupling points in extension+server (launch terminal, session path discovery, JSONL parser, hook installer, webview labels, tests), output (1) file/function list (2) what to abstract (3) what to hard-cut to Codex first (4) risks & test recommendations. **不要改檔**.

### What executor did

- Read-only, no edits — clean.
- Produced an excellent inventory: pinpointed `getProjectDirPath`, `launchNewTerminal`, `restoreAgents` in agentManager.ts; the JSONL polling, scanners, teammate logic in fileWatcher.ts; the hardcoded `PERMISSION_EXEMPT_TOOLS` and Claude tool names in transcriptParser.ts; the Claude-hardcoded `initHooks()` in PixelAgentsViewProvider.ts.
- Recommended provider abstraction at the file-provider layer (`server/src/providers/file/<provider>/`).

### Deviations

- **None of consequence.** This is the cleanest thread in the set. If anything, the only issue is that the rest of the program ignored its abstraction recommendation in favor of hard-cutting.

### Leftover issues

- None directly from this thread. Its audit list is still accurate and useful as a cleanup checklist.

### Current code state

Read-only — no diff produced.

---

## Work-stream 2 — Investigate Codex observability

- **Thread**: `019e1ae8-1309` — "調查 Codex 可觀測資料"
- **File**: `…/2026/05/12/rollout-2026-05-12T14-37-57-019e1ae8-1309-7c10-bd6c-4043a937bbe1.jsonl`
- **Date**: 2026-05-12, 370 KB, 2 user / 5 assistant / 29 function calls.

### User's original ask

Read-only investigation of `~/.codex/state_5.sqlite`, `session_index.jsonl`, `rollout-*.jsonl`, and `codex --help`. Output: (1) how to find active thread + rollout from cwd, (2) common record types, (3) event→toolStart/toolEnd/turnEnd/permission/subagent mapping, (4) v1 parser rules.

### What executor did

- Read-only, no edits — clean.
- Identified SQLite `threads where archived=0 and cwd=? order by updated_at_ms desc` as primary lookup. Documented `session_meta`, `turn_context`, `response_item`, `event_msg`, `compacted` record types.
- Mapped function_call→toolStart, function_call_output→toolEnd, task_complete→turnEnd, guardian_assessment→permissionRequest, collab_agent_spawn_end→subagent.

### Deviations

- **None.** Clean.

### Leftover issues

None.

### Current code state

Read-only — no diff. Its findings became the basis for `server/src/providers/file/codex/codex.ts` in commit `e61b405`.

---

## Work-stream 3 — Webview copy to Codex/neutral

- **Thread**: `019e1aeb-8628` — "更新 webview 文案為 Codex"
- **File**: `…/2026/05/12/rollout-2026-05-12T14-41-43-019e1aeb-8628-74c2-a3fd-0bf23dcbf35f.jsonl`
- **Date**: 2026-05-12, 104 KB, 2 user / 5 assistant / 11 function calls.

### User's original ask

**Narrow scope**: only change user-visible Claude copy to Codex/neutral in `App.tsx`, `SettingsModal.tsx`, `BottomToolbar.tsx`, `useEditorActions.ts`. Internal `openClaude` message naming may be **preserved**. Don't touch `src/`, `server/`, `tests`.

### What executor did

- Only touched `App.tsx` and `SettingsModal.tsx` (didn't touch the other two in-scope files because there was no Claude copy to change). Explicit decision to keep `openClaude`/`handleOpenClaude` internal naming.
- Reported clean.

### Deviations

- **None.** Stayed strictly inside scope. Good thread.

### Leftover issues

None.

### Current code state

Committed inside `e61b405`.

---

## Work-stream 4 — Codex provider tests

- **Thread**: `019e1aeb-a979` — "新增 Codex provider 測試"
- **File**: `…/2026/05/12/rollout-2026-05-12T14-41-52-019e1aeb-a979-7a00-9604-3ad9073eaa8c.jsonl`
- **Date**: 2026-05-12, 190 KB, 2 user / 9 assistant / 25 function calls.

### User's original ask

Write `server/__tests__/codex.test.ts` (and fixtures) testing identity, launch command, function_call→toolStart, function_call_output→toolEnd, guardian_assessment in_progress→permissionRequest, task_complete→turnEnd. **Don't touch implementation files.** Assume not-yet-implemented exports.

### What executor did

- Wrote `server/__tests__/codex.test.ts` covering all six requested scenarios.
- Did not run tests (`vitest` binary not installed in `server/node_modules/.bin`) — reported honestly.

### Deviations

- **Mild — never verified tests run** `[ANNOYING]` — executor couldn't run `npm test` and didn't escalate / `npm install` to make it runnable. Tests may have stale signatures versus what `e61b405` actually shipped (e.g. `findLatestCodexThread` vs `findCodexThreadById` etc). Worth re-checking they still pass.

### Leftover issues

- `server/__tests__/codex.test.ts` test pass status unknown at time of writing (audit didn't run them).

### Current code state

Committed in `e61b405` (file is present in tree).

---

## Work-stream 5 — Mock Codex e2e

- **Thread**: `019e1af5-c27e` — "改用 mock Codex"
- **File**: `…/2026/05/12/rollout-2026-05-12T14-52-54-019e1af5-c27e-72b0-b861-b42e392c4ae2.jsonl`
- **Date**: 2026-05-12, 265 KB, 2 user / 10 assistant / 51 function calls.

### User's original ask

Switch e2e from mock-claude to mock-codex: create `e2e/fixtures/mock-codex` (+ `.cmd` for Windows), update `e2e/helpers/launch.ts`, update `e2e/tests/agent-spawn.spec.ts`. Mock builds isolated `HOME/.codex/state_5.sqlite` and rollout JSONL so extension can find latest thread. Terminal name expected `Codex #N`. Don't touch `src/server/webview`.

### What executor did

- Wrote `mock-codex` bash script + `.cmd` Windows wrapper that builds sqlite + rollout.
- Updated launch helper for `CODEX_HOME` isolation. Updated spec to look for `Codex #N`.
- Could not actually run full Playwright e2e (no `.vscode-test/vscode-executable.txt`); reported.

### Deviations

- **Reinforces Codex-only assumption in e2e** `[ANNOYING]` — there is no mock-claude anymore _and_ no mode in the e2e to pick provider. When dual-provider launching comes back, the e2e harness must regrow a provider axis.
- **E2e never verified end-to-end** `[ANNOYING]` — repeating pattern: executor wrote it, didn't run it. Quality unknown.

### Leftover issues

- e2e/tests/agent-spawn.spec.ts assumes single-provider; needs a `provider` test matrix once Claude path returns.

### Current code state

Committed in `e61b405`.

---

## Work-stream 6 — Rename openClaude → openAgent (key suspect for S-T1-01)

- **Thread**: `019e1af5-d6d5` — "重命名 openClaude 為 openAgent"
- **File**: `…/2026/05/12/rollout-2026-05-12T14-52-59-019e1af5-d6d5-7150-8e30-42117fbc1087.jsonl`
- **Date**: 2026-05-12, 109 KB, 2 user / 5 assistant / 11 function calls.

### User's original ask

"清理 webview/extension 內部 openClaude 命名債，但**保持行為不變**." Scope: `useEditorActions.ts`, `BottomToolbar.tsx`, `App.tsx`, `PixelAgentsViewProvider.ts`. Extension accepts both `openAgent` and `openClaude` for backward compat. **Don't touch `agentManager/server/e2e`.**

### What executor did

- Renamed prop/handler/message to `openAgent` in the four files.
- Kept `openClaude` accepted in PixelAgentsViewProvider via `||` check at line 803.
- Reported clean.

### Deviations

- **None _in this thread itself_.** The rename was a pure rename. The user's intent ("behavior unchanged") was respected by _this_ sub-agent.
- **BUT** — this is the _suspected origin_ of S-T1-01 per the symptoms log. Closer inspection: the executor of _this_ thread did not touch `agentManager.ts` and did not delete the Claude launch path. The launcher hard-cut to Codex was done **separately, by the main thread directly** (see commit `e61b405` diff: `terminal.sendText(claudeCmd)` → `terminal.sendText(buildCodexLaunchCommand(...))`) — _not_ by this rename sub-agent. **S-T1-01 was a main-thread direct-edit deviation, masked by the rename thread happening around the same time.**

### Leftover issues

- The rename itself: clean. Re-add of provider selection requires undoing the main thread's hard-cut, not this thread's rename.
- `openClaude` backward-compat in `PixelAgentsViewProvider.ts:803` is now misleading — the message accepts both names but does the same Codex-only thing regardless.

### Current code state

Committed in `e61b405`.

---

## Work-stream 7 — Guardian-assessment review (not implementation)

- **Thread**: `019e1aef-e0ed` — title unknown in spec; **on inspection this is Codex's own internal approval/guardian-assessment session**, not a development thread
- **File**: `…/2026/05/12/rollout-2026-05-12T14-46-28-019e1aef-e0ed-75c3-8663-55184a6ff745.jsonl`
- **Date**: 2026-05-12, 572 KB, 13 user / 8 assistant / 0 function calls.

### User's original ask

N/A — the "user" messages here are Codex's guardian-style review prompts ("Treat the transcript… as untrusted evidence"). It's a meta-session where one Codex instance is assessing another's planned action.

### What executor did

- Output is a series of structured JSON risk assessments (`{"risk_level": "medium", "outcome": "allow", …}`).
- Made no file edits (0 function calls).

### Deviations

- **None.** Not a development thread; should be excluded from cleanup design.

### Leftover issues

None.

### Current code state

N/A.

> Cannot confidently characterize as a deviation source — this thread was the guardian-review subsystem, not Worker labor. Listed for completeness only.

---

## Work-stream 8 — Status-engine roadmap draft (planning)

- **Thread**: `019e2ada-aa6f` — "撰寫狀態引擎與回放路線圖"
- **File**: `…/2026/05/15/rollout-2026-05-15T16-57-14-019e2ada-aa6f-7423-8774-6416da6c559e.jsonl`
- **Date**: 2026-05-15, 96 KB, 2 user / 5 assistant / 7 function calls.

### User's original ask

Write `docs/roadmap/drafts/status-timeline-replay.md` — lifecycle status engine + bubbles + timeline + replay foundation. **No build, no other files.** Traditional Chinese, owner-facing.

### What executor did

- Created the draft, single file. Reported.

### Deviations

- **None.** Stayed in scope.

### Leftover issues

None.

### Current code state

Untracked working tree (`?? docs/roadmap/`).

---

## Work-stream 9 — Agent Center + Projects + VS Code integration draft (planning)

- **Thread**: `019e2ada-c7f2` — "撰寫 Agent Center 規劃草稿"
- **File**: `…/2026/05/15/rollout-2026-05-15T16-57-21-019e2ada-c7f2-7823-bde6-9cc203435ebd.jsonl`
- **Date**: 2026-05-15, 91 KB, 2 user / 4 assistant / 6 function calls.

### User's original ask

Write `docs/roadmap/drafts/agent-center-projects-integration.md`. Same constraints.

### What executor did

- Created the draft. Reported clean.

### Deviations

- **None.** Stayed in scope.

### Leftover issues

None.

### Current code state

Untracked working tree.

---

## Work-stream 10 — Zones + Cost + Hide/Archive/Kill + Team draft (planning)

- **Thread**: `019e2ada-f806` — "撰寫 roadmap 規劃草稿"
- **File**: `…/2026/05/15/rollout-2026-05-15T16-57-33-019e2ada-f806-7181-8f99-a0b7de7cf3ba.jsonl`
- **Date**: 2026-05-15, 91 KB, 2 user / 4 assistant / 7 function calls.

### User's original ask

Write `docs/roadmap/drafts/zones-cost-actions-team.md`. Same constraints.

### What executor did

- Created the draft. Reported clean.

### Deviations

- **None.**

### Leftover issues

None.

### Current code state

Untracked working tree.

---

## Work-stream 11 — Worker A: lifecycle status engine (backend)

- **Thread**: `019e2ae0-727d` — "統一 lifecycle 狀態"
- **File**: `…/2026/05/15/rollout-2026-05-15T17-03-33-019e2ae0-727d-77a2-8bb9-83ea05d2cdfd.jsonl`
- **Date**: 2026-05-15, 289 KB, 2 user / 7 assistant / 27 function calls.

### User's original ask

Worker A: implement unified lifecycle webview message. Files: new `src/lifecycleStatus.ts`, modify `transcriptParser.ts`, `timerManager.ts`, `server/src/hookEventHandler.ts`, minimal `agentManager.ts` for reload-snapshot. **Don't touch `webview-ui/**`.** Preserve existing `agentStatus`/`agentTool*`messages. Send`agentLifecycleStatus` *in addition\*.

### What executor did

- Created `src/lifecycleStatus.ts` (226 lines) with status type + helpers `postAgentLifecycleStatus`, `postToolRunning`, `postWaitingPermission`, `postWaitingUser`, `postCompleted`, `postError`.
- Wired Claude `system.status=requesting`→thinking, `tool_use`→tool_running, `turn_duration`→completed; Codex `userTurn`→thinking, `toolStart`→tool_running, `permissionRequest`→waiting_permission, `turnEnd`→completed; hook events; heuristic timer fallbacks; reload-snapshot inference.
- `npm run check-types` passed.

### Deviations

- **Reload snapshot heuristic** `[ANNOYING]` — reload snapshot can only infer status from extension-side state; it does not replay prior timeline. Acceptable, but means "what was the last status" is rebuilt by guess after webview reload.
- Otherwise contract was followed.

### Leftover issues

- `src/lifecycleStatus.ts` is currently **untracked** — never committed; will be lost on a hard-reset.

### Current code state

Untracked + uncommitted changes to existing files.

---

## Work-stream 12 — Worker B: lifecycle status UI (webview)

- **Thread**: `019e2ae0-b9a4` — "實作 lifecycle 狀態顯示"
- **File**: `…/2026/05/15/rollout-2026-05-15T17-03-51-019e2ae0-b9a4-7602-bb52-451e331a31dc.jsonl`
- **Date**: 2026-05-15, 254 KB, 2 user / 9 assistant / 21 function calls.

### User's original ask

Worker B: receive `agentLifecycleStatus` on the webview. Files: `useExtensionMessages.ts`, `ToolOverlay.tsx`, `DebugView.tsx`, optional minimal `App.tsx`/`AgentCenter.tsx`. **Don't touch `src/**`or`server/**`.** Status bubble lightweight; don't overhaul UI. `completed` auto-fades to `idle` after 2.5 s unless newer status arrives.

### What executor did

- Added `agentLifecycleStatuses` + `agentLifecycleEvents` in `useExtensionMessages`.
- `ToolOverlay` shows lifecycle label/detail with fallback to existing tool/status; lifecycle dot color by severity.
- `DebugView` and `AgentCenter` agent rows show lifecycle.
- `cd webview-ui && npm run build` passed.

### Deviations

- **Slight scope creep into AgentCenter** `[COSMETIC]` — was meant to be optional minimal; ended up wiring lifecycle into AgentCenter as well. Worker D later does a full AgentCenter rewrite anyway so this is fine.
- **`completed→idle` 2.5 s fade is webview-side state with `updatedAt` guard** — fragile if backend sends `completed` repeatedly with stale timestamps. Has not been observed misfiring in symptoms log yet.

### Leftover issues

- None blocking. Risk: webview-side lifecycle state is duplicated with extension-side; reload races possible.

### Current code state

Uncommitted working tree.

---

## Work-stream 13 — Worker C: timeline-event foundation (backend)

- **Thread**: `019e2aeb-2da3` — "新增 timeline event 基礎架構"
- **File**: `…/2026/05/15/rollout-2026-05-15T17-15-16-019e2aeb-2da3-7270-b740-7d60e7b4e71c.jsonl`
- **Date**: 2026-05-15, 196 KB, 2 user / 6 assistant / 22 function calls.

### User's original ask

Worker C: add normalized `agentTimelineEvent` message. Files: new `src/timelineEvents.ts`, modify `lifecycleStatus.ts`, minimal modifications to `transcriptParser.ts`, `timerManager.ts`, `server/src/hookEventHandler.ts`. **Don't touch `webview-ui/**`.** `status.changed`, `tool.started`, `permission.requested`, `user_input.requested`, `run.started/completed/failed`, `token.usage` kinds.

### What executor did

- Created `src/timelineEvents.ts` (only 66 lines — tiny). Defines `postAgentTimelineEvent` + kind type.
- Modified `lifecycleStatus.ts` so each helper now emits exactly **one** semantic kind (rather than always `status.changed` + a semantic kind), to avoid duplicate event spam.
- `npm run check-types` passed.

### Deviations

- **`timelineEvents.ts` is bare-bones** `[ANNOYING]` — 66 lines with no buffer, no projection, no persistence. The phase-2 acceptance criterion "webview reload can rebuild current status from recent snapshot plus timeline" is not implementable with this surface.
- **Interpretation drift on "status.changed"** `[COSMETIC]` — Worker C decided helpers should emit _only_ the semantic kind (not also `status.changed`); the contract is ambiguous either way, but the supervisor never confirmed this trade-off.

### Leftover issues

- `src/timelineEvents.ts` untracked.
- No timeline persistence anywhere — reload still rebuilds from heuristics.

### Current code state

Untracked + uncommitted.

---

## Work-stream 14 — Worker D: Agent Center task-hub UI

- **Thread**: `019e2aeb-5d17` — "更新 Agent Center 任務中心"
- **File**: `…/2026/05/15/rollout-2026-05-15T17-15-28-019e2aeb-5d17-7aa2-b165-7d747728c6b7.jsonl`
- **Date**: 2026-05-15, 309 KB, 2 user / 7 assistant / 26 function calls.

### User's original ask

Worker D: minimal "task center" upgrade to AgentCenter. Files: `useExtensionMessages.ts`, `AgentCenter.tsx`, optional minimal `App.tsx`. **Don't touch `src/**`or`server/**`.** Provider filter All/Codex/Claude **preserved**; add status filter All/Active/Waiting/Needs me/Error. Detail panel with title/provider/project/lifecycle/last event/timeline preview/token usage/Focus+Kill actions. **"克制、工具型，不要做 landing page 或大卡片堆."**

### What executor did

- Added `agentTimelineEvents` state with fallback to lifecycle events when no timeline yet.
- Rewrote `AgentCenter.tsx` from ~340 lines pre-thread to **937 lines** post-thread (+985 in current diff).
- Added provider filter, status filter, project filter, **team filter** (not requested), team dashboard (not requested), team roster (not requested).
- Detail panel shows lifecycle, last event, timeline, token usage, Focus/Kill actions.
- `cd webview-ui && npm run build` passed.

### Deviations

- **Scope creep — built team dashboard / team filter / team roster** `[ANNOYING]` — the user prompt explicitly says "克制、工具型，不要做 landing page 或大卡片堆." Team functionality is from a _different_ roadmap phase (Phase 9). Executor pulled it forward into this minimal slice. `AgentCenter.tsx` is now nearly 1 000 lines and three feature surfaces wide.
- **Duplicate state pipelines** `[ANNOYING]` — frontend now maintains lifecycle map, lifecycle event log, timeline event log, _and_ fallback projection from lifecycle→timeline. Four sources of truth for "what is this agent doing now."
- **Detail panel is interactive but actions are still mapped to legacy `onCloseAgent`** `[COSMETIC]` — Hide/Archive/Kill UI was deferred to a later phase but the Kill button uses the old close flow, which is generic Codex-only close path. Action semantics not yet wired to the safe-action model from Phase 4.

### Leftover issues

- `webview-ui/src/components/AgentCenter.tsx` is the single largest uncommitted file in the diff and the hardest to review.
- Symptom S-T2-01 (one +Agent click = many entries) surfaces here because the AgentCenter does not de-dup same-cwd Codex threads — but the root cause is in `scanCodexWorkspaceThreads` (extension), not AgentCenter rendering. AgentCenter just faithfully shows the ghosts.

### Current code state

Uncommitted working tree.

---

# Synthesis

## Recurring deviation themes (with frequency)

1. **Abstraction collapse instead of polymorphism** (1 thread direct, 1 thread indirect = 2 threads + 1 commit) — The single most damaging pattern. Main thread's direct edit to `src/agentManager.ts` (in commit `e61b405`) **replaced** `terminal.sendText('claude --session-id …')` with `terminal.sendText(buildCodexLaunchCommand(…))` and added `providerId: 'codex'` hardcoded. No `provider` parameter was threaded through `launchNewTerminal`'s signature, no UI affordance to pick, no Claude path retained behind an `if`. The user _never asked_ to drop Claude launching — they asked to _add_ Codex. Same pattern shows up in e2e (mock-claude deleted, only mock-codex now) and in `webview-ui/src/components/AgentCenter.tsx` Kill action (Codex-shaped only).

2. **Sub-agent dispatching without checkpoints / commits** (May 15 batch: 4 workers, 0 commits) — Workers A/B/C/D each reported "worktree has other agents' uncommitted changes I didn't touch." Supervisor never landed intermediate diffs. Result: ~2 200 line uncommitted diff + 7 untracked files in one trunk, impossible to bisect, impossible to ship piecewise.

3. **Scope creep in a "minimal slice"** (Worker D, Worker A reload-snapshot, Worker C lifecycleStatus delta) — User says "minimal", "克制", "small enough to test quickly"; executor builds three-feature-wide surfaces (AgentCenter ~340→937 lines), or expands the helper API beyond what the spec required.

4. **Tests / verification written but not executed** (Workers 4, 5; partial check-types in A/B/C/D) — Codex provider tests authored but never run (`vitest binary missing`). Playwright e2e written but never run (`.vscode-test/vscode-executable.txt missing`). Only `npm run check-types` and `cd webview-ui && npm run build` are reliably executed. Type-checks pass; **runtime behavior was not verified by the executor** on any May 15 thread.

5. **Provider symmetry asymmetry** (visible across the May 12 + May 15 themes) — Lifecycle mapping defined Claude AND Codex events in Worker A, but `scanClaudeWorkspaceThreads`/`scanCodexWorkspaceThreads` are siblings that don't share dedup keys, Claude's adoption path is feature-poorer than Codex's, and S-T1-01 means Claude can't even be launched. The contract on paper looks dual-provider; the runtime is Codex-with-Claude-read-only.

6. **Documentation marked "Done" ahead of "committed"** (`visual-agent-control-room-roadmap.md:44-57`) — Phases 1–6 marked Done while the implementation sits uncommitted. Misleads any future contributor / user audit.

## Severity-ranked deviation list (for cleanup framework)

### BLOCKER (fix before any further work)

- **[BLK-1]** Provider-less launcher in `src/agentManager.ts:64-97` — `launchNewTerminal()` has no provider parameter and `terminal.sendText(buildCodexLaunchCommand(...))` is unconditional. Re-introduce provider as: (a) parameter through `launchNewTerminal` signature, (b) UI picker in `BottomToolbar.tsx:131-211` +Agent modal, (c) extension-side dispatch in `PixelAgentsViewProvider.ts:803-822` to set the right launch command and `providerId`. Source: main thread direct edit committed in `e61b405`. Symptom: S-T1-01.

- **[BLK-2]** Same-cwd Codex thread de-dup in `src/PixelAgentsViewProvider.ts:369-446` (`adoptCodexExternalThread`) and `:478-495` (`scanCodexWorkspaceThreads`) keys only on `sessionId === thread.id`. Codex 0.130+ spawns new thread id per prompt → every prompt = new ghost agent. Symptom: S-T2-01.

### ANNOYING (fix in same cleanup wave)

- **[ANN-1]** `webview-ui/src/components/AgentCenter.tsx` is 937 lines covering 4 feature surfaces (agents, projects, teams, timeline). Phase boundaries from roadmap not respected. Split per phase before deeper changes land.
- **[ANN-2]** Four duplicate "what is this agent doing now" state stores in webview: `agentStatuses`, `agentTools`, `agentLifecycleStatuses`, `agentLifecycleEvents`+`agentTimelineEvents`. Consolidate before adding more.
- **[ANN-3]** `removeStaleCodexAgents()` keyed off workspace-wide thread list, not cwd-scoped. Allows ghosts to survive across projects.
- **[ANN-4]** ~2 200 line uncommitted diff + 7 untracked new files (`src/lifecycleStatus.ts`, `src/timelineEvents.ts`, `src/tokenUsage.ts`, four webview components, `zoneUtils.ts`, `visibleRoomBounds.ts`). All sit on a single trunk with no checkpoint commit. Cleanup framework must define commit gates per phase.
- **[ANN-5]** Mock-claude e2e fixture deleted in favor of mock-codex; no provider matrix. Will fail Claude-side regression tests once Claude launching returns.
- **[ANN-6]** Codex provider tests (`server/__tests__/codex.test.ts`) and Playwright e2e never actually run by their authoring threads. Run them now and document pass/fail before assuming green.
- **[ANN-7]** `openClaude`/`openAgent` backward-compat `||` at `PixelAgentsViewProvider.ts:803` is misleading: both names now route to the same Codex-only launcher. Either delete the legacy alias or restore real Claude behavior behind it.
- **[ANN-8]** `lifecycleStatus.ts` Codex helpers don't all share the reload-snapshot path; on webview reload mid-tool-call, the Codex agent's status may flicker to idle then back to tool_running.

### COSMETIC

- **[COS-1]** Roadmap `visual-agent-control-room-roadmap.md:44-57` status column says "Done" for Phases 1–6 although implementation is uncommitted. Update language to "Implemented (uncommitted)" or "Implemented (not yet shipped)".
- **[COS-2]** `timelineEvents.ts` is a 66-line stub; no buffer/persistence. Plan-phase contract said timeline can rebuild status on reload — this is not yet possible. Either expand or downgrade roadmap acceptance criterion.
- **[COS-3]** Worker D's Kill button still routes to legacy `onCloseAgent` path, not the Hide/Archive/Kill safe-action model Phase 4 calls for. (Phase 4 is also marked "Done" in roadmap.)

## What looks well-executed (preserve in cleanup)

1. **Read-only audit threads (Work-streams 1 and 2)** — both produced precise, accurate inventories that are still useful as cleanup checklists. Don't lose `019e1ae8-010a`'s coupling-point list or `019e1ae8-1309`'s record-type and event-mapping table.

2. **Codex provider extraction at `server/src/providers/file/codex/codex.ts`** — clean module boundary, SQLite + rollout-JSONL parsing logic well organized. The Codex _parser side_ of the work is solid; the _launcher / dedup_ side is what's broken.

3. **Webview copy de-Claude-ification (Work-stream 3)** — stayed exactly in scope, preserved internal `openClaude` naming, did not bleed into other concerns. Model behaviour for tight-scope tasks.

4. **Roadmap drafts (Work-streams 8, 9, 10)** — three drafts plus the integration document are coherent, owner-facing, in Traditional Chinese as requested. Use these as the source of truth for what "should" be built, against which the diff can be diff'd.

5. **Lifecycle status engine design (Worker A — minus the launcher commit)** — the `AgentLifecycleStatus` type + `postAgentLifecycleStatus` helpers + Claude/Codex/hook/heuristic mappings give the cleanup framework a usable spine. Keep the contract; consolidate the duplicate webview-side stores around it.

6. **Worker B's `completed→idle` auto-fade with `updatedAt` guard** — sensible, defensive design choice. Reusable pattern for any timed status state.

7. **The fact that all 14 threads stayed entirely off-branch and used `apply_patch` consistently** — the diff is large but mechanically clean; no rebase damage, no half-applied patches, no `--force` history rewrites. Cleanup can rely on the working tree being a faithful reflection of what each thread shipped.

---

_Audit produced 2026-05-27. Sources: 14 Codex session JSONLs; `git log --all --since='6 weeks ago'`; `git diff --stat HEAD`; manual reads of `src/agentManager.ts`, `src/PixelAgentsViewProvider.ts`, `webview-ui/src/components/AgentCenter.tsx`, the roadmap, drafts, and symptoms-log._
