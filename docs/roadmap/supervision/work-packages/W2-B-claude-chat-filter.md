# Work Package W2-B — Claude chat-mode filter

## Context (read first)

User's vision: a Claude + Codex work-status platform that surfaces **working agents only** — actively coding/researching sessions. The user has explicitly stated they want pixel-agents to show:

- Claude **code** mode sessions ✅ (already adopted)
- Claude **cowork** mode sessions ✅ (already adopted)
- Codex **code** sessions ✅ (already adopted, plus W2-A external sync)

And NOT show:

- Claude **chat** mode sessions ❌ (user: "chat 沒有必要")

Today, all Claude sessions get adopted regardless of mode. This package adds a filter so chat-mode sessions are skipped.

### What "chat mode" means

`claude` (the CLI) supports at least three modes:

- `claude` (default) — Claude Code mode, file operations + tool use
- `claude cowork` — collaborative agents mode, has sidecar metadata
- `claude chat` — pure conversational mode, no tool use

The exact storage/marker for these modes is NOT documented in this repo. The executor's first job is to **investigate how mode information surfaces in the Claude session artifacts** before writing any filter code.

### What you'll be working with

- `src/fileWatcher.ts:842` — `adoptExternalSessionFromHook` (entry point for hook-driven adoption)
- `src/fileWatcher.ts:952` — `adoptExternalSession` (shared adopter — the one W1-C made the "last line of defense" with `hasAgentForJsonlFile`)
- `src/fileWatcher.ts:1121` — `scanClaudeCoworkSessions` (cowork-specific scanner)
- The scanner sites that eventually call `adoptExternalSession` (`scanClaudeRecentSessions` and the cowork path)
- `~/.claude/projects/<hash>/<sessionId>.jsonl` — actual Claude transcripts on disk
- Optional: `~/.claude/` may have other metadata files for cowork (`metadata.threadName` is read from a sidecar — see lines around 1141, 1612 in fileWatcher.ts)

## In scope

1. **Investigate the chat-mode marker**: read several Claude JSONL files from your local `~/.claude/projects/` (or create reference ones via running `claude chat` vs `claude code` vs `claude cowork` if needed) and document how chat-mode sessions differ from code/cowork sessions. Candidates the executor should evaluate:
   - A field in the first record (`session_meta` style, or `mode`, or `subtype`)
   - The presence/absence of tool_use blocks in the early records
   - A sidecar file alongside the JSONL
   - The session id format
   - A directory marker (e.g. chat sessions live in a different folder)
     Pick the most reliable marker and document it in your final report (section "Implementation choices made").

2. **Filter chat-mode sessions out of adoption**: in `adoptExternalSession` (or earlier, in the calling scanners), reject Claude chat-mode candidates before any `agentCreated` postMessage. Cowork and code remain visible.

3. **Provide an escape hatch**: contributed setting `pixel-agents.claude.showChatSessions` (boolean, default `false`). When true, the filter is bypassed and chat sessions are adopted normally.

