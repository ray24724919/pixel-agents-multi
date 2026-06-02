import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const expectedExtension = `${pkg.publisher}.${pkg.name}`;
const expectedVersion = pkg.version;
const expectedInstalledLine = `${expectedExtension}@${expectedVersion}`;
const upstreamExtension = 'pablodelucca.pixel-agents';

function runCodeListExtensions() {
  if (process.platform === 'win32') {
    return execFileSync(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'code --list-extensions --show-versions'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
  }

  return execFileSync('code', ['--list-extensions', '--show-versions'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

let output;
try {
  output = runCodeListExtensions();
} catch (error) {
  const stderr = error.stderr ? String(error.stderr).trim() : '';
  console.error('Unable to run `code --list-extensions --show-versions`.');
  if (process.platform === 'win32') {
    console.error(
      'On Windows, ensure the VS Code CLI is available on PATH, then rerun `npm run verify:installed`.',
    );
  } else {
    console.error(
      'Ensure the VS Code CLI is available on PATH, then rerun `npm run verify:installed`.',
    );
  }
  console.error(error.message);
  if (stderr) {
    console.error(stderr);
  }
  process.exit(1);
}

const installed = output
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const failures = [];

if (!installed.includes(expectedInstalledLine)) {
  const matchingVersions = installed.filter((line) => line.startsWith(`${expectedExtension}@`));
  if (matchingVersions.length > 0) {
    failures.push(
      `expected ${expectedInstalledLine}, but installed version is ${matchingVersions.join(', ')}`,
    );
  } else {
    failures.push(`expected installed extension is missing: ${expectedInstalledLine}`);
  }
}

for (const line of installed) {
  if (line.startsWith(`${upstreamExtension}@`)) {
    failures.push(
      `upstream public extension must not be installed for this release check: ${line}`,
    );
  }
}

const suspiciousPixelAgents = installed.filter((line) => {
  const lower = line.toLowerCase();
  return lower.includes('pixel-agents') && line !== expectedInstalledLine;
});

for (const line of suspiciousPixelAgents) {
  failures.push(`unexpected pixel-agents extension is installed: ${line}`);
}

if (failures.length > 0) {
  console.error('Installed extension verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Installed extension verified: ${expectedInstalledLine}`);
