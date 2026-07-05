# W4-D Team / Lab Mode Architecture Report

## Summary

Produced a docs-only Team / Lab Mode architecture document for the long-term Pixel Agents Multi
collaboration layer.

The architecture defines Team/Lab Mode as a later product stage after the personal local cockpit,
Agent Center 2.0, Usage Intelligence, timeline history, release verification, and repo-centered
collaboration are stable.

## Key Architecture Decisions

- Team/Lab Mode targets small groups of roughly 3-5 people.
- Team/Lab Mode should not be implemented before the personal all-agent cockpit is reliable.
- Git repositories should be the first shared coordination layer.
- Handoff notes and shared artifacts are the smallest useful shared units.
- A team sync service should be optional and deferred until repo-centered collaboration proves
  useful.
- Shared records should reserve schema versions, stable ids, visibility metadata, redaction state,
  project/repo context, validation summaries, and usage labels.
- Local numeric agent ids are not team-wide identities; future records should reserve stable agent
  ids.
- Usage Intelligence across members should aggregate opt-in normalized records and preserve
  exact/estimated/proxy labels.

## Privacy Stance

The architecture explicitly avoids raw transcript surveillance.

Privacy decisions:

- Local agent data is private by default.
- Raw prompts and raw transcript text are not synced by default.
- Absolute local paths, provider credentials, shell output, and private environment details remain
  local.
- Visibility is explicit: private, project, team, or public.
- Shared artifacts must be redacted and user-reviewed before publication.
- The future MVP should require `containsRawTranscript: false` for shared artifacts.
- Member-level usage visibility should be opt-in and should not become a productivity ranking.

## Repo-Centered Collaboration Stance

The architecture prefers repo-centered collaboration before platform sync:

- Branches, commits, PRs, issues, handoff markdown, and shared artifact JSON are the first shared
  facts.
- The extension should never auto-commit.
- Users should be able to draft and edit handoffs before sharing.
- A future team service should index approved artifacts and metadata rather than replace git-based
  collaboration.

## Unresolved Questions

- Should repo handoff files live under `.pixel-agents/` or under human-facing docs paths such as
  `docs/agent-handoffs/` by default?
- Which identity source should be primary before a team server exists: git config, GitHub identity,
  or explicit local profile?
- How much local audit history should be persisted before Team/Lab sync is introduced?
- Should member-level usage be visible to team leads by explicit per-member opt-in or by
  project-level team policy?
- What revocation guarantees can be honestly offered for artifacts already committed to git or
  posted to PRs?

## Files Changed

- `docs/roadmap/product/team-lab-mode-architecture.md`
- `docs/roadmap/supervision/reports/W4-D-team-lab-mode-architecture-report.md`

## Validation

- `git diff --check`: passed
