# Team / Lab Mode Architecture

## Product Objective

Team / Lab Mode is the long-term collaboration layer for Pixel Agents Multi. It lets a small group
see shared AI-agent work state, outcomes, handoffs, branches, pull requests, and usage patterns
without turning Pixel Agents Multi into raw transcript surveillance.

The architecture should preserve the product's local-first foundation:

- Personal local operation remains useful without any team server.
- Users explicitly choose what becomes project-visible or team-visible.
- Raw prompts, raw transcript text, private paths, and provider credentials are not synced by
  default.
- Git repositories act as the first shared coordination layer before any dedicated team platform is
  introduced.

The desired long-term experience:

- A lead can see which AI-assisted work is active, blocked, ready for review, or handed off.
- Team members can share concise agent work summaries, artifacts, branches, PR links, and usage
  context.
- Private exploratory sessions stay private unless the user publishes an artifact or handoff.
- Usage Intelligence can aggregate team-level patterns from opt-in metadata without exposing raw
  private transcripts.

## Why This Comes After The Personal Local Cockpit

Team/Lab Mode should come after the personal cockpit is stable because team sharing amplifies every
local reliability problem.

Prerequisites:

- Provider adoption is reliable for Claude, Claude Cowork/Desktop, and Codex.
- Agent Center 2.0 has page-level Agents, Usage, and Timeline surfaces.
- Hide, Archive, Kill, Pause, Resume, and failed-action history are semantically clear.
- Usage Intelligence has normalized local records with exact/estimated/proxy labels.
- Release verification protects extension identity and packaged contents.
- Repo-centered handoff artifacts exist before a server tries to synchronize them.

Without those prerequisites, Team/Lab Mode would multiply ambiguous state: duplicate agents,
unclear action history, raw transcript leakage, and misleading usage totals would become team-wide
problems. The right sequence is personal trust first, repo-centered collaboration second, optional
team sync third.

## Target Team Size And Use Cases

Target team size: 3-5 people.

Primary use cases:

- Small AI lab supervising several local agents across shared repositories.
- Tech lead checking which AI-assisted tasks are active, blocked, review-ready, or already handed
  off.
- Developer publishing a concise handoff note after an agent completes a work package.
- Reviewer opening a branch, PR, artifact summary, or tests report without reading raw private
  prompts.
- Maintainer comparing team usage by project/provider/model to understand workflow cost and value.
- Pair or trio coordinating agent work without duplicating the same task.

Secondary use cases:

- Local team demo room showing high-level status only.
- Sprint handoff report generation.
- Historical project timeline based on branches, PRs, commits, and shared notes.

## Non-Goals

- Do not build employee surveillance.
- Do not sync raw prompts or raw transcript contents by default.
- Do not expose provider API keys, auth tokens, shell output, or local environment details.
- Do not require a team server for personal Pixel Agents Multi usage.
- Do not make team dashboards the default first screen.
- Do not infer developer productivity scores from token usage.
- Do not publish private absolute paths by default.
- Do not replace GitHub, GitLab, local git, issue trackers, or PR review tools.
- Do not implement Team/Lab Mode in the W4-D package.

## Privacy Model

Team/Lab Mode has four privacy classes.

### Private

Default class for local agent data.

Examples:

- Raw prompts.
- Raw transcript text.
- Full local transcript paths.
- Full local project paths.
- Provider credentials.
- Shell output.
- Unpublished local branches.
- Usage records that include private project identity.

Private data remains local unless the user explicitly publishes a redacted artifact or changes
visibility.

### Project-Visible

Shared with people who have access to the repository/project.

Examples:

- Handoff notes committed to the repo.
- Branch names and commit SHAs.
- PR or issue links.
- Redacted agent status such as active, blocked, waiting, ready-for-review.
- Artifact summaries.
- Usage summaries grouped by project hash or repo slug.

Project-visible data should avoid raw transcript content and private local paths.

### Team-Visible

Shared with a configured team/lab space.

Examples:

- Cross-project status board.
- Aggregated usage by provider/model/project/member.
- Team-level handoff feed.
- Shared artifact catalog.
- Project timeline and review queue.

Team-visible data requires opt-in identity and team membership.

### Public

Published outside the team, usually through normal repo channels.

Examples:

- Public PRs.
- Public release notes.
- Public docs.
- Public demo artifacts.

Pixel Agents Multi should treat public sharing as an explicit downstream action, not an automatic
sync target.

## Visibility Model

