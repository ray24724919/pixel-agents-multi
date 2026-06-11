import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCharacterSprite } from '../src/office/engine/characters.ts';
import type { CharacterSprites } from '../src/office/sprites/spriteData.ts';
import { type Character, CharacterState, Direction, type SpriteData } from '../src/office/types.ts';

const DIRS = [Direction.DOWN, Direction.LEFT, Direction.RIGHT, Direction.UP];

function markerSprites(): CharacterSprites {
  const s = (tag: string): SpriteData => [[tag]];
  const rec = <T>(make: () => T): Record<Direction, T> =>
    Object.fromEntries(DIRS.map((d) => [d, make()])) as Record<Direction, T>;
  return {
    walk: rec(() => [s('walk0'), s('walk1'), s('walk2'), s('walk3')]),
    typing: rec(() => [s('type0'), s('type1')]),
    reading: rec(() => [s('read0'), s('read1')]),
  } as CharacterSprites;
}

function tag(sprite: SpriteData): string {
  return sprite[0][0];
}

test('a resting (inactive) seated agent renders a seated reading frame, not the standing walk pose', () => {
  // Regression for "agent stands on the sofa": a resting agent is in TYPE state with isActive=false.
  // The fork used to return the standing walk[dir][1] frame here, so a resting agent on a sofa was a
  // STANDING sprite. The upstream uses a seated frame for every TYPE state.
  const sprites = markerSprites();
  const ch = {
    state: CharacterState.TYPE,
    isActive: false,
    dir: Direction.DOWN,
    frame: 0,
    currentTool: null,
  } as Character;
  const sprite = getCharacterSprite(ch, sprites);
  assert.equal(tag(sprite), 'read0', 'resting agent uses the seated reading frame');
  assert.notEqual(tag(sprite), 'walk1', 'must NOT be the standing idle/walk pose');
});

test('an ACTIVE typing agent still uses the typing frame (unchanged)', () => {
  const sprites = markerSprites();
  const ch = {
    state: CharacterState.TYPE,
    isActive: true,
    dir: Direction.DOWN,
    frame: 0,
    currentTool: 'Edit',
  } as Character;
  assert.equal(tag(getCharacterSprite(ch, sprites)), 'type0');
});

test('an idle (wandering) agent still uses the standing walk frame', () => {
  const sprites = markerSprites();
  const ch = {
    state: CharacterState.IDLE,
    isActive: false,
    dir: Direction.DOWN,
    frame: 0,
    currentTool: null,
  } as Character;
  assert.equal(tag(getCharacterSprite(ch, sprites)), 'walk1');
});
