'use strict';

// "paul": a lullaby on the piano, and everyone else asleep till they're hit.

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

test('paul: two seconds of piano, then they fall asleep', () => {
  const g = fight();
  type(g, 0, 'paul');
  assert.ok(G.snapshot(g).fighters[0].piano, 'at the piano');
  assert.ok(!run(g, G.PIANO_TICKS - 5).some((e) => e.type === 'lullaby'), 'still playing');
  const events = run(g, 10);
  const lullaby = events.find((e) => e.type === 'lullaby');
  assert.deepStrictEqual(lullaby.targets, [1]);
  assert.strictEqual(g.fighters[1].asleep, true);
  assert.ok(G.snapshot(g).fighters[1].asleep);
  assert.ok(!G.snapshot(g).fighters[0].piano, 'done playing');
});

test('paul: asleep, they stay asleep, and can not move, attack, block or type', () => {
  const g = fight();
  type(g, 0, 'paul');
  run(g, G.PIANO_TICKS + 2);
  const b = g.fighters[1];
  const x = b.x;
  G.setHeld(g, 1, { right: true, block: true });
  G.pressAction(g, 1, 'punch');
  run(g, 20 * G.TICK_RATE);
  assert.strictEqual(b.asleep, true, 'still asleep twenty seconds on');
  assert.strictEqual(b.x, x);
  assert.notStrictEqual(b.state, 'block');
  assert.notStrictEqual(b.state, 'attack');
  type(g, 1, 'paul');
  assert.ok(!b.piano, 'no typing in your sleep');
});

test('paul: a hit wakes them up (and lands in full: no guard)', () => {
  const g = fight();
  g.fighters[0].x = 450;
  g.fighters[1].x = 530;
  type(g, 0, 'paul');
  G.setHeld(g, 1, { block: true });
  run(g, G.PIANO_TICKS + 2);
  G.pressAction(g, 0, 'punch');
  const events = run(g, 30);
  assert.ok(events.some((e) => e.type === 'hit' && e.target === 1));
  assert.ok(events.some((e) => e.type === 'wake' && e.target === 1));
  assert.strictEqual(g.fighters[1].asleep, false);
  assert.ok(g.fighters[1].hp < G.MAX_HP);
});

test('paul: hit the pianist and the music stops, nobody sleeps', () => {
  const g = fight();
  g.fighters[0].x = 450;
  g.fighters[1].x = 530;
  type(g, 0, 'paul');
  G.pressAction(g, 1, 'punch');
  const events = run(g, G.PIANO_TICKS + 30);
  assert.ok(events.some((e) => e.type === 'pianoStop'));
  assert.ok(!events.some((e) => e.type === 'lullaby'));
  assert.strictEqual(g.fighters[1].asleep, false);
});

test('paul: in the ring, everyone else nods off; an invincible one does not', () => {
  const g = fight(['A', 'B', 'C', 'D']);
  type(g, 3, 'supercalifragilisticexpialidocious');
  type(g, 0, 'paul');
  run(g, G.PIANO_TICKS + 2);
  assert.deepStrictEqual(g.fighters.map((f) => f.asleep), [false, true, true, false]);
});

test('paul: a new round, everyone wakes up fresh', () => {
  const g = fight();
  type(g, 0, 'paul');
  run(g, G.PIANO_TICKS + 2);
  g.timer = 1;
  run(g, 2);
  while (g.phase !== 'fight') G.step(g);
  assert.strictEqual(g.fighters[1].asleep, false);
});
