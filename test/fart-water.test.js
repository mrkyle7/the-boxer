'use strict';

// luna's kick after the teleport, fart (poison cloud), water (boat or swim).

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

test('luna: teleports in and kicks', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 150;
  b.x = 800;
  type(g, 0, 'luna');
  assert.strictEqual(a.move, 'kick');
  const events = run(g, 30);
  const hit = events.find((e) => e.type === 'hit' && e.move === 'kick' && e.target === 1);
  assert.ok(hit, 'the kick landed');
  assert.ok(b.hp < G.MAX_HP);
});

test('luna in the ring: kicks the one it lands next to', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, , c] = g.fighters;
  a.x = 150; a.y = 150;
  g.fighters[1].x = 700; g.fighters[1].y = 700;
  c.x = 850; c.y = 200;
  type(g, 0, 'luna');
  const events = run(g, 30);
  assert.ok(events.some((e) => e.type === 'hit' && e.target === 2));
});

test('fart: the cloud poisons them, 5 every 10 seconds, for the rest of the match', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 300;
  b.x = 600;
  type(g, 0, 'fart');
  const events = run(g, 120);
  assert.ok(events.some((e) => e.type === 'fart' && e.attacker === 0));
  assert.ok(events.some((e) => e.type === 'gassed' && e.target === 1));
  assert.ok(b.poison);
  assert.strictEqual(b.hp, G.MAX_HP, 'no damage straight away');
  g.timer = 100000;
  const later = run(g, G.POISON_EVERY);
  assert.strictEqual(later.filter((e) => e.type === 'poison' && e.target === 1).length, 1);
  assert.strictEqual(b.hp, G.MAX_HP - G.POISON_DAMAGE);
  run(g, G.POISON_EVERY * 2);
  assert.strictEqual(b.hp, G.MAX_HP - 3 * G.POISON_DAMAGE);
});

test('fart: the poison carries on into the next round', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 300;
  b.x = 600;
  type(g, 0, 'fart');
  run(g, 120);
  a.hp = 0;
  a.state = 'ko';
  run(g, G.ROUND_END_TICKS + 2);
  assert.strictEqual(g.round, 2);
  assert.ok(g.fighters[1].poison, 'still poisoned');
  assert.ok(!g.fighters[0].poison);
});

test('fart: jump over the cloud to dodge it', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 300;
  b.x = 600;
  type(g, 0, 'fart');
  // The cloud goes off at tick 24 and drifts 6 a tick: it reaches B (70 away) about tick 62.
  run(g, 56);
  G.pressAction(g, 1, 'jump');
  const events = run(g, 160);
  assert.ok(!events.some((e) => e.type === 'gassed'));
  assert.ok(!b.poison);
});

test('water: the clock stops, the first to type boat gets it, the rest must swim', () => {
  const g = fight(['A', 'B', 'C']);
  const timer = g.timer;
  type(g, 0, 'water');
  assert.ok(G.snapshot(g).water);
  type(g, 1, 'boat');
  type(g, 2, 'boat'); // too late
  assert.strictEqual(g.water.boat, 1);
  // A keeps swimming; C doesn't.
  let events = [];
  for (let i = 0; i < G.WATER_TICKS; i++) {
    if (i % 90 === 0) type(g, 0, 'swim');
    events.push(...run(g, 1));
  }
  assert.ok(timer - g.timer <= 1, 'the clock stood still');
  assert.ok(events.some((e) => e.type === 'sank' && e.target === 2), 'C sank');
  assert.ok(!events.some((e) => e.type === 'sank' && e.target === 0), 'A swam');
  assert.ok(!events.some((e) => e.type === 'sank' && e.target === 1), 'B was in the boat');
  assert.ok(events.some((e) => e.type === 'waterEnd'));
  assert.strictEqual(g.water, null);
  run(g, 5);
  assert.ok(g.timer < timer, 'the clock runs again');
});

test("water: swim before it's flooded, or boat after the boat's gone, does nothing", () => {
  const g = fight();
  type(g, 0, 'swim');
  type(g, 0, 'boat');
  assert.strictEqual(g.water, null);
  assert.strictEqual(g.fighters[0].afloat, 0);
});

test("water: don't swim and you sink within a few seconds", () => {
  const g = fight();
  type(g, 0, 'water');
  type(g, 0, 'boat');
  const events = run(g, G.SWIM_TICKS + 2);
  assert.ok(events.some((e) => e.type === 'sank' && e.target === 1));
  assert.ok(events.some((e) => e.type === 'roundEnd' && e.winner === 0));
});
