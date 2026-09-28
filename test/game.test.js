'use strict';

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

function fightingGame() {
  const g = G.createGame(['A', 'B']);
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

function placeAt(g, distance) {
  g.fighters[0].x = 500 - distance / 2;
  g.fighters[1].x = 500 + distance / 2;
}

test('no one can act during the countdown', () => {
  const g = G.createGame(['A', 'B']);
  G.setHeld(g, 0, { right: true });
  const x = g.fighters[0].x;
  G.step(g);
  assert.strictEqual(g.phase, 'countdown');
  assert.strictEqual(g.fighters[0].x, x);
});

test('fighters walk and cannot pass through each other or the ropes', () => {
  const g = fightingGame();
  G.setHeld(g, 0, { right: true });
  G.setHeld(g, 1, { left: true });
  run(g, 300);
  const [a, b] = g.fighters;
  assert.ok(b.x - a.x >= G.MIN_SEPARATION - 0.001);
  G.setHeld(g, 0, { left: true });
  G.setHeld(g, 1, { right: true });
  run(g, 600);
  assert.strictEqual(g.fighters[0].x, G.RING_LEFT);
  assert.strictEqual(g.fighters[1].x, G.RING_RIGHT);
});

test('a jab in range lands, costs stamina and deals damage', () => {
  const g = fightingGame();
  placeAt(g, 120);
  G.pressAction(g, 0, 'jab');
  const events = run(g, 30);
  const hit = events.find((e) => e.type === 'hit');
  assert.ok(hit, 'jab should land');
  assert.strictEqual(hit.target, 1);
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.MOVES.jab.damage);
  assert.strictEqual(g.fighters[0].stats.landed, 1);
  assert.ok(g.fighters[0].stamina < G.MAX_STAMINA);
});

test('a jab out of range whiffs', () => {
  const g = fightingGame();
  placeAt(g, G.MOVES.jab.range + 60);
  G.pressAction(g, 0, 'jab');
  const events = run(g, 30);
  assert.ok(!events.some((e) => e.type === 'hit'));
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);
  assert.strictEqual(g.fighters[0].stats.thrown, 1);
});

test('blocking stops jab damage but hooks chip through', () => {
  const g = fightingGame();
  placeAt(g, 110);
  G.setHeld(g, 1, { block: true });
  run(g, 2);
  G.pressAction(g, 0, 'jab');
  let events = run(g, 30);
  assert.ok(events.some((e) => e.type === 'block'));
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);

  placeAt(g, 110);
  G.pressAction(g, 0, 'hook');
  events = run(g, 50);
  assert.ok(events.some((e) => e.type === 'block' && e.move === 'hook'));
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.MOVES.hook.blockDamage);
});

test('slipping makes a punch miss', () => {
  const g = fightingGame();
  placeAt(g, 110);
  G.pressAction(g, 0, 'hook');
  run(g, 3);
  G.pressAction(g, 1, 'slip');
  const events = run(g, 40);
  assert.ok(events.some((e) => e.type === 'slipped' && e.target === 1));
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);
});

test('hitting an opponent mid-punch is a counter for extra damage', () => {
  const g = fightingGame();
  placeAt(g, 100);
  G.pressAction(g, 1, 'upper'); // slow startup
  G.pressAction(g, 0, 'jab');   // fast, lands during the uppercut startup
  const events = run(g, 12);
  const hit = events.find((e) => e.type === 'hit' && e.target === 1);
  assert.ok(hit && hit.counter, 'expected a counter hit');
  assert.strictEqual(hit.damage, Math.round(G.MOVES.jab.damage * 1.4));
});

test('punches need stamina', () => {
  const g = fightingGame();
  placeAt(g, 400);
  g.fighters[0].stamina = G.MOVES.upper.stamina - 1;
  G.pressAction(g, 0, 'upper');
  run(g, 1);
  assert.notStrictEqual(g.fighters[0].state, 'attack');
});

test('a guard with no stamina breaks', () => {
  const g = fightingGame();
  placeAt(g, 100);
  G.setHeld(g, 1, { block: true });
  run(g, 2);
  g.fighters[1].stamina = 5;
  G.pressAction(g, 0, 'hook');
  const events = run(g, 30);
  assert.ok(events.some((e) => e.type === 'guardbreak'));
  assert.strictEqual(g.fighters[1].state, 'guardbreak');
});

test('knocking someone out wins the round and the match after two', () => {
  const g = fightingGame();
  for (let round = 1; round <= 2; round++) {
    while (g.phase !== 'fight') run(g, 1);
    placeAt(g, 100);
    g.fighters[1].hp = 3;
    G.pressAction(g, 0, 'jab');
    const events = run(g, 20);
    assert.ok(events.some((e) => e.type === 'ko' && e.target === 1));
    assert.ok(events.some((e) => e.type === 'roundEnd' && e.winner === 0));
    assert.strictEqual(g.fighters[0].roundsWon, round);
    run(g, G.ROUND_END_TICKS + 1);
  }
  assert.strictEqual(g.phase, 'matchEnd');
  assert.strictEqual(g.winner, 0);
});

test('the round timer decides on health', () => {
  const g = fightingGame();
  g.fighters[0].hp = 40;
  g.timer = 2;
  const events = run(g, 3);
  const end = events.find((e) => e.type === 'roundEnd');
  assert.ok(end);
  assert.strictEqual(end.winner, 1);
});

test('a new round resets health but keeps rounds won and stats', () => {
  const g = fightingGame();
  placeAt(g, 100);
  g.fighters[1].hp = 2;
  G.pressAction(g, 0, 'jab');
  run(g, 20);
  run(g, G.ROUND_END_TICKS + 2);
  assert.strictEqual(g.round, 2);
  assert.strictEqual(g.phase, 'countdown');
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);
  assert.strictEqual(g.fighters[0].roundsWon, 1);
  assert.strictEqual(g.fighters[0].stats.landed, 1);
});

test('unknown actions are ignored', () => {
  const g = fightingGame();
  G.pressAction(g, 0, 'teleport');
  G.pressAction(g, 0, '__proto__');
  run(g, 5);
  assert.strictEqual(g.fighters[0].state, 'idle');
});
