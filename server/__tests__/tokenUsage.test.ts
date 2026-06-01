import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { extractClaudeUsage, readTokenUsageFromTranscript } =
  await import('../../src/tokenUsage.js');

describe('token usage extraction', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-token-usage-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('keeps only the latest streamed Claude usage for a request and message', () => {
    const transcript = path.join(tmpDir, 'claude.jsonl');
    fs.writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          requestId: 'req-1',
          message: {
            id: 'msg-1',
            usage: { input_tokens: 10, output_tokens: 2 },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          requestId: 'req-1',
          message: {
            id: 'msg-1',
            usage: { input_tokens: 12, output_tokens: 4 },
          },
        }),
      ].join('\n') + '\n',
    );

    expect(readTokenUsageFromTranscript(transcript, 'claude')).toMatchObject({
      inputTokens: 12,
      outputTokens: 4,
      estimated: false,
      details: {
        input: 12,
        output: 4,
      },
    });
  });

  it('preserves Claude cache and reasoning usage details', () => {
    const usage = extractClaudeUsage({
      type: 'assistant',
      requestId: 'req-cache',
      message: {
        id: 'msg-cache',
        usage: {
          input_tokens: 20,
          output_tokens: 8,
          reasoning_output_tokens: 3,
          cache_read_input_tokens: 5,
          cache_creation_input_tokens: 7,
        },
      },
    });

    expect(usage).toMatchObject({
      inputTokens: 32,
      outputTokens: 11,
      estimated: false,
      details: {
        input: 20,
        output: 8,
        reasoningOutput: 3,
        cacheRead: 5,
        cacheWrite: 7,
      },
    });
  });

  it('splits Codex cached input without double-counting it', () => {
    const transcript = path.join(tmpDir, 'codex.jsonl');
    fs.writeFileSync(
      transcript,
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 25,
              output_tokens: 40,
              reasoning_output_tokens: 7,
            },
            last_token_usage: {
              input_tokens: 20,
              cached_input_tokens: 5,
              output_tokens: 8,
            },
          },
        },
      }) + '\n',
    );

    expect(readTokenUsageFromTranscript(transcript, 'codex')).toMatchObject({
      inputTokens: 100,
      outputTokens: 47,
      details: {
        input: 75,
        cacheRead: 25,
        output: 40,
        reasoningOutput: 7,
      },
      lastTokenUsage: {
        input: 15,
        cacheRead: 5,
        output: 8,
      },
    });
  });
});
