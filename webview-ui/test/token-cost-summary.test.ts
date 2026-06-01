import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getProviderTokenSummaries,
  type ProviderTokenSummary,
} from '../src/components/tokenCostSummaryModel.ts';
import type { OfficeState } from '../src/office/engine/officeState.ts';
import type { Character, TokenUsageDetails } from '../src/office/types.ts';

type TestCharacter = Pick<
  Character,
  | 'id'
  | 'providerId'
  | 'inputTokens'
  | 'outputTokens'
  | 'artifactOutputTokens'
  | 'tokenUsageEstimated'
  | 'tokenUsageDetails'
  | 'codexRateLimit'
>;

const emptyDetails = (overrides: Partial<TokenUsageDetails> = {}): TokenUsageDetails => ({
  input: 0,
  output: 0,
  reasoningOutput: 0,
  cacheRead: 0,
  cacheWrite: 0,
  artifactEstimate: 0,
  estimated: false,
  ...overrides,
});

function officeStateWith(characters: TestCharacter[]): OfficeState {
  return {
    characters: new Map(characters.map((character) => [character.id, character])),
  } as unknown as OfficeState;
}

function summaryFor(
  summaries: ProviderTokenSummary[],
  providerId: ProviderTokenSummary['providerId'],
): ProviderTokenSummary {
  const summary = summaries.find((item) => item.providerId === providerId);
  assert.ok(summary);
  return summary;
}

test('provider token summaries keep Codex and Claude rows visible with no agents', () => {
  const summaries = getProviderTokenSummaries([], officeStateWith([]));

  assert.deepEqual(
    summaries.map((summary) => summary.providerId),
    ['codex', 'claude'],
  );
  assert.equal(summaryFor(summaries, 'codex').totalCost, 0);
  assert.equal(summaryFor(summaries, 'claude').totalCost, 0);
});

test('provider token summaries separate cache, reasoning, and artifact estimates', () => {
  const summaries = getProviderTokenSummaries(
    [1],
    officeStateWith([
      {
        id: 1,
        providerId: 'codex',
        inputTokens: 125,
        outputTokens: 47,
        artifactOutputTokens: 10,
        tokenUsageEstimated: false,
        tokenUsageDetails: emptyDetails({
          input: 100,
          output: 40,
          cacheRead: 25,
          reasoningOutput: 7,
          artifactEstimate: 10,
        }),
      },
    ]),
  );

  const codex = summaryFor(summaries, 'codex');
  assert.equal(codex.inputTokens, 125);
  assert.equal(codex.outputTokens, 47);
  assert.equal(codex.artifactOutputTokens, 10);
  assert.equal(codex.details.cacheRead, 25);
  assert.equal(codex.details.reasoningOutput, 7);
  assert.equal(codex.totalCost, codex.inputCost + codex.outputCost);
  assert.equal(codex.totalCost, (125 / 1_000_000) * 5 + (47 / 1_000_000) * 30);
  assert.notEqual(codex.totalCost, (125 / 1_000_000) * 5 + (57 / 1_000_000) * 30);
});

test('provider token summaries mark usage estimated when detail records are estimated', () => {
  const summaries = getProviderTokenSummaries(
    [1],
    officeStateWith([
      {
        id: 1,
        providerId: 'claude',
        inputTokens: 12,
        outputTokens: 4,
        tokenUsageEstimated: false,
        tokenUsageDetails: emptyDetails({ input: 12, output: 4, estimated: true }),
      },
    ]),
  );

  assert.equal(summaryFor(summaries, 'claude').estimated, true);
});

test('provider token summaries use proxy wording instead of billing wording', () => {
  const summaries = getProviderTokenSummaries([], officeStateWith([]));

  for (const summary of summaries) {
    assert.match(summary.label, /usage proxy/);
    assert.match(summary.note, /Proxy estimate only/);
    assert.match(summary.note, /may not bill per token/);
  }
});
