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
const TASK_PLACEHOLDER = '描述這個 agent 要完成的工作，或點下方範例帶入。';

export function BottomToolbar({
  isEditMode,
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
  const [provider, setProvider] = useState<'claude' | 'codex'>('claude');
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

  const closeAgentModal = () => {
    setIsAgentModalOpen(false);
    setProvider('claude');
    setPrompt('');
    setBypassPermissions(false);
  };

  const handleSubmit = () => {
    const folderPath = projectPath === '__custom__' ? customProjectPath.trim() : projectPath;
    const trimmedPrompt = prompt.trim();
    vscode.postMessage({
      type: 'openAgent',
      folderPath: folderPath || undefined,
      providerId: provider,
      prompt: trimmedPrompt || undefined,
      bypassPermissions,
    });
    closeAgentModal();
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
        onClose={closeAgentModal}
        title="New Agent"
        className="modern-surface w-[min(94vw,820px)]"
      >
        <div className="flex flex-col gap-6 px-10 pb-8">
          <label className="flex flex-col gap-2 text-[13px] font-semibold text-text-muted">
            Project
            <select
              className="h-34 rounded-[6px] border border-border bg-bg px-3 text-[13px] text-text outline-none focus:border-accent"
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
            <label className="flex flex-col gap-2 text-[13px] font-semibold text-text-muted">
              Project path
              <input
                className="h-34 rounded-[6px] border border-border bg-bg px-3 text-[13px] text-text outline-none focus:border-accent"
                value={customProjectPath}
                onChange={(e) => setCustomProjectPath(e.target.value)}
                placeholder="/Users/raychen/Documents/my-project"
              />
            </label>
          )}

          <fieldset className="flex flex-col gap-2 text-[13px] font-semibold text-text-muted">
            <legend className="mb-2">Provider</legend>
            <div className="grid grid-cols-2 rounded-[6px] border border-border bg-bg p-1">
              {(['claude', 'codex'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`rounded-[4px] px-3 py-2 text-[13px] text-text transition-colors ${
                    provider === option ? 'bg-active-bg' : 'bg-bg hover:bg-btn-hover'
                  }`}
                  onClick={() => setProvider(option)}
                >
                  {option === 'claude' ? 'Claude' : 'Codex'}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-2 text-[13px] font-semibold text-text-muted">
            Task
            <textarea
              ref={promptRef}
              className="min-h-[132px] resize-y rounded-[6px] border border-border bg-bg px-3 py-3 text-[14px] leading-[1.45] text-text outline-none placeholder:text-text-muted focus:border-accent"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={TASK_PLACEHOLDER}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TASK_TEMPLATES.map((template) => (
              <button
                key={template}
                type="button"
                className="min-h-[62px] rounded-[6px] border border-border bg-btn-bg px-3 py-3 text-left text-[14px] leading-[1.45] text-text transition-colors hover:border-accent hover:bg-btn-hover"
                onClick={() => setPrompt(template)}
              >
                {template}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-3 text-[13px] text-text-muted">
            <input
              type="checkbox"
              checked={bypassPermissions}
              onChange={(e) => setBypassPermissions(e.target.checked)}
            />
            Skip permission prompts for this agent
          </label>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={closeAgentModal}>
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
