import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIdentityRows,
  buildIdentitySummary,
  DEFAULT_BUILD_IDENTITY,
  normalizeBuildIdentity,
} from '../src/components/buildIdentityModel.ts';

test('build identity summary includes private fork identity fields', () => {
  const identity = normalizeBuildIdentity({
    extensionId: 'raychen.pixel-agents-multi',
    displayName: 'Pixel Agents Multi',
    packageVersion: '1.3.0',
    dataRoot: '~/.pixel-agents-multi',
    buildCommit: 'unknown',
    runtimeSource: 'production',
  });

  const summary = buildIdentitySummary(identity);

  assert.match(summary, /Extension ID: raychen\.pixel-agents-multi/);
  assert.match(summary, /Display name: Pixel Agents Multi/);
  assert.match(summary, /Version: 1\.3\.0/);
  assert.match(summary, /Data root: ~\/\.pixel-agents-multi/);
  assert.match(summary, /Build commit: unknown/);
  assert.match(summary, /Runtime source: production/);
});

test('build identity normalizer fills conservative defaults for malformed payloads', () => {
  const identity = normalizeBuildIdentity({
    extensionId: '',
    displayName: undefined,
    packageVersion: 13,
    dataRoot: '',
    buildCommit: null,
    runtimeSource: '',
  });

  assert.deepEqual(identity, DEFAULT_BUILD_IDENTITY);
});

test('build identity rows are stable for Settings display', () => {
  const rows = buildIdentityRows(
    normalizeBuildIdentity({
      packageVersion: '1.3.0',
      runtimeSource: 'development',
    }),
  );

  assert.deepEqual(
    rows.map((row) => row.label),
    ['Extension ID', 'Display name', 'Version', 'Data root', 'Build commit', 'Runtime source'],
  );
  assert.equal(rows.find((row) => row.label === 'Version')?.value, '1.3.0');
  assert.equal(rows.find((row) => row.label === 'Runtime source')?.value, 'development');
});

test('build identity data root avoids leaking absolute local paths', () => {
  const windowsPath = normalizeBuildIdentity({
    dataRoot: 'C:\\Users\\User\\.pixel-agents-multi',
  });
  const uncPath = normalizeBuildIdentity({
    dataRoot: '\\\\server\\share\\.pixel-agents-multi',
  });
  const posixPath = normalizeBuildIdentity({
    dataRoot: '/home/user/.pixel-agents-multi',
  });

  assert.equal(windowsPath.dataRoot, '~/.pixel-agents-multi');
  assert.equal(uncPath.dataRoot, '~/.pixel-agents-multi');
  assert.equal(posixPath.dataRoot, '~/.pixel-agents-multi');
});
