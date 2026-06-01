# Work Package W3-C - Usage and token display polish

## Context

W2-H improved token accuracy and introduced richer token details. The user also referenced
`iangithub/llm-usage-dashboard` as inspiration for improving token usage calculation/display.

After a rejected dashboard-style Agent Center experiment, the UI is intentionally back to the
pixel modal style. W3-C should improve correctness and clarity without redesigning the page.

## Goal

Make Usage information reliable, understandable, and non-blank in the existing pixel Agent Center.

Requirements:

1. Usage tab always renders a visible state:
   - populated data, or
   - empty state, or
   - explicit fallback error panel.
2. Codex exact token usage is clearly distinguished from estimates.
3. Claude exact/estimated usage is clearly distinguished from Codex usage.
4. Cache, reasoning, and artifact estimates are not double-counted.
5. Provider cost text is clearly labeled as a proxy/estimate and does not imply real billing
   charges when the provider is subscription-based.
6. Token totals in Agent Center match the office overlay for the same visible agent set.

## Non-goals

Do not:

- redesign Agent Center into a dashboard page
- add charts unless they fit the current pixel modal without crowding
- pull code from external repositories
- call provider APIs
- change provider adoption/scanning
- change extension identity/publishing metadata

## Files to inspect

- `src/tokenUsage.ts`
- `src/transcriptParser.ts`
- `src/PixelAgentsViewProvider.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/TokenCostSummary.tsx`
- `webview-ui/src/office/components/RoomTokenCostSummary.tsx`
- `webview-ui/src/office/components/ToolOverlay.tsx`
- `webview-ui/src/office/types.ts`
- token-related tests under `server/__tests__/`

## External reference policy

If using the `llm-usage-dashboard` project for ideas, inspect it as design inspiration only.
Do not copy code. Summarize which ideas were adopted or rejected in the report.

Candidate ideas to evaluate:

- clear provider breakdown
- date/project grouping
- exact vs estimated badge
- cache/reasoning/artifact separation
- quota reset display

## Tests

Add tests only where the logic changes. Candidate tests:

- usage detail totals do not double-count cache or reasoning
- Usage tab empty state renders with no agents
- Usage fallback catches render-time errors
- provider cost copy uses proxy wording

Expected validation:

```powershell
npm run check-types
npm run test:webview
npm run test:server
npm run build
```

Package/install if webview output changes:

```powershell
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
```

## Report

Write:

```text
docs/roadmap/supervision/reports/W3-C-usage-token-polish-report.md
```

Include:

- Current behavior audited.
- Any adopted ideas from the external dashboard.
- Exact vs estimated behavior.
- Tests run.
- Screenshots or textual runtime evidence if available.

## Commit

One commit on the current branch. Do not push, merge, rebase, or amend.

Suggested commit:

```text
fix: clarify agent usage display
```
