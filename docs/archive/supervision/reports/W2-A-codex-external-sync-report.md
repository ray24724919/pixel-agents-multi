# W2-A Execution Report

Spec: [docs/roadmap/supervision/work-packages/W2-A-codex-external-sync.md](../work-packages/W2-A-codex-external-sync.md)

> **Note**: This report was originally pasted into the supervisor session by the user (executor delivered via stdout-paste workflow, before the report-via-md-file convention was adopted). Archived here retroactively for consistency with later packages.

## A. Branch + commit SHA

`cleanup/w2-a-codex-external-sync`  
`3613cc0357e0ced55cb7a4c4e3e4b29b410bda97` — `fix: adopt external codex cwd threads`

## B. git diff --stat main...cleanup/w2-a-codex-external-sync

```
 package.json                           |  10 ++
 server/__tests__/codexFollowon.test.ts | 144 ++++++++++++++++++++++++++-
 src/PixelAgentsViewProvider.ts         | 175 ++++++++++++++++++++++++++++++++-
 src/agentManager.ts                    |   2 +-
 4 files changed, 328 insertions(+), 3 deletions(-)
```

## C. Per-file change narrative

- **package.json**: added the contributed `pixel-agents.codex.discoverAllCwds` boolean setting, default false, with the exact requested description.
- **src/agentManager.ts**: exported `startCodexCwdPoll`.
- **src/PixelAgentsViewProvider.ts**: added external Codex adoption during Codex workspace scans, cwd grouping / latest selection, default/discover-all scope filtering, existing-agent cwd dedup, token usage initialization, file watching, and cwd polling for adopted agents. Also expanded the live Codex thread-id helper used by stale cleanup so top-level adopted external Codex agents are not immediately pruned.
- **server/**tests**/codexFollowon.test.ts**: added four tests covering one-agent-per-cwd grouping, default vs discover-all scope, no duplicate adoption for existing spawned agents, and post-adoption cwd polling thread switch.

## D. startCodexCwdPoll export/access

Cleanly exportable. The previously module-private helper was changed to `export function startCodexCwdPoll(...)` and reused directly from PixelAgentsViewProvider. No wrapper was needed.

## E. Default scope filter

Matches spec. With `discoverAllCwds=false`, allowed cwds are resolved VS Code workspace folder roots plus resolved cwds of existing `isExternal=false` Codex agents. With `discoverAllCwds=true`, all recent-thread cwds are eligible, still grouped to one latest thread per cwd and still excluding cwds where any Codex agent already exists.

## F. restoreAgents check for isExternal=true

Confirmed. The existing restored-agent path checks external transcript existence, then the `if (agent.providerId === 'codex')` branch starts `startCodexCwdPoll` regardless of `isExternal`. No changes to `restoreAgents` were needed.

## G. Final summary lines

- `npm run build`: ✓ built in 188ms
- `npm test`: Test Files 11 passed (11) / Tests 161 passed (161)

## H. Acceptance criteria check

1. PASS — scanner adopts latest workspace-scope Codex thread per cwd.
2. PASS — multiple threads in one cwd collapse to one latest adopted agent.
3. PASS — default scope excludes non-workspace / non-existing-agent cwds.
4. PASS — `discoverAllCwds=true` adopts out-of-workspace cwds.
5. PASS — existing +Agent-spawned Codex cwd prevents external duplicate.
6. PASS — adopted external agents use `startCodexCwdPoll` and switch on newer same-cwd thread without duplicating.
7. PASS — existing stale cleanup remains in path for missing/deleted active threads.
8. PASS — build green, tests green, 161 total tests with four W2-A tests added.

## I. Out-of-scope findings

None.

## J. Deviations from spec

None intentional. One implementation detail for supervisor awareness: the stale-cleanup live-thread-id helper now considers top-level Codex agent cwds, not only spawned-agent cwds, so newly adopted external agents survive the same scan that creates them.

## K. Items for supervisor to double-check

Please double-check the broadened live Codex thread-id helper in `src/PixelAgentsViewProvider.ts` (`getLiveCodexThreadIdsForAgentCwds`) and the adoption ordering around `removeStaleCodexAgents`; this is the small but important glue that lets external adoption coexist with existing stale cleanup.

## Supervisor review notes (added 2026-05-27)

- Verified K's concern: `getLiveCodexThreadIdsForAgentCwds` is the broader helper required for this feature; the narrower `getLiveCodexThreadIdsForSpawnedAgentCwds` is preserved (still exported, may be useful elsewhere). The broadening is correct and necessary — without it, every adoption would self-destruct on the next scan.
- Reproduced build + test results locally: green + 161 tests.
- Static review: PASS. Ready to merge.
- Runtime verification deferred until user installs a Wave-1+W2-A combined .vsix.
