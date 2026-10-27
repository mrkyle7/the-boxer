'use strict';

// Getting out of a corner, one on one: the leapfrog and the referee's break.
// And the clinch break, anywhere: block three quick hits to shove them off.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

/** A is backed onto the left ropes, B close in front. */
function cornered() {
  const g = G.createGame(['A', 'B']);
  while (g.phase !== 'fight') G.step(g);
  g.events = [];
  g.fighters[0].x = G.RING_LEFT + 10;
  g.fighters[1].x = G.RING_LEFT + 110;
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

const JUMP = G.MOVES.jump.startup + G.MOVES.jump.recovery;

test('leapfrog: jumping in the corner takes you over their head and out', () => {
  const g = cornered();
  const [a, b] = g.fighters;
  G.pressAction(g, 0, 'jump');
  const events = run(g, 6);
  assert.ok(events.some((e) => e.type === 'leapfrog' && e.attacker === 0));
  G.pressAction(g, 1, 'punch'); // swings at A going over
  events.push(...run(g, JUMP));
  assert.ok(a.x > b.x + G.MIN_SEPARATION - 5, 'landed behind them');
  assert.strictEqual(a.facing, -1, 'facing them again');
  assert.ok(!events.some((e) => e.type === 'hit' && e.target === 0), 'nothing hit A in the air');
});

test('out in the open a jump is still straight up and down', () => {
  const g = cornered();
  const [a, b] = g.fighters;
  a.x = 400; b.x = 520;
  G.pressAction(g, 0, 'jump');
  const events = run(g, JUMP);
  assert.ok(!events.some((e) => e.type === 'leapfrog'));
  assert.ok(Math.abs(a.x - 400) < 2);
});

/** B punches A (blocking, head) `n` times, `gap` ticks apart. */
function blockPunches(g, n, gap) {
  const [a, b] = g.fighters;
  G.setHeld(g, 0, { block: true, aim: 'head' });
  G.setHeld(g, 1, { aim: 'head' });
  run(g, 2);
  const events = [];
  for (let k = 0; k < n; k++) {
    b.x = a.x + 100; // stay on them
    if (g.mode === 'ring') b.y = a.y;
    G.pressAction(g, 1, 'punch');
    events.push(...run(g, gap));
  }
  return events;
}

test('clinch break: block three quick punches in the corner and you shove them off', () => {
  const g = cornered();
  const [a, b] = g.fighters;
  const events = blockPunches(g, 3, 22);
  assert.strictEqual(events.filter((e) => e.type === 'block').length, 3);
  assert.ok(events.some((e) => e.type === 'clinchBreak' && e.attacker === 0));
  run(g, 30);
  assert.ok(b.x - a.x > 180, `shoved off (${Math.round(b.x - a.x)})`);
  assert.strictEqual(b.hp, G.MAX_HP);
});

test('clinch break works out in the open too', () => {
  const g = cornered();
  g.fighters[0].x = 400;
  const events = blockPunches(g, 3, 22);
  assert.ok(events.some((e) => e.type === 'clinchBreak' && e.attacker === 0));
});

test('...and in the ring', () => {
  const g = G.createGame(['A', 'B', 'C']);
  while (g.phase !== 'fight') G.step(g);
  const [a, b, c] = g.fighters;
  a.x = 400; a.y = 500; b.x = 500; b.y = 500; c.x = 850; c.y = 880;
  const events = blockPunches(g, 3, 22);
  assert.ok(events.some((e) => e.type === 'clinchBreak' && e.attacker === 0));
});

test('blocks spread out slowly earn nothing', () => {
  const g = cornered();
  g.fighters[0].x = 400;
  const events = blockPunches(g, 3, G.CLINCH_WINDOW / 2 + 5);
  assert.strictEqual(events.filter((e) => e.type === 'block').length, 3);
  assert.ok(!events.some((e) => e.type === 'clinchBreak'));
});

test('ref break: locked up in the corner for three seconds, back to the middle', () => {
  const g = cornered();
  const [a, b] = g.fighters;
  let events = run(g, G.REF_BREAK_TICKS - 5);
  assert.ok(!events.some((e) => e.type === 'refBreak'));
  events = run(g, 10);
  assert.ok(events.some((e) => e.type === 'refBreak'));
  assert.strictEqual(a.x, G.REF_BREAK_AT[0]);
  assert.strictEqual(b.x, G.REF_BREAK_AT[1]);
});

test('no referee in the ring', () => {
  const g = G.createGame(['A', 'B', 'C']);
  while (g.phase !== 'fight') G.step(g);
  const [a, b] = g.fighters;
  a.x = 70; a.y = 500; b.x = 170; b.y = 500;
  G.setHeld(g, 0, { left: true });
  const events = run(g, G.REF_BREAK_TICKS + 10);
  assert.ok(!events.some((e) => e.type === 'refBreak'));
});
