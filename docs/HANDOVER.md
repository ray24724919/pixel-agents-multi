# HANDOVER — Current State & Successor Guide

> **This is the single authoritative "where are we" document.** Written 2026-07-06 during a full-project
> audit (5-agent fan-out over roadmap, tech debt, docs, runtime health, and memory).
> When documents disagree, trust order is: **AI memory files → git log → this file → CLAUDE.md → everything else.**
> `docs/roadmap/visual-agent-control-room-roadmap.md` is a _historical planning artifact_ (last updated
> 2026-05-18) — its per-phase status column is stale; do not report status from it.

## 1. Who runs this project

**ray** (ray24724919) — owner, supervisor, and the only human. Replies in Traditional Chinese.
He decides: merge timing, push timing, UI/visual taste, anything destructive. You (the AI session)
build, verify, and present; he approves. There are **no GitHub PRs** — the convention is local
`--no-ff` merges to `main`, push to his own fork as backup.

Non-negotiable rules learned the hard way (each one was violated once and caused real damage):

1. **IDLE ≠ DEAD.** All of ray's agents are external/adopted sessions (`isExternal: true`, no
   extension-owned terminals). Rooms and agents are _persistent campus structure_. An agent or room
   disappears only when **ray** deletes/ends/archives it — never on an idle timeout, never on reload,
   never on a transient error. "File gone" means **confirmed ENOENT**, not "stat threw once".
2. **No cosmetic churn.** The product must get more _useful_, not the building prettier. Convergent
   PR-sized changes with executable acceptance criteria. The W18 polish spiral (see §4) is the
   cautionary tale.
3. **Never auto-modify `~/.pixel-agents-multi/layout.json` destructively.** Back up first
   (`.bak-*`), surface every data edit to ray.
4. **Verification is not self-attested.** Files → fresh-context read-back; code → tests/real run
   with pasted output; live UI → computer-use or ray's own reload. "Should work" = not verified.
5. **Abstract yes/no answers from ray about destructive behavior don't transfer to practice.**
   He approved "reload removes empty rooms" in the abstract; when it deleted real rooms he was
   upset. When a choice is destructive, prefer the non-destructive default regardless of an earlier
   abstract approval.

## 2. Current state (2026-07-06, end of Fable handover session)

- **main:** v1.3.53 (e6f6cbb — perf IO basics: JSONL store compaction/tail-read + Codex sqlite query
  cache), pushed to `origin/main`. Gate at main: check-types + lint + server **321** + webview **286**.
- **Parallel sessions in flight — VERSION RESERVATIONS:**
  - `feat/handoff-brick-d-backlink` @ 2a8ed80 — Brick D COMPLETE, awaiting ray's review/merge. It
    mistakenly also used "1.3.53" (collision): at merge time, merge main into it, re-bump to
    **1.3.54**, re-gate (expect server 321+12, webview 293), repackage. Details in memory
    `task-brick-d-backlink.md`.
  - Webview perf session (React re-render batching + rAF pause) — branches from main v1.3.53; use
    version **1.3.55** at its checkpoint. ⚠️ It will touch `useExtensionMessages.ts`/`renderer.ts`,
    which Brick D ALSO touched on its branch — **merge Brick D first**, then rebase the perf branch
    on updated main before finalizing, or conflicts will land on whoever merges second.
- **Installed extension right now:** Brick D's "1.3.53" build (= v1.3.52 + backlink/badge, WITHOUT
  the perf commits). After Brick D merges as 1.3.54, package+install from main.
- **Per-checkpoint discipline** (follow it): feature branch → gate green → bump version (**check
  main and this section first — parallel sessions have collided on version numbers**) →
  `npm run package:vsix` → `npm run install:local` → commit → ray reviews → local `--no-ff` merge to
  main. Push = ray's call. ⚠️ For changes that REWRITE user data, get ray's policy sign-off BEFORE
  `install:local` — install is live deployment (see the usage-store incident in §5).
- **Pending live verification by ray:** v1.3.50–53 (agent-flicker reaps ×2, Brick C cancel/timeout,
  perf IO) + Brick D's badge visuals (pixel taste = ray's call).

## 3. Roadmap scoreboard

The product north star (decided 2026-06-09): a **small-team lab** — pixel office as the visual layer,
**handoff (交接) as the product spine**, dual-provider (Claude + Codex) symmetry throughout.

