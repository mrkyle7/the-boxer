'use strict';

// "bear": honey thrown at whoever's nearest, a quarter of the screen at most.
// Whoever it splats moves at half speed for ten seconds.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

function fight(names = ['A', 'B']) {
  const g = G.createGame(names);
  while (g.phase !== 'fight') G.step(g);
  g.events = [];
  return g;
}

function run(g, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) {
    G.step(g);
    events.push(...g.events);
    g.events = [];
  }
  return events;
}

const type = (g, i, word) => { for (const k of word) G.typeKey(g, i, k); };
const FLIGHT = Math.ceil(G.HONEY_RANGE / G.HONEY_SPEED) + 2;

/** How far fighter `i` walks left in 20 ticks. */
function walk(g, i) {
  const f = g.fighters[i];
  const x = f.x;
  G.setHeld(g, i, { left: true });
  run(g, 20);
  G.setHeld(g, i, {});
  return x - f.x;
}

test('bear: honey splats them, and they move at half speed for ten seconds', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 300; b.x = 500;
  type(g, 0, 'bear');
  const events = run(g, FLIGHT);
  assert.ok(events.some((e) => e.type === 'bear' && e.attacker === 0 && e.target === 1));
  assert.ok(events.some((e) => e.type === 'honeyHit' && e.target === 1));
  assert.ok(G.snapshot(g).fighters[1].sticky > 0);
  assert.strictEqual(b.hp, G.MAX_HP, 'no damage, just sticky');
  b.x = 800; a.x = 200;
  const slow = walk(g, 1);
  run(g, G.STICKY_TICKS);
  assert.ok(!('sticky' in G.snapshot(g).fighters[1]), 'washed off');
  b.x = 800;
  const normal = walk(g, 1);
  assert.ok(Math.abs(slow / normal - G.STICKY_SPEED) < 0.05, `${slow} vs ${normal}`);
  assert.strictEqual(G.STICKY_TICKS, 10 * G.TICK_RATE);
});

test('it only carries a quarter of the screen', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 200; b.x = 200 + G.HONEY_RANGE + 120;
  G.cheat(g, 0, 'bear');
  const events = run(g, FLIGHT + 10);
  assert.ok(events.some((e) => e.type === 'honeyMiss'));
  assert.ok(!events.some((e) => e.type === 'honeyHit'));
  assert.strictEqual(b.sticky, 0);
  assert.strictEqual(G.HONEY_RANGE, 250);
});

test('jump over it', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 300; b.x = 520;
  G.cheat(g, 0, 'bear');
  G.pressAction(g, 1, 'jump');
  const events = run(g, FLIGHT + 10);
  assert.ok(!events.some((e) => e.type === 'honeyHit'));
  assert.strictEqual(b.sticky, 0);
});

test('in the ring it goes at the nearest', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 500; a.y = 500;
  b.x = 850; b.y = 850;
  c.x = 500; c.y = 680;
  G.cheat(g, 0, 'bear');
  const events = run(g, FLIGHT);
  assert.ok(events.some((e) => e.type === 'honeyHit' && e.target === 2));
  assert.strictEqual(b.sticky, 0);
});
