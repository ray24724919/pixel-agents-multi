/**
 * E2E: Starting a Codex agent in the Pixel Agents webview spawns a mock Codex terminal.
 *
 * Assertions:
 *   1. The mock `codex` binary was invoked (invocations.log exists and is non-empty).
 *   2. The expected Codex state DB and rollout JSONL files were created in the isolated HOME.
 *   3. A VS Code terminal named "Codex #1" appears in the workbench.
 *   4. A mock Codex child thread is adopted as a Pixel Agents teammate.
 *   5. Agent Center > Usage renders a visible dashboard body.
 *   6. A seeded Claude Cowork session is adopted and visible through the Claude filter.
 *
 * NOTE FOR NEW TESTS: As more specs are added, refactor session setup into a
 * Playwright fixture using test.extend<{ session: VSCodeSession }>() so that
 * launch/cleanup is automatic and tests stay focused on assertions. See:
 * https://playwright.dev/docs/test-fixtures
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { launchVSCode, waitForWorkbench } from '../helpers/launch';
import {
  getPixelAgentsFrame,
  openAgentCenterUsage,
  openPixelAgentsPanel,
  startCodexAgent,
} from '../helpers/webview';

function seedClaudeCoworkSession(appDataDir: string, projectDir: string) {
  const sessionId = 'local_cowork_e2e';
  const title = 'E2E Cowork Lead';
  const metadataDir = path.join(
    appDataDir,
    'Claude',
    'local-agent-mode-sessions',
    'space-1',
    'process-1',
  );
  const sessionDir = path.join(metadataDir, sessionId);
  const outputDir = path.join(sessionDir, 'outputs');
  const auditPath = path.join(sessionDir, 'audit.jsonl');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    auditPath,
    JSON.stringify({
      type: 'system',
      subtype: 'init',
      cwd: outputDir,
      session_id: sessionId,
      tools: ['Read', 'Edit', 'Bash'],
    }) + '\n',
  );
  fs.writeFileSync(
    path.join(metadataDir, `${sessionId}.json`),
    JSON.stringify(
      {
        sessionId,
        title,
        cwd: outputDir,
        userSelectedFolders: [projectDir],
        isArchived: false,
        isAgentCompleted: false,
      },
      null,
      2,
    ),
  );

  return { sessionId, title, projectDir, auditPath };
}

test('starting a Codex agent spawns mock codex and adopts a child thread teammate', async ({}, testInfo) => {
  const session = await launchVSCode(testInfo.title);
  const { window, tmpHome, appDataDir, workspaceDir, mockLogFile } = session;
  const runVideo = window.video();
  const seededCowork = seedClaudeCoworkSession(
    appDataDir,
    path.join(path.dirname(workspaceDir), 'animfy_gs1'),
  );

  test.setTimeout(120_000);

  try {
    // 1. Wait for VS Code workbench to be ready
    await waitForWorkbench(window);

    // 2. Open the Pixel Agents panel
    await openPixelAgentsPanel(window);

    // 3. Find the webview frame and start a Codex agent
    const frame = await getPixelAgentsFrame(window);
    await startCodexAgent(frame);

    // 4. Assert: mock codex was invoked.
    //    The mock script writes to $HOME/.codex-mock/invocations.log.
    await expect
      .poll(
        () => {
          try {
            const content = fs.readFileSync(mockLogFile, 'utf8');
            return content.trim().length > 0;
          } catch {
            return false;
          }
        },
        {
          message: `Expected invocations.log at ${mockLogFile} to be non-empty`,
          timeout: 20_000,
          intervals: [500, 1000],
        },
      )
      .toBe(true);

    const invocationLog = fs.readFileSync(mockLogFile, 'utf8');
    expect(invocationLog).toContain('cwd=');
    await testInfo.attach('mock-codex-invocations', {
      body: invocationLog,
      contentType: 'text/plain',
    });

    // 5. Assert: Codex state DB and rollout JSONL session file were created.
    const codexDir = path.join(tmpHome, '.codex');
    const stateDb = path.join(codexDir, 'state_5.sqlite');
    const sessionsDir = path.join(codexDir, 'sessions');

    const findRolloutFiles = (): string[] => {
      const files: string[] = [];
      const visit = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const entryPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            visit(entryPath);
          } else if (entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
            files.push(entryPath);
          }
        }
      };
      try {
        if (fs.existsSync(sessionsDir)) visit(sessionsDir);
      } catch {
        return [];
      }
      return files;
    };

    await expect
      .poll(() => fs.existsSync(stateDb), {
        message: `Expected Codex state DB at ${stateDb}`,
        timeout: 20_000,
        intervals: [500, 1000],
      })
      .toBe(true);

    await expect
      .poll(findRolloutFiles, {
        message: `Expected parent and child rollout JSONL files under ${sessionsDir}`,
        timeout: 20_000,
        intervals: [500, 1000],
      })
      .toHaveLength(2);

    await testInfo.attach('rollout-files', {
      body: findRolloutFiles().join('\n'),
      contentType: 'text/plain',
    });

    // 6. Assert: terminal "Codex #1" is visible in VS Code UI
    //    VS Code renders the terminal name as visible text in the tab bar.
    const terminalTab = window.getByText(/Codex #\d+/);
    await expect(terminalTab.first()).toBeVisible({ timeout: 15_000 });

    // 7. Assert: the child Codex thread was adopted as a teammate in the webview.
    await openPixelAgentsPanel(window);
    const activeFrame = await getPixelAgentsFrame(window);
    const root = activeFrame.locator('[data-testid="pixel-agents-root"]');
    await expect
      .poll(async () => Number((await root.getAttribute('data-agent-count')) ?? '0'), {
        message: 'Expected Pixel Agents to show parent + Codex child teammate',
        timeout: 20_000,
        intervals: [500, 1000],
      })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () => (await root.getAttribute('data-agent-names')) ?? '', {
        message: 'Expected Codex child teammate name to be visible in webview state',
        timeout: 20_000,
        intervals: [500, 1000],
      })
      .toContain('Curie');

    // 8. Assert: Agent Center > Usage renders a visible state instead of a blank panel.
    await openAgentCenterUsage(activeFrame);

    // 9. Assert: the seeded Claude Cowork session is adopted and provider filtering can show it.
    await expect
      .poll(async () => (await root.getAttribute('data-agent-names')) ?? '', {
        message: 'Expected seeded Claude Cowork session to appear in webview state',
        timeout: 20_000,
        intervals: [500, 1000],
      })
      .toContain(seededCowork.title);
    await expect
      .poll(async () => (await root.getAttribute('data-agent-providers')) ?? '', {
        message: 'Expected seeded Claude Cowork session to retain providerId=claude',
        timeout: 20_000,
        intervals: [500, 1000],
      })
      .toContain(':claude');

    await activeFrame.locator('button', { hasText: /^x$/ }).last().click();
    await expect(activeFrame.getByText('Agent Center')).toBeHidden({ timeout: 10_000 });
    await activeFrame.locator('button', { hasText: /^Claude$/ }).click();
    await expect
      .poll(async () => Number((await root.getAttribute('data-visible-agent-count')) ?? '0'), {
        message: 'Expected Claude provider filter to show the seeded Cowork agent',
        timeout: 20_000,
        intervals: [500, 1000],
      })
      .toBe(1);
    await expect
      .poll(async () => (await root.getAttribute('data-visible-agent-names')) ?? '', {
        message: 'Expected Claude provider filter to show the seeded Cowork title',
        timeout: 20_000,
        intervals: [500, 1000],
      })
      .toContain(seededCowork.title);
  } finally {
    // Save a screenshot of the final state regardless of outcome
    const screenshotPath = path.join(
      __dirname,
      '../../test-results/e2e',
      `agent-spawn-final-${Date.now()}.png`,
    );
    try {
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await window.screenshot({ path: screenshotPath });
      await testInfo.attach('final-screenshot', {
        path: screenshotPath,
        contentType: 'image/png',
      });
    } catch {
      // screenshot failure is non-fatal
    }

    await session.cleanup();

    if (runVideo) {
      try {
        const videoPath = testInfo.outputPath('run-video.webm');
        await runVideo.saveAs(videoPath);
        await testInfo.attach('run-video', {
          path: videoPath,
          contentType: 'video/webm',
        });
      } catch {
        // video attachment failure is non-fatal
      }
    }
  }
});
