export type AppPage = 'office' | 'agents' | 'usage' | 'timeline';
export type AgentCenterPage = Exclude<AppPage, 'office'>;

export const DEFAULT_APP_PAGE: AppPage = 'office';

export const APP_PAGES: readonly AppPage[] = ['office', 'agents', 'usage', 'timeline'];

export function isAgentCenterPage(page: AppPage): page is AgentCenterPage {
  return page !== 'office';
}

export function appPageLabel(page: AppPage): string {
  if (page === 'office') return 'Office';
  if (page === 'agents') return 'Agents';
  if (page === 'usage') return 'Usage';
  return 'Timeline';
}

export function shouldShowOfficeCanvasControls(page: AppPage): boolean {
  return page === 'office';
}
