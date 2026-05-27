# Cleanup Framework

Coordinated cleanup plan for the multi-provider (Claude + Codex) `pixel-agents` fork. Derived from [`deviation-map.md`](deviation-map.md) and the symptoms in [`symptoms-log.md`](symptoms-log.md). Goal: bring the repo from "fragile 2,200-line uncommitted trunk with two blockers" to "shippable .vsix that honors the roadmap's dual-provider intent."

The plan replaces the previous symptom-by-symptom approach. Six executor deviation themes were identified in the audit; each guardrail below directly counters one of them.

---

## 1. Guardrails (all work-packages must honor)

These rules exist because of specific past failures. Each work-package prompt repeats them verbatim.

### G-1 — Polymorphic, never replace

Counters audit theme #1 (abstraction collapse). When you add support for a new provider/mode/variant, introduce a parameter or branch — never delete the existing path. Concretely: `launchNewTerminal` takes `providerId: 'claude' | 'codex'`; the +Agent modal exposes the choice; both paths exist in code; tests cover both.

### G-2 — One work-package = one commit

Counters audit theme #2 (no checkpoints). Each work-package ends with exactly one commit on a feature branch named `cleanup/<wave>-<package>`. Don't merge to `main` directly. Don't pile multiple packages into one commit. Don't `--amend` once handed back to supervisor.

### G-3 — Scope frozen in prompt

Counters audit theme #3 (scope creep). The "in scope" and "out of scope" sections of each prompt are binding. If the work seems to require touching out-of-scope files, **stop and surface it**, don't quietly expand. Out-of-scope discoveries become follow-up packages, not silent additions.

### G-4 — Tests must actually run

Counters audit theme #4 (type-check ≠ verified). Acceptance always requires:

- `npm run build` green (already covered by check-types + lint + esbuild + vite)
- `npm test` green (147 tests today; new count must be ≥147)
- The runtime verification protocol in the prompt's "Verification" section, executed by the user, recorded as pass/fail before the package is considered done

### G-5 — Provider symmetry by default

Counters audit theme #5 (paper vs runtime mismatch). When touching anything in `src/agentManager.ts`, `src/PixelAgentsViewProvider.ts`, `src/transcriptParser.ts`, `src/fileWatcher.ts`, `webview-ui/src/hooks/useExtensionMessages.ts`, or `webview-ui/src/components/AgentCenter.tsx`: if the change handles Codex, it must also be considered for Claude (and vice versa). If only one side is touched, the prompt must explicitly say why.

### G-6 — Roadmap status honesty

Counters audit theme #6 (Done ≠ committed). `docs/roadmap/visual-agent-control-room-roadmap.md` status column reflects what's **committed and verified on `main`**, not what's drafted or working-tree-resident. Updates to that table happen only inside work-packages, and only after the change is committed.

### G-7 — Preserve known-good (audit's "well-executed" list)

Don't refactor or "improve" these unless the work-package explicitly targets them:

- `server/src/providers/file/codex/codex.ts` (clean module boundary, accurate parser)
- The lifecycle status type + helper API in `src/lifecycleStatus.ts` (good design, kept the contract)
- Webview copy de-Claude-ification (App.tsx, SettingsModal.tsx) — tight scope, respect it
- The roadmap drafts (`docs/roadmap/drafts/*.md`) — owner-approved source of truth
- The Worker B `completed→idle` 2.5s fade pattern with `updatedAt` guard
- The audit lists in audit threads 1 & 2 (still accurate as cleanup checklists)

---

## 2. Standard work-package prompt structure

Every executor prompt drafted under this framework uses this skeleton. The supervisor fills in the bracketed sections; the rest is shared boilerplate. Stored under `docs/roadmap/supervision/work-packages/<wave>-<package>-<slug>.md`.

```
# Work Package <ID> — <short title>

## Context (read first)
[Why this package exists; reference deviation-map and symptoms-log entries it addresses.]

## In scope
[Bulleted list of behavioral changes required. Be specific.]

## Out of scope (do NOT touch)
[Bulleted list of files/concerns that must remain untouched in this package.]

## Required changes
[File-by-file description with file:line refs where possible.
Each change states the desired end-state, not the implementation steps.
Where multiple implementations are valid, say "you may pick X or Y; pick one and report which."]

## Tests
[Specific tests to add or update. Existing tests that must continue passing.]

## Guardrails (verbatim from cleanup-framework.md §1)
- G-1 Polymorphic, never replace
- G-2 One package = one commit on branch cleanup/<wave>-<package>
- G-3 Scope frozen; surface, don't expand
- G-4 npm run build green + npm test green + user runtime verification
- G-5 Provider symmetry on touched files
- G-6 No roadmap status edits unless explicitly in this package's scope
- G-7 Preserve known-good list

## Acceptance criteria
[Numbered, observable, externally verifiable. Each criterion is a question the supervisor can answer yes/no.]

## Verification protocol (user runs after handback)
[Step-by-step reproducible test the user runs to confirm the package is done.
Includes .vsix repackage + reinstall + reload window + the actual scenario being verified.]

## Reporting back
1. Branch name + commit SHA
2. Files touched (paste `git diff --stat <branch>...main`)
3. Test results (paste final `npm run build` and `npm test` summary lines)
4. Where you deviated from suggestions and why
5. Out-of-scope findings flagged for future packages
```

