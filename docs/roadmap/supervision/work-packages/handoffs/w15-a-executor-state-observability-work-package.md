# W15-A Handoff Executor State Observability Work Package

You are executing a repo-centered Pixel Agents handoff work package.

cwd:
C:\Users\User\Documents\raychen\pixel-agents-multi

Source handoff:
docs/agent-handoffs/2026-06-08-1017-w15-a-executor-state-observability-handoff.md

Preferred base:
main after W14-F is merged.

Stacked fallback:
If main does not include W14-F yet, it is acceptable to branch from `product/w14-f-claude-handoff-launch-stuck` and clearly state in the report that this is a stacked W15-A branch depending on W14-F.

Branch:
product/w15-a-executor-state-observability

Report:
docs/roadmap/supervision/reports/w15-a-executor-state-observability-executor-report.md

## Start Here

Run:

```powershell
git status --short --branch
git log -3 --oneline
```

If the worktree is dirty before you start, stop and report the exact status. Do not stash, reset, clean, or delete files.

Read first:

- docs/agent-handoffs/2026-06-08-1017-w15-a-executor-state-observability-handoff.md
- docs/roadmap/supervision/reports/W14-F-claude-handoff-launch-stuck-report.md
- docs/roadmap/supervision/reports/W14-E-installed-handoff-launch-qa-report.md
- docs/roadmap/supervision/reports/W14-B-handoff-queue-operator-summary-report.md
- docs/roadmap/supervision/reports/W14-C-handoff-checklist-copy-ergonomics-report.md
- src/PixelAgentsViewProvider.ts
- src/handoffArtifacts.ts
- src/handoffLaunchEvidence.ts
- src/timelineEvents.ts
- src/types.ts
- webview-ui/src/components/AgentCenter.tsx
- webview-ui/src/components/handoffArtifactLibraryModel.ts
- webview-ui/src/components/timelinePageModel.ts
- webview-ui/src/hooks/useExtensionMessages.ts
- README.md
- docs/pixel-agents-development-timeline.html

## Goal

Make package-backed handoff executor state visible after launch, not just at launch time.

W14-F fixed false-positive Claude launch metadata by requiring session evidence before writing `active`. W15-A should continue that product line: once an executor is linked/launched, Handoff Queue should show useful read-only state when the linked agent is active, waiting for approval, blocked, completed, stale/unknown, or report-ready.

## Core Requirements

1. Build a small executor-state read model.
   - Prefer pure helper logic in `webview-ui/src/components/handoffArtifactLibraryModel.ts` or a small adjacent model.
   - Input should be existing safe state: handoff artifact item, linked execution metadata, visible agents, lifecycle/status/timeline data already in the webview.
   - Output should include:
     - display status label
     - severity/tone
     - recommended supervisor action
     - whether refresh completion/open report/inspect terminal is the next useful action
   - Do not include raw transcript text, raw tool output, full report bodies, absolute transcript paths, or credentials.

2. Surface executor state in Handoff Queue / Recent Handoffs.
   - Keep UI compact.
   - Do not add a new top-level page.
   - Do not make rows much taller than necessary.
   - Show state-specific cues such as:
     - active executor
     - waiting for approval / permission / user input
     - report ready
     - blocked
     - stale or unknown
   - Keep existing actions intact:
     - Open report
     - Refresh completion
     - Mark reviewed
     - Mark stale
     - Reset draft
     - Launch Codex / Launch Claude
     - checklist copy actions

3. Keep provider symmetry.
   - Codex and Claude should use the same UI/model path where possible.
   - Do not add provider-specific UI unless the wording genuinely needs it.
   - Do not change launch command arguments unless you find a concrete bug.

4. Add timeline/search category support only if needed.
   - If new event kinds are introduced, keep them safe and persisted through existing timeline paths.
   - Suggested kind if useful: `handoff.execution_observed`.
   - Avoid spammy repeated events.

5. Update stale release-facing documentation.
   - `README.md` currently still says Codex is the only supported direct handoff executor launch path and Claude launch is deferred. Update this to match W14-F reality:
     - package-backed Codex and Claude launch are supported;
     - Claude launch is confirmed only after session evidence;
     - local Claude can still pause on approval/auth/resource pressure.
   - Update `docs/pixel-agents-development-timeline.html` only in the relevant current/W14-W15 sections. Do not rewrite the whole file.

## Non-Goals / Guardrails

- Do not push, merge, rebase, amend, reset, stash, clean, or delete files.
- Do not add backend git merge/push/rebase/reset/stash/clean behavior.
- Do not auto-close or kill executor terminals.
- Do not auto-stage, auto-commit, or auto-open PRs.
- Do not read or display full raw transcript bodies.
- Do not copy raw report bodies into the webview payload.
- Do not redesign Agent Center.
- Do not change provider discovery/adoption unless a focused bug blocks executor state visibility.
- Do not change usage parsing or office/canvas visuals.

## Suggested Implementation Shape

- Add or extend pure helpers in `webview-ui/src/components/handoffArtifactLibraryModel.ts`.
- Use linked execution metadata plus visible agent state to compute executor-state cues.
- Keep completion review/report-ready behavior as the strongest signal when a report exists.
- Treat permission/waiting lifecycle as "waiting for supervisor action" rather than "stuck".
- Treat missing linked agent with old active execution metadata as stale/unknown, not active.
- Update UI in `webview-ui/src/components/AgentCenter.tsx` with a compact cue row/badge.
- Update docs after the UI/model behavior is clear.

## Tests

Add focused tests, at minimum:

- webview model tests for active, waiting, blocked, report-ready, stale/unknown, and completed executor states.
- test that Codex and Claude linked executions use the same model path.
- test that state copy/checklist text does not include raw paths or transcript/report body text.
- update timeline model tests if adding a new event kind/category.
- server tests only if you change extension/server helpers.

Expected baseline after W14-F:

- webview tests: at least 154.
- server tests: at least 284.
- combined tests: at least 438.

This package should add tests, so combined count should increase unless the implementation is docs-only, which would not satisfy the core requirements.

## Validation

Run:

```powershell
npm run build
npm run test:webview
npm run test:server
git diff --check
git status --short --branch
```

If source code changes affect installed-extension behavior, also run:

```powershell
npm run release:local
npm run verify:installed
```

## Report

Write:

```text
docs/roadmap/supervision/reports/w15-a-executor-state-observability-executor-report.md
```

Report must include:

- branch/base used, including whether this was stacked on W14-F;
- files changed;
- final executor-state model behavior;
- UI behavior in Handoff Queue / Recent Handoffs;
- provider symmetry notes for Codex and Claude;
- documentation updates;
- tests added and final counts;
- validation command results;
- known limitations/manual QA gaps.

## Commit

If completed, commit on the executor branch:

```text
feat: improve handoff executor state visibility
```

Do not push.
