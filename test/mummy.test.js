'use strict';

// "mummy": love all round for seven seconds. Anyone too close is caught in a
// cuddle, and she steals 10 health from them.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

function fight(names = ['Mum', 'B']) {
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

test('mummy: whoever comes too close is cuddled, and she takes 10 health', () => {
  const g = fight();
  const [m, b] = g.fighters;
  m.x = 300; b.x = 700;
  m.hp = 50;
  type(g, 0, 'mummy');
  assert.ok(run(g, 1).some((e) => e.type === 'mummy'));
  assert.ok(G.snapshot(g).fighters[0].love > 0);
  assert.ok(!run(g, 30).some((e) => e.type === 'cuddle'), 'nobody near');
  b.x = m.x + G.MUMMY_RADIUS - 10;
  const events = run(g, 2);
  assert.ok(events.some((e) => e.type === 'cuddle' && e.attacker === 0 && e.target === 1));
  assert.strictEqual(b.hp, G.MAX_HP - G.CUDDLE_STEAL);
  assert.strictEqual(m.hp, 50 + G.CUDDLE_STEAL);
  assert.strictEqual(b.state, 'hitstun', 'held in the cuddle');
  assert.ok(G.snapshot(g).fighters[1].hug > 0);
  assert.ok(Math.abs(b.x - m.x) <= G.MIN_SEPARATION + 1, 'pulled in close');
  assert.strictEqual(G.CUDDLE_STEAL, 10);
});

test('a second to be held, two more to get away before the next cuddle', () => {
  const g = fight();
  const [m, b] = g.fighters;
  m.x = 300; b.x = 400;
  G.cheat(g, 0, 'mummy');
  const events = run(g, G.CUDDLE_TICKS + G.CUDDLE_EVERY + 2);
  const cuddles = events.filter((e) => e.type === 'cuddle');
  assert.strictEqual(cuddles.length, 2, 'stayed close: caught again');
  assert.strictEqual(b.hp, G.MAX_HP - 2 * G.CUDDLE_STEAL);
});

test('the love wears off after seven seconds', () => {
  const g = fight();
  const [m, b] = g.fighters;
  m.x = 200; b.x = 800;
  G.cheat(g, 0, 'mummy');
  run(g, G.MUMMY_TICKS + 1);
  assert.ok(!('love' in G.snapshot(g).fighters[0]));
  b.x = 300;
  assert.ok(!run(g, 10).some((e) => e.type === 'cuddle'));
  assert.strictEqual(G.MUMMY_TICKS, 7 * G.TICK_RATE);
});

test('in the ring, everyone close enough gets a cuddle', () => {
  const g = fight(['Mum', 'B', 'C', 'D']);
  const [m, b, c, d] = g.fighters;
  m.x = 500; m.y = 500;
  b.x = 600; b.y = 500;
  c.x = 500; c.y = 610;
  d.x = 850; d.y = 850;
  G.cheat(g, 0, 'mummy');
  const events = run(g, 3);
  const caught = events.filter((e) => e.type === 'cuddle').map((e) => e.target).sort();
  assert.deepStrictEqual(caught, [1, 2]);
  assert.strictEqual(d.hp, G.MAX_HP);
});