---

## 3. Cleanup waves

Waves run sequentially. Within a wave, packages may be drafted in parallel but executor must complete in dependency order. Wave gates: supervisor + user must both sign off on a wave's runtime verification before the next wave's prompts are drafted.

### Wave 0 — Baseline preservation (supervisor executes, with user permission)

Before any cleanup work, the current working tree is committed and tagged as a safety net. This is the single moment where unrelated changes are bundled into one commit; everything after Wave 0 is one-commit-per-package.

**W0 — Baseline checkpoint commit + tag**

- **In scope**: `git add -A` (after manual review for secrets — none expected), single commit, single annotated tag.
- **Out of scope**: Any code change. Pure preservation.
- **Branch**: directly on `main` (this is the snapshot point).
- **Commit message**: `chore: checkpoint pre-cleanup baseline (2,200-line WIP from May 12-15 batch)` with body listing the broad categories of uncommitted work.
- **Tag**: `cleanup-baseline-2026-05-27` (annotated, with message pointing to `docs/roadmap/supervision/deviation-map.md`).
- **Acceptance**: `git status` clean, `git tag -l cleanup-baseline-*` returns the tag, `git show cleanup-baseline-2026-05-27` shows the metadata.
- **Verification**: User reviews `git log -1` and `git show --stat HEAD` to confirm nothing surprising.
- **Executed by**: supervisor agent directly via Bash, with explicit user confirmation before `git add -A` and before `git commit`. No executor handoff.

---

### Wave 1 — Stop bleeding (BLOCKER fixes)

Both packages target user-facing blockers. Wave gate: user can launch a Claude agent via +Agent AND a single Codex prompt session shows exactly one Codex agent that follows new threads.

**W1-A — Restore Claude launch path with provider selection** (counters BLK-1, S-T1-01)

- **In scope**:
  - `src/agentManager.ts` `launchNewTerminal()` gains `providerId: 'claude' | 'codex'` parameter and dispatches to the correct launch command. Claude path uses `claude --session-id <uuid>` (recover from git history before commit `e61b405`).
  - `src/PixelAgentsViewProvider.ts:803-822` `openAgent` handler reads `message.providerId` and threads it through.
  - `webview-ui/src/components/BottomToolbar.tsx:131-211` +Agent modal gains a Provider radio/select (Claude / Codex), default Claude (matches pre-fork behavior).
  - `webview-ui/src/types` or relevant message types updated.
- **Out of scope**: Codex thread dedup (W1-B), AgentCenter rendering, lifecycle pipeline.
- **Dependencies**: W0.
- **Branch**: `cleanup/w1-a-restore-claude-launch`.

**W1-B — Codex thread follow-on + ghost adoption gate** (counters BLK-2, S-T2-01)

- **In scope** (same as the parked draft at `work-packages/B-codex-thread-handling.md`, refreshed to honor §1 guardrails):
  - Disable auto-adoption of external Codex threads in `scanCodexWorkspaceThreads()`. Keep `codexProjects` message firing for the picker.
  - +Agent-spawned Codex agents follow new threads in the same cwd (switch sessionId, jsonlFile, rebind file watcher at EOF, accumulate tokens, clear per-turn state).
  - Add cwd-scoping to `removeStaleCodexAgents` (only consider threads in cwds with at least one user-spawned agent).
- **Out of scope**: AgentCenter cwd-grouping (deferred or absorbed in W2-B), Claude-side logic.
- **Dependencies**: W0, W1-A (the launch path provider parameter is referenced for symmetry checks but not modified here).
- **Branch**: `cleanup/w1-b-codex-thread-followon`.

---

### Wave 2 — Pipeline consolidation

These reduce surface area and accidental complexity before later phases pile more on. Wave gate: webview has one canonical "what is this agent doing" pipeline; AgentCenter rendering is split into phase-aligned modules.

**W2-A — Consolidate webview agent-state pipelines** (counters ANN-2)

- **In scope**:
  - Audit and consolidate `agentStatuses`, `agentTools`, `agentLifecycleStatuses`, `agentLifecycleEvents`, `agentTimelineEvents` in `webview-ui/src/hooks/useExtensionMessages.ts`. End state: lifecycle + timeline are the two canonical stores. Legacy `agentStatus` / `agentTool*` are either (a) folded into lifecycle on the extension side at emission time, or (b) kept as a thin compat layer that derives from lifecycle, clearly labeled.
  - Document in code comments (only the few that explain _why_) which store is authoritative for which UI concern.
- **Out of scope**: New features, AgentCenter component split (W2-B), backend lifecycle helper changes (the contract is fine per audit).
- **Dependencies**: W1 wave gate passed.
- **Branch**: `cleanup/w2-a-state-pipeline-consolidation`.

**W2-B — Split AgentCenter.tsx along phase boundaries** (counters ANN-1)

