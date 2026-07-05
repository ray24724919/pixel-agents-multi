# Wave 1 Executor Instructions

You have been dispatched by a supervisor agent to execute Wave 1 of the pixel-agents cleanup. Wave 1 contains two related work-packages (W1-A and W1-B) that must be done **sequentially** in this order. Do not improvise — every design decision has already been made in the spec.

Your cwd should be `/Users/raychen/Documents/pixel-agents`. Verify before starting:

```
pwd  # must end in pixel-agents
git log -1 --oneline  # main HEAD should be the latest supervision commit
git status  # should be clean
```

## Step 1 — Read these files IN FULL before any code change

Skipping this step is the #1 cause of past executor failures in this repo. The supervisor wrote these documents specifically to prevent the deviations that caused the current bugs.

Read in this order:

1. `docs/roadmap/supervision/cleanup-framework.md` — entire file, especially §1 (Guardrails G-1..G-7) and §2 (work-package template structure). These guardrails are binding.
2. `docs/roadmap/supervision/deviation-map.md` — at minimum read the "Synthesis" section at the bottom (recurring deviation themes, severity list) and the BLK-1 and BLK-2 entries. This tells you what NOT to repeat.
3. `docs/roadmap/supervision/symptoms-log.md` — entries S-T1-01 and S-T2-01. These are the user-facing runtime symptoms your work fixes.
4. `docs/roadmap/supervision/work-packages/W1-A-restore-claude-launcher.md` — full spec for the first package.
5. `docs/roadmap/supervision/work-packages/W1-B-codex-thread-followon.md` — full spec for the second package.

Do not start implementing until you've read all five files. After reading, briefly summarize back to yourself what each of the seven guardrails means in your own words — this proves you understood, not just skimmed.

## Step 2 — Implement W1-A first

```
git checkout main
git checkout -b cleanup/w1-a-restore-claude-launcher
```

Follow `W1-A-restore-claude-launcher.md` exactly. Pay special attention to:

- The original Claude launch flow is **recoverable** from `git show e61b405^:src/agentManager.ts` (lines ~83–156). Port it back — do not redesign.
- Both Claude AND Codex launch paths must exist after this change. Two parallel branches in `launchNewTerminal` is fine; do not extract a shared helper in this package.
- Add ≥3 unit tests as specified.
- Verify: `npm run build` green AND `npm test` ≥ 150 tests passing. If red, fix before committing.
- One commit on this branch. Do NOT push, do NOT merge to main, do NOT --amend, do NOT rebase.

When W1-A's commit lands on `cleanup/w1-a-restore-claude-launcher`, proceed to Step 3.

## Step 3 — Implement W1-B

Branch FROM main (not from W1-A's branch):

```
git checkout main
git checkout -b cleanup/w1-b-codex-thread-followon
```

Follow `W1-B-codex-thread-followon.md` exactly. Note the three implementation choices the spec offers you (gate-vs-remove, token snapshot strategy, Scenario C behavior). The spec states preferences for each — pick and justify.

Same verification gates apply: `npm run build` green, `npm test` ≥ baseline+3. One commit. Don't push, merge, amend, or rebase.

## Hard rules (scan this before every action)

- **DO NOT** delete any code that handles the Claude flow. G-1 — polymorphism.
- **DO NOT** touch `server/src/providers/file/codex/codex.ts`. G-7 — preserved-known-good.
- **DO NOT** touch `src/lifecycleStatus.ts`. G-7.
- **DO NOT** push, merge to main, --amend, or rebase any branch.
- **DO NOT** silently expand scope. If you find an out-of-scope file needs touching, **STOP** and put it in your final report instead.
- **DO NOT** mark a commit when `npm run build` or `npm test` is red.
- **DO NOT** combine W1-A and W1-B into one branch or one commit.
- **DO** read the five files in Step 1 before any code change.

## Step 4 — Report back

Your final reply to the user must contain BOTH packages' reports in one message, clearly separated. The user will paste your full reply verbatim to the supervisor for review, so be thorough — vague reports trigger another round trip.

Use this exact structure:

```
# Wave 1 Execution Report

## W1-A — Restore Claude launcher

A. Branch + commit SHA: <branch> @ <sha> (`git log -1 --oneline` output)
B. Diff stat:
   <paste output of: git diff --stat cleanup/w1-a-restore-claude-launcher...main>
C. Per-file change narrative:
   For each modified/created file, one paragraph covering:
   - The file's role before this change
   - What you changed functionally (describe behavior, not line numbers)
   - Why you chose this implementation
D. Build result:
   <paste final summary line of `npm run build`>
E. Test result:
   <paste final summary line of `npm test`, with test count>
F. Acceptance criteria check (8 criteria in the W1-A spec):
   1. <PASS|FAIL> — <one line of evidence>
   2. <PASS|FAIL> — <one line of evidence>
   ... (through 8)
G. Out-of-scope findings (file:line + one-line description, or "none"):
   - ...
H. Deviations from the spec's Required changes section, with reason (or "none"):
   - ...
I. Items for supervisor to double-check (or "none"):
   - ...

## W1-B — Codex thread follow-on + ghost adoption gate

A. Branch + commit SHA
B. Diff stat: `git diff --stat cleanup/w1-b-codex-thread-followon...main`
C. Per-file change narrative
D. Three implementation choices (one paragraph each):
   1. Adoption: removed entirely / gated behind setting — and why
   2. Token snapshot strategy: snapshot-at-switch / per-thread running totals — and why
   3. Scenario C on thread deletion: re-discover / clean idle — and why
E. Build result
F. Test result
G. Acceptance criteria check (6 criteria in the W1-B spec)
H. Out-of-scope findings
I. Deviations from spec, with reason
J. Items for supervisor to double-check
```

## If you get stuck or unsure

If anything in the specs is ambiguous, or you find something the spec didn't anticipate, **STOP and ask in your final report**. Do not guess. The supervisor would much rather get a partial report with clear questions than a complete commit that quietly went off-spec.

Begin by reading the five files in Step 1. Don't start `git checkout` until you've read them all.
