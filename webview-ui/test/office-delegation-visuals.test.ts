import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  buildDelegationSummaries,
  type DelegationSummary,
} from '../src/components/delegationModel.ts';
import { FALLBACK_FLOOR_COLOR } from '../src/constants.ts';
import { shouldCreateInlineSubagentCharacter } from '../src/hooks/useExtensionMessages.ts';
import {
  buildDelegationVisualState,
  delegationVisualMarkerText,
  delegationVisualStatusLabel,
  delegationVisualWorkerLabel,
} from '../src/office/delegationVisual.ts';
import { OfficeState } from '../src/office/engine/officeState.ts';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.ts';
import {
  CharacterState,
  type FurnitureCatalogEntry,
  type OfficeLayout,
  type PlacedFurniture,
  TILE_SIZE,
  TileType,
} from '../src/office/types.ts';

type TestCatalogAsset = Omit<FurnitureCatalogEntry, 'type' | 'sprite'> & {
  id: string;
  width: number;
  height: number;
  category: string;
};

const sprite = [[FALLBACK_FLOOR_COLOR]];

beforeEach(() => {
  const assets: TestCatalogAsset[] = [
    {
      id: 'DESK',
      label: 'Desk',
      category: 'desks',
      width: TILE_SIZE * 3,
      height: TILE_SIZE * 2,
      footprintW: 3,
      footprintH: 2,
      isDesk: true,
      backgroundTiles: 1,
    },
    {
      id: 'PC',
      label: 'PC',
      category: 'electronics',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
      canPlaceOnSurfaces: true,
    },
    {
      id: 'CHAIR_UP',
      label: 'Chair Up',
      category: 'chairs',
      width: TILE_SIZE,
      height: TILE_SIZE,
      footprintW: 1,
      footprintH: 1,
      isDesk: false,
      orientation: 'back',
    },
    {
      id: 'SOFA_FRONT',
      label: 'Sofa Front',
      category: 'chairs',
      width: TILE_SIZE * 2,
      height: TILE_SIZE,
      footprintW: 2,
      footprintH: 1,
      isDesk: false,
      orientation: 'front',
    },
    {
      id: 'COFFEE_TABLE',
      label: 'Coffee Table',
      category: 'desks',
      width: TILE_SIZE * 2,
      height: TILE_SIZE * 2,
      footprintW: 2,
      footprintH: 2,
      isDesk: true,
    },
  ];

  buildDynamicCatalog({
    catalog: assets,
    sprites: Object.fromEntries(assets.map((asset) => [asset.id, sprite])),
  });
});

function makeLayout(furniture: PlacedFurniture[], cols = 10, rows = 8): OfficeLayout {
  return {
    version: 1,
    cols,
    rows,
    tiles: Array.from({ length: cols * rows }, () => TileType.FLOOR_1),
    furniture,
  };
}

function workstationFurniture(): PlacedFurniture[] {
  return [
    { uid: 'desk', type: 'DESK', col: 2, row: 1 },
    { uid: 'pc', type: 'PC', col: 3, row: 1 },
    { uid: 'work-chair', type: 'CHAIR_UP', col: 3, row: 3 },
  ];
}

function loungeFurniture(): PlacedFurniture[] {
  return [
    { uid: 'sofa', type: 'SOFA_FRONT', col: 6, row: 2 },
    { uid: 'coffee-table', type: 'COFFEE_TABLE', col: 6, row: 3 },
  ];
}

function summary(overrides: Partial<DelegationSummary> = {}): DelegationSummary {
  return {
    supervisorAgentId: 1,
    providerId: 'codex',
    status: 'delegating',
    activeDelegateCount: 2,
    completedDelegateCount: 0,
    failedDelegateCount: 0,
    delegateSource: 'hook',
    teamName: 'Release',
    delegateLabels: ['raw prompt: inspect private transcript'],
    updatedAt: 100,
    ...overrides,
  };
}

function addAgent(state: OfficeState, id: number, active = true): void {
  state.addAgent(id, undefined, undefined, undefined, true, undefined, active);
}

test('delegation visual state derives safe marker data from DelegationSummary', () => {
  const visual = buildDelegationVisualState(summary())!;

  assert.equal(visual.totalDelegateCount, 2);
  assert.equal(visual.isActive, true);
  assert.equal(delegationVisualMarkerText(visual), '2w');
  assert.equal(delegationVisualWorkerLabel(visual), '2 workers');
  assert.equal(delegationVisualStatusLabel(visual), 'Supervising');
  assert.doesNotMatch(JSON.stringify(visual), /raw prompt|private transcript/i);
});

