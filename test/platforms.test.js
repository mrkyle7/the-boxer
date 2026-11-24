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

test('run and jump: holding a direction carries you across through the jump', () => {
  for (const venue of ['ring', 'meadow']) {
    const g = fight(venue);
    const a = g.fighters[0];
    a.x = 300; g.fighters[1].x = 900;
    Game.setHeld(g, 0, { aim: 'head', right: true });
    Game.pressAction(g, 0, 'jump');
    for (let i = 0; i < 40; i++) Game.step(g);
    assert.ok(a.x > 300 + 4.2 * 25, `${venue}: carried on (${a.x})`);
  }
});

const Bot = require('../bot.js');

/** A hard bot chasing a sitting target up on a ledge: does it get there? */
function botReaches(ledge, seed) {
  let s = seed;
  const random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = Game.createGame(['Target', 'Bot'], { venue: 'meadow', random });
  while (g.phase === 'countdown') Game.step(g);
  const t = g.fighters[0];
  const b = g.fighters[1];
  const bot = Bot.createBot('hard', random);
  bot.nextCode = Infinity; // no cheat codes: just climbing
  b.x = 700;
  for (let i = 0; i < 20 * Game.TICK_RATE; i++) {
    t.x = (ledge.x0 + ledge.x1) / 2; t.z = ledge.h; t.vz = 0; t.hp = 100;
    Bot.botTick(g, 1, bot);
    Game.step(g);
    if (b.z === ledge.h) return true;
  }
  return false;
}

test('a bot jumps up to a low ledge after you', () => {
  assert.ok(botReaches(Game.PLATFORMS[0], 7));
});

test('a bot climbs to the high ledge by way of a low one', () => {
  assert.ok(botReaches(Game.PLATFORMS[2], 11));
});

test('a teleport takes you up to their level', () => {
  const g = fight('meadow');
  const [a, b] = g.fighters;
  const p = Game.PLATFORMS[2];
  b.x = 500; b.z = p.h;
  a.x = 200;
  Game.cheat(g, 0, 'luna');
  for (let i = 0; i < 3; i++) Game.step(g);
  assert.strictEqual(a.z, p.h);
});

test('on a stage, hotdogs fall where fighters can reach them', () => {
  const g = Game.createGame(['A', 'B', 'C'], { venue: 'snow' });
  while (g.phase === 'countdown') Game.step(g);
  Game.cheat(g, 0, 'spreadbury');
  for (let i = 0; i < 3; i++) Game.step(g);
  assert.ok(g.hotdogs.length);
  g.hotdogs.forEach((h) => assert.ok(h.y >= Game.STAGE_MIN && h.y <= Game.STAGE_MAX, `y ${h.y}`));
});
