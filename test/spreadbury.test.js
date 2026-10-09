'use strict';

// "spreadbury": USA! Two hotdogs float down; catch one for half your health back.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

function fight(names = ['A', 'B'], r = 0.5) {
  const g = G.createGame(names, { random: () => r });
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

test('spreadbury: USA for ten seconds, and two hotdogs drop at different moments', () => {
  const g = fight();
  type(g, 0, 'spreadbury');
  assert.ok(G.snapshot(g).usa > 0, 'everyone sees the USA theme');
  assert.strictEqual(G.snapshot(g).theme, 'usa');
  const events = run(g, G.USA_TICKS + 10);
  const drops = events.filter((e) => e.type === 'hotdogDrop');
  assert.strictEqual(drops.length, 2);
  assert.ok(!('usa' in G.snapshot(g)), 'over after ten seconds');
  assert.strictEqual(events.filter((e) => e.type === 'hotdogSplat' || e.type === 'hotdogCaught').length, 2);
});

test('spreadbury: catch a hotdog for half your health back (never above full)', () => {
  const g = fight(['A', 'B'], 0);
  const [a, b] = g.fighters;
  a.hp = 30;
  b.hp = 90;
  type(g, 1, 'spreadbury');
  // Stand under each hotdog as its shadow appears.
  let caught = [];
  for (let i = 0; i < G.USA_TICKS; i++) {
    G.step(g);
    for (const e of g.events) {
      if (e.type === 'hotdogDrop') { a.x = e.x; b.x = e.x > 500 ? 150 : 850; }
      if (e.type === 'hotdogCaught') caught.push(e);
    }
    g.events = [];
  }
  assert.strictEqual(caught.length, 2);
  assert.ok(caught.every((e) => e.target === 0), 'A caught both: anyone can catch them, not just who typed it');
  assert.strictEqual(a.hp, G.MAX_HP);
  assert.strictEqual(caught[0].heal, G.HOTDOG_HEAL);
});

test('spreadbury: a hotdog nobody is under splats on the floor', () => {
  const g = fight(['A', 'B'], 0);
  const [a, b] = g.fighters;
  a.hp = 30;
  type(g, 0, 'spreadbury');
  let splats = 0;
  for (let i = 0; i < G.USA_TICKS; i++) {
    G.step(g);
    for (const e of g.events) {
      if (e.type === 'hotdogDrop') { a.x = e.x > 500 ? 120 : 880; b.x = a.x === 120 ? 300 : 700; }
      if (e.type === 'hotdogSplat') splats++;
    }
    g.events = [];
  }
  assert.strictEqual(splats, 2);
  assert.strictEqual(a.hp, 30);
});

test('spreadbury: it falls slower than the giant fist, and lands in the ring', () => {
  assert.ok(G.HOTDOG_FALL_TICKS > G.FIST_WARN_TICKS * 2);
  const g = fight(['A', 'B', 'C'], 0.99);
  type(g, 0, 'spreadbury');
  const drops = run(g, G.USA_TICKS).filter((e) => e.type === 'hotdogDrop');
  for (const d of drops) {
    assert.ok(d.x >= G.RING_MIN && d.x <= G.RING_MAX && d.y >= G.RING_MIN && d.y <= G.RING_MAX);
  }
});

test('mamtora: the same, but India, and dosas', () => {
  const g = fight(['A', 'B'], 0);
  const a = g.fighters[0];
  a.hp = 20;
  type(g, 1, 'mamtora');
  assert.strictEqual(G.snapshot(g).theme, 'india');
  let caught = 0;
  for (let i = 0; i < G.USA_TICKS; i++) {
    G.step(g);
    for (const e of g.events) {
      if (e.type === 'hotdogDrop') { assert.strictEqual(e.kind, 'dosa'); a.x = e.x; g.fighters[1].x = e.x > 500 ? 150 : 850; }
      if (e.type === 'hotdogCaught') caught++;
    }
    g.events = [];
  }
  assert.strictEqual(caught, 2);
  assert.strictEqual(a.hp, G.MAX_HP);
  assert.ok(!('theme' in G.snapshot(g)));
});