| Item                                                     | Status                                                   | Evidence                                                   |
| -------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| ② AgentCenter split (5826→833 lines, 15 modules)         | ✅ shipped v1.3.34                                       | `webview-ui/src/components/agentCenter/`                   |
| ③a Campus centre-out bay growth                          | ✅ shipped v1.3.36                                       | `campusBounds.ts orderBayColsCenterOut`                    |
| ③b Freed-slot auto-reclaim                               | ❌ **abandoned** v1.3.38 (deleted real rooms)            | `applyVacancyLifecycle` is a no-op without explicit cutoff |
| ③c Corridor right-extension + center camera              | ✅ shipped v1.3.42                                       | `widenWorkCorridorRightAnchored`, `computeCampusCenterPan` |
| ① Handoff foundation (evidence gate, sanitization)       | ✅ merged+pushed 2026-06-09                              | `handoffLaunchEvidence.ts`                                 |
| ① Brick A — live QA of Codex handoff launch              | ✅ verified live 2026-06-17                              | computer-use session                                       |
| ① Brick B — auto-advance completion on executor settle   | ✅ shipped v1.3.43, verified live                        | `selectHandoffAutoRefreshTargets`                          |
| ① #1 — per-session handoff repo root (multi-repo)        | ✅ shipped v1.3.45, verified live                        | `resolveGitRepoRoot`, `scanHandoffArtifactsAcrossRoots`    |
| ① Brick C — launch-timeout cleanup + Cancel executor     | ✅ shipped v1.3.51, **not live-verified**                | `clearHandoffExecutorLink`, Work Queue "Cancel executor"   |
| ① Brick D — agent→handoff back-link on AgentState        | ⬜ **NEXT**                                              | office-character handoff badge + global auto-advance       |
| External-agent lifecycle (idle≠dead, dedup, ENOENT-only) | ✅ v1.3.37–v1.3.52                                       | see §4                                                     |
| Session Replay (roadmap Phase 10)                        | ⬜ planned; old `product/w8-c`, `w9-a` branches unmerged | low priority                                               |
| Usage Intelligence build-out, Team/Lab server            | ⏸ deferred until handoff spine proven live               | ray's explicit sequencing                                  |

**The next piece of real product work is Brick D** (design options → ray picks → build), after ray
live-verifies Brick C + the reaper fixes.

## 4. Direction errors → standing corrections

Full sagas live in git history and the AI memory; these are the distilled rules:

| Wrong turn                                                                                             | Standing rule                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ③b auto-reclaim deleted ray's real idle rooms (v1.3.36→38)                                             | Nothing is ever auto-deleted. Reclaim stays off unless ray explicitly opts in per-run.                                                                                                                                             |
| 6h idle reap removed still-open sessions (→14d→delete-only, v1.3.39–41)                                | Lifecycle is deletion-based on ALL THREE paths: adopt, restore, reap. Audit all three when touching lifecycle.                                                                                                                     |
| Any-stat-error treated as deletion (two separate reapers, v1.3.50 + v1.3.52)                           | Deletion = ENOENT/ENOTDIR via `isExternalTranscriptGone()` — both reapers share it. Never add a third reaper; extend this one.                                                                                                     |
| Sofa-posture chased with offsets/z-order for 3 versions; real bug was sprite-frame choice (v1.3.18–22) | For render bugs: check `getCharacterSprite` frame selection FIRST, and diff against upstream `pablodelucca/pixel-agents` before inventing logic.                                                                                   |
| Duplicate agents kept returning despite reaps (v1.3.23–47)                                             | Root cause was Windows path-casing. Any path-keyed identity MUST lowercase on win32 (`jsonlPathKey`, `codexPathKey`). Three dedup guards exist — don't add a fourth, find the leaking path.                                        |
| Phantom "outputs" rooms misdiagnosed as Codex cron (v1.3.35)                                           | Cowork/local-agent-mode sandboxes inherit the global hook. Both the raw adopters AND the scanner's failed-rebase fallback must reject `local-agent-mode-sessions` paths. Confirm mechanisms with on-disk evidence before "fixing". |
| Generator bulldozed ray's hand-designed studio (v1.3.7)                                                | Generation is additive-only; never delete/void non-`project-` furniture. "My layout got messed up" → suspect destructive generation, repro with a node diag against the real layout.json.                                          |
| W18 cosmetic polish spiral                                                                             | If a plan's acceptance criteria can't be executed (test/command/measurement), it's churn — don't start it.                                                                                                                         |

## 5. Technical debt register (audited 2026-07-06)

Fixed this audit: the duplicate heuristic reaper (v1.3.52).

Open, in priority order:

