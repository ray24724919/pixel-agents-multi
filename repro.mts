import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildDynamicCatalog } from './webview-ui/src/office/layout/furnitureCatalog.js';
import { layoutToSeats } from './webview-ui/src/office/layout/layoutSerializer.js';
import { OfficeState } from './webview-ui/src/office/engine/officeState.js';
import { Direction, CharacterState } from './webview-ui/src/office/types.js';
import { seatIsForeignProjectRoomForAgent } from './webview-ui/src/office/projectRooms.js';

const layoutPath = path.join(os.homedir(), '.pixel-agents-multi', 'layout.json');
const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));

const cjPath = path.join(process.cwd(), 'dist', 'webview', 'assets', 'furniture-catalog.json');
const cj = JSON.parse(fs.readFileSync(cjPath, 'utf8'));
const assets = (cj.furniture ?? cj).map((e: any) => ({
  ...e,
  width: (e.footprintW ?? 1) * 16,
  height: (e.footprintH ?? 1) * 16,
}));
buildDynamicCatalog({
  catalog: assets,
  sprites: Object.fromEntries(assets.map((a: any) => [a.id, [['#fff']]])),
} as any);

const ANIMFY = 'c:/users/user/documents/raychen/animfy_gs1';

// Build seats and find the animfy room's seats.
const seats = layoutToSeats(layout);
const animfyRoom = layout.projectRooms.find((r: any) => r.project?.key === ANIMFY);
const pxRoom = layout.projectRooms.find((r: any) => r.id === 'project-pixel-agents-multi');
function inRoom(room: any, col: number, row: number) {
  return (
    col >= room.bounds.col &&
    col < room.bounds.col + room.bounds.width &&
    row >= room.bounds.row &&
    row < room.bounds.row + room.bounds.height
  );
}

const animfySeats = [...seats.values()].filter((s) => inRoom(animfyRoom, s.seatCol, s.seatRow));
const pxSeats = [...seats.values()].filter((s) => inRoom(pxRoom, s.seatCol, s.seatRow));
console.log('=== animfy room seats ===');
for (const s of animfySeats)
  console.log(s.uid, `(${s.seatCol},${s.seatRow})`, s.seatKind, s.zoneSource);
console.log('animfy: work=', animfySeats.filter((s) => s.seatKind === 'work').length, 'rest=', animfySeats.filter((s) => s.seatKind === 'rest').length);
console.log('=== pixel-agents room seats ===');
for (const s of pxSeats)
  console.log(s.uid, `(${s.seatCol},${s.seatRow})`, s.seatKind, s.zoneSource);
console.log('px: work=', pxSeats.filter((s) => s.seatKind === 'work').length, 'rest=', pxSeats.filter((s) => s.seatKind === 'rest').length);

// Verify the foreign-room guard for an animfy agent against each px seat.
const fakeAnimfyCh = { folderName: undefined, projectDir: ANIMFY, projectName: undefined } as any;
console.log('\n=== foreign-room guard: animfy agent vs px seats ===');
for (const s of pxSeats) {
  const foreign = seatIsForeignProjectRoomForAgent(layout, fakeAnimfyCh, s);
  console.log(s.uid, `(${s.seatCol},${s.seatRow})`, 'foreign?', foreign);
}

// Now drive the real engine.
console.log('\n=== ENGINE: add idle animfy agent ===');
const os1 = new OfficeState(layout);
os1.addAgent(
  1, // id
  0, // palette
  0, // hueShift
  undefined, // preferredSeatId
  true, // skipSpawnEffect
  'animfy_gs1', // folderName
  false, // initialActive  => idle
  false, // randomizeInitialSeat
  ANIMFY, // projectDir
  'animfy_gs1', // projectName
);
const ch = (os1 as any).characters.get(1);
console.log('after addAgent: tile=', ch.tileCol, ch.tileRow, 'seatId=', ch.seatId, 'restSeatId=', ch.restSeatId, 'state=', ch.state);
const initSeat = ch.seatId ? (os1 as any).seats.get(ch.seatId) : null;
console.log('seat in animfy?', initSeat ? inRoom(animfyRoom, initSeat.seatCol, initSeat.seatRow) : 'no seat');

function whereRoom(col: number, row: number) {
  for (const r of layout.projectRooms) if (inRoom(r, col, row)) return r.id;
  return 'NEUTRAL';
}

// Simulate the FSM stepping forward until it sits, watching for teleports.
let prevCol = ch.tileCol,
  prevRow = ch.tileRow;
const dt = 0.1;
for (let step = 0; step < 2000; step++) {
  os1.update(dt);
  if (Math.abs(ch.tileCol - prevCol) + Math.abs(ch.tileRow - prevRow) > 1) {
    console.log(
      `TELEPORT at step ${step}: (${prevCol},${prevRow})[${whereRoom(prevCol, prevRow)}] -> (${ch.tileCol},${ch.tileRow})[${whereRoom(ch.tileCol, ch.tileRow)}] state=${ch.state}`,
    );
  }
  prevCol = ch.tileCol;
  prevRow = ch.tileRow;
}
console.log('final tile', ch.tileCol, ch.tileRow, whereRoom(ch.tileCol, ch.tileRow), 'state', ch.state, 'seatId', ch.seatId);
