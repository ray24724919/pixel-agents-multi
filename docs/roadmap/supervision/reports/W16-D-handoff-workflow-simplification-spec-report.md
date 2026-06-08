# W16-D Handoff Workflow Simplification Spec

## Summary

This package is a product simplification spec for the current Handoff / Handoff Queue / executor workflow. It does not change product behavior. The goal is to reduce the cognitive load of a powerful local-first workflow so a solo supervisor can quickly answer:

- What is this handoff?
- Is there an executable work package?
- Is an executor active, blocked, done, or waiting for review?
- What should I click next?
- Which actions are primary, and which are maintenance?

Recommended product direction: keep "handoff" as the context artifact, but rename the operational queue from **Handoff Queue** to **Work Queue**. The queue should be about package-backed executable work, not about every handoff markdown file.

## Files Read

All requested files existed and were read or inspected:

- `AGENTS.md`
- `README.md`
- `README.zh-TW.md`
- `docs/roadmap/supervision/reports/W10-A-handoff-artifact-writing-report.md`
- `docs/roadmap/supervision/reports/W10-B-handoff-artifact-library-report.md`
- `docs/roadmap/supervision/reports/W10-C-handoff-artifact-manifest-report.md`
- `docs/roadmap/supervision/reports/W10-D-handoff-status-actions-report.md`
- `docs/roadmap/supervision/reports/W11-remaining-handoff-executor-flow-report.md`
- `docs/roadmap/supervision/reports/W11-A-handoff-dispatch-workflow-report.md`
- `docs/roadmap/supervision/reports/W11-B-handoff-work-package-queue-report.md`
- `docs/roadmap/supervision/reports/W11-C-handoff-execution-tracking-report.md`
- `docs/roadmap/supervision/reports/W12-A-claude-handoff-executor-launch-report.md`
- `docs/roadmap/supervision/reports/W13-A-handoff-completion-review-report.md`
- `docs/roadmap/supervision/reports/W13-D-handoff-action-groups-report.md`
- `docs/roadmap/supervision/reports/W14-B-handoff-queue-operator-summary-report.md`
- `docs/roadmap/supervision/reports/W14-C-handoff-checklist-copy-ergonomics-report.md`
- `docs/roadmap/supervision/reports/W15-A-executor-state-observability-executor-report.md`
- `docs/roadmap/supervision/reports/w15-a-executor-state-observability-executor-report.md`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/src/components/handoffDraftModel.ts`
- `webview-ui/src/components/handoffDraftPageModel.ts`

No requested report path was missing.

## Current Workflow Map

The current workflow has grown in layers:

1. Timeline / Replay produces a redacted handoff draft.
2. `Write to Repo` writes Markdown into `docs/agent-handoffs/`.
3. W10-C sidecar metadata adds a `.handoff.json` file next to the Markdown.
4. Recent Handoffs scans `docs/agent-handoffs/` and shows Markdown-only and metadata-backed rows.
5. Local handoff status can be `draft`, `reviewed`, or `stale`.
6. A package-backed handoff can create a work package in `docs/roadmap/supervision/work-packages/handoffs/`.
7. Work package metadata is stored in `dispatchPackage` on the handoff sidecar.
8. Dispatch package status can be `draft`, `ready`, `dispatched`, `completed`, or `blocked`.
9. The row can copy a dispatch prompt or work-package prompt.
10. The row can launch Codex or Claude from the work package.
11. Launched executor metadata is linked back into `dispatchPackage.execution`.
12. Execution status can be `linked`, `active`, `waiting`, `completed`, `blocked`, or `unknown`.
13. Completion refresh reads safe local facts: report presence, branch presence, merge state, and bounded report cues.
14. Review model derives states such as `needs_report`, `needs_review`, `ready_to_merge`, `merged`, `blocked`, and `active`.
15. Merge readiness and checklist copy actions help the supervisor decide what to do outside Pixel Agents.
16. Handoff Queue groups package-backed rows into needs dispatch, active/waiting/unknown, blocked, report ready, and done.

This is powerful, but the page now presents several similar nouns and many actions at once.

## Product Problem

The current UI asks the user to understand internal implementation terms before they can act:

- "Handoff" can mean draft preview, Markdown artifact, sidecar metadata, or queue row.
- "Dispatch" can mean copied prompt, package status, launched executor, or queue state.
- "Work package" is the actual executable instruction file, but it appears secondary to handoff labels.
- "Completion", "review", "merge readiness", and "checklist" overlap in meaning.
- Codex and Claude launch buttons are correct, but they compete visually with report/review actions and maintenance dropdowns.
- Status controls expose multiple independent state machines: artifact status, dispatch package status, execution status, review status.
- Recent Handoffs and Handoff Queue duplicate rows, which can make one item appear like two separate things.

The supervisor wants a simpler question answered first: **what work needs my attention now?**

## Proposed Mental Model

Use three product nouns and keep implementation nouns mostly hidden:

1. **Handoff**: a safe context note. It explains what happened and what needs to be handed off. It is stored as Markdown under `docs/agent-handoffs/`.
2. **Work Package**: executable instructions created from a handoff. This is what an executor should run. It is stored under `docs/roadmap/supervision/work-packages/handoffs/`.
3. **Executor**: a visible Codex or Claude agent working on a work package. Executor state is local evidence, not a guarantee.

Then define one operational lifecycle for package-backed work:

```text
Draft handoff -> Work package ready -> Dispatched -> Active / waiting / blocked -> Report ready -> Reviewed / done
```

The sidecar can keep richer internal states, but the UI should collapse them into those stages.

## Recommended Naming

- Rename **Handoff Queue** to **Work Queue**.
  - Reason: queue rows are package-backed executable jobs, not all handoff artifacts.
- Rename **Recent Handoffs** to **Handoff Library**.
  - Reason: it is a browseable local artifact list, not an action queue.
- Keep **Handoff Draft**.
  - Reason: it is generated from Timeline/Replay and not yet committed to a repo artifact.
- Rename **Copy dispatch prompt** to **Copy handoff prompt** only when no work package exists.
  - Reason: before a work package exists, this is an escape hatch for manual dispatch from the handoff artifact.
- Rename **Copy prompt** to **Copy work-package prompt** everywhere.
  - Reason: "Copy prompt" is too generic beside handoff, dispatch, checklist, and launch actions.
- Rename **Refresh completion** to **Refresh report status**.
  - Reason: what users expect is report/branch/review evidence, not an abstract completion scanner.
- Rename **Open report** to **Open executor report**.
  - Reason: distinguishes it from this roadmap package report and handoff reports.
- Keep **Launch Codex** and **Launch Claude**.
  - Reason: provider-specific launch buttons are explicit and symmetric.

## Proposed Information Architecture

Keep this in the Agent Center Timeline / Handoff area, but split the surface into three stacked sections:

### 1. Create Handoff

Purpose: turn Timeline/Replay evidence into a safe local context artifact.

Primary controls:

- Create Handoff
- Copy Markdown
- Write to Repo

Secondary text:

- Source: selected replay session or current Timeline filters.
- Privacy note: normalized Timeline/Usage only, no raw prompts or tool output.

This section should collapse after successful write, with a small success link to the new artifact.

### 2. Work Queue

Purpose: show package-backed work that needs supervisor attention.

This should become the primary operational surface. It should show only rows with a work package or rows that are one click away from making a work package when they are reviewed handoffs.

Top operator summary:

- Blocked
- Report ready
- Active / waiting
- Needs dispatch
- Done

Row headline should be:

- Work title
- Stage label
- Provider/executor label when linked
- Recommended next step

Recommended row actions by stage:

- No work package: Create work package
- Ready, not launched: Launch Codex, Launch Claude
- Active / waiting: Inspect terminal, Refresh report status
- Blocked: Open executor report when available, Copy blocker checklist
- Report ready: Open executor report, Copy review checklist
- Ready to inspect: Open executor report, Copy merge checklist
- Merged / done: Mark reviewed, Copy closeout checklist

Secondary maintenance actions should be hidden in an overflow or "More" group:

- Open handoff
- Open work package
- Copy work-package prompt
- Link agent
- Mark stale
- Reset draft
- manual dispatch status dropdown
- manual execution status dropdown

### 3. Handoff Library

Purpose: browse local handoff artifacts and create work from reviewed context.

Default list should be compact and less operational than Work Queue. Rows can show:

- Handoff title
- local status: draft, reviewed, stale, markdown only
- metadata presence
- latest update time
- linked work package badge when present

Primary actions:

- Open handoff
- Create work package when metadata exists and no package exists

Secondary actions:

- Mark reviewed
- Mark stale
- Reset draft
- Copy handoff prompt

Package-backed rows should link into the Work Queue group rather than duplicating the full queue action set.

## Proposed Primary And Secondary Actions

Primary actions should be visible only when they are the likely next action:

- `Write to Repo`: only in Handoff Draft preview.
- `Create work package`: for reviewed metadata-backed handoffs without a package.
- `Launch Codex` / `Launch Claude`: for ready package-backed handoffs without active execution.
- `Refresh report status`: for active, waiting, unknown, completed, or report-missing package-backed handoffs.
- `Open executor report`: when report exists.
- `Mark reviewed`: when branch is merged or supervisor has accepted the result.

Secondary actions should be quieter:

- `Open handoff`
- `Open work package`
- `Copy handoff prompt`
- `Copy work-package prompt`
- `Copy status/review/merge/checklist`
- `Mark stale`
- `Reset draft`
- manual dispatch status
- manual execution status
- `Link agent`

One row should ideally show at most two visually prominent buttons.

## Controls To Merge, Hide, Or Move

Merge:

- Merge completion review, merge readiness, and executor state into one "Next step" strip. The existing models can remain separate internally.
- Merge `Copy dispatch prompt` and `Copy prompt` labels into source-specific copy labels:
  - `Copy handoff prompt`
  - `Copy work-package prompt`

Hide behind More:

- Mark stale
- Reset draft
- dispatch status dropdown
- execution status dropdown
- Link agent
- Open work package

Move:

- Checklist copy should live near review/readiness cues, not among launch actions.
- Handoff artifact status actions belong in Handoff Library, not primary Work Queue rows.
- Work package status and execution status manual controls belong in a diagnostics/More area.

Keep prominent:

- Launch Codex
- Launch Claude
- Open executor report
- Refresh report status
- Mark reviewed when applicable
- Create work package

## Executor State Surface

Executor state should be shown as a single normalized status, regardless of provider:

- Not started
- Ready to launch
- Active
- Waiting for input
- Blocked
- Report ready
- Ready to inspect
- Done
- Stale / unknown

Each state should include:

- status label
- short evidence line
- provider label when known: Codex or Claude
- linked visible agent label when available
- next action label

Evidence priority should remain:

1. Completion review and report state.
2. Visible linked agent live state.
3. Sidecar execution metadata.
4. Safe fallback to stale / unknown.

This keeps W15-A's important truthfulness rule: sidecar metadata alone should not make a stale executor look confidently active.

## Codex And Claude Symmetry

Codex and Claude should share the same Work Queue model:

- Same stage labels.
- Same row layout.
- Same execution state semantics.
- Same report refresh behavior.
- Same completion review and merge readiness cues.
- Same safety rules for sidecar metadata.

Provider-specific differences should be limited to launch buttons and provider evidence:

- `Launch Codex`
- `Launch Claude`
- provider label on linked executor state
- provider-specific launch failure text when CLI is missing or the launch cannot produce an agent

Avoid adding separate Codex queue and Claude queue surfaces.

## Privacy And Local-First Constraints

Keep the current guardrails:

- No raw prompts, raw tool output, raw transcript text, credentials, or absolute transcript paths in webview payloads.
- Handoff Markdown is redacted and local.
- Sidecar metadata uses repo-relative paths only.
- Work packages reference handoff files; they do not embed full handoff bodies.
- Completion review reads bounded report signals and safe read-only git facts.
- Pixel Agents must not push, merge, rebase, amend, reset, stash, clean, delete branches, stage user work, or auto-open PRs.
- Manual checklist copy must remain copy-only.
- Webview requests should continue to send safe identifiers such as relative handoff path and request id.

## Edge Cases

Missing report:

- Work Queue stage: active / waiting or needs report.
- Primary action: Refresh report status.
- Secondary: Open work package, Copy status checklist.

Stale linked agent:

- Work Queue stage: stale / unknown.
- Evidence: "Execution metadata points to an agent that is not visible."
- Primary action: Inspect terminal or Refresh report status.
- Do not mark active from sidecar alone.

Blocked executor:

- Work Queue stage: blocked.
- Primary action: Open executor report if present.
- Secondary: Copy blocker checklist, Mark stale.
- Do not recommend merge.

Markdown-only handoff:

- Handoff Library status: Markdown only.
- Actions: Open handoff, Copy handoff prompt if safe.
- Disabled or absent: Create work package, status updates, launch.
- Explanation: metadata sidecar required for tracked workflow.

No branch:

- Review cue: branch missing.
- Work Queue stage: needs review or unknown depending on report.
- Checklist should instruct manual inspection and no merge until branch facts are understood.

Merged branch:

- Work Queue stage: done or already merged.
- Primary action: Mark reviewed.
- Checklist: closeout checklist.

Report ready but validation missing:

- Work Queue stage: report ready or needs review.
- Primary action: Open executor report.
- Warning cue: validation missing.
- Checklist: review checklist, not merge checklist.

Executor active with report already present:

- Report state should win; show report ready.
- Next action: Open executor report.
- Still show linked executor evidence as secondary.

Claude CLI missing:

- Launch failure should not mark sidecar launched.
- Work Queue remains ready to launch.
- UI should show provider-specific launch failure text and keep `Launch Claude` available after environment fix.

## Proposed W17 Implementation Sequence

### W17-A - Work Queue IA And Naming

Goal: rename and restructure the surface without changing backend behavior.

Scope:

- Rename Handoff Queue to Work Queue.
- Rename Recent Handoffs to Handoff Library.
- Make Work Queue appear before Handoff Library when package-backed items exist.
- Update labels:
  - Refresh report status
  - Open executor report
  - Copy work-package prompt
  - Copy handoff prompt
- Keep existing model helpers and message builders.
- Add webview model tests for label/state mapping where pure helpers change.

Acceptance:

- User sees one primary operational queue.
- Markdown-only handoffs no longer look like launchable work.
- No backend behavior changes.

### W17-B - Row Next-Action Compression

Goal: reduce visible button noise while preserving all capabilities.

Scope:

- Introduce a pure row action model that returns:
  - primaryActions
  - secondaryActions
  - maintenanceActions
  - recommendedNextAction
- Show at most two prominent actions per row.
- Move maintenance controls into a compact More/details section.
- Keep Launch Codex / Launch Claude prominent only when package is ready to launch.
- Keep Open executor report prominent when report exists.

Acceptance:

- Queue rows are shorter and easier to scan.
- Existing actions remain reachable.
- No provider launch behavior changes.

### W17-C - Executor State And Review Cue Consolidation

Goal: combine executor state, completion review, and merge readiness into one readable decision strip.

Scope:

- Build a display model from existing `buildHandoffExecutorStateModel`, `buildHandoffReviewRecommendedAction`, and `buildHandoffMergeReadiness`.
- Show one stage label, evidence line, warning count, and next step.
- Keep detailed cues available in an expandable section.
- Keep checklist copy state-specific.

Acceptance:

- Supervisor can decide next action without parsing three separate cue blocks.
- Blocked, report-ready, active, stale, and merged states remain distinct.
- No full report body or raw paths appear in the UI.

## Open Questions For Supervisor

1. Should "Work Queue" become the public product name, or should it be "Executor Queue"?
2. Should Handoff Library remain on the Timeline page, or move to a dedicated Handoff page once the workflow is central enough?
3. Should a reviewed handoff be required before `Create work package`, or should draft handoffs be packageable with a warning?
4. Should the UI keep both `Copy handoff prompt` and `Copy work-package prompt`, or should manual prompt copy move entirely behind More after launch is reliable?
5. Should package status and execution status remain manually editable, or become diagnostics-only controls after launch/completion tracking matures?
6. Should "Mark reviewed" mean "I reviewed the executor report" or "This handoff is closed"? The current wording mixes artifact status and supervisor acceptance.

## Validation

- `git diff --check`: passed.
- `npm run test:webview`: passed, 166 tests.
- `npm run test:server`: passed, 284 tests.
- `npm run build`: passed.

The expected minimums were met:

- webview tests: 166 >= 166.
- server tests: 284 >= 284.

## Files Changed

- `docs/roadmap/supervision/reports/W16-D-handoff-workflow-simplification-spec-report.md`
- `docs/roadmap/supervision/reports/W16-D-handoff-workflow-simplification-spec.html`

## Known Limitations

- This is a docs/spec package only. No React UI, backend launch logic, provider adoption, usage tracking, office rendering, or installed extension identity behavior changed.
- The spec is based on source and report inspection, not a fresh installed VSIX visual QA pass.
