'use strict';

// Getting out of a corner, one on one: leapfrog, rope bounce, clinch break,
// and the referee's break.

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

test('rope bounce: keep pushing into the ropes and you barge them back, no damage', () => {
  const g = cornered();
  const [a, b] = g.fighters;
  G.setHeld(g, 0, { left: true });
  const events = run(g, G.ROPE_WIND + 2);
  assert.ok(events.some((e) => e.type === 'ropeBounce' && e.attacker === 0));
  G.setHeld(g, 0, {});
  run(g, 30);
  assert.ok(b.x - a.x > 200, `pushed well back (${Math.round(b.x - a.x)})`);
  assert.strictEqual(b.hp, G.MAX_HP);
});

test('just leaning on the ropes for a moment does nothing', () => {
  const g = cornered();
  G.setHeld(g, 0, { left: true });
  assert.ok(!run(g, G.ROPE_WIND - 3).some((e) => e.type === 'ropeBounce'));
});

test('clinch break: block three in a row in the corner and you shove them off', () => {
  const g = cornered();
  const [a, b] = g.fighters;
  G.setHeld(g, 0, { block: true, aim: 'head' });
  G.setHeld(g, 1, { aim: 'head' });
  run(g, 2);
  const events = [];
  for (let k = 0; k < 3; k++) {
    b.x = a.x + 100; // stay on them
    G.pressAction(g, 1, 'punch');
    events.push(...run(g, 22));
  }
  assert.strictEqual(events.filter((e) => e.type === 'block').length, 3);
  assert.ok(events.some((e) => e.type === 'clinchBreak' && e.attacker === 0));
  run(g, 30);
  assert.ok(b.x - a.x > 180, `shoved off (${Math.round(b.x - a.x)})`);
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

test('no corner tricks in the ring', () => {
  const g = G.createGame(['A', 'B', 'C']);
  while (g.phase !== 'fight') G.step(g);
  const [a, b] = g.fighters;
  a.x = 70; a.y = 500; b.x = 170; b.y = 500;
  G.setHeld(g, 0, { left: true });
  const events = run(g, G.REF_BREAK_TICKS + 10);
  assert.ok(!events.some((e) => ['ropeBounce', 'refBreak', 'leapfrog', 'clinchBreak'].includes(e.type)));
});