test('Codex spawn_agent creates an inline delegation marker without hook ids', () => {
  assert.equal(shouldCreateInlineSubagentCharacter('spawn_agent', undefined, 'call-spawn'), true);
  assert.equal(shouldCreateInlineSubagentCharacter('spawn_agent', false, 'hook-spawn'), false);
  assert.equal(shouldCreateInlineSubagentCharacter('Agent', true, 'call-agent'), false);
});

test('pure smoke derives a visible Codex delegation marker without VS Code click-through', () => {
  const summaries = buildDelegationSummaries({
    agents: [
      {
        id: 1,
        name: 'Codex supervisor',
        providerId: 'codex',
        statusGroup: 'active',
        updatedAt: 200,
      },
    ],
    subagentCharacters: [{ id: -1, parentAgentId: 1, parentToolId: 'call-spawn', label: 'worker' }],
    subagentTools: {},
    parentTools: {
      1: [{ toolId: 'call-spawn', status: 'Subtask: worker', done: false }],
    },
    nowMs: 250,
  });
  const visual = buildDelegationVisualState(summaries.get(1))!;
  const state = new OfficeState(makeLayout([...workstationFurniture(), ...loungeFurniture()]));
  addAgent(state, 1, false);

  state.setAgentDelegation(1, visual);

  const ch = state.characters.get(1)!;
  assert.equal(delegationVisualMarkerText(visual), '1w');
  assert.equal(delegationVisualStatusLabel(visual), 'Supervising');
  assert.equal(ch.delegation?.totalDelegateCount, 1);
  assert.equal(ch.isActive, true);
  assert.equal(state.seats.get(ch.seatId!)?.seatKind, 'work');
});

test('delegating supervisor uses a work seat instead of idle rest behavior', () => {
  const state = new OfficeState(makeLayout([...workstationFurniture(), ...loungeFurniture()]));
  addAgent(state, 1, false);

  state.setAgentDelegation(1, buildDelegationVisualState(summary()));

  const ch = state.characters.get(1)!;
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.equal(ch.isActive, true);
  assert.equal(ch.delegation?.isActive, true);
  assert.equal(seat?.seatKind, 'work');
  assert.equal(seat?.zoneSource, 'workstation');

  state.setAgentActive(1, false);
  assert.equal(ch.isActive, true);
  assert.equal(ch.delegationDrivesActive, true);
  assert.equal(state.seats.get(ch.seatId!)?.seatKind, 'work');
});

test('delegating supervisor without a workstation does not type in place', () => {
  const state = new OfficeState(makeLayout(loungeFurniture()));
  addAgent(state, 1, false);

  state.setAgentDelegation(1, buildDelegationVisualState(summary()));
  state.update(1);

  const ch = state.characters.get(1)!;
  assert.equal(ch.isActive, true);
  assert.equal(ch.seatId, null);
  assert.notEqual(ch.state, CharacterState.TYPE);
});

test('completed delegation marker does not promote an idle supervisor to active', () => {
  const state = new OfficeState(makeLayout([...workstationFurniture(), ...loungeFurniture()]));
  addAgent(state, 1, false);

  state.setAgentDelegation(
    1,
    buildDelegationVisualState(
      summary({
        status: 'waiting_for_delegate',
        activeDelegateCount: 0,
        completedDelegateCount: 2,
      }),
    ),
  );

  const ch = state.characters.get(1)!;
  const seat = ch.seatId ? state.seats.get(ch.seatId) : undefined;
  assert.equal(ch.isActive, false);
  assert.equal(ch.delegation?.isActive, false);
  assert.equal(seat?.seatKind, 'rest');
});

test('delegation visuals do not convert subagents into top-level office agents', () => {
  const state = new OfficeState(makeLayout(workstationFurniture()));
  addAgent(state, 1, true);

  const subId = state.addSubagent(1, 'task-a');
  const beforeCount = state.characters.size;
  state.setAgentDelegation(1, buildDelegationVisualState(summary()));

  const sub = state.characters.get(subId)!;
  assert.equal(state.characters.size, beforeCount);
  assert.equal([...state.characters.values()].filter((ch) => !ch.isSubagent).length, 1);
  assert.equal(sub.isSubagent, true);
  assert.equal(sub.seatId, null);
});
