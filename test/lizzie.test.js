'use strict';

// "lizzie": a rugby player. A charge at whoever's nearest, and a shoulder
// smash for 20 when she gets there. No guard stops it.

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

test('lizzie: charges across and shoulder-smashes them for 20, through a guard', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 150; b.x = 800;
  G.setHeld(g, 1, { block: true, aim: 'head' });
  for (const k of 'lizzie') G.typeKey(g, 0, k);
  const events = run(g, 5);
  assert.ok(events.some((e) => e.type === 'lizzie' && e.attacker === 0 && e.target === 1));
  assert.ok(G.snapshot(g).fighters[0].rugby, 'in her kit');
  assert.ok(a.x > 220, 'running');
  events.push(...run(g, 45));
  assert.ok(events.some((e) => e.type === 'shoulderSmash' && e.attacker === 0 && e.target === 1));
  assert.strictEqual(b.hp, G.MAX_HP - G.RUGBY_DAMAGE);
  assert.ok(!events.some((e) => e.type === 'block'));
  run(g, 30);
  assert.ok(b.x - a.x > 150, 'knocked back');
  assert.strictEqual(G.RUGBY_DAMAGE, 20);
});

test('jump it, one on one, and she misses', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 150; b.x = 650;
  G.cheat(g, 0, 'lizzie');
  run(g, 14);
  G.pressAction(g, 1, 'jump');
  const events = run(g, 40);
  assert.ok(events.some((e) => e.type === 'smashMiss'));
  assert.strictEqual(b.hp, G.MAX_HP);
});

test('a hit on the way stops her', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 150; b.x = 800;
  G.cheat(g, 0, 'lizzie');
  // B times a punch to meet her as she comes in.
  while (a.x < b.x - 290) run(g, 1);
  G.pressAction(g, 1, 'punch');
  const events = run(g, 50);
  assert.ok(events.some((e) => e.type === 'hit' && e.target === 0));
  assert.ok(!events.some((e) => e.type === 'shoulderSmash'));
});

test('in the ring she goes for whoever is nearest', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 200; a.y = 500;
  b.x = 850; b.y = 500;
  c.x = 200; c.y = 850;
  G.cheat(g, 0, 'lizzie');
  const events = run(g, 40);
  assert.ok(events.some((e) => e.type === 'shoulderSmash' && e.target === 2));
  assert.strictEqual(b.hp, G.MAX_HP);
});
