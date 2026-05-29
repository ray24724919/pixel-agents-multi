import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isAgentVisibleWithHiddenToggle } from '../src/components/agentCenterFilters.ts';

test('hidden agents are filtered until Show hidden agents is enabled', () => {
  assert.equal(isAgentVisibleWithHiddenToggle(true, false), false);
  assert.equal(isAgentVisibleWithHiddenToggle(true, true), true);
  assert.equal(isAgentVisibleWithHiddenToggle(false, false), true);
});
