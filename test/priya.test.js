'use strict';

// "priya": a freeze ray. Three seconds frozen, unless it's blocked.

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

test('priya: the ray flies at them and freezes them for three seconds', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 200;
  b.x = 700;
  type(g, 0, 'priya');
  assert.ok(G.snapshot(g).bolts, 'everyone can see it coming');
  const events = run(g, 40);
  assert.ok(events.some((e) => e.type === 'rayFreeze' && e.target === 1));
  assert.strictEqual(b.frozen > G.RAY_FREEZE_TICKS - 40, true);
  const x = b.x;
  G.setHeld(g, 1, { left: true });
  G.pressAction(g, 1, 'punch');
  run(g, 60);
  assert.strictEqual(b.x, x, "can't move");
  assert.notStrictEqual(b.move, 'punch', "can't punch");
  run(g, G.RAY_FREEZE_TICKS);
  assert.strictEqual(b.frozen, 0, 'thawed out');
  assert.ok(b.x < x, 'moving again');
});

test('priya: holding block stops it', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 200;
  b.x = 700;
  G.setHeld(g, 1, { block: true });
  run(g, 2);
  type(g, 0, 'priya');
  const events = run(g, 40);
  assert.ok(events.some((e) => e.type === 'rayBlocked' && e.target === 1));
  assert.strictEqual(b.frozen, 0);
});

test('priya: it flies straight, so stepping out of the way in the ring dodges it', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 200; a.y = 500;
  b.x = 750; b.y = 500;
  c.x = 850; c.y = 900;
  type(g, 0, 'priya');
  G.setHeld(g, 1, { up: true });
  const events = run(g, 70);
  assert.ok(!events.some((e) => e.type === 'rayFreeze'));
  assert.ok(events.some((e) => e.type === 'rayFizzle'), 'it flew on and fizzled out');
  assert.strictEqual(b.frozen, 0);
});

test('priya in the ring: a guard only stops it from the front', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 200; a.y = 500;
  b.x = 650; b.y = 500;
  c.x = 850; c.y = 500; // B turns to face C, with their back to A
  run(g, 1);
  assert.strictEqual(b.target, 2);
  G.setHeld(g, 1, { block: true });
  run(g, 2);
  type(g, 0, 'priya');
  const events = run(g, 40);
  assert.ok(events.some((e) => e.type === 'rayFreeze' && e.target === 1), 'frozen from behind');
});

test("priya: a jump doesn't dodge it", () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 200;
  b.x = 700;
  G.pressAction(g, 1, 'jump');
  run(g, G.JUMP_CROUCH + 1);
  type(g, 0, 'priya');
  const events = run(g, 30);
  assert.ok(events.some((e) => e.type === 'rayFreeze' && e.target === 1));
});
