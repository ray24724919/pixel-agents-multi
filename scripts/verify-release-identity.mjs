import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const expected = {
  name: 'pixel-agents-multi',
  displayName: 'Pixel Agents Multi',
  publisher: 'raychen',
  version: '1.3.0',
  extensionId: 'raychen.pixel-agents-multi',
  viewContainerId: 'pixel-agents-multi-panel',
  webviewId: 'pixel-agents-multi.panelView',
  commandPrefix: 'pixel-agents-multi.',
  commandTitlePrefix: 'Pixel Agents Multi:',
  settingPrefix: 'pixel-agents-multi.',
};

const failures = [];

function fail(message) {
  failures.push(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function normalizeText(text) {
  return text.replace(/\r\n/g, '\n');
}

function collectConfigurationProperties(configuration) {
  if (Array.isArray(configuration)) {
    return configuration.flatMap((entry) => Object.keys(entry.properties ?? {}));
  }
  return Object.keys(configuration?.properties ?? {});
}

function assertEqual(label, actual, wanted) {
  if (actual !== wanted) {
    fail(`${label}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
  }
}

const pkg = readJson('package.json');

assertEqual('package.name', pkg.name, expected.name);
assertEqual('package.displayName', pkg.displayName, expected.displayName);
assertEqual('package.publisher', pkg.publisher, expected.publisher);
assertEqual('package.version', pkg.version, expected.version);

const commands = pkg.contributes?.commands ?? [];
for (const command of commands) {
  if (!command.command?.startsWith(expected.commandPrefix)) {
    fail(`command id must start with ${expected.commandPrefix}: ${command.command}`);
  }
  if (!command.title?.startsWith(expected.commandTitlePrefix)) {
    fail(`command title must start with ${expected.commandTitlePrefix}: ${command.title}`);
  }
}

const activationEvents = pkg.activationEvents ?? [];
for (const event of activationEvents) {
  if (
    event.startsWith('onCommand:') &&
    !event.slice('onCommand:'.length).startsWith(expected.commandPrefix)
  ) {
    fail(`activation command must use ${expected.commandPrefix}: ${event}`);
  }
  if (event.startsWith('onView:') && event !== `onView:${expected.webviewId}`) {
    fail(`activation view must be ${expected.webviewId}: ${event}`);
  }
}

const panelContainers = pkg.contributes?.viewsContainers?.panel ?? [];
if (!panelContainers.some((container) => container.id === expected.viewContainerId)) {
  fail(`viewsContainers.panel must include ${expected.viewContainerId}`);
}

const views = pkg.contributes?.views ?? {};
const contributedViews = Object.values(views).flat();
if (!contributedViews.some((view) => view.id === expected.webviewId)) {
  fail(`contributes.views must include webview id ${expected.webviewId}`);
}
if (!Object.prototype.hasOwnProperty.call(views, expected.viewContainerId)) {
  fail(`contributes.views must be keyed by ${expected.viewContainerId}`);
}

const settingKeys = collectConfigurationProperties(pkg.contributes?.configuration);
for (const key of settingKeys) {
  if (!key.startsWith(expected.settingPrefix)) {
    fail(`setting key must start with ${expected.settingPrefix}: ${key}`);
  }
}

const requiredTextChecks = [
  {
    file: 'src/constants.ts',
    snippets: [
      `EXTENSION_PUBLISHER = '${expected.publisher}'`,
      `EXTENSION_NAME = '${expected.name}'`,
      `DISPLAY_NAME = '${expected.displayName}'`,
      'CONFIG_SECTION = EXTENSION_NAME',
      'VIEW_CONTAINER_ID = `${EXTENSION_NAME}-panel`',
      'VIEW_ID = `${EXTENSION_NAME}.panelView`',
    ],
  },
  {
    file: 'server/src/constants.ts',
    snippets: [
      "SERVER_JSON_DIR = '.pixel-agents-multi'",
      "HOOK_SCRIPTS_DIR = '.pixel-agents-multi/hooks'",
    ],
  },
  {
    file: 'docs/release-identity.md',
    snippets: [
      expected.extensionId,
      expected.viewContainerId,
      expected.webviewId,
      'pixel-agents-multi.*',
      '~/.pixel-agents-multi',
    ],
  },
  {
    file: 'README.md',
    snippets: [expected.extensionId],
  },
  {
    file: 'CHANGELOG.md',
    snippets: [expected.extensionId, 'pixel-agents-multi-<version>.vsix'],
  },
];

for (const check of requiredTextChecks) {
  const text = readText(check.file);
  for (const snippet of check.snippets) {
    if (!text.includes(snippet)) {
      fail(`${check.file} must include ${JSON.stringify(snippet)}`);
    }
  }
}

const identityFiles = [
  'package.json',
  'src/constants.ts',
  'server/src/constants.ts',
  'docs/release-identity.md',
  'README.md',
  'CHANGELOG.md',
];

const allowedLegacyContext = [
  'legacy',
  'fallback',
  'derived',
  'original',
  'public',
  'fork',
  'migration',
  'imported',
  'contributors',
  'github.com/pablodelucca/pixel-agents',
  'pablodelucca',
  'pull/',
  'issues/',
  'closes',
  'supersedes',
  '.pixel-agents',
  'pixel-agents.*',
];

function containsLegacyIdentity(line) {
  const withoutMulti = line.replace(/pixel-agents-multi/g, '');
  return /pablodelucca[./]pixel-agents|pablodelucca\.pixel-agents|\bpixel-agents\b/.test(
    withoutMulti,
  );
}

function hasAllowedLegacyContext(line) {
  const lower = line.toLowerCase();
  return allowedLegacyContext.some((token) => lower.includes(token));
}

for (const file of identityFiles) {
  const lines = normalizeText(readText(file)).split('\n');
  lines.forEach((line, index) => {
    if (!containsLegacyIdentity(line)) {
      return;
    }
    if (file === 'package.json') {
      fail(`${file}:${index + 1} contains unexpected legacy/public identity: ${line.trim()}`);
      return;
    }
    if (!hasAllowedLegacyContext(line)) {
      fail(
        `${file}:${index + 1} contains legacy/public identity outside an allowed context: ${line.trim()}`,
      );
    }
  });
}

if (failures.length > 0) {
  console.error('Release identity verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Release identity verified: ${expected.extensionId}@${expected.version}`);
