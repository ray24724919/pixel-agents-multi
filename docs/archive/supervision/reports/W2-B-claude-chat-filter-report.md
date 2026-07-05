# W2-B Execution Report

Spec: [docs/roadmap/supervision/work-packages/W2-B-claude-chat-filter.md](../work-packages/W2-B-claude-chat-filter.md)

## A. Branch + commit SHA

`cleanup/w2-b-claude-chat-filter`

Commit SHA: this report is included in the single W2-B commit; resolve with `git log -1 --oneline cleanup/w2-b-claude-chat-filter` after checkout.

## B. git diff --stat main...cleanup/w2-b-claude-chat-filter

```
 .../reports/W2-B-claude-chat-filter-report.md      |  93 ++++++++++++++++
 package.json                                       |   5 +
 server/__tests__/claudeAdoption.test.ts            | 118 ++++++++++++++++++++-
 server/__tests__/fixtures/claude-modes/chat.jsonl  |   6 ++
 server/__tests__/fixtures/claude-modes/code.jsonl  |   7 ++
 .../__tests__/fixtures/claude-modes/cowork.jsonl   |   2 +
 src/fileWatcher.ts                                 |  80 ++++++++++++--
 7 files changed, 301 insertions(+), 10 deletions(-)
```

## C. Per-file change narrative

- **package.json**: added the contributed `pixel-agents.claude.showChatSessions` boolean setting, default false, with the requested description.
- **src/fileWatcher.ts**: added `isClaudeChatSession(...)`, shared JSONL-header parsing, and a conservative adoption-layer filter in `adoptExternalSession`. The filter runs before `agentCreated` and is bypassed by the new setting. Code/cowork affordance markers short-circuit to non-chat.
- **server/**tests**/fixtures/claude-modes/**: added minimal chat/code/cowork JSONL header fixtures derived from the W2-B investigation.
- **server/**tests**/claudeAdoption.test.ts**: added four chat-filter tests covering classifier behavior, default skip, opt-in adoption, and code/cowork non-chat behavior.
- **docs/roadmap/supervision/reports/W2-B-claude-chat-filter-report.md**: this report.

## D. Implementation choices made

Marker used: Claude chat/no-tools transcripts are identified from the JSONL header by the absence of Claude Code workspace/tool affordance records after a conversation has completed. The helper returns chat only when the header has conversation completion evidence (`assistant`, `last-prompt`, or `ai-title`) and does not contain any of:

- `type: "attachment"`
- `type: "file-history-snapshot"`
- assistant/user content blocks of `tool_use` or `tool_result`
- a `system` init record with a non-empty `tools` array
- cowork sidecar metadata supplied by the caller

Investigation procedure:

- Inspected recent local `~/.claude/projects/**.jsonl` headers and cowork audit/metadata files.
- Ran controlled reference sessions in `/private/tmp/pixel-agents-w2b-claude-modes`:
  - normal: `claude -p --session-id 11111111-1111-4111-8111-111111111111 --output-format json "Reply with exactly: w2b normal"`
  - no-tools/chat-like: `claude -p --tools "" --session-id 22222222-2222-4222-8222-222222222222 --output-format json "Reply with exactly: w2b no tools"`
- Observed that the normal session wrote `attachment` records in the persisted JSONL, while the no-tools conversational session did not. Existing local code-mode sessions also showed `attachment` and/or `file-history-snapshot`; cowork audit JSONL showed `system`/`init` with a populated `tools` array and cowork sidecar metadata.

Reliability assessment: reasonably reliable for persisted/completed sessions, which is what the scanners adopt. The classifier waits for completion evidence so a just-created code transcript without context records is not immediately labeled chat. Edge case: a future Claude version could change header record names; the tests lock the observed fixture shapes.

Alternative markers evaluated and rejected:

- Explicit `mode`, `subtype`, or session id format: no stable chat/code field was present in regular project JSONL headers.
- Pure absence of tool use: rejected because normal code sessions may not use tools in a short conversation.
- `entrypoint` or `permissionMode`: rejected because normal code and no-tools sessions shared `entrypoint: "sdk-cli"` and `permissionMode: "default"` in the controlled samples.
- Directory marker: rejected because normal and no-tools sessions both lived under `~/.claude/projects/<cwd-hash>/`.

## E. Scope filter / setting behavior

The filter is enabled by default through `pixel-agents.claude.showChatSessions: false`. When the setting is true, `adoptExternalSession` bypasses the chat classifier and adopts chat sessions normally. No UI changes were added.

## F. restoreAgents / persisted chat-mode agents

No explicit migration was added. Persisted chat agents are expected to fall out through the existing stale/external cleanup behavior as specified. The package only filters future adoption before `agentCreated`.

## G. Final summary lines

- `npm run build`: ✓ built in 189ms
- `npm test`: Test Files 11 passed (11) / Tests 165 passed (165)

## H. Acceptance criteria check

1. PASS — default `showChatSessions=false` skips chat fixture adoption before `agentCreated`.
2. PASS — `showChatSessions=true` adopts the same chat fixture.
3. PASS — code fixture still adopts normally with the setting false.
4. PASS — cowork fixture/metadata is classified non-chat and remains outside the filter.
5. PASS — Codex paths were not touched.
6. PASS — no explicit migration was added; existing cleanup remains responsible for persisted stale chat agents.
7. PASS — investigation marker and alternatives are documented in section D.
8. PASS — build green, tests green, 165 total tests.

## I. Out-of-scope findings

None.

## J. Deviations from spec

The installed Claude CLI did not expose `claude chat` as a documented subcommand in `claude --help`; `claude chat --help` was parsed like the top-level help. For the fixture investigation, I used a no-tools conversational reference session (`claude -p --tools ""`) as the observable persisted equivalent of pure chat mode.

## K. Items for supervisor to double-check

Please double-check the classifier conservatism in `isClaudeChatSession`: it intentionally requires completed-conversation evidence and absence of code/cowork markers, rather than filtering on “no tool use” alone.
