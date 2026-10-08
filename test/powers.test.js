'use strict';

// The power-up cheat codes: "jemini" (a giant, 10% harder hits, 7 seconds)
// and "kyle" (invisible to the others, 5 seconds).

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

function kickDamage(g) {
  g.fighters[0].x = 400;
  g.fighters[1].x = 560;
  g.fighters[1].hp = G.MAX_HP;
  G.setHeld(g, 0, { aim: 'head' });
  G.pressAction(g, 0, 'kick');
  return run(g, 30).find((e) => e.type === 'hit').damage;
}

test('jemini: a giant for seven seconds, hitting 10% harder', () => {
  const g = fight();
  type(g, 0, 'jemini');
  assert.strictEqual(g.fighters[0].giant, G.JEMINI_TICKS);
  const events = run(g, 1);
  assert.ok(events.some((e) => e.type === 'jemini' && e.target === 0));
  assert.ok(G.snapshot(g).fighters[0].giant > 0, 'everyone sees it');
  const plain = G.MOVES.kick.head.damage;
  assert.strictEqual(kickDamage(g), Math.round(plain * 1.1));

  run(g, G.JEMINI_TICKS);
  assert.strictEqual(g.fighters[0].giant, 0, 'worn off after seven seconds');
  assert.ok(!('giant' in G.snapshot(g).fighters[0]));
  run(g, 30);
  assert.strictEqual(kickDamage(g), plain);
});

test('jemini works straight away, even mid-attack, and needs no stamina', () => {
  const g = fight();
  g.fighters[0].stamina = 0;
  G.pressAction(g, 0, 'kick');
  run(g, 1);
  type(g, 0, 'jemini');
  assert.ok(g.fighters[0].giant > 0);
});

test('kyle: invisible for five seconds (only how the others draw you)', () => {
  const g = fight();
  type(g, 0, 'kyle');
  const events = run(g, 1);
  assert.ok(events.some((e) => e.type === 'kyle' && e.target === 0));
  assert.ok(G.snapshot(g).fighters[0].invisible > 0);
  run(g, G.KYLE_TICKS);
  assert.ok(!('invisible' in G.snapshot(g).fighters[0]), 'back after five seconds');
  assert.strictEqual(G.KYLE_TICKS, 5 * G.TICK_RATE);
  assert.strictEqual(G.JEMINI_TICKS, 7 * G.TICK_RATE);
});

test('all four codes are there; the E in kyle and jemini is fine', () => {
  assert.ok(['jemini', 'kyle', 'luna', 'zeffen'].every((c) => c in G.CODES));
  const g = fight();
  type(g, 0, 'kyl');
  assert.strictEqual(g.fighters[0].typing, 'kyl');
  type(g, 0, 'jemin');
  assert.strictEqual(g.fighters[0].typing, 'jemin');
});

test('power-ups go at the end of the round', () => {
  const g = fight();
  type(g, 0, 'jemini');
  type(g, 0, 'kyle');
  g.fighters[1].hp = 0;
  g.fighters[1].state = 'ko';
  run(g, G.ROUND_END_TICKS + 2);
  assert.strictEqual(g.round, 2);
  assert.strictEqual(g.fighters[0].giant, 0);
  assert.strictEqual(g.fighters[0].invisible, 0);
});
