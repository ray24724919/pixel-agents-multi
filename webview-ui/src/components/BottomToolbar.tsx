import { useEffect, useMemo, useRef, useState } from 'react';

import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js';
import { vscode } from '../vscodeApi.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface BottomToolbarProps {
  isEditMode: boolean;
  onOpenAgent: () => void;
  onToggleEditMode: () => void;
  onToggleAgentCenter: () => void;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  workspaceFolders: WorkspaceFolder[];
  codexProjects: WorkspaceFolder[];
  agentProviderFilter: 'all' | 'codex' | 'claude';
  onAgentProviderFilterChange: (filter: 'all' | 'codex' | 'claude') => void;
}

const TASK_TEMPLATES = [
  '分析這個專案的架構，整理主要模組與資料流',
  '檢查這個專案的測試設定，找出可以補強的地方',
  '做一次 code review，優先找 bug、風險與缺少測試的地方',
  '幫我規劃下一步實作，列出可以分派給子 agent 的工作',
];

export function BottomToolbar({
  isEditMode,
  onOpenAgent,
  onToggleEditMode,
  onToggleAgentCenter,
  isSettingsOpen,
  onToggleSettings,
  workspaceFolders,
  codexProjects,
  agentProviderFilter,
  onAgentProviderFilterChange,
}: BottomToolbarProps) {
  const projectChoices = useMemo(() => {
    const byPath = new Map<string, WorkspaceFolder>();
    for (const folder of [...workspaceFolders, ...codexProjects]) {
      byPath.set(folder.path, folder);
    }
    return [...byPath.values()];
  }, [workspaceFolders, codexProjects]);

  const defaultProjectPath = projectChoices[0]?.path ?? '';
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [projectPath, setProjectPath] = useState(defaultProjectPath);
  const [customProjectPath, setCustomProjectPath] = useState('');
  const [prompt, setPrompt] = useState('');
  const [bypassPermissions, setBypassPermissions] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!projectPath && defaultProjectPath) {
      setProjectPath(defaultProjectPath);
    }
  }, [defaultProjectPath, projectPath]);

  useEffect(() => {
    if (isAgentModalOpen) {
      window.setTimeout(() => promptRef.current?.focus(), 0);
    }
  }, [isAgentModalOpen]);

  const handleSubmit = () => {
    const folderPath = projectPath === '__custom__' ? customProjectPath.trim() : projectPath;
    const trimmedPrompt = prompt.trim();
    if (!folderPath && !trimmedPrompt && !bypassPermissions) {
      onOpenAgent();
    } else {
      vscode.postMessage({
        type: 'openAgent',
        folderPath: folderPath || undefined,
        prompt: trimmedPrompt || undefined,
        bypassPermissions,
      });
    }
    setIsAgentModalOpen(false);
    setPrompt('');
    setBypassPermissions(false);
  };

  return (
    <>
      <div className="absolute bottom-10 left-10 z-20 flex items-center gap-4 pixel-panel p-4">
        <Button variant="accent" onClick={() => setIsAgentModalOpen(true)}>
          + Agent
        </Button>
        <Button
          variant="default"
          onClick={() => vscode.postMessage({ type: 'refreshAgents' })}
          title="Refresh agents"
        >
          Refresh
        </Button>
        <div className="flex items-center gap-1 border-2 border-border bg-bg p-1">
          {(['all', 'codex', 'claude'] as const).map((filter) => (
            <Button
              key={filter}
              variant={agentProviderFilter === filter ? 'active' : 'ghost'}
              size="sm"
              onClick={() => onAgentProviderFilterChange(filter)}
              title={`Show ${filter} agents`}
            >
              {filter === 'all' ? 'All' : filter === 'codex' ? 'Codex' : 'Claude'}
            </Button>
          ))}
        </div>
        <Button
          variant={isEditMode ? 'active' : 'default'}
          onClick={onToggleEditMode}
          title="Edit office layout"
        >
          Layout
        </Button>
        <Button variant="default" onClick={onToggleAgentCenter} title="Open agent center">
          Agents
        </Button>
        <Button
          variant={isSettingsOpen ? 'active' : 'default'}
          onClick={onToggleSettings}
          title="Settings"
        >
          Settings
        </Button>
      </div>

      <Modal
        isOpen={isAgentModalOpen}
        onClose={() => setIsAgentModalOpen(false)}
        title="New Agent"
        className="w-[min(92vw,720px)]"
      >
        <div className="px-10 pb-8 flex flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm text-text-muted">
            Project
            <select
              className="bg-bg border-2 border-border px-3 py-2 text-text outline-none"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
            >
              {projectChoices.length === 0 && <option value="">Current VS Code folder</option>}
              {projectChoices.map((project) => (
                <option key={project.path} value={project.path}>
                  {project.name} - {project.path}
                </option>
              ))}
              <option value="__custom__">Choose by path...</option>
            </select>
          </label>

          {projectPath === '__custom__' && (
            <label className="flex flex-col gap-2 text-sm text-text-muted">
              Project path
              <input
                className="bg-bg border-2 border-border px-3 py-2 text-text outline-none"
                value={customProjectPath}
                onChange={(e) => setCustomProjectPath(e.target.value)}
                placeholder="/Users/raychen/Documents/my-project"
              />
            </label>
          )}

          <label className="flex flex-col gap-2 text-sm text-text-muted">
            Task
            <textarea
              ref={promptRef}
              className="min-h-36 resize-y bg-bg border-2 border-border px-3 py-2 text-text outline-none leading-6"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：分析這個專案的測試架構，並列出下一步可以改善的地方"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TASK_TEMPLATES.map((template) => (
              <button
                key={template}
                type="button"
                className="text-left border border-border bg-btn-bg hover:bg-btn-hover px-3 py-2 text-sm"
                onClick={() => setPrompt(template)}
              >
                {template}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-3 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={bypassPermissions}
              onChange={(e) => setBypassPermissions(e.target.checked)}
            />
            Skip permission prompts for this agent
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setIsAgentModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" onClick={handleSubmit}>
              Start Agent
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
