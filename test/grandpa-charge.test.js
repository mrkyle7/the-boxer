'use strict';

// "grandpa", the other half of the 50:50: a charge. He sprints at whoever's
// nearest, and kicks when he gets there.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

function fight(names = ['A', 'B'], r = 0.1) {
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

const KICK = G.MOVES.kick.startup + G.MOVES.kick.active;

test('half the time grandpa is the speed, half the time the charge', () => {
  const speed = fight(['A', 'B'], 0.6);
  G.cheat(speed, 0, 'grandpa');
  assert.ok(speed.fighters[0].turbo > 0);
  assert.ok(!speed.fighters[0].charge);
  const charge = fight(['A', 'B'], 0.4);
  G.cheat(charge, 0, 'grandpa');
  assert.ok(charge.fighters[0].charge);
  assert.ok(!(charge.fighters[0].turbo > 0));
});

test('the charge: flat out across the ring, then a kick that lands', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 150; b.x = 800;
  G.setHeld(g, 0, { aim: 'body' });
  G.cheat(g, 0, 'grandpa');
  const events = run(g, 10);
  assert.ok(events.some((e) => e.type === 'grandpaCharge' && e.attacker === 0 && e.target === 1));
  assert.ok(a.x > 150 + 9 * G.CHARGE_SPEED - 5, `running fast (${a.x})`);
  events.push(...run(g, 40 + KICK));
  assert.ok(events.some((e) => e.type === 'grandpaKick' && e.attacker === 0));
  const hit = events.find((e) => e.type === 'hit' && e.attacker === 0);
  assert.ok(hit, 'the kick landed');
  assert.strictEqual(hit.move, 'kick');
  assert.strictEqual(hit.height, 'body');
});

test('a hit on the way stops the charge', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 150; b.x = 800;
  G.cheat(g, 0, 'grandpa');
  run(g, 20);
  // B steps in and punches him before he gets there.
  b.x = a.x + 120;
  G.pressAction(g, 1, 'punch');
  const events = run(g, 12);
  assert.ok(events.some((e) => e.type === 'hit' && e.target === 0));
  assert.ok(!a.charge, 'stopped');
  assert.ok(!run(g, 40).some((e) => e.type === 'grandpaKick'));
});

test('if they get out of the way he gives up and kicks thin air', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 150; b.x = 800;
  G.cheat(g, 0, 'grandpa');
  const events = [];
  for (let i = 0; i < G.CHARGE_MAX_TICKS + KICK + 5; i++) {
    // B keeps away, as fast as he comes.
    if (a.charge) { a.x = 150; b.x = 800; }
    events.push(...run(g, 1));
  }
  assert.ok(events.some((e) => e.type === 'grandpaKick'));
  assert.ok(!events.some((e) => e.type === 'hit'));
});

test('in the ring he charges at whoever is nearest', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 200; a.y = 500;
  b.x = 800; b.y = 500;
  c.x = 200; c.y = 850;
  G.cheat(g, 0, 'grandpa');
  const events = run(g, 40 + KICK);
  assert.ok(events.some((e) => e.type === 'grandpaCharge' && e.target === 2));
  assert.ok(events.some((e) => e.type === 'hit' && e.attacker === 0 && e.target === 2));
});
