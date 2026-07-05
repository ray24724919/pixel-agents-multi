# Supervisor Delegation Visibility Draft

Date: 2026-06-02

## Product Idea

When a visible supervisor agent delegates work to background workers, Pixel Agents should not make
the supervisor look idle. The office should show that the supervisor is actively coordinating work,
even when the delegated workers are not ordinary terminal-backed Codex or Claude sessions.

This applies to both Codex and Claude supervisors. The design should be provider-agnostic: Codex
threads, Claude Code sessions, Claude Cowork/local-agent-mode sessions, and future in-app delegated
workers should all be able to express the same high-level relationship.

## User-Facing Goal

The user should be able to glance at the webview and understand:

- This supervisor is working by delegation, not resting.
- The supervisor is currently managing N delegated workers.
- The workers belong to the supervisor's team or child-agent group.
- Delegated work started, progressed, completed, failed, or was cancelled.
- The same visual language works for Codex and Claude.

## Visual Direction

There are two acceptable first designs:

- Conservative: mark the supervisor as `Delegating` or `Supervising` and keep them in a work pose.
- Playful: show the supervisor near a desk, board, or meeting area while small delegate figures or
  team badges indicate the workers being supervised.

The playful version should still be legible and not imply the workers are real terminal agents when
they are only internal app workers. If the delegate is terminal-backed, it can appear as a normal
agent. If it is internal-only, it can appear as a small subordinate/team marker attached to the
supervisor rather than as a full independent office resident.

## State Model

Add a provider-agnostic delegation layer:

```ts
type DelegationStatus = 'none' | 'delegating' | 'waiting_for_delegate' | 'delegate_error';

type DelegationSummary = {
  supervisorAgentId: number;
  providerId: 'codex' | 'claude' | string;
  activeDelegateCount: number;
  completedDelegateCount: number;
  failedDelegateCount: number;
  delegateSource: 'terminal' | 'hook' | 'codex_app_worker' | 'claude_worker' | 'unknown';
  teamName?: string;
  updatedAt: number;
};
```

The supervisor's lifecycle state should treat active delegation as working. It should not collapse to
idle/rest until all known delegates finish, fail, or are cancelled.

## Timeline Events

Add retained timeline events:

- `delegation.started`
- `delegation.progress`
- `delegation.completed`
- `delegation.failed`
- `delegation.cancelled`

Timeline event payloads should be privacy-safe. They can include delegate count, provider, branch,
work-package name, and status. They should not include raw prompts, raw outputs, or private
transcript text.

## Agent Center Requirements

Agents page:

- Add a `Delegating` or `Supervising` status group.
- Sort delegating supervisors above ordinary idle/waiting agents.
- Show a compact delegate count, for example `2 workers`.
- Detail drawer should list delegate summaries when available.

Timeline page:

- Filter delegation events by provider, project, supervisor, and work-package when metadata exists.
- Retain delegation events after a worker disappears or finishes.

Office page:

- Delegating supervisors should stay in a work/supervision pose.
- If team/child-agent visuals are enabled, show delegate markers near the supervisor.
- Do not place internal-only delegates in normal seats as if they were terminal-backed agents.

## Provider Symmetry

Codex and Claude should share the same display states and event names. Provider-specific sources may
differ, but the webview should receive normalized delegation summaries. Examples:

- Codex CLI thread spawning a terminal-backed subagent.
- Claude Cowork/local-agent-mode spawning a teammate.
- Supervisor thread using app-internal background workers.

The UI should not have a Codex-only implementation that leaves Claude supervisors looking idle.

## Open Questions

- Where should app-internal worker state be sourced from if it is not visible in local transcripts?
- Should internal workers appear as miniature team markers, a drawer-only list, or temporary office
  figures?
- Should the supervisor agent reserve a meeting/work zone while delegating?
- How should delegation state persist across VS Code reloads if the worker source is not persistent?

## Acceptance Criteria

- A supervisor with active delegates is visibly working or supervising in the office.
- Agent Center has a readable `Delegating`/`Supervising` state and delegate count.
- Delegation events appear in Timeline and remain after completion.
- Internal app workers are visually distinguished from real terminal-backed agents.
- The design applies equally to Codex and Claude providers.