4. **Existing chat-mode agents on disk**: if persisted state has any chat-mode agents from before this package landed, they should be silently dropped on the next scan (let the existing stale cleanup take care of them — don't add new removal logic).

## Out of scope (do NOT touch)

- Codex (no chat mode concept).
- Claude code or cowork adoption behavior (only filter chat).
- AgentCenter UI changes (the filter operates at the adoption layer; UI sees fewer agents naturally).
- Title extraction / dedup invariants (W1-C handles these; do not duplicate or replace).
- The `+Agent` modal Provider picker (W1-A's contract is fine).

## Required changes (end-state described)

### `package.json`

- Add contributed setting `pixel-agents.claude.showChatSessions`:
  - type: `boolean`
  - default: `false`
  - description: `When enabled, Pixel Agents adopts Claude chat-mode sessions in addition to code and cowork. Off by default to reduce noise from non-working conversations.`

### `src/fileWatcher.ts`

- Add a helper `isClaudeChatSession(jsonlFile, metadata?): boolean` near the existing dedup helper `hasAgentForJsonlFile`. Document the chosen marker in a comment.
- Wire the filter into `adoptExternalSession`: early-return null if `isClaudeChatSession(...)` returns true AND `pixel-agents.claude.showChatSessions` is false. Provide a debug-friendly console log explaining the skip.
- If the marker requires reading multiple JSONL lines, extend the existing JSONL header read pattern (similar to W1-C's `extractClaudeTitleFromJsonlHeader`).

### Tests

- Investigation deliverable: a test fixture file (or three) representing chat / cowork / code mode JSONL headers. If creating fixtures requires running `claude` locally, document the procedure in the report and place fixtures under `server/__tests__/fixtures/claude-modes/`.
- New tests in `server/__tests__/claudeAdoption.test.ts` (extend the W1-C file):
  - **Test 1**: `isClaudeChatSession` returns `true` for a chat-mode fixture and `false` for code/cowork fixtures.
  - **Test 2**: `adoptExternalSession` does not create an agent for a chat-mode JSONL when `showChatSessions` setting is false.
  - **Test 3**: `adoptExternalSession` DOES create an agent for the same chat-mode JSONL when `showChatSessions` setting is true.
  - **Test 4**: code and cowork sessions remain unaffected by the filter regardless of setting.
- New test count: ≥3 added. Total must be ≥164 (161 baseline + ≥3 new).

## Guardrails (verbatim from cleanup-framework.md §1)

- **G-1 Polymorphic, never replace**: do NOT delete code adoption or cowork adoption logic. Add a filter, don't remove a path.
- **G-2 One package = one commit on branch `cleanup/w2-b-claude-chat-filter`** based on current `main` (post-W2-A merge).
- **G-3 Scope frozen**: if your investigation reveals that the chat marker isn't reliably extractable from JSONL alone (e.g. requires reading a different file altogether), STOP and surface — propose follow-up rather than expanding scope.
- **G-4 npm run build green + npm test green + user runtime verification**.
- **G-5 Provider symmetry**: this is Claude-only; Codex has no chat mode. Document the asymmetry in the commit body.
- **G-6 No roadmap status edits**.
- **G-7 Preserve known-good list**.

## Acceptance criteria

After build + repackage + reinstall:

1. With `pixel-agents.claude.showChatSessions: false` (default): a Claude chat-mode session (started via `claude chat ...` or equivalent) does NOT appear as an agent in Agent Center. Confirmed via Test 1+2.
2. With the same setting enabled: the same chat session DOES appear. Confirmed via Test 3.
3. Claude code sessions still adopt normally regardless of setting. Confirmed via Test 4.
4. Claude cowork sessions still adopt normally regardless of setting. Confirmed via Test 4.
5. Codex sessions (any) are unaffected.
6. Existing pre-W2-B persisted chat-mode agents are removed on the next stale-cleanup tick (no explicit migration code needed; existing path handles it).
7. The investigation result is clearly documented in the report's "Implementation choices made" section (the marker used + why).
8. `npm run build` and `npm test` green; new tests cover all four behaviors above.

## Verification protocol (user runs after handback)

1. `git checkout cleanup/w2-b-claude-chat-filter`
2. `npm run build && npm test` — green, ≥164 tests.
3. Package + install: `rm -f pixel-agents-*.vsix && npx @vscode/vsce package -o pixel-agents-W2B.vsix && code --install-extension /Users/raychen/Documents/pixel-agents/pixel-agents-W2B.vsix --force` → Reload Window.

**Test 1 — chat hidden by default**:

- In a terminal outside pixel-agents: `claude chat` (or whatever the exact chat-mode invocation is — confirm in the report).
- Send a short message in chat mode.
- Open pixel-agents Agent Center → confirm NO new Claude agent for that session.

**Test 2 — opt-in shows chat**:

- VS Code settings → enable `pixel-agents.claude.showChatSessions` → Reload Window.
- Same chat session as Test 1 should now appear in Agent Center.

**Test 3 — code/cowork unaffected**:

- Disable the setting again, Reload Window.
- Start a `claude` (code) session via + Agent → appears normally.
- Start a `claude cowork` session externally → appears normally.

Record PASS / FAIL per acceptance criterion.

## Reporting back

Write your final report to `docs/roadmap/supervision/reports/W2-B-claude-chat-filter-report.md` and include it in the single W2-B commit. Use the same shape as `reports/W2-A-codex-external-sync-report.md`. The "Implementation choices made" section MUST document:

- Which marker you used to detect chat mode (field name, file location, format).
- How reliable you believe this marker is (always present? edge cases?).
- Any alternative markers you evaluated and why you rejected them.

Do NOT paste the report into a terminal back to the user — just commit it on the branch.
