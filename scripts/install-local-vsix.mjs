import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const extensionId = `${pkg.publisher}.${pkg.name}`;
const vsixName = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(rootDir, vsixName);

function runBin(command, args) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
}

if (!fs.existsSync(vsixPath)) {
  console.error(`Missing ${vsixName}. Run \`npm run package:vsix\` first.`);
  process.exit(1);
}

runBin('code', ['--install-extension', vsixPath, '--force']);
console.log(`Installed ${extensionId}@${pkg.version} from ${vsixName}`);
