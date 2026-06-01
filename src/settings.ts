import * as vscode from 'vscode';

import { CONFIG_SECTION, LEGACY_CONFIG_SECTION } from './constants.js';

interface InspectResult<T> {
  key: string;
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
  globalLanguageValue?: T;
  workspaceLanguageValue?: T;
  workspaceFolderLanguageValue?: T;
}

export function getExtensionConfigValue<T>(key: string, defaultValue: T): T {
  const currentConfig = vscode.workspace.getConfiguration(CONFIG_SECTION);
  if (hasConfiguredValue(inspectConfig<T>(currentConfig, key))) {
    return currentConfig.get<T>(key, defaultValue);
  }

  const legacyConfig = vscode.workspace.getConfiguration(LEGACY_CONFIG_SECTION);
  if (hasConfiguredValue(inspectConfig<T>(legacyConfig, key))) {
    return legacyConfig.get<T>(key, defaultValue);
  }

  return currentConfig.get<T>(key, defaultValue);
}

export function isExtensionConfigExplicitlyConfigured<T>(key: string): boolean {
  return (
    hasConfiguredValue(inspectConfig<T>(vscode.workspace.getConfiguration(CONFIG_SECTION), key)) ||
    hasConfiguredValue(
      inspectConfig<T>(vscode.workspace.getConfiguration(LEGACY_CONFIG_SECTION), key),
    )
  );
}

function inspectConfig<T>(
  config: vscode.WorkspaceConfiguration,
  key: string,
): InspectResult<T> | undefined {
  if (typeof config.inspect !== 'function') return undefined;
  return config.inspect<T>(key);
}

function hasConfiguredValue<T>(inspection: InspectResult<T> | undefined): boolean {
  return (
    inspection !== undefined &&
    (inspection.globalValue !== undefined ||
      inspection.workspaceValue !== undefined ||
      inspection.workspaceFolderValue !== undefined ||
      inspection.globalLanguageValue !== undefined ||
      inspection.workspaceLanguageValue !== undefined ||
      inspection.workspaceFolderLanguageValue !== undefined)
  );
}