Every shareable record should carry visibility metadata.

```ts
type Visibility = 'private' | 'project' | 'team' | 'public';

interface VisibilityPolicyV1 {
  visibility: Visibility;
  ownerUserId: string;
  projectId?: string;
  teamId?: string;
  redactionProfile: 'strict' | 'project_safe' | 'team_safe' | 'unredacted';
  sharedAtMs?: number;
  expiresAtMs?: number;
  allowTranscriptOpenByOthers: false;
}
```

Rules:

- Default visibility is `private`.
- Project/team/public visibility must be explicit.
- Redaction defaults to `strict`.
- Shared records should reference raw local transcript evidence by local id or hash, not by shipping
  transcript text.
- `allowTranscriptOpenByOthers` should be false for the MVP. Raw transcript sharing can be a later,
  explicit, risky feature if ever needed.
- Visibility downgrade is allowed locally. Existing remote copies cannot be assumed deleted unless
  the sync service has deletion acknowledgements.

## What Should Be Shared

Recommended shareable data:

- Agent work status: active, blocked, waiting, paused, ready-for-review, completed, archived.
- Provider and model labels when non-sensitive.
- Project/repo slug.
- Branch name.
- Commit SHA.
- PR/issue link.
- Handoff summary.
- Artifact summary.
- Test/build result summaries.
- User-authored notes.
- Normalized token usage aggregates.
- Timeline events that describe lifecycle/action outcomes, not private prompt text.
- Error summaries that are safe to expose, such as "Claude CLI missing" or "Kill failed: no safe
  process match", without dumping environment secrets.

## What Should Stay Private

Default-private data:

- Raw transcript lines.
- Raw prompt and assistant text.
- Tool arguments and command output unless included in a user-approved artifact.
- Absolute local paths.
- Workspace storage paths.
- Provider tokens, auth headers, and API keys.
- Local process ids unless needed for local diagnostics.
- Machine username and home directory.
- Private branch names unless the user publishes them.
- Detailed usage evidence that points to private transcript paths.

## Repo-Centered Collaboration Model

Git repos are the first bridge between personal and team modes.

Repo-centered collaboration means:

- The repo stores intentional shared artifacts.
- Branches, commits, PRs, and issue links are the durable collaboration anchors.
- Pixel Agents Multi can generate or open handoff notes, but the user controls whether they are
  committed.
- The project timeline is built around repo events plus shared agent artifacts.
- A team server, if added later, indexes and syncs these artifacts rather than replacing them.

Recommended repo artifact locations:

```text
.pixel-agents/
  handoffs/
    <date>-<agent-or-task-slug>.md
  artifacts/
    <artifact-id>.json
  timelines/
    project-timeline.jsonl
```

Alternative for teams that do not want dot-directories in repo root:

```text
docs/agent-handoffs/
docs/agent-artifacts/
```

Rules:

- Repo artifacts should be human-readable when possible.
- JSON artifacts should have schema versions.
- Markdown handoffs should be editable before commit.
- The extension should never auto-commit.
- The extension may offer "open handoff draft", "copy handoff path", or "stage file" only in a
  separately scoped implementation package.

## Handoff Protocol

A handoff is the smallest useful shared unit of Team/Lab Mode.

Handoff lifecycle:

1. Local agent does work.
2. User opens Agent Center detail drawer or Timeline.
3. User creates a handoff draft from selected agent/session/events.
4. Pixel Agents Multi generates a redacted summary with links to artifacts, branch, tests, and PR.
5. User edits and approves the draft.
6. User stores it in the repo or shares it to the team space.
7. Reviewers consume the handoff without needing raw private transcript access.

Recommended handoff markdown shape:

```markdown
# Agent Handoff: <task title>

## Summary

<human-editable summary>

## Status

- State: ready_for_review
- Provider: Codex
- Project: pixel-agents-multi
- Branch: feature/example
- Commit: abc1234
- PR: <link or pending>

## What Changed

- <artifact or file summary>

## Validation

- <tests/builds/manual checks>

## Follow-Up

- <remaining risks/questions>

## Usage Snapshot

- Tokens: <exact/mixed/estimated label>
- API proxy estimate only: <value if shown>

## Local Evidence

- Transcript reference: local-only, not included
- Generated at: <timestamp>
```

The handoff protocol should prefer user-editable summaries over automatic claims. Generated content
is a draft, not a signed truth.

## Shared Artifact Schema

