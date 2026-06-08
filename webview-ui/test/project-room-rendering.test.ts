import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRoomRenderInstructions,
  projectRoomDoorplateLabel,
} from '../src/office/roomRendering.ts';
import type { OfficeLayout, ProjectRoom } from '../src/office/types.ts';
import { TileType } from '../src/office/types.ts';

function layout(projectRooms?: unknown[]): OfficeLayout {
  return {
    version: 1,
    cols: 12,
    rows: 10,
    tiles: Array.from({ length: 120 }, () => TileType.FLOOR_1),
    furniture: [],
    ...(projectRooms ? { projectRooms: projectRooms as ProjectRoom[] } : {}),
  };
}

test('valid rooms produce bounded draw instructions', () => {
  const instructions = buildRoomRenderInstructions(
    layout([
      {
        id: 'alpha',
        kind: 'project',
        bounds: { col: 2, row: 1, width: 5, height: 4 },
        project: { key: 'alpha', displayName: 'Alpha', source: 'folderName' },
      },
    ]),
    2,
  );

  assert.equal(instructions.length, 1);
  assert.equal(instructions[0]!.x, 64);
  assert.equal(instructions[0]!.w, 160);
  assert.ok(instructions[0]!.doorplate.x >= instructions[0]!.x);
  assert.ok(instructions[0]!.doorplate.maxWidth <= instructions[0]!.w);
});

test('malformed rooms are skipped without crashing', () => {
  const instructions = buildRoomRenderInstructions(
    layout([
      { id: 'missing-bounds', kind: 'project' },
      { id: '', kind: 'project', bounds: { col: 0, row: 0, width: 4, height: 4 } },
      { id: 'ok', kind: 'public', bounds: { col: 0, row: 0, width: 4, height: 4 } },
    ]),
    1,
  );

  assert.deepEqual(
    instructions.map((instruction) => instruction.id),
    ['ok'],
  );
});

test('project labels are sanitized and do not leak absolute paths', () => {
  const label = projectRoomDoorplateLabel({
    id: 'repo',
    kind: 'project',
    bounds: { col: 0, row: 0, width: 6, height: 4 },
    label: 'C:\\Users\\User\\Documents\\raychen\\private-repo',
  });

  assert.equal(label, 'private-repo');
  assert.doesNotMatch(label, /C:\\|Users|Documents/);
});

test('secret-like and transcript labels fall back to safe names', () => {
  const room: ProjectRoom = {
    id: 'bad',
    kind: 'project',
    bounds: { col: 0, row: 0, width: 6, height: 4 },
    label: 'sk-live-token transcript.jsonl raw prompt',
  };

  assert.equal(projectRoomDoorplateLabel(room), 'Project');
});

test('public rest meeting and unassigned labels are safe', () => {
  const labels = buildRoomRenderInstructions(
    layout([
      { id: 'public', kind: 'public', bounds: { col: 0, row: 0, width: 3, height: 3 } },
      { id: 'rest', kind: 'rest', bounds: { col: 3, row: 0, width: 3, height: 3 } },
      { id: 'meeting', kind: 'meeting', bounds: { col: 6, row: 0, width: 3, height: 3 } },
      { id: 'unassigned', kind: 'unassigned', bounds: { col: 9, row: 0, width: 3, height: 3 } },
    ]),
    1,
  ).map((instruction) => instruction.doorplate.label);

  assert.deepEqual(labels, ['Public', 'Rest', 'Meeting', 'Unassigned']);
});

test('layouts without projectRooms produce no room render instructions', () => {
  assert.deepEqual(buildRoomRenderInstructions(layout(), 2), []);
});
