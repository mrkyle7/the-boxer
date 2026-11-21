'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Game = require('../public/game.js');

function fight(venue) {
  const g = Game.createGame(['A', 'B'], { venue });
  while (g.phase === 'countdown') Game.step(g);
  return g;
}

test('platforms in a setting, none in the plain ring', () => {
  assert.strictEqual(fight('ring').platforms.length, 0);
  assert.strictEqual(Game.createGame(['A', 'B', 'C'], { venue: 'ring' }).platforms.length, 0);
  assert.strictEqual(Game.createGame(['A', 'B', 'C'], { venue: 'snow' }).platforms.length, 3);
  assert.strictEqual(fight('meadow').platforms.length, 3);
});

test('three or four fight on the same stage, and can jump up to the ledges', () => {
  const g = Game.createGame(['A', 'B', 'C', 'D'], { venue: 'forest' });
  assert.strictEqual(g.mode, 'ring');
  g.fighters.forEach((f) => assert.ok(f.y >= Game.STAGE_MIN && f.y <= Game.STAGE_MAX));
  while (g.phase === 'countdown') Game.step(g);
  const a = g.fighters[0];
  const p = Game.PLATFORMS[0];
  a.x = p.x1 + 20; a.y = 500;
  g.fighters.forEach((f, i) => { if (i) { f.x = 800 + i * 20; f.y = 450 + i * 30; } });
  Game.pressAction(g, 0, 'jump');
  Game.setHeld(g, 0, { aim: 'head', left: true });
  for (let i = 0; i < 60; i++) Game.step(g);
  assert.strictEqual(a.z, p.h);
  // Keeps to the stage.
  Game.setHeld(g, 0, { aim: 'head', down: true });
  for (let i = 0; i < 200; i++) Game.step(g);
  assert.ok(a.y <= Game.STAGE_MAX);
});

test('a jump from the floor lands on a low ledge, and walking off drops you', () => {
  const g = fight('meadow');
  const a = g.fighters[0];
  const p = Game.PLATFORMS[0];
  a.x = p.x1 + 20; // just beside the left ledge's right end
  g.fighters[1].x = 900;
  Game.pressAction(g, 0, 'jump');
  Game.setHeld(g, 0, { aim: 'head', left: true });
  let top = 0;
  for (let i = 0; i < 60; i++) { Game.step(g); top = Math.max(top, a.z); }
  assert.ok(top > p.h, `jumped high enough (${top})`);
  assert.strictEqual(a.z, p.h, 'standing on the ledge');
  assert.ok(a.x >= p.x0 && a.x <= p.x1);
  // Walk off the right edge.
  Game.setHeld(g, 0, { aim: 'head', right: true });
  for (let i = 0; i < 120; i++) Game.step(g);
  assert.strictEqual(a.z, 0);
});

test('a straight jump from the floor cannot reach the high ledge', () => {
  const g = fight('forest');
  const a = g.fighters[0];
  a.x = 500;
  g.fighters[1].x = 900;
  Game.pressAction(g, 0, 'jump');
  for (let i = 0; i < 60; i++) Game.step(g);
  assert.strictEqual(a.z, 0);
});

test('attacks miss someone on another level', () => {
  const g = fight('meadow');
  const [a, b] = g.fighters;
  a.x = 400; b.x = 470;
  b.z = Game.PLATFORMS[0].h + 100; // way up (and falling will take a while)
  b.vz = 0;
  Game.pressAction(g, 0, 'punch');
  for (let i = 0; i < 12; i++) { b.z = 250; Game.step(g); }
  assert.strictEqual(b.hp, 100);
});