- **In scope**:
  - `webview-ui/src/components/AgentCenter.tsx` (937 lines, 4 feature surfaces) is split into: `AgentList.tsx` (agents tab), `ProjectsTab.tsx` (projects), `TimelinePanel.tsx` (timeline), `TeamDashboard.tsx` (team — this was Phase 9 scope creep but is already built; preserve as a separate file so removing later is easy).
  - `AgentCenter.tsx` itself becomes ~150 lines of layout + tab routing.
  - No behavioral changes — pure split. Visual identical.
- **Out of scope**: Trimming team functionality (deferred to whether Phase 9 actually stays), Hide/Archive/Kill safe-action model (separate package later), behavioral rework.
- **Dependencies**: W2-A.
- **Branch**: `cleanup/w2-b-agentcenter-split`.

---

### Wave 3 — Cleanup tail

Smaller, mostly independent packages addressing ANN-3 through ANN-8 and the COS items. Some can be done in parallel by separate executor runs.

**W3-A — Cwd-scope `removeStaleCodexAgents`** (ANN-3) — likely absorbed into W1-B; verify.

**W3-B — e2e provider matrix + restore mock-claude** (ANN-5) — recover the deleted mock-claude fixture; parametrize `e2e/tests/agent-spawn.spec.ts` over provider; run both.

**W3-C — Run-and-fix existing tests** (ANN-6) — actually execute `server/__tests__/codex.test.ts` and the Playwright e2e; fix anything red; document pass status in the symptoms log.

**W3-D — Resolve `openClaude` / `openAgent` alias** (ANN-7) — once W1-A restores Claude semantics behind both names, decide: keep both as true aliases or deprecate `openClaude` in webview. Single small package.

**W3-E — Lifecycle reload flicker fix** (ANN-8) — investigate the Codex reload-mid-tool flicker; either harden the snapshot path or document the known limitation.

**W3-F — Roadmap status correction** (COS-1) — update `docs/roadmap/visual-agent-control-room-roadmap.md:44-57` so "Done" ↔ "committed on main." Phases marked Done that are actually uncommitted get re-labeled to "Implemented (post-cleanup verification pending)" until they ride through Waves 1-3 verifications.

Each W3 package gets its own work-package file when drafted; this section is the placeholder index.

---

### Wave 4 — Roadmap continuation (deferred until Wave 1-3 land)

Once cleanup is complete and the .vsix is stable:

- Zone Stage 2 / Stage 3 (Phase 7 of roadmap)
- Stronger VS Code / terminal integration (Phase 8)
- Team Meeting Mode polish (Phase 9 — but reconsider whether to keep, given the audit noted it was scope-creep into Phase 3's work)
- Session Replay (Phase 10) — depends on whether `timelineEvents.ts` gets the persistence/buffer it needs

This wave is intentionally underspecified. We re-plan it after Wave 3, once we have a stable base and clearer signal from your actual usage.

---

## 4. Dependency graph

```
W0 (baseline)
  ├─→ W1-A (claude launch)
  │     └─→ W3-D (alias)
  └─→ W1-B (codex thread)
        └─→ W3-A (verify cwd-scope) [likely no-op if W1-B handles]

W1 gate
  └─→ W2-A (state pipelines)
        └─→ W2-B (agentcenter split)

W2 gate
  └─→ W3-B, W3-C, W3-E, W3-F (parallel)

W3 gate
  └─→ Wave 4 (re-planned)
```

Wave gates require:

- All packages in the wave have been merged to `main`.
- The wave's user-side runtime verification protocols all passed.
- Supervisor has updated `symptoms-log.md` and this framework with any new findings.

---

## 5. What this framework deliberately does NOT do

- **Doesn't refactor working code.** Codex parser, lifecycle types, roadmap drafts, webview copy work are explicitly preserved (see G-7).
- **Doesn't redesign data model for cwd-grouping in canvas/AgentCenter.** That was option C in the earlier discussion; the agreed decision is canvas stays per-thread, AgentCenter stays per-agent. If grouping is wanted later, it becomes a Wave 4 design exercise after the base is solid.
- **Doesn't fix Codex CLI behavior.** Codex 0.130's per-`/clear` new-thread behavior is upstream. We adapt to it (W1-B) but don't try to change it.
- **Doesn't expand roadmap phases.** Phase 9 (Team Meeting Mode) is on probation pending Wave 4 re-plan; Phase 10 (Session Replay) is also re-evaluated then.
- **Doesn't gate cleanup on the user installing new tooling.** All changes remain testable via the existing `npm run build` / `npm test` / .vsix flow the user already has.

---

## 6. How this document is maintained

- Supervisor updates the Waves section as packages drafted / handed off / merged / verified.
- `symptoms-log.md` keeps growing as new symptoms are reported; each symptom gets cross-referenced to its W-package once triaged.
- `deviation-map.md` is frozen — it's a historical artifact from the May 12-15 transcripts. New deviations (e.g., from future executor work) go in a separate "post-cleanup audit" section appended here, not retroactively into the map.

_Framework version 1, 2026-05-27._
