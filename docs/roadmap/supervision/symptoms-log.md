# Cleanup Symptoms Log

> **Design decisions** (agreed with user during S-T2-01 triage, 2026-05-27):
>
> - For Codex multi-thread-per-prompt behavior, the conceptual model is **one cwd = one agent**.
> - Office canvas: keep one character per thread (no canvas-level grouping). AgentCenter does the grouping layer.
> - AgentCenter UI: Codex and Claude rows look identical from the outside (hide sub-thread count).
> - Path: **B (stop-bleed + same-cwd thread follow-on)** ships first, design **C (full cwd-grouping in AgentCenter, with past-thread history)** in parallel.
> - User installs as `.vsix` in main VS Code, not F5 Dev Host. Every executor change needs repackage + reinstall to verify.
> - Note: after B lands, B alone may actually satisfy most of the user's pain (1 agent per +Agent click, follows new threads). C may shrink to "show past-thread history" polish.

This log captures runtime symptoms observed during supervisor-led cross-testing of the multi-agent (Claude + Codex) Pixel Agents fork. Each symptom feeds triage in `docs/roadmap/supervision/`.

- **Owner of log entries**: `ray` (records what they see)
- **Owner of triage / suspect-area**: supervisor agent (fills in after each entry)
- **Owner of fix**: downstream executor agent (via work package in `work-packages/`)

## Template

```markdown
## S-NN — <one-line title>

- **Batch**: T1 / T2 / T3 / T4
- **Provider**: claude / codex / both
- **What I did**: …
- **What I expected**: …
- **What I saw**: …
- **Reproducibility**: always / sometimes / once-off
- **Notes / screenshots**: …

### Triage (supervisor)

- **Suspect area**:
- **Related symptoms**:
- **Severity**: blocker / annoying / cosmetic
- **Proposed work-package**:
```

---

## Batch T1 — Single Claude agent baseline

### S-T1-02 — Pixel Agents shows 2 Claude agents when CLI has only 1

- **Batch**: T1
- **Provider**: claude
- **What user reports** (during W1-A verification 2026-05-27): one Claude session opened via + Agent, but Agent Center shows two Claude agent entries. CLI / `~/.claude/projects/` confirms only one matching JSONL.
- **Suspect root cause**: four parallel Claude adoption paths (`scanClaudeRecentSessions`, `scanClaudeCoworkSessions`, `adoptExternalSessionFromHook`, `adoptExternalSession`) may race. Dedup against `knownJsonlFiles` may not be sufficient if `launchNewTerminal` and external scanner both create an agent before the set is updated.
- **Severity**: annoying — primary use case (single Claude session) shows wrong count.
- **Proposed work-package**: W1-C Fix B.

### S-T1-03 — Claude Code (non-cowork) agent shows generic title `Claude`

- **Batch**: T1
- **Provider**: claude
- **What user reports** (during W1-A verification): a regular `claude` (not `claude cowork`) agent appears in Pixel Agents with no per-session title — just `Claude`. Cowork agents do display a title via metadata.
- **Suspect root cause**: `src/fileWatcher.ts:929` hardcodes `agentName: 'Claude'` for the regular Claude branch. No JSONL title-extraction logic exists; cowork agents are different because they read `metadata.threadName` from a sidecar file.
- **Severity**: annoying — parity with Codex (which shows thread title) is broken.
- **Proposed work-package**: W1-C Fix C.

### S-T1-01 — + Agent button cannot launch Claude (only Codex)

