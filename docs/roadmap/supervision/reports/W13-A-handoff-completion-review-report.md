# W13-A Handoff Completion Review Report

## Branch and Commit

- Branch: `product/w13-a-handoff-completion-review`
- Package commit SHA: recorded as this branch's HEAD after the single W13-A commit.
- Baseline: `1e82172 docs: add W13-A handoff completion review package`

## Files Changed

- `src/handoffArtifacts.ts`
- `src/constants.ts`
- `src/PixelAgentsViewProvider.ts`
- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `server/__tests__/handoffArtifacts.test.ts`
- `webview-ui/test/handoff-artifact-library-model.test.ts`

## Review Model

Added a virtual, read-only `HandoffCompletionReviewV1` read model to handoff artifact scan results.
It is derived from sidecar dispatch metadata, completion scan state, bounded executor report parsing,
and read-only local git facts. It is not written back to `.handoff.json` sidecars.

Statuses:

- `not_ready`: no work package exists.
- `needs_report`: package exists but no report is available yet.
- `active`: package has active/linked/waiting execution and no report yet.
- `blocked`: dispatch or execution status is blocked.
- `needs_review`: report exists, but expected report cues or branch facts need supervisor attention.
- `ready_to_merge`: report exists, branch exists, and summary/files/validation cues are present.
- `merged`: branch is already merged to local `main`.
- `unknown`: fallback for malformed or incomplete inputs.

## Report Parsing and Redaction

- Executor reports are read up to `HANDOFF_COMPLETION_REPORT_SCAN_BYTES` only.
- The parser extracts only bounded display signals: title, expected heading presence, short validation lines, short changed-file lines, and short risk/follow-up lines.
- Full report bodies are not sent to the webview.
- Absolute Windows, UNC, and POSIX-like paths are replaced with `[redacted path]`.
- Raw prompt/tool output/transcript/secret-looking lines are replaced with redacted content.
- Long lines and warning lists are capped before reaching the webview.

## Git Reads

Only read-only git argv commands are used:

- `git rev-parse --verify <branch>`
- `git rev-parse --verify main`
- `git rev-list --left-right --count main...<branch>`
- `git merge-base --is-ancestor <branch> main`

No scanning code stages, checks out, merges, pushes, rebases, resets, stashes, cleans, or deletes branches.

## UI Changes

- Recent Handoffs and Handoff Queue now show compact review status labels.
- Rows show a safe next action label such as `Open report`, `Inspect branch`, or `Mark reviewed`.
- Rows include a small validation/file/branch cue when available.
- The UI keeps existing Open Handoff, Open Work Package, Open Report, Refresh Completion, Launch Codex, and Launch Claude actions unchanged.
- No merge button or automatic approval workflow was added.

## Validation

- `npm run build`: passed.
- `npm run test:webview`: passed, 139 tests.
- `npm run test:server`: passed, 281 tests.
- Combined test count: 420.
- `git diff --check`: passed.

## Acceptance Checklist

- Package-backed handoffs expose safe completion review data on load/refresh: yes.
- Missing reports produce useful non-crashing review states: yes.
- Existing report/branch completion detection still works: yes.
- Handoff Queue displays review status and safe next action: yes.
- Review parsing does not expose absolute local paths or full raw report bodies: yes.
- No git mutation commands were introduced: yes.
- Codex and Claude handoff executor launch behavior is unchanged: yes.
- Required build/tests pass: yes.

## Out of Scope

None beyond the explicit W13-A exclusions: no auto-merge, no PR creation, no executor branch mutation,
no report editing, no provider launch behavior changes, and no broad Agent Center redesign.

## Deviations

- The report cannot contain its own final commit SHA before commit creation. The final SHA is reported
  in the supervisor response after the single W13-A commit is created.
