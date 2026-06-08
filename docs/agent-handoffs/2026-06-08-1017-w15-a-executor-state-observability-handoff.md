# W15-A Handoff Executor State Observability

## Intent

Pixel Agents Multi can now launch package-backed Codex and Claude executors, but the Handoff Queue still treats execution metadata mostly as launch/link state. W14-F proved the launch path can be correct while the executor is actually waiting on an approval prompt or stalled by local resources.

W15-A should make executor state visible and harder to misread:

- show whether a launched executor is active, waiting, blocked, completed, or unknown using safe local signals;
- keep Handoff Queue / Recent Handoffs legible without adding git mutation behavior;
- retain provider symmetry for Codex and Claude;
- update release-facing docs that still say Claude handoff launch is deferred.

## Evidence To Read

- `docs/roadmap/supervision/reports/W14-F-claude-handoff-launch-stuck-report.md`
- `docs/roadmap/supervision/reports/W14-E-installed-handoff-launch-qa-report.md`
- `docs/roadmap/supervision/reports/W14-B-handoff-queue-operator-summary-report.md`
- `docs/roadmap/supervision/reports/W14-C-handoff-checklist-copy-ergonomics-report.md`
- `README.md`
- `docs/pixel-agents-development-timeline.html`

## Desired Outcome

The supervisor should be able to look at Handoff Queue and tell the difference between:

- executor launched and currently working;
- executor waiting for permission / approval / user input;
- executor has a report ready;
- executor appears stale or unknown and needs manual inspection.

This must remain local-first and read-only with respect to git operations.
