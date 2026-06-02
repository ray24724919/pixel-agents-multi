import { execFileSync } from 'node:child_process';

const requiredFiles = [
  'dist/extension.js',
  'dist/hooks/claude-hook.js',
  'dist/webview/index.html',
  'docs/external-assets.md',
  'docs/release-identity.md',
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'SECURITY.md',
  'icon.png',
];

const excludedPrefixes = [
  '.husky/',
  'server/',
  'docs/roadmap/',
  'e2e/',
  'eslint-rules/',
  'playwright-report/',
  'test-results/',
];

const excludedExact = ['AGENTS.md', 'CLAUDE.md'];

function normalizeVsixPath(line) {
  return line
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^extension\//, '');
}

function looksLikePackagePath(line) {
  if (!line || line.startsWith('>') || line.startsWith('npm ')) {
    return false;
  }
  if (line.includes(' ') || line.includes(':')) {
    return false;
  }
  return /^[A-Za-z0-9._@+/-]+$/.test(line);
}

function runVsceLs() {
  if (process.platform === 'win32') {
    return execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx vsce ls'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  return execFileSync('npx', ['vsce', 'ls'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

let output;
try {
  output = runVsceLs();
} catch (error) {
  const stdout = error.stdout ? String(error.stdout).trim() : '';
  const stderr = error.stderr ? String(error.stderr).trim() : '';
  console.error('Unable to run `npx vsce ls`.');
  console.error('Ensure npm can run VSCE from this checkout, then rerun `npm run verify:vsix`.');
  console.error(error.message);
  if (stdout) {
    console.error(stdout);
  }
  if (stderr) {
    console.error(stderr);
  }
  process.exit(1);
}

const files = new Set(output.split(/\r?\n/).map(normalizeVsixPath).filter(looksLikePackagePath));

const failures = [];

for (const required of requiredFiles) {
  if (!files.has(required)) {
    failures.push(`missing required VSIX file: ${required}`);
  }
}

for (const file of files) {
  if (excludedExact.includes(file)) {
    failures.push(`excluded file is present in VSIX: ${file}`);
  }
  if (file.endsWith('.jsonl')) {
    failures.push(`JSONL transcript must not be packaged: ${file}`);
  }
  for (const prefix of excludedPrefixes) {
    if (file === prefix.slice(0, -1) || file.startsWith(prefix)) {
      failures.push(`excluded path is present in VSIX: ${file}`);
    }
  }
}

if (failures.length > 0) {
  console.error('VSIX contents verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`VSIX contents verified: ${files.size} packaged files checked`);
