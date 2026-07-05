# Work Package W13-A - Handoff completion review

## Context

W9-W12 built the local handoff flow:

- Timeline can create safe handoff drafts.
- Handoff drafts can be written to `docs/agent-handoffs/`.
- Handoffs can create package-backed executor work packages.
- Handoff Queue can launch Codex or Claude executors.
- The extension can detect whether the expected executor report exists and whether the package
  branch exists or has been merged into local `main`.

The next product gap is supervisor review. When an executor says "done", the user still has to
manually inspect a report, branch, commit state, validation notes, and next action. W13-A should
turn the existing completion signals into a safe read-only review model and a compact Handoff Queue
presentation.

This package must not merge, push, stage, checkout, stash, reset, clean, delete branches, or edit
executor work. It should make completion easier to understand, not automate approval.

## Goal

Add a supervisor-facing completion review layer for package-backed handoffs.

The user should be able to glance at Handoff Queue and understand:

- whether a package is still waiting, active, blocked, report-ready, ready for review, or merged,
- which report and branch are relevant,
- what validation evidence the executor reported,
- whether the report includes expected sections,
- what the safe next action is: open report, inspect branch, mark reviewed, or nothing needed.

## In scope

- Add a read-only completion review model derived from existing handoff metadata, completion scan
  state, executor report Markdown, and safe local git reads.
- Parse bounded, sanitized executor report signals:
  - report title,
  - summary heading presence,
  - files-changed heading presence,
  - validation heading presence,
  - acceptance/deviation/out-of-scope heading presence,
  - short validation result lines,
  - short changed-file lines,
  - short risk/deviation/follow-up lines.
- Add safe branch/read-only git facts when available:
  - branch exists,
  - branch merged to local `main`,
  - branch head commit SHA,
  - local `main` head commit SHA,
  - branch ahead/behind counts when safely available.
- Expose review state to the webview through existing handoff artifact load/refresh messages.
- Show review labels and next-action copy in Recent Handoffs / Handoff Queue without a large UI
  redesign.
- Add model tests and report the new combined test count.
- Write the W13-A report and commit all W13-A changes as one commit.

## Out of scope

Do not:

- auto-merge executor branches,
- auto-push any branch,
- create PRs,
- stage files,
- modify executor reports,
- modify executor branches,
- switch branches as part of completion scanning,
- run arbitrary commands from reports,
- display raw full report bodies in the queue,
- include absolute local paths in webview payloads,
- redesign Agent Center, Timeline, Usage, Office, Layout Editor, or provider adoption,
- change Claude/Codex launch behavior.

## Recommended model

Use names that fit the existing codebase, but the review object should be close to:

```ts
type HandoffCompletionReviewStatus =
  | 'not_ready'
  | 'active'
  | 'blocked'
  | 'needs_report'
  | 'needs_review'
  | 'ready_to_merge'
  | 'merged'
  | 'unknown';

interface HandoffCompletionReviewV1 {
  status: HandoffCompletionReviewStatus;
  statusLabel: string;
  nextActionLabel: string;
  reportRelativePath?: string;
  branchName?: string;
  report?: {
    title?: string;
    hasSummary: boolean;
    hasFilesChanged: boolean;
    hasValidation: boolean;
    hasAcceptanceCriteria: boolean;
    hasDeviations: boolean;
    validationLines: string[];
    changedFileLines: string[];
    riskLines: string[];
    truncated: boolean;
  };
  git?: {
    branchExists?: boolean;
    branchMergedToMain?: boolean;
    branchHeadSha?: string;
    mainHeadSha?: string;
    aheadCount?: number;
    behindCount?: number;
  };
  warnings: string[];
  checkedAt: string;
}
```

Rules:

- This review object is read-only and can be recomputed on refresh.
- It may be included in handoff library loaded payloads, but do not persist it into sidecars unless
  you can justify that persistence is necessary. Prefer virtual/read-model state.
- Keep all strings bounded and sanitized.
- Strip or replace absolute Windows/macOS/Linux paths before sending to the webview.
- Do not expose raw report body text beyond short bounded lines.
- If a report is missing, return a useful `needs_report`/`not_ready` state rather than throwing in
  normal library scans.

## Suggested files

Backend/read model:

- `src/handoffArtifacts.ts`
- `src/PixelAgentsViewProvider.ts`
- `src/timelineEvents.ts` only if a new safe review refresh event is needed

Webview:

- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/src/components/AgentCenter.tsx`

Tests:

- `server/__tests__/handoffArtifacts.test.ts`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- Add another focused test file if it keeps the model cleaner.

Report:

- `docs/roadmap/supervision/reports/W13-A-handoff-completion-review-report.md`

## Backend requirements

### Completion review builder

Add a pure or mostly-pure helper that can build completion review data from:

- repo root,
- handoff Markdown relative path,
- parsed sidecar metadata,
- existing completion scan status,
- optional git runner for tests.

It should:

- validate all report and branch paths with existing safe path helpers,
- read at most a bounded number of bytes from the executor report,
- parse Markdown headings without requiring a full Markdown dependency unless the repo already has
  one,
- extract short sanitized signal lines from relevant sections,
- compute local git facts through read-only commands only.

Allowed git reads:

```powershell
git rev-parse --verify <branch>
git rev-parse --verify main
git rev-list --left-right --count main...<branch>
git merge-base --is-ancestor <branch> main
```

Use the repo's existing `HandoffGitCheckRunner` pattern or add a similarly testable runner. Do not
use shell strings for git commands; pass argument arrays.

### Artifact loading

When handoff artifacts are loaded or completion is refreshed, include the review object in the item
summary when a dispatch package exists.

The review object should be omitted or set to a safe empty state for handoffs without a work package.

### Status mapping

Recommended mapping:

- no dispatch package: `not_ready`
- dispatch package exists, no execution, no report: `needs_report`
- execution active/waiting and no report: `active`
- execution blocked or dispatch blocked: `blocked`
- report exists and branch is not merged: `needs_review` or `ready_to_merge`
- report exists and branch merged to local main: `merged`
- missing/failed git facts: keep status useful and add a warning instead of failing the whole load

## Webview requirements

In the handoff library model:

- Parse and sanitize the review object.
- Add a compact `review` field to `HandoffArtifactLibraryItem`.
- Add status label and next-action helpers.
- Ensure absolute paths, raw prompts, raw report body, and unsafe fields are not retained.

In Handoff Queue / Recent Handoffs:

- Show a compact review status label such as `Needs review`, `Ready to merge`, `Merged`, or
  `Blocked`.
- Show the safe `nextActionLabel`.
- Add small report/validation cues without expanding the row into a huge report preview.
- Keep existing Open Handoff, Open Work Package, Open Report, Refresh Completion, Launch Codex, and
  Launch Claude actions working.
- Do not add an automatic merge button in W13-A.

## Tests

Add focused automated tests.

At minimum:

- Report parser detects expected headings and bounded validation/file/risk lines.
- Report parser redacts absolute local paths and truncates long lines.
- Completion review status maps correctly for:
  - package with no report,
  - active execution with no report,
  - blocked execution,
  - report exists + branch exists + not merged,
  - report exists + branch merged,
  - missing git facts.
- Git runner is read-only and uses argument arrays.
- Handoff library loaded payload exposes review data without absolute paths.
- Webview model keeps review labels and next actions.
- Webview model does not retain prompt text, absolute paths, or full report body.

Required validation:

```powershell
npm run build
npm run test:webview
npm run test:server
git diff --check
```

Current baseline after W12-G:

- server tests: 278
- webview tests: 137
- combined: 415

The W13-A combined count should be greater than 415 if tests are added. Report the actual counts.

## Guardrails

- Branch from current `main`.
- Current known `main` baseline: `be11574 fix: read Claude Code desktop session titles` or later.
- Use branch name: `product/w13-a-handoff-completion-review`.
- One package = one commit on that branch.
- Do not push, merge, rebase, amend, reset, clean, delete branches, or stash.
- If the preflight worktree is dirty, stop and report exact `git status --short --branch`.
- Do not use Computer Use or live VS Code automation for this package unless explicitly instructed.
- Do not change package identity, publisher, version, command ids, or view ids.

## Acceptance criteria

1. Package-backed handoffs expose a safe completion review object when loaded/refreshed.
2. Missing reports produce a useful non-crashing review state.
3. Existing report/branch completion detection still works.
4. Handoff Queue displays review status and safe next action.
5. Review parsing never exposes absolute local paths or full raw report body.
6. No git mutation commands are introduced.
7. Codex and Claude handoff executor launch behavior is unchanged.
8. `npm run build`, `npm run test:webview`, `npm run test:server`, and `git diff --check` pass.

## Reporting back

Write:

```text
docs/roadmap/supervision/reports/W13-A-handoff-completion-review-report.md
```

The report must include:

1. Branch and commit SHA
2. Files changed
3. Review model shape and status mapping
4. Report parsing and redaction behavior
5. Git read commands used
6. UI changes
7. Validation command results and test counts
8. Acceptance criteria checklist
9. Out-of-scope items or "none"
10. Deviations from this spec or "none"
