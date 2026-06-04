# W9-D Build / Release Identity UI Report

## Summary

W9-D adds a compact Build / Release Identity display so a loaded Pixel Agents Multi webview can show which private fork build is running. The identity payload is posted from the extension during the existing `webviewReady` settings load and is rendered in the Settings modal.

## Identity Payload

The backend sends safe metadata in `settingsLoaded.buildIdentity`:

- extension id: `raychen.pixel-agents-multi`
- display name: `Pixel Agents Multi`
- package version from the extension package metadata
- data root label: `~/.pixel-agents-multi`
- build commit: `unknown`
- runtime source: `development`, `production`, `test`, or `unknown` from `vscode.ExtensionMode`

The build commit is intentionally `unknown` for this package because there is no established build-time generated commit constant and runtime shelling out to Git would make installed VSIX behavior depend on a local repository.

## UI Behavior

The Settings modal now includes a `Build / Release Identity` block with stable diagnostic rows and a `Copy` button. The copy action uses the browser Clipboard API when available and shows `Copied` or `Copy failed` state instead of silently failing.

The webview model normalizes malformed identity payloads back to private-fork defaults and refuses to render accidental absolute local data-root paths, preferring the safe `~/.pixel-agents-multi` label.

## Files Changed

- `src/PixelAgentsViewProvider.ts`
- `webview-ui/src/App.tsx`
- `webview-ui/src/components/SettingsModal.tsx`
- `webview-ui/src/components/buildIdentityModel.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/test/build-identity-model.test.ts`

## Validation

- `npm run build` passed.
- `npm run test:webview` passed: 104 tests.
- `npm run test:server` passed: 239 tests.
- `npm run verify:identity` passed: `raychen.pixel-agents-multi@1.3.0`.
- `git diff --check` passed.

## Known Limitations

- Build commit is `unknown` until a simple build-time commit stamping path is added.
- Manual installed-VSIX confirmation was not performed in this code package.
