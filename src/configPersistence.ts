import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CONFIG_FILE_NAME, LAYOUT_FILE_DIR, LEGACY_LAYOUT_FILE_DIR } from './constants.js';

interface PixelAgentsConfig {
  externalAssetDirectories: string[];
}

const DEFAULT_CONFIG: PixelAgentsConfig = {
  externalAssetDirectories: [],
};

function getConfigFilePath(): string {
  return path.join(os.homedir(), LAYOUT_FILE_DIR, CONFIG_FILE_NAME);
}

function getLegacyConfigFilePath(): string {
  return path.join(os.homedir(), LEGACY_LAYOUT_FILE_DIR, CONFIG_FILE_NAME);
}

export function readConfig(): PixelAgentsConfig {
  return readConfigFile(getConfigFilePath(), true);
}

function readConfigFile(filePath: string, allowLegacyMigration: boolean): PixelAgentsConfig {
  try {
    if (!fs.existsSync(filePath)) {
      if (allowLegacyMigration) {
        const legacy = readConfigFile(getLegacyConfigFilePath(), false);
        if (legacy.externalAssetDirectories.length > 0) {
          console.log(
            '[Pixel Agents] Migrating config from ~/.pixel-agents to ~/.pixel-agents-multi',
          );
          writeConfig(legacy);
        }
        return legacy;
      }
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PixelAgentsConfig>;
    return {
      externalAssetDirectories: Array.isArray(parsed.externalAssetDirectories)
        ? parsed.externalAssetDirectories.filter((d): d is string => typeof d === 'string')
        : [],
    };
  } catch (err) {
    console.error(`[Pixel Agents] Failed to read config file ${filePath}:`, err);
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: PixelAgentsConfig): void {
  const filePath = getConfigFilePath();
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const json = JSON.stringify(config, null, 2);
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, json, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error('[Pixel Agents] Failed to write config file:', err);
  }
}
