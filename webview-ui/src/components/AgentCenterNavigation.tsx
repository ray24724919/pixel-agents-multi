import type { AppPage } from './agentCenterPages.js';
import { APP_PAGES, appPageLabel } from './agentCenterPages.js';
import { Button } from './ui/Button.js';

interface AgentCenterNavigationProps {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
}

export function AgentCenterNavigation({ activePage, onPageChange }: AgentCenterNavigationProps) {
  return (
    <nav
      aria-label="Agent Center pages"
      className="absolute top-10 left-1/2 z-30 flex max-w-[calc(100%-20px)] -translate-x-1/2 flex-wrap justify-center gap-1 border-2 border-border bg-bg p-1 shadow-pixel"
    >
      {APP_PAGES.map((page) => (
        <Button
          key={page}
          variant={activePage === page ? 'active' : 'default'}
          size="sm"
          className="min-w-[92px] px-4"
          onClick={() => onPageChange(page)}
        >
          <span className="block truncate">{appPageLabel(page)}</span>
        </Button>
      ))}
    </nav>
  );
}
