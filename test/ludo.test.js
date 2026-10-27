'use strict';

// "ludo": a sword for 7s. Punches only: 1.5x damage, 1.25x reach.

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

function punchFrom(g, gap) {
  const [a, b] = g.fighters;
  a.x = 300;
  b.x = 300 + gap;
  b.hp = G.MAX_HP;
  G.setHeld(g, 0, { aim: 'head' });
  G.pressAction(g, 0, 'punch');
  return run(g, 30).find((e) => e.type === 'hit' && e.target === 1);
}

test('ludo: a sword slash does 1.5x damage', () => {
  const g = fight();
  type(g, 0, 'ludo');
  assert.ok(g.events.some((e) => e.type === 'ludo' && e.target === 0));
  assert.ok(G.snapshot(g).fighters[0].sword > 0, 'everyone can see the sword');
  const hit = punchFrom(g, 140);
  assert.strictEqual(hit.damage, Math.round(G.MOVES.punch.head.damage * 1.5));
});

test('ludo: 25% more reach', () => {
  const far = G.MOVES.punch.range + 30; // out of reach of a plain punch
  const plain = fight();
  assert.ok(!punchFrom(plain, far), 'a plain punch misses');
  const g = fight();
  type(g, 0, 'ludo');
  assert.ok(punchFrom(g, far), 'the sword reaches');
  assert.ok(G.MOVES.punch.range * G.SWORD_REACH >= far);
});

test('ludo: no kicks while you hold the sword', () => {
  const g = fight();
  type(g, 0, 'ludo');
  g.fighters[0].x = 400;
  g.fighters[1].x = 560;
  G.pressAction(g, 0, 'kick');
  const events = run(g, 30);
  assert.notStrictEqual(g.fighters[0].move, 'kick');
  assert.ok(!events.some((e) => e.type === 'hit'));
});

test('ludo: gone after ten seconds', () => {
  const g = fight();
  type(g, 0, 'ludo');
  run(g, G.SWORD_TICKS);
  assert.strictEqual(g.fighters[0].sword, 0);
  const hit = punchFrom(g, 140);
  assert.strictEqual(hit.damage, G.MOVES.punch.head.damage);
  assert.strictEqual(G.SWORD_TICKS, 10 * G.TICK_RATE);
});