1. **Performance (ray's reported pain — STATIC RECON DONE 2026-07-06, two read-only audits).**
   Ranked suspects with evidence; runtime profiling still pending:
   1. **Extension host blocks on synchronous `sqlite3` subprocesses** — `codex.ts` queries via
      `execFileSync` on the 3 s external scan AND a 1 s per-launching-Codex-agent cwd poll; each
      spawn blocks the event loop. _Mitigation shipped v1.3.53: mtime-gated query cache._ Remaining:
      consider async exec.
   2. **Unbounded history stores** — `usage-v1.jsonl` hit 25 MB / 23.5 k lines, `timeline-v1.jsonl`
      6.8 MB / 30.7 k lines; every load did whole-file read + full sort.
      _Mitigation shipped v1.3.53: compact-on-write + tail-read._ **INCIDENT + POLICY
      (2026-07-06):** unlike timeline (read always capped at 500), the Usage page consumed FULL
      history; the first live append under v1.3.53 compacted the real usage store 23,542 → ~2,000
      records (post-compact backup: `usage/usage-v1.jsonl.bak-post-compact-incident`; the lost
      2026-06-03→06-15 window exists only in source transcripts/rollouts). ray accepted the
      **bounded-history policy** (Usage page shows newest ~2,000 ≈ 3 weeks) and requested a
      **backfill task** (spawn-task card created): re-derive the lost window into
      `usage/usage-v1-archive-2026-06.jsonl` (independent archive file, never compacted, for future
      Usage-Intelligence aggregation). A full-history Usage view requires that aggregation design —
      do NOT simply raise retention caps. Timeline pre-compaction snapshot backed up:
      `timeline/timeline-v1.jsonl.bak-intact`.
   3. **React re-render flood (webview)** — `useExtensionMessages.ts` fires 1–4 setState per tool
      message (~60–90 setState/s with 12 streaming agents); ALL state lives at App level; no
      React.memo on OfficeCanvas/ToolOverlay/AgentCenterSurface. Fix = batch/throttle tool-event
      state (~300 ms), memo the big children, split contexts. **Needs React DevTools profiling
      first** (Developer: Open Webview Developer Tools).
   4. **rAF loop never pauses** (`gameLoop.ts:9-36` — no visibilitychange handling) + full-canvas
      clear + per-frame z-sort in `renderer.ts` (~50–100 drawables). Fix = pause on hidden,
      dirty-flag skip.
   5. Heuristic-mode scanner load: ~28 sync fs ops/s per window (~56 with two windows); per-agent
      500 ms polls run regardless of hooks mode (only their /clear logic is gated). Hooks default
      OFF (`GLOBAL_KEY_HOOKS_ENABLED` default false) — ray runs full-heuristic. Enabling hooks mode
      is itself a perf lever, but its global scans (`scanGlobalProjectDirs`, cowork scan) run
      unconditionally either way.
      Measure before fixing #3/#4. Do NOT blind-optimize.
2. **`server/src/providers/file/codex/codex.ts` (971 lines, two functions span most of it).**
   Split only when next touched (extract process-termination + SQL query helpers). No standalone
   refactor.
3. **Extension `src/` has only partial test coverage** via `server/__tests__/*.test.ts` importing
   `../../src/*` with a vscode mock (see `codexFollowon.test.ts`, `claudeAdoption.test.ts` for the
   pattern). New extension logic should get tests there; a full harness migration is not worth it.
4. **15 bare `catch {}` blocks in `agentManager.ts`** (lines ~120–1539) — mostly benign best-effort
   contexts, but each new one is a latent v1.3.50-class bug. Rule: a catch that _decides lifecycle_
   must inspect `err.code`.
5. Dead/noise: `createTimelineRecord` needlessly exported (timelineStore.ts:149); commented-out
   deprecated constant (server/src/constants.ts:26); 3 architectural TODOs (hookEventHandler.ts:1,
   provider.ts:88) — clean up opportunistically, never as standalone commits.
6. **VSIX clutter**: build artifacts accumulate in repo root (gitignored). Keep the latest few;
   older ones live in `vsix-archive/`.

## 6. Map of the docs

| Path                                                                                        | What it is                                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                                                                 | Architecture reference (rewritten 2026-07-06 — trust it again)                        |
| `docs/HANDOVER.md`                                                                          | This file — current state, roadmap, rules                                             |
| `docs/agent-handoffs/`                                                                      | **LIVE product data** — handoff markdown + `.handoff.json` sidecars. Never mass-edit. |
| `docs/roadmap/supervision/work-packages/handoffs/`                                          | **LIVE runtime path** — handoff work packages referenced by sidecars                  |
| `docs/roadmap/supervision/reports/`                                                         | **LIVE runtime path** — executor reports land here                                    |
| `docs/roadmap/product/`                                                                     | Product specs (project-rooms spec/roadmap) — still-relevant design references         |
| `docs/roadmap/visual-agent-control-room-roadmap.md`                                         | Historical planning doc; phase-status column is STALE                                 |
| `docs/archive/`                                                                             | 126 historical W-series reports/work-packages/drafts. Read-only history.              |
| AI memory (`~/.claude/projects/C--Users-User-Documents-raychen-pixel-agents-multi/memory/`) | Session-persistent knowledge: principles, gotchas, diagnostics, successor guide       |

## 7. For the next AI session — read in this order

1. Project `CLAUDE.md` (auto-loaded) — architecture.
2. `MEMORY.md` index + the memory files it flags (auto-loaded) — principles & gotchas.
3. This file §2–§5 — state, next work, debt.
4. `git log --oneline -30` — what actually happened recently.

**Skills/tools that matter here:** the `verify` skill for confirming fixes; computer-use for live
webview QA (VS Code is granted at "click" tier — no typing; reload via a normal window reload by
ray, NOT "Restart Extensions", which half-resyncs the webview and fakes agent-count bugs);
`claude-api` skill for any model/API facts; Bash tool for POSIX work (PowerShell 5.1 has no `&&`).

**Hard constraints:** don't push/merge without ray's word; don't delete agents/rooms/transcripts;
don't rewrite architecture wholesale; bump version + package + install on every checkpoint; write
task state to a file for anything >3 steps.