Shared artifacts describe outcomes and evidence that are safe to publish within a selected
visibility scope.

```ts
interface SharedArtifactV1 {
  schemaVersion: 1;
  artifactId: string;
  artifactType:
    | 'handoff_note'
    | 'branch'
    | 'commit'
    | 'pull_request'
    | 'issue'
    | 'test_report'
    | 'build_report'
    | 'usage_summary'
    | 'design_note'
    | 'file_summary';
  title: string;
  summary: string;
  createdAtMs: number;
  updatedAtMs?: number;

  visibility: VisibilityPolicyV1;

  project: {
    projectId: string;
    repoSlug?: string;
    repoRemoteUrlHash?: string;
    localDirHash?: string;
  };

  sourceAgent?: {
    localAgentId?: number;
    stableAgentId?: string;
    providerId?: 'codex' | 'claude' | string;
    modelId?: string;
    roleName?: string;
    teamName?: string;
  };

  repo?: {
    branch?: string;
    baseBranch?: string;
    commitSha?: string;
    pullRequestUrl?: string;
    issueUrl?: string;
  };

  validation?: Array<{
    kind: 'build' | 'test' | 'manual' | 'review';
    label: string;
    status: 'passed' | 'failed' | 'skipped' | 'unknown';
    summary?: string;
    occurredAtMs?: number;
  }>;

  usage?: {
    tokenSource: 'exact_provider' | 'estimated_transcript' | 'mixed' | 'unknown';
    providerTokens?: number;
    artifactEstimateTokens?: number;
    apiProxyEstimateUsd?: number;
    nonBillingLabel: 'API proxy estimate only';
  };

  links: Array<{
    label: string;
    href: string;
    kind: 'repo' | 'pr' | 'issue' | 'file' | 'doc' | 'external';
  }>;

  redaction: {
    containsRawTranscript: false;
    containsAbsoluteLocalPath: boolean;
    containsPromptText: boolean;
    reviewedByUser: boolean;
  };
}
```

MVP rule: `containsRawTranscript` must be false.

## Local Agent Record Schema Extensions

Personal Agent Center state should reserve fields that make future sharing possible without forcing
sharing now.

```ts
interface LocalAgentSharingFieldsV1 {
  stableAgentId: string;
  ownerUserId?: string;
  teamId?: string;
  projectId?: string;
  visibility: Visibility;
  shareState: 'not_shared' | 'drafted' | 'shared' | 'revoked' | 'sync_pending' | 'sync_failed';
  shareUpdatedAtMs?: number;

  repoContext?: {
    repoRootHash?: string;
    repoSlug?: string;
    currentBranch?: string;
    baseBranch?: string;
    headCommitSha?: string;
    upstreamRemoteHash?: string;
  };

  handoff?: {
    latestHandoffArtifactId?: string;
    latestHandoffPath?: string;
    latestHandoffStatus?: 'draft' | 'published' | 'reviewed' | 'stale';
  };

  privacy?: {
    transcriptSharingAllowed: false;
    pathRedaction: 'hash' | 'repo_relative' | 'none';
    promptTextSharingAllowed: false;
  };
}
```

Rules:

- `stableAgentId` should survive local agent id changes where possible.
- Local numeric `agent.id` is a UI/runtime id, not a team-wide identity.
- Repo-relative paths are safer than absolute paths, but still require user review.
- Team sharing fields should be inert until a Team/Lab implementation package uses them.

## Synchronization Options

### Option 1: No Server, Repo Artifacts Only

The extension writes handoff notes/artifacts into the repo after user approval.

Pros:

- Fully local-first.
- Uses existing git permissions.
- No new identity provider.
- Easy to inspect and version.

Cons:

- No live team dashboard.
- Sync depends on git workflow.
- Revocation is limited once artifacts are committed.

Recommended first bridge.

### Option 2: Local Network Peer Sync

Clients discover each other or connect to a local relay.

Pros:

- No hosted service.
- Useful for small labs on the same network.

Cons:

- Harder Windows networking story.
- Identity and trust are tricky.
- Not ideal for remote teams.

Not recommended as the first MVP unless the product explicitly targets one physical lab.

### Option 3: Optional Team Sync Service

A small service syncs approved metadata and artifacts.

Pros:

- Enables live team dashboard.
- Supports membership, revocation, audit, and cross-repo views.
- Can keep raw transcript sharing disabled by design.

Cons:

- Requires auth, server security, storage, and operations.
- Adds product complexity and trust burden.
- Must avoid becoming a surveillance backend.

