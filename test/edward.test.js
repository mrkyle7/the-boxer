'use strict';

// "edward": the whole fight pauses for three seconds.

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

test('edward: everything stops for three seconds, Edward included, then carries on', () => {
  const g = fight();
  const [a, b] = g.fighters;
  G.setHeld(g, 0, { left: true });
  G.setHeld(g, 1, { right: true });
  run(g, 5);
  type(g, 0, 'edward');
  assert.ok(G.snapshot(g).paused > 0, 'everyone sees it');
  const ax = a.x;
  const bx = b.x;
  const timer = g.timer;
  run(g, G.PAUSE_TICKS - 1);
  assert.strictEqual(a.x, ax);
  assert.strictEqual(b.x, bx);
  assert.strictEqual(g.timer, timer, 'the clock stops too');
  const events = run(g, 1);
  assert.ok(events.some((e) => e.type === 'unpause'));
  run(g, 5);
  assert.ok(a.x < ax && b.x > bx, 'moving again');
  assert.ok(g.timer < timer);
});

test('edward: attacks in progress freeze mid-way, and land afterwards', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 520;
  G.pressAction(g, 0, 'punch');
  run(g, 3);
  type(g, 1, 'edward');
  const during = run(g, G.PAUSE_TICKS - 1);
  assert.ok(!during.some((e) => e.type === 'hit'));
  const after = run(g, 20);
  assert.ok(after.some((e) => e.type === 'hit' && e.target === 1));
});

test("edward: can't be stacked or typed over while paused", () => {
  const g = fight();
  type(g, 0, 'edward');
  run(g, 60);
  type(g, 1, 'edward');
  assert.strictEqual(g.paused, G.PAUSE_TICKS - 60);
  type(g, 1, 'zeffen');
  assert.strictEqual(g.fighters[1].typing, '');
});
