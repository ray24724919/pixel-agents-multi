# W3-G Usage blank regression report

Date: 2026-06-01
Branch: `cleanup/w3-g-usage-blank-regression`

## Summary verdict

Pass with caveat.

The current source/build renders Agent Center > Usage with a visible state in Extension Development
Host E2E, and the installed VSIX bundle contains the visible Usage fallback/populated-state strings.
I could not complete normal installed VS Code click-through automation from this Codex session, so
the final normal-window visual check remains a manual/live QA item for W3-I.

## Preflight

Commands:

```powershell
git checkout main
git log -1 --oneline
git status --short --branch
git checkout -b cleanup/w3-g-usage-blank-regression
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"
```

Observed:

```text
401b7ca docs: add W3-I final release handoff package
## main...origin/main [ahead 51]
raychen.pixel-agents-multi@1.3.0
```

No upstream public Pixel Agents extension was listed.

## Reproduction and investigation

I added an E2E assertion that opens **Agent Center**, switches to **Usage**, and polls for one of the
visible Usage states:

```text
Codex usage proxy
Claude usage proxy
No usage to show yet
Usage data unavailable
```

The first draft of the assertion used a new `data-testid`, which failed because the current E2E run
was using the already-built webview bundle before that test-only attribute had been built into
`dist/`. The failure screenshot was useful: it already showed a non-blank Usage tab.

The assertion was then changed to verify user-visible text rather than a new implementation-only
attribute. With that check, E2E passes and proves the rendered Usage body is not blank.

Current E2E Usage state:

```text
CODEX USAGE PROXY
CLAUDE USAGE PROXY
USAGE
2 visible agents tracked in this view
PROVIDER USAGE
AGENT USAGE LEDGER
No token usage has been recorded yet
```

Screenshot captured by the successful E2E run:

```text
test-results/e2e/agent-spawn-starting-a-Cod-a422a-pts-a-child-thread-teammate/attachments/final-screenshot-338e214c60b63d085ba900f66965cae13b454f70.png
```

## Root cause

No product-code render bug was reproducible in the current source/build through Extension
Development Host E2E. The actionable gap was missing integration coverage: previous tests verified
token summary model output and text presence, but did not click the real Agent Center tab in a VS
Code webview.

The user-facing blank state may have come from a stale installed VSIX or a normal-window runtime
state that still needs W3-I live QA. This package rebuilds/reinstalls the VSIX and adds the missing
E2E guard so future blank regressions fail automatically.

## Files changed

- `e2e/helpers/webview.ts`
  - Added `openAgentCenterUsage(frame)`, which opens Agent Center, switches to Usage, and waits for
    visible Usage content.
- `e2e/tests/agent-spawn.spec.ts`
  - Extends the existing mock Codex spawn/adoption E2E to assert Agent Center > Usage is not blank.

No production UI behavior was changed.

## Validation

Commands run:

```powershell
npm run check-types
npm run test:webview
npm run test:server
npm run build
npm run e2e
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
rg -n "Codex usage proxy|Claude usage proxy|No usage to show yet|Usage data unavailable" "$env:USERPROFILE\.vscode\extensions\raychen.pixel-agents-multi-1.3.0\dist\webview"
```

Results:

```text
npm run check-types: passed
npm run test:webview: passed, 22 tests
npm run test:server: passed, 203 tests
npm run build: passed
npm run e2e: passed, 1 test
npx vsce package: passed, pixel-agents-multi-1.3.0.vsix (186 files, 794.22KB)
code --install-extension --force: passed
code --list-extensions: raychen.pixel-agents-multi@1.3.0
installed bundle string check: matched Usage visible-state strings in dist/webview/assets/index-DgDd1Nf6.js
```

## Final Usage state

Extension Development Host E2E opens Agent Center > Usage and sees a visible dashboard body with
provider proxy rows, metrics, provider usage, project usage, and the empty ledger state. The tab is
not blank in this validation path.

## Remaining live-QA limitation

Normal installed VS Code visual automation remains incomplete from this Codex session. W3-I should
reload normal VS Code after W3-G/W3-H are merged and verify Agent Center > Usage in the installed
extension window.