Recommended only after repo-centered collaboration proves useful.

### Option 4: Existing Platform Integration

Use GitHub/GitLab APIs, PR comments, issue comments, or project boards as the shared surface.

Pros:

- Uses existing identity and repo permissions.
- Handoff lives where review already happens.

Cons:

- Requires provider-specific integrations.
- Can leak too much if users post generated summaries carelessly.
- Harder to support offline.

Good as an optional integration, not the only sharing model.

## Possible Server / Platform Architecture

If a team sync service is introduced, keep it narrow.

Client components:

- Local Pixel Agents Multi extension.
- Local normalized usage store.
- Local handoff/artifact generator.
- Local redaction and review flow.
- Optional sync client that uploads approved records only.

Server components:

- Team membership service.
- Project registry keyed by repo remote hash or configured project id.
- Artifact index.
- Agent status snapshot store.
- Team usage aggregate store.
- Audit log.
- Websocket or polling channel for live status.

Server should not store by default:

- Raw transcript text.
- Provider credentials.
- Absolute local paths.
- Raw shell output.
- Full prompt history.

Suggested storage split:

- Short-lived live status snapshots for current dashboard state.
- Append-only audit events for sharing, revocation, and artifact lifecycle.
- Aggregated usage records with redacted project/member identifiers.
- Optional artifact blobs that are user-approved and redacted.

## Auth And Identity Considerations

MVP repo-centered phase:

- Identity can come from local git config, commit author, or user-entered display name.
- Repo permissions are enforced by git hosting or local team workflow.
- Pixel Agents Multi does not need a central auth system.

Optional team sync phase:

- Use explicit team membership.
- Prefer existing identity providers such as GitHub OAuth, GitLab OAuth, or organization SSO.
- Team ids and user ids should be stable.
- Local devices should have revocable tokens.
- The server should support least-privilege scopes:
  - read team status,
  - publish own artifacts,
  - publish own usage aggregates,
  - administer team membership.

Identity rules:

- A user owns their local agent records.
- Team admins should not gain raw transcript access by default.
- Shared artifacts should record who published them and when.
- Service accounts or bots should be labeled distinctly from people.

## Audit Trail Model

Audit trails should answer who shared what, when, and at what visibility.

Audit event examples:

- `artifact.created`
- `artifact.shared`
- `artifact.updated`
- `artifact.revoked`
- `handoff.generated`
- `handoff.published`
- `visibility.changed`
- `usage.aggregate.shared`
- `team.member.added`
- `team.member.removed`
- `sync.failed`

```ts
interface TeamAuditEventV1 {
  schemaVersion: 1;
  eventId: string;
  eventKind: string;
  occurredAtMs: number;
  actorUserId: string;
  teamId?: string;
  projectId?: string;
  artifactId?: string;
  agentStableId?: string;
  previousVisibility?: Visibility;
  nextVisibility?: Visibility;
  summary: string;
  metadata?: Record<string, string | number | boolean>;
}
```

Audit rules:

- Audit event summaries must be safe to show at their visibility level.
- Audit logs should not contain raw prompts or transcripts.
- Revocation should add an audit event rather than deleting historical evidence silently.
- Local-only audit can exist before server sync.

## Usage Intelligence Across Team Members

Team Usage Intelligence should aggregate opt-in records from the W4-C usage model.

Team dimensions:

- Team member.
- Project.
- Provider.
- Model.
- Agent role/team name.
- Time window.
- Exact/estimated/mixed usage.
- Token category.
- API proxy estimate only.
- Outcome links: handoff, branch, commit, PR, test report.

Privacy rules:

- Default to aggregate usage, not per-prompt history.
- Redact absolute paths.
- Preserve exact/estimated/proxy labels.
- Do not present usage as productivity ranking.
- Do not show member-level detail unless the member opted into team-visible usage.
- Allow project-level aggregate without exposing private agent/session ids.

Useful team questions:

- Which projects consumed the most AI-agent usage this week?
- Which provider/model mix is near quota or threshold?
- Which handoffs or PRs correspond to high-usage agent work?
- Are repeated failed tasks consuming usage without outcomes?
- Are cache or reasoning patterns changing across the team?

## Risks And Mitigations

### Risk: Surveillance Framing

Team dashboards can easily feel like monitoring people.

Mitigation:

- Default private.
- Require opt-in sharing.
- Share outcomes and handoffs, not raw transcripts.
- Avoid productivity scores.
- Use language like work state, handoff, artifact, and review, not surveillance or monitoring.

