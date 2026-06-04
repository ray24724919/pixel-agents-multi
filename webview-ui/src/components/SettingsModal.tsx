import { useState } from 'react';

import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { vscode } from '../vscodeApi.js';
import {
  type BuildIdentity,
  buildIdentityRows,
  buildIdentitySummary,
} from './buildIdentityModel.js';
import { Button } from './ui/Button.js';
import { Checkbox } from './ui/Checkbox.js';
import { MenuItem } from './ui/MenuItem.js';
import { Modal } from './ui/Modal.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
  buildIdentity: BuildIdentity;
  externalAssetDirectories: string[];
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
  hooksEnabled: boolean;
  onToggleHooksEnabled: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  buildIdentity,
  externalAssetDirectories,
  watchAllSessions,
  onToggleWatchAllSessions,
  hooksEnabled,
  onToggleHooksEnabled,
}: SettingsModalProps) {
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);
  const [identityCopyStatus, setIdentityCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const identityRows = buildIdentityRows(buildIdentity);
  const identitySummary = buildIdentitySummary(buildIdentity);

  const handleCopyIdentity = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(identitySummary);
      setIdentityCopyStatus('copied');
    } catch {
      setIdentityCopyStatus('failed');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      className="w-[min(560px,calc(100vw-32px))] max-h-[calc(100vh-48px)] overflow-y-auto"
    >
      <MenuItem
        onClick={() => {
          vscode.postMessage({ type: 'openSessionsFolder' });
          onClose();
        }}
      >
        Open Sessions Folder
      </MenuItem>
      <MenuItem
        onClick={() => {
          vscode.postMessage({ type: 'exportLayout' });
          onClose();
        }}
      >
        Export Layout
      </MenuItem>
      <MenuItem
        onClick={() => {
          vscode.postMessage({ type: 'importLayout' });
          onClose();
        }}
      >
        Import Layout
      </MenuItem>
      <MenuItem
        onClick={() => {
          vscode.postMessage({ type: 'addExternalAssetDirectory' });
          onClose();
        }}
      >
        Add Asset Directory
      </MenuItem>
      {externalAssetDirectories.map((dir) => (
        <div key={dir} className="flex items-center justify-between py-4 px-10 gap-8">
          <span
            className="text-xs text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
            title={dir}
          >
            {dir.split(/[/\\]/).pop() ?? dir}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => vscode.postMessage({ type: 'removeExternalAssetDirectory', path: dir })}
            className="shrink-0"
          >
            x
          </Button>
        </div>
      ))}
      <Checkbox
        label="Sound Notifications"
        checked={soundLocal}
        onChange={() => {
          const newVal = !isSoundEnabled();
          setSoundEnabled(newVal);
          setSoundLocal(newVal);
          vscode.postMessage({ type: 'setSoundEnabled', enabled: newVal });
        }}
      />
      <Checkbox
        label="Watch All Sessions"
        checked={watchAllSessions}
        onChange={onToggleWatchAllSessions}
      />
      <Checkbox label="Instant Detection" checked={hooksEnabled} onChange={onToggleHooksEnabled} />
      <Checkbox
        label="Always Show Labels"
        checked={alwaysShowOverlay}
        onChange={onToggleAlwaysShowOverlay}
      />
      <Checkbox label="Debug View" checked={isDebugMode} onChange={onToggleDebugMode} />
      <div className="mt-4 border-t border-border px-10 py-4">
        <div className="flex items-center justify-between gap-6">
          <div className="text-sm text-accent-bright">Build / Release Identity</div>
          <Button variant="ghost" size="sm" onClick={handleCopyIdentity}>
            {identityCopyStatus === 'copied'
              ? 'Copied'
              : identityCopyStatus === 'failed'
                ? 'Copy failed'
                : 'Copy'}
          </Button>
        </div>
        <div className="mt-3 grid gap-2 text-xs">
          {identityRows.map((row) => (
            <div key={row.label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-4">
              <span className="text-text-muted">{row.label}</span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={row.value}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
