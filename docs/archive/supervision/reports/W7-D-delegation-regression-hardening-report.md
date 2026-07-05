# W7-D Delegation Regression Hardening Report

## Summary

Implemented W7-D as a pure code and automated-test hardening pass. No Extension Host, installed VSIX, desktop QA, or UI redesign work was performed.

## Hardening Implemented

- Added stateful Codex transcript delegation correlation in `server/src/providers/file/codex/codex.ts`.
- `parseCodexTranscriptLine(...)` now accepts optional `CodexTranscriptParserState`.
- Delegation outputs containing `agent_id` are only treated specially when their `call_id` matches a previously seen Codex delegation tool call.
- Supported delegation tool names are:
  - `spawn_agent`
  - `Agent`
  - `Task`
- Unrelated tools that output JSON containing `agent_id` continue to produce normal `toolEnd` events.
- Codex delegation statuses use safe labels such as `Subtask: worker` or `Subtask: reviewer` and do not expose raw prompt text, transcript paths, or tool output.
- `src/transcriptParser.ts` now keeps the parser state per agent and clears pending delegation call IDs on turn boundaries.

## Tests Added

- `server/__tests__/codex.test.ts`
  - Current Codex `multi_agent_v1.spawn_agent` sequence keeps the delegation marker active.
  - Unrelated `agent_id` tool outputs are not treated as delegation.
  - Codex `Agent` and `Task` names are tracked as delegation tools.
  - Safe subtask formatting avoids raw prompt/path text.
  - JSONL fixture tests cover current Codex spawn output and non-delegation `agent_id` output.
- `server/__tests__/fixtures/codex-spawn-agent-current.jsonl`
- `server/__tests__/fixtures/codex-agent-id-non-delegation-output.jsonl`
- `webview-ui/test/delegation-timeline-model.test.ts`
  - Repeated delegation snapshots do not duplicate `started`, `progress`, `completed`, or `cancelled`.
  - Initial error snapshots emit `started` and `failed` once, then do not repeat.
- `webview-ui/test/office-delegation-visuals.test.ts`
  - Pure smoke test derives a visible Codex `1w` delegation marker from model state without VS Code click-through.

## Files Changed

- `server/src/providers/file/codex/codex.ts`
- `src/transcriptParser.ts`
- `src/types.ts`
- `server/__tests__/codex.test.ts`
- `server/__tests__/fixtures/codex-spawn-agent-current.jsonl`
- `server/__tests__/fixtures/codex-agent-id-non-delegation-output.jsonl`
- `webview-ui/test/delegation-timeline-model.test.ts`
- `webview-ui/test/office-delegation-visuals.test.ts`

## Validation

- `npm run build`: passed.
- `npm run test:webview`: passed, 76 tests.
- `npm run test:server`: passed, 231 tests.
- `git diff --check`: passed.

## Notes

- This package intentionally did not open Extension Host or perform desktop/manual QA.
- The hardening path is conservative: if an output has `agent_id` but no correlated delegation call ID, Pixel Agents treats it as ordinary tool output.
