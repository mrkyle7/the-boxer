'use strict';

// "edward": a secret pause for three seconds. The fight carries on, but no
// hit does any damage and the clock stands still. Stamina still counts.

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

test('edward: hits land but do no damage, and the clock stands still', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 520;
  type(g, 1, 'edward');
  const timer = g.timer;
  G.pressAction(g, 0, 'kick');
  const events = run(g, 40);
  const hit = events.find((e) => e.type === 'hit');
  assert.ok(hit, 'the kick still lands (hit-stun, knock-back and all)');
  assert.strictEqual(hit.damage, 0);
  assert.strictEqual(b.hp, G.MAX_HP);
  assert.strictEqual(g.timer, timer);
  assert.ok(a.stamina < G.MAX_STAMINA, 'the kick still cost stamina');
});

test('edward: everyone still moves, and nobody is told', () => {
  const g = fight();
  const a = g.fighters[0];
  const x = a.x;
  type(g, 1, 'edward');
  assert.ok(!('paused' in G.snapshot(g)), 'nothing in what everyone sees');
  G.setHeld(g, 0, { left: true });
  run(g, 10);
  assert.ok(a.x < x);
});

test('edward: after three seconds hits hurt again and the clock runs', () => {
  const g = fight();
  const [a, b] = g.fighters;
  type(g, 1, 'edward');
  const events = run(g, G.PAUSE_TICKS);
  assert.ok(events.some((e) => e.type === 'unpause' && e.attacker === 1));
  const timer = g.timer;
  a.x = 400;
  b.x = 520;
  G.pressAction(g, 0, 'punch');
  run(g, 20);
  assert.ok(b.hp < G.MAX_HP);
  assert.ok(g.timer < timer);
});

test('edward: covers the cheat moves and the giant fist too, and the spikes', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 600;
  type(g, 1, 'daniel');
  type(g, 1, 'edward');
  G.cheat(g, 0, 'zeffen');
  run(g, 60);
  assert.strictEqual(b.hp, G.MAX_HP);
  assert.strictEqual(a.hp, G.MAX_HP, 'no spikes back either');
  const f = G.createGame(['Kyle', 'B'], { fists: true, random: () => 0 });
  while (f.phase !== 'fight') G.step(f);
  run(f, G.FIST_MIN_TICKS);
  type(f, 1, 'edward');
  run(f, G.FIST_WARN_TICKS);
  assert.strictEqual(f.fighters[0].hp, G.MAX_HP);
});