- **Batch**: T1 (discovered before testing started, via code audit)
- **Provider**: claude (regression)
- **What user reports**: "+agent只能選擇codex不能選擇claude，很躁"
- **Root cause** (confirmed): [src/agentManager.ts:97](src/agentManager.ts:97) `launchNewTerminal()` hardcodes `terminal.sendText(buildCodexLaunchCommand(...))`. There is no provider parameter, no Claude branch, and no UI affordance to choose. The + Agent modal in [BottomToolbar.tsx:131-211](webview-ui/src/components/BottomToolbar.tsx:131) has Project, Task, and Bypass — no Provider field.
- **Actual origin** (corrected after audit, see [deviation-map.md](deviation-map.md#work-stream-6--rename-openclaude--openagent-key-suspect-for-s-t1-01)): NOT the rename sub-agent. The rename thread (`019e1af5-d6d5`) stayed strictly in scope and did not touch `agentManager.ts`. The launch-path hard-cut was done by the **main supervisor thread itself** as part of commit `e61b405 feat: add Codex agent visualization`, replacing `terminal.sendText(claudeCmd)` with `terminal.sendText(buildCodexLaunchCommand(...))` without threading a `provider` parameter through `launchNewTerminal`.
- **Severity**: blocker for any Claude-side cross-testing. T1 baseline cannot run until this is fixed.
- **Proposed work-package**: part of upcoming framework — re-introduce provider parameter through `openAgent` message + `launchNewTerminal` + UI picker.

## Batch T2 — Single Codex agent

### S-T2-02 — After W1-B install + reload, all persisted Codex agents disappear (W1-B regression)

- **Batch**: T2 (regression discovered during W1-B verification 2026-05-27)
- **Provider**: codex
- **What user reports**: installed pixel-agents-W1B.vsix, reloaded window — all previously visible Codex agents vanished from Agent Center.
- **Root cause** (confirmed by supervisor):
  - W1-B added a persistent cwd-keyed poll inside `launchNewTerminal` that switches agents to the latest thread in their cwd.
  - W1-B did NOT add the same poll inside `restoreAgents` (`src/agentManager.ts`).
  - W1-B tightened `removeStaleCodexAgents` to require `findCodexThreadById(agent.sessionId)` to succeed.
  - Restored Codex agents keep their persisted `sessionId`. If that thread was archived/deleted (common after `/clear`), the staleness check kills them and there's no follow-on to rescue.
- **Severity**: blocker for W1-B merge — restored agents are unusable.
- **Supervisor failure to catch**: static review focused on `launchNewTerminal` and missed cross-checking `restoreAgents`. Future review must list all agent-state creation paths and verify behavior on each.
- **Proposed work-package**: W1-C Fix A.

### S-T2-01 — One +Agent click, but every prompt creates a new agent entry

- **Batch**: T2
- **Provider**: codex
- **What I did**: Clicked + Agent **once** (Codex). Then typed three prompts in sequence: `read package.json`, `read package.json`, `say hi`.
- **What I expected**: One agent entry that accumulates a conversation (or at most reflects /clear if any happened).
- **What I saw**: Three separate CODEX entries in Agent Center: `#10 read package.json` (168k tok), `#11 read package.json` (168k tok), `#12 say hi` (18k tok). All in `pixel-agents` project, all `WAITING_USER`. Single recent-timeline entry shows `user_input.requested` 34s ago. User confirms each entry has a corresponding terminal in VS Code Terminal panel.
- **Reproducibility**: confirmed once; likely always (user did not /clear or re-spawn intentionally).
- **Notes / screenshots**: see chat at 2026-05-27 09:11. Agent IDs are #10/#11/#12 — suggests previous test runs in same workspace.

### Triage (supervisor)

- **Root cause** (confirmed via SQLite inspection of `~/.codex/state_5.sqlite` 2026-05-27): Codex CLI v0.130 in interactive mode is creating a **new thread per user prompt** (source=`cli`, fresh thread id), instead of appending to one persistent thread. The pixel-agents `scanCodexWorkspaceThreads()` scanner runs periodically, calls `findRecentCodexThreads(50)`, and `adoptCodexExternalThread()` dedups only by `sessionId === thread.id || jsonlFile === thread.rolloutPath`. New thread → new id → not deduped → adopted as a fresh agent with `agentName = thread.title` (which equals the user's prompt text).
- **Evidence**: SQLite shows exactly 2 new threads created today for this cwd (`019e66f9` titled "read package.json" at 09:08, `019e66fb` titled "say hi" at 09:10). Both are source=`cli`, archived=0. The third "read package.json" prompt user reported is not in SQLite — possibly merged into one of the existing threads, or the user double-counted.
- **Stale agent residue**: Agent Center currently shows 5 Codex agents, but only 1 non-subagent thread (`019e1ad8`) exists in this cwd. Remaining 4 are ghosts. `removeStaleCodexAgents(topLevelThreadIds)` either isn't running or is too lenient (its `topLevelThreadIds` source `findRecentCodexThreads(50)` is workspace-wide, not cwd-scoped — so threads from other cwds keep stale agents alive).
- **Suspect area**: [src/PixelAgentsViewProvider.ts:369-446](src/PixelAgentsViewProvider.ts:369) `adoptCodexExternalThread`, [PixelAgentsViewProvider.ts:478-495](src/PixelAgentsViewProvider.ts:478) `scanCodexWorkspaceThreads`, plus `removeStaleCodexAgents`. The de-dup key needs a stronger identity than thread id when threads come from the same terminal/cwd.
- **Severity**: blocker — every Codex prompt potentially spawns a new visible agent, making the office unusable for multi-prompt sessions.
- **Related symptoms**: token totals (168k both for #10 #11) are also likely misleading — they reflect cumulative cwd/account tokens, not per-thread.
- **Proposed work-package**: see triage doc. Three options: (A) terminal-bound dedup, (B) opt-out of auto-adopting external threads, (C) group same-cwd threads as one agent with sub-thread list. Needs design decision before drafting executor prompt.

## Batch T3 — Mixed providers + Hide/Archive/Kill

(empty)

## Batch T4 — Team filter / zones / meeting movement

(empty)