### Risk: Raw Transcript Leakage

Generated summaries may accidentally include sensitive prompt/output text.

Mitigation:

- Redaction profiles.
- User review before publish.
- `containsRawTranscript: false` requirement for MVP shared artifacts.
- Path and prompt-text warnings before publishing.

### Risk: Misleading Usage Aggregates

Estimated and exact usage can be mixed incorrectly.

Mitigation:

- Reuse W4-C exact/estimated/mixed labels.
- Aggregate normalized deltas, not raw cumulative snapshots.
- Keep API proxy estimate separate from billing.

### Risk: Duplicate Or Stale Agent State

Team sync can amplify local adoption bugs.

Mitigation:

- Do not build Team/Lab before personal Agent Center state is stable.
- Share stable agent ids and artifact ids, not transient local numeric ids.
- Make stale snapshots expire.

### Risk: Revocation Expectations

Once repo artifacts are committed or PR comments are posted, revocation is not absolute.

Mitigation:

- Explain revocation limits.
- Support local/team visibility downgrade.
- Add audit events for revocation.
- Prefer drafts before publish.

### Risk: Server Trust Burden

A team sync service changes the privacy posture.

Mitigation:

- Keep server optional.
- Store approved metadata only.
- Do not store raw transcripts by default.
- Use least-privilege auth scopes.

## Phased Rollout Plan

### Phase 1: Personal Local Cockpit

Finish and stabilize:

- Agent Center 2.0.
- Usage Intelligence.
- Timeline action history.
- Provider diagnostics.
- Local release verification.

Exit criteria:

- Personal all-agent management is reliable.
- Usage exact/estimated labels are trustworthy.
- Timeline preserves action history.

### Phase 2: Repo-Centered Collaboration

Add user-approved handoff artifacts in repositories.

Scope:

- Handoff draft generation.
- Repo artifact schema.
- Branch/commit/PR links.
- Manual publish flow.
- No team server required.

Exit criteria:

- A user can create a redacted handoff note from an agent/session.
- The handoff can be committed or attached to a PR manually.
- No raw transcript text is included by default.

### Phase 3: Shared Handoff Protocol

Make handoff artifacts machine-readable and indexable.

Scope:

- `SharedArtifactV1`.
- `TeamAuditEventV1` local log.
- Project timeline from repo artifacts.
- Agent Center/Timeline links to handoffs.

Exit criteria:

- Pixel Agents Multi can list shared handoffs from a repo.
- Handoff status can be draft, published, reviewed, or stale.
- Timeline correlates agent work with branch/commit/PR artifacts.

### Phase 4: Optional Team Sync Service

Introduce live team status only after repo-centered workflow proves useful.

Scope:

- Team/project membership.
- Approved status snapshots.
- Approved shared artifacts.
- Aggregated usage sync.
- Audit log and revocation events.

Exit criteria:

- A 3-5 person team can opt into a shared lab space.
- Members see only approved metadata/artifacts by default.
- Local personal cockpit continues working offline.

### Phase 5: Team/Lab Dashboard

Build the team-facing dashboard.

Scope:

- Team room status.
- Project collaboration map.
- Handoff feed.
- Team Usage Intelligence.
- Review queue.

Exit criteria:

- Team lead can see work state and handoffs without raw transcript access.
- Team members can publish/revoke/update their own artifacts.
- Usage aggregates are clearly exact/estimated/proxy-labeled.

## Future MVP Acceptance Criteria

A future Team/Lab MVP is acceptable when:

- Personal local cockpit remains fully usable without a server.
- Default visibility for local agent data is private.
- Raw transcripts and prompts are not synced by default.
- Users can create a redacted handoff note from an agent/session.
- Handoff notes include status, project, branch/commit/PR links, validation, follow-up, and usage
  snapshot.
- Shared artifact records have schema versions and visibility metadata.
- Repo-centered artifacts can be listed and linked from Agent Center or Timeline.
- Team sync, if enabled, uploads approved metadata/artifacts only.
- Team Usage Intelligence aggregates opt-in records with exact/estimated/proxy labels.
- Member-level usage is not shown unless that member opted into team-visible usage.
- Audit events record sharing, visibility changes, and revocation.
- The product copy makes clear that Team/Lab Mode is for coordination and handoff, not surveillance.
- A reviewer can understand agent work from handoff artifacts without raw transcript access.
