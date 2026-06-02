import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_PAGES,
  appPageLabel,
  DEFAULT_APP_PAGE,
  isAgentCenterPage,
  shouldShowOfficeCanvasControls,
} from '../src/components/agentCenterPages.ts';

test('app navigation defaults to Office and exposes all page destinations', () => {
  assert.equal(DEFAULT_APP_PAGE, 'office');
  assert.deepEqual(APP_PAGES, ['office', 'agents', 'usage', 'timeline']);
  assert.equal(appPageLabel('office'), 'Office');
  assert.equal(appPageLabel('timeline'), 'Timeline');
});

test('Agent Center pages are separate from Office-only canvas controls', () => {
  assert.equal(isAgentCenterPage('office'), false);
  assert.equal(isAgentCenterPage('agents'), true);
  assert.equal(isAgentCenterPage('usage'), true);
  assert.equal(isAgentCenterPage('timeline'), true);

  assert.equal(shouldShowOfficeCanvasControls('office'), true);
  assert.equal(shouldShowOfficeCanvasControls('agents'), false);
  assert.equal(shouldShowOfficeCanvasControls('usage'), false);
  assert.equal(shouldShowOfficeCanvasControls('timeline'), false);
});
