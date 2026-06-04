export interface BuildIdentity {
  extensionId: string;
  displayName: string;
  packageVersion: string;
  dataRoot: string;
  buildCommit: string;
  runtimeSource: string;
}

export interface BuildIdentityRow {
  label: string;
  value: string;
}

export const DEFAULT_BUILD_IDENTITY: BuildIdentity = {
  extensionId: 'raychen.pixel-agents-multi',
  displayName: 'Pixel Agents Multi',
  packageVersion: 'unknown',
  dataRoot: '~/.pixel-agents-multi',
  buildCommit: 'unknown',
  runtimeSource: 'unknown',
};

function safeIdentityString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function safeDataRootLabel(value: unknown): string {
  const dataRoot = safeIdentityString(value, DEFAULT_BUILD_IDENTITY.dataRoot);
  if (/^[A-Za-z]:[\\/]/.test(dataRoot) || dataRoot.startsWith('\\\\') || dataRoot.startsWith('/')) {
    return DEFAULT_BUILD_IDENTITY.dataRoot;
  }
  return dataRoot;
}

export function normalizeBuildIdentity(value: unknown): BuildIdentity {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    extensionId: safeIdentityString(record.extensionId, DEFAULT_BUILD_IDENTITY.extensionId),
    displayName: safeIdentityString(record.displayName, DEFAULT_BUILD_IDENTITY.displayName),
    packageVersion: safeIdentityString(
      record.packageVersion,
      DEFAULT_BUILD_IDENTITY.packageVersion,
    ),
    dataRoot: safeDataRootLabel(record.dataRoot),
    buildCommit: safeIdentityString(record.buildCommit, DEFAULT_BUILD_IDENTITY.buildCommit),
    runtimeSource: safeIdentityString(record.runtimeSource, DEFAULT_BUILD_IDENTITY.runtimeSource),
  };
}

export function buildIdentityRows(identity: BuildIdentity): BuildIdentityRow[] {
  const normalized = normalizeBuildIdentity(identity);
  return [
    { label: 'Extension ID', value: normalized.extensionId },
    { label: 'Display name', value: normalized.displayName },
    { label: 'Version', value: normalized.packageVersion },
    { label: 'Data root', value: normalized.dataRoot },
    { label: 'Build commit', value: normalized.buildCommit },
    { label: 'Runtime source', value: normalized.runtimeSource },
  ];
}

export function buildIdentitySummary(identity: BuildIdentity): string {
  return buildIdentityRows(identity)
    .map((row) => `${row.label}: ${row.value}`)
    .join('\n');
}
