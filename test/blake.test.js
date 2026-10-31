'use strict';

// "blake": a dragon for ten seconds. Fire breath instead of punches (no
// guard stops it; 1 a second for five seconds), two seconds between breaths.
// Kicks are a tail whip: exactly a kick.

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

const BREATH = G.MOVES.fire.startup + G.MOVES.fire.active + G.MOVES.fire.recovery;

function dragon(names) {
  const g = fight(names);
  for (const k of 'blake') G.typeKey(g, 0, k);
  return g;
}

test('blake: a dragon for ten seconds', () => {
  const g = dragon();
  assert.ok(run(g, 1).some((e) => e.type === 'blake' && e.target === 0));
  assert.ok(G.snapshot(g).fighters[0].dragon > 0);
  run(g, G.DRAGON_TICKS);
  assert.ok(!('dragon' in G.snapshot(g).fighters[0]));
  assert.strictEqual(G.DRAGON_TICKS, 10 * G.TICK_RATE);
});

test('punch breathes fire: through a guard, from further away, and they burn 1 a second for 5', () => {
  const g = dragon();
  const [a, b] = g.fighters;
  a.x = 300; b.x = 300 + 220; // out of punching reach
  G.setHeld(g, 1, { block: true, aim: 'head' });
  run(g, 2);
  G.pressAction(g, 0, 'punch');
  const events = run(g, BREATH);
  assert.ok(events.some((e) => e.type === 'breathe' && e.attacker === 0));
  const hit = events.find((e) => e.type === 'hit' && e.attacker === 0);
  assert.ok(hit, 'the fire reached');
  assert.strictEqual(hit.move, 'fire');
  assert.ok(!events.some((e) => e.type === 'block'));
  assert.ok(events.some((e) => e.type === 'onFire' && e.target === 1));
  assert.ok(G.snapshot(g).fighters[1].burn > 0);
  const hp = b.hp;
  const burns = run(g, G.BURN_TICKS + 10).filter((e) => e.type === 'burn' && e.target === 1);
  assert.strictEqual(burns.length, 5);
  assert.strictEqual(b.hp, hp - 5);
  assert.strictEqual(b.burn, 0, 'gone out');
});

test('two seconds before the next breath', () => {
  const g = dragon();
  const [a, b] = g.fighters;
  a.x = 300; b.x = 500;
  run(g, 2);
  G.pressAction(g, 0, 'punch');
  run(g, BREATH);
  G.pressAction(g, 0, 'punch');
  assert.ok(!run(g, 20).some((e) => e.type === 'breathe'), 'still catching his breath');
  run(g, G.FIRE_COOL);
  G.pressAction(g, 0, 'punch');
  assert.ok(run(g, 5).some((e) => e.type === 'breathe'));
  assert.strictEqual(G.FIRE_COOL, 2 * G.TICK_RATE);
});

test('kick is a tail whip: exactly a kick', () => {
  const g = dragon();
  const [a, b] = g.fighters;
  a.x = 300; b.x = 480;
  G.setHeld(g, 0, { aim: 'head' });
  run(g, 2);
  G.pressAction(g, 0, 'kick');
  const hit = run(g, 30).find((e) => e.type === 'hit' && e.attacker === 0);
  assert.strictEqual(hit.move, 'kick');
  assert.strictEqual(hit.damage, G.MOVES.kick.head.damage);
});

test('without the dragon a punch is a punch', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 300; b.x = 420;
  G.pressAction(g, 0, 'punch');
  const hit = run(g, 20).find((e) => e.type === 'hit' && e.attacker === 0);
  assert.strictEqual(hit.move, 'punch');
});

test('in the ring the fire goes where the dragon faces', () => {
  const g = dragon(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 500; a.y = 500;
  b.x = 700; b.y = 500;
  c.x = 300; c.y = 500; // right behind
  a.target = null;
  run(g, 1);
  c.x = 280;
  G.pressAction(g, 0, 'punch');
  const events = run(g, BREATH);
  const burned = events.filter((e) => e.type === 'onFire').map((e) => e.target);
  assert.strictEqual(burned.length, 1);
});
