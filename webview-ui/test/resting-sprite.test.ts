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

function ch(partial: Partial<Character>): Character {
  return {
    state: CharacterState.TYPE,
    isActive: false,
    dir: Direction.DOWN,
    frame: 0,
    currentTool: null,
    seated: false,
    ...partial,
  } as Character;
}

const sprites = markerSprites();

test('a resting agent PARKED ON its seat renders the seated reading pose', () => {
  // The "agent sits on the sofa" case: inactive, on its seat tile (seated=true).
  assert.equal(tag(getCharacterSprite(ch({ isActive: false, seated: true }), sprites)), 'read0');
});

test('a resting agent NOT on a seat renders STANDING (no sitting in mid-air)', () => {
  // TYPE + inactive but seated=false (e.g. on a floor tile): must NOT render the seated pose.
  assert.equal(tag(getCharacterSprite(ch({ isActive: false, seated: false }), sprites)), 'walk1');
});

test('an idle agent still on its seat renders seated (no standing on the sofa)', () => {
  // After a rest the agent flips TYPE->IDLE while still on the sofa; seated=true keeps it sitting.
  const c = ch({ state: CharacterState.IDLE, isActive: false, seated: true });
  assert.equal(tag(getCharacterSprite(c, sprites)), 'read0');
});

test('an idle agent wandering on open floor renders the standing walk pose', () => {
  const c = ch({ state: CharacterState.IDLE, isActive: false, seated: false });
  assert.equal(tag(getCharacterSprite(c, sprites)), 'walk1');
});

test('an ACTIVE typing agent renders the typing frame regardless of seat (covers sub-agents)', () => {
  assert.equal(tag(getCharacterSprite(ch({ isActive: true, seated: false }), sprites)), 'type0');
  assert.equal(tag(getCharacterSprite(ch({ isActive: true, seated: true }), sprites)), 'type0');
});

test('a walking agent always animates the walk cycle', () => {
  const c = ch({ state: CharacterState.WALK, seated: true, frame: 2 });
  assert.equal(tag(getCharacterSprite(c, sprites)), 'walk2');
});
