import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_TALL_SIDE_SITTING_OFFSET_PX,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_TALL_SIDE_SITTING_EMBED_X_PX,
  CHARACTER_TALL_SIDE_SITTING_OFFSET_PX,
} from '../src/constants.ts';
import { seatedRenderOffset } from '../src/office/engine/characters.ts';
import { type Character, CharacterState, Direction, type Seat } from '../src/office/types.ts';

function makeCh(partial: Partial<Character>): Character {
  return {
    state: CharacterState.TYPE,
    seatId: 'seat-1',
    dir: Direction.RIGHT,
    ...partial,
  } as Character;
}

function makeSeats(entries: Record<string, Partial<Seat>>): Map<string, Seat> {
  const m = new Map<string, Seat>();
  for (const [uid, v] of Object.entries(entries)) {
    m.set(uid, {
      uid,
      seatCol: 0,
      seatRow: 0,
      facingDir: Direction.RIGHT,
      seatKind: 'rest',
      assigned: true,
      ...v,
    } as Seat);
  }
  return m;
}

test('a character that is not seated gets zero offsets', () => {
  const off = seatedRenderOffset(
    makeCh({ state: CharacterState.IDLE }),
    makeSeats({ 'seat-1': {} }),
  );
  assert.deepEqual(off, { dx: 0, dyChar: 0, dyBubble: 0 });
});

test('a flat 1-tile chair seat gets the flat offset and no horizontal lean', () => {
  const off = seatedRenderOffset(
    makeCh({ seatId: 'seat-1', dir: Direction.RIGHT }),
    makeSeats({ 'seat-1': {} }),
  );
  assert.deepEqual(off, {
    dx: 0,
    dyChar: CHARACTER_SITTING_OFFSET_PX,
    dyBubble: BUBBLE_SITTING_OFFSET_PX,
  });
});

test('a tall side sofa facing RIGHT sinks deeper and leans LEFT (toward the back)', () => {
  const off = seatedRenderOffset(
    makeCh({ seatId: 's', dir: Direction.RIGHT }),
    makeSeats({ s: { tallSide: true } }),
  );
  assert.deepEqual(off, {
    dx: -CHARACTER_TALL_SIDE_SITTING_EMBED_X_PX,
    dyChar: CHARACTER_TALL_SIDE_SITTING_OFFSET_PX,
    dyBubble: BUBBLE_TALL_SIDE_SITTING_OFFSET_PX,
  });
});

test('a tall side sofa facing LEFT leans the opposite way (RIGHT)', () => {
  const off = seatedRenderOffset(
    makeCh({ seatId: 's', dir: Direction.LEFT }),
    makeSeats({ s: { tallSide: true } }),
  );
  assert.equal(off.dx, CHARACTER_TALL_SIDE_SITTING_EMBED_X_PX);
  assert.equal(off.dyChar, CHARACTER_TALL_SIDE_SITTING_OFFSET_PX);
});

test('a tallSide seat with a non-side facing (DOWN) falls back to the flat offset', () => {
  // Guards the regression caught in review: scope on the SEAT being tall-side AND a side facing,
  // never on facing alone (UP/DOWN desk chairs must keep the flat 1-tile offset).
  const off = seatedRenderOffset(
    makeCh({ seatId: 's', dir: Direction.DOWN }),
    makeSeats({ s: { tallSide: true } }),
  );
  assert.deepEqual(off, {
    dx: 0,
    dyChar: CHARACTER_SITTING_OFFSET_PX,
    dyBubble: BUBBLE_SITTING_OFFSET_PX,
  });
});

test('a seated character with no seats map still gets the flat seated offset', () => {
  const off = seatedRenderOffset(makeCh({ seatId: 'x', dir: Direction.RIGHT }), undefined);
  assert.equal(off.dyChar, CHARACTER_SITTING_OFFSET_PX);
});
