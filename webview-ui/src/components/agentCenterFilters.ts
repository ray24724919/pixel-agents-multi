export function isAgentVisibleWithHiddenToggle(
  hidden: boolean,
  showHiddenAgents: boolean,
): boolean {
  return showHiddenAgents || !hidden;
}
