import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getHandoffExecutorLaunchEvidence,
  waitForHandoffExecutorLaunchConfirmation,
} from '../../src/handoffLaunchEvidence.js';

describe('handoff executor launch evidence', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempTranscript(contents = ''): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-handoff-launch-'));
    tempDirs.push(dir);
    const transcript = path.join(dir, 'session.jsonl');
    fs.writeFileSync(transcript, contents, 'utf8');
    return transcript;
  }

  it('confirms Codex launches only from a bound rollout transcript', async () => {
    // A bound, non-empty ~/.codex rollout file is the truthful "the session started" signal.
    expect(
      getHandoffExecutorLaunchEvidence('codex', {
        hookDelivered: false,
        jsonlFile: tempTranscript('{"type":"session_meta"}\n'),
        linesProcessed: 0,
      }),
    ).toBe('codex-rollout-file');
    // Processed transcript lines are even stronger evidence the executor is doing work.
    expect(
      getHandoffExecutorLaunchEvidence('codex', {
        hookDelivered: false,
        jsonlFile: '',
        linesProcessed: 1,
      }),
    ).toBe('codex-rollout-lines');
    await expect(
      waitForHandoffExecutorLaunchConfirmation(
        'codex',
        {
          hookDelivered: false,
          jsonlFile: tempTranscript('{"type":"session_meta"}\n'),
          linesProcessed: 0,
        },
        { timeoutMs: 0, pollMs: 1 },
      ),
    ).resolves.toEqual({ confirmed: true, evidence: 'codex-rollout-file' });
  });

  it('does not confirm Codex launches before a rollout is bound', async () => {
    // Terminal opened but no ~/.codex thread has appeared yet (auth/permission prompt, or the
    // CLI errored out): no evidence, so the launch must NOT be marked active.
    expect(
      getHandoffExecutorLaunchEvidence('codex', {
        hookDelivered: false,
        jsonlFile: '',
        linesProcessed: 0,
      }),
    ).toBeUndefined();
    // An empty rollout file is not yet a started session.
    const emptyRollout = tempTranscript();
    expect(
      getHandoffExecutorLaunchEvidence('codex', {
        hookDelivered: false,
        jsonlFile: emptyRollout,
        linesProcessed: 0,
      }),
    ).toBeUndefined();
    await expect(
      waitForHandoffExecutorLaunchConfirmation(
        'codex',
        { hookDelivered: false, jsonlFile: '', linesProcessed: 0 },
        { timeoutMs: 0, pollMs: 1 },
      ),
    ).resolves.toEqual({ confirmed: false });
  });

  it('confirms Claude launches from hook, processed-line, or nonempty transcript evidence', () => {
    expect(
      getHandoffExecutorLaunchEvidence('claude', {
        hookDelivered: true,
        jsonlFile: '',
        linesProcessed: 0,
      }),
    ).toBe('claude-hook');
    expect(
      getHandoffExecutorLaunchEvidence('claude', {
        hookDelivered: false,
        jsonlFile: '',
        linesProcessed: 1,
      }),
    ).toBe('claude-transcript-lines');
    expect(
      getHandoffExecutorLaunchEvidence('claude', {
        hookDelivered: false,
        jsonlFile: tempTranscript('{"type":"assistant"}\n'),
        linesProcessed: 0,
      }),
    ).toBe('claude-transcript-file');
  });

  it('does not confirm Claude launches for missing or empty transcripts', async () => {
    const emptyTranscript = tempTranscript();

    expect(
      getHandoffExecutorLaunchEvidence('claude', {
        hookDelivered: false,
        jsonlFile: emptyTranscript,
        linesProcessed: 0,
      }),
    ).toBeUndefined();
    await expect(
      waitForHandoffExecutorLaunchConfirmation(
        'claude',
        {
          hookDelivered: false,
          jsonlFile: path.join(path.dirname(emptyTranscript), 'missing.jsonl'),
          linesProcessed: 0,
        },
        { timeoutMs: 0, pollMs: 1 },
      ),
    ).resolves.toEqual({ confirmed: false });
  });
});
