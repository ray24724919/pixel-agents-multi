import { describe, expect, it, vi } from 'vitest';

const configState = vi.hoisted(
  () =>
    new Map<
      string,
      {
        values: Record<string, unknown>;
        explicit: Set<string>;
      }
    >(),
);

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn((section: string) => {
      const state = configState.get(section) ?? { values: {}, explicit: new Set<string>() };
      return {
        get: vi.fn((key: string, fallback: unknown) =>
          key in state.values ? state.values[key] : fallback,
        ),
        inspect: vi.fn((key: string) => ({
          key,
          defaultValue: undefined,
          globalValue: state.explicit.has(key) ? state.values[key] : undefined,
        })),
      };
    }),
  },
}));

const { getExtensionConfigValue, isExtensionConfigExplicitlyConfigured } =
  await import('../../src/settings.js');

describe('extension settings namespace', () => {
  it('uses pixel-agents-multi settings before legacy pixel-agents settings', () => {
    configState.clear();
    configState.set('pixel-agents-multi', {
      values: { 'codex.discoverAllCwds': false },
      explicit: new Set(['codex.discoverAllCwds']),
    });
    configState.set('pixel-agents', {
      values: { 'codex.discoverAllCwds': true },
      explicit: new Set(['codex.discoverAllCwds']),
    });

    expect(getExtensionConfigValue<boolean>('codex.discoverAllCwds', true)).toBe(false);
    expect(isExtensionConfigExplicitlyConfigured<boolean>('codex.discoverAllCwds')).toBe(true);
  });

  it('falls back to legacy pixel-agents settings when the new namespace is unset', () => {
    configState.clear();
    configState.set('pixel-agents-multi', {
      values: {},
      explicit: new Set(),
    });
    configState.set('pixel-agents', {
      values: { 'claude.commandPath': 'C:\\tools\\claude.cmd' },
      explicit: new Set(['claude.commandPath']),
    });

    expect(getExtensionConfigValue<string>('claude.commandPath', 'claude')).toBe(
      'C:\\tools\\claude.cmd',
    );
    expect(isExtensionConfigExplicitlyConfigured<string>('claude.commandPath')).toBe(true);
  });
});
