# Work Package W2-E — W2-A no-workspace fallback

## Context (read first)

W2-A ([spec](W2-A-codex-external-sync.md)) re-enabled external Codex thread adoption with this default scope filter (`getAdoptionCandidates` in `src/PixelAgentsViewProvider.ts`):

> Default: adopt threads whose `cwd` is either (a) a workspace folder root the user has open in VS Code, or (b) a cwd that already owns at least one `+Agent`-spawned (`isExternal=false`) Codex agent.

This assumption breaks when the user runs VS Code **without any folder open** and uses Pixel Agents as a cross-project status board. With no workspace folder AND no user-spawned Codex agents, the default `allowedCwds` set is empty → no thread is ever adopted.

Symptom during W2-A runtime verification (2026-05-27):

- User opened VS Code with no folder (`workspaceFolders` is `undefined` / empty).
- `~/.codex/state_5.sqlite` had multiple `archived=0` Codex threads with cwds like `/Users/raychen/Documents/pixel-agents`, but Pixel Agents showed zero Codex agents.
- Setting `pixel-agents.codex.discoverAllCwds: true` made all threads adopt correctly, confirming the only issue is the default's restrictive scope.

## What this package fixes

Add a fallback so `getAdoptionCandidates` treats "no workspace folder AND no user-spawned Codex agents" as a signal that the user is running Pixel Agents in cross-project status-board mode, and therefore the default should behave like `discoverAllCwds: true` for this session. This preserves the original spec's intent for workspace-attached users (no noise from unrelated projects) AND covers the no-workspace use case naturally.

## In scope

Single behavioral change in `src/PixelAgentsViewProvider.ts` `getAdoptionCandidates`:

1. After the existing logic that builds `allowedCwds` from workspace folders and existing-agent cwds, check whether `allowedCwds` is empty.
2. If empty AND the user has NOT explicitly set `pixel-agents.codex.discoverAllCwds: false` (the default), treat the run as if `discoverAll` were `true` (i.e., return latest-thread-per-cwd for every cwd, excluding already-owned cwds).
3. If the user has explicitly set `discoverAllCwds: false`, respect that (they're opting out of the fallback) — return empty as before. Use `vscode.workspace.getConfiguration('pixel-agents').inspect('codex.discoverAllCwds')` to distinguish "default false" from "explicitly set false".

This is a 10-20 line patch.

## Out of scope (do NOT touch)

- Anything outside `getAdoptionCandidates` in `PixelAgentsViewProvider.ts`.
- The setting itself (no rename, no description change).
- Adding new settings.
- Claude-side scope filters (W2-B's territory).
- The `discoverAllCwds: true` opt-in path (still works as before).
- AgentCenter UI changes.

## Required changes (end-state described)

### `src/PixelAgentsViewProvider.ts` `getAdoptionCandidates`

- After computing `allowedCwds` (workspace folders ∪ existing-agent cwds), branch:
  - If `discoverAllCwds` setting is explicitly user-configured (true OR false) → respect literally (existing W2-A behavior).
  - Else if `allowedCwds.size === 0` → fall back to discoverAll behavior (return latest-thread-per-cwd for every cwd, still excluding cwds with existing agents).
  - Else → existing W2-A behavior (filter by allowedCwds).
- Add a one-line `console.log` when the fallback engages so future debugging is easy: `[Pixel Agents] Codex: no workspace folder and no user-spawned agents — adopting across all cwds (default fallback). Set pixel-agents.codex.discoverAllCwds=false to disable.`

### Setting description tweak (optional, surface if you decide to update)

If you find the `pixel-agents.codex.discoverAllCwds` description in `package.json` misleading after the fallback (e.g. it implies the default is always "scoped" when the fallback breaks that), edit it to note the fallback behavior. Otherwise leave it.

## Tests

- New test in `server/__tests__/codexFollowon.test.ts`:
  - **Test 1**: With no workspace folders, no existing agents, and `discoverAllCwds` NOT explicitly set: scan adopts threads from all cwds (one per cwd).
  - **Test 2**: With no workspace folders but `discoverAllCwds` explicitly set to `false`: no adoption (respects explicit user opt-out).
  - **Test 3**: With at least one workspace folder, default behavior unchanged (no fallback engaged).
- Total `npm test` must be ≥164 (161 baseline + ≥3 new for W2-A).

## Guardrails (verbatim from cleanup-framework.md §1)

- **G-1 Polymorphic, never replace**: Don't change the original scope logic — add a fallback branch.
- **G-2 One package = one commit on branch `cleanup/w2-e-no-workspace-fallback`** based on current `main` (post-W2-A merge).
- **G-3 Scope frozen**: don't expand into Claude side, don't redesign settings, don't refactor `getAdoptionCandidates` beyond the fallback. If you find an unrelated bug, surface it.
- **G-4 npm run build green + npm test green + user runtime verification**.
- **G-5 Provider symmetry**: this is Codex-only; Claude's adoption path doesn't have the same scope filter, no symmetric change needed. Document in commit body.
- **G-6 No roadmap status edits**.
- **G-7 Preserve known-good list**.

## Acceptance criteria

After build + repackage + reinstall:

1. With VS Code opened without any folder AND no +Agent-spawned Codex agents: Codex agents auto-appear within ~5 seconds for every non-archived thread cwd (one per cwd). User does NOT need to manually toggle `discoverAllCwds`.
2. With VS Code opened with one or more folders: behavior unchanged from W2-A (only threads in those folder cwds or +Agent cwds adopt).
3. With `pixel-agents.codex.discoverAllCwds: true` (explicit): all cwds adopt regardless of workspace state. (Unchanged from W2-A.)
4. With `pixel-agents.codex.discoverAllCwds: false` (explicit) AND no workspace folder: NO adoption. (Respects explicit opt-out.)
5. The fallback engagement logs once per scan tick so behavior is observable in Extension Host output.
6. `npm run build` green; `npm test` green with the new tests.

## Verification protocol (user runs after handback)

1. `git checkout cleanup/w2-e-no-workspace-fallback`
2. `npm run build && npm test` — green.
3. `rm -f pixel-agents-*.vsix && npx @vscode/vsce package -o pixel-agents-W2E.vsix && code --install-extension /Users/raychen/Documents/pixel-agents/pixel-agents-W2E.vsix --force`
4. Reload Window.
5. **Reset `pixel-agents.codex.discoverAllCwds` setting to its default** (remove any explicit override in your User Settings JSON).
6. With NO folder open in VS Code: open Pixel Agents view → within 5s, Codex agents should appear for any non-archived threads in SQLite (e.g. `/Users/raychen/Documents/pixel-agents`).
7. Open a folder (say `~/Documents/some-unrelated-folder`) as workspace → Reload Window → confirm: ONLY threads in that folder cwd appear (if any), not all cwds.

Record PASS/FAIL per acceptance criterion.

## Reporting back

Write your final report to `docs/roadmap/supervision/reports/W2-E-no-workspace-fallback-report.md` and commit on the same branch (G-2). Do NOT paste the report back via terminal.

The "Implementation choices made" section MUST document:

- How you distinguish "default false" from "explicitly set false" (the `inspect()` call is recommended).
- Whether the fallback engages once per scan tick or only at session start (latter is fine if simpler).
- Any concerns about the fallback being too aggressive (e.g., user might want zero-noise but forgot to set false).
