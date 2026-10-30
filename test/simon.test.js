'use strict';

// "simon": a giant moustache for the rest of the match. Each landed punch: 5%
// an instant knockout, 15% he nods off for five seconds, wide open.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

/** A fight where game.random() hands out `rolls` in turn (then 0.99). */
function fight(rolls = [], names = ['A', 'B']) {
  const queue = [...rolls];
  const g = G.createGame(names, { random: () => (queue.length ? queue.shift() : 0.99) });
  while (g.phase !== 'fight') G.step(g);
  g.events = [];
  g.roll = (...r) => queue.push(...r);
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

function punch(g, from = 0, to = 1, move = 'punch') {
  g.fighters[from].x = 400;
  g.fighters[to].x = 520;
  G.pressAction(g, from, move);
  return run(g, 30);
}

test('simon: a moustache, for the rest of the match', () => {
  const g = fight();
  for (const k of 'simon') G.typeKey(g, 0, k);
  assert.ok(run(g, 1).some((e) => e.type === 'simon' && e.target === 0));
  assert.ok(G.snapshot(g).fighters[0].moustache);
  g.fighters[1].hp = 0; // end the round
  run(g, 400);
  assert.strictEqual(g.round, 2);
  assert.ok(g.fighters[0].moustache, 'still there next round');
});

test('a 5% punch is an instant knockout', () => {
  const g = fight();
  G.cheat(g, 0, 'simon');
  g.roll(0.04);
  const events = punch(g);
  assert.ok(events.some((e) => e.type === 'moustacheKO' && e.attacker === 0 && e.target === 1));
  assert.ok(events.some((e) => e.type === 'ko' && e.target === 1));
  assert.strictEqual(g.fighters[1].hp, 0);
  assert.strictEqual(G.MOUSTACHE_KO, 0.05);
});

test('otherwise a 15% chance he nods off for five seconds, and can be hit', () => {
  const g = fight();
  G.cheat(g, 0, 'simon');
  g.roll(0.5, 0.1); // no knockout, but sleepy
  const events = punch(g);
  const hit = events.find((e) => e.type === 'hit' && e.attacker === 0);
  assert.strictEqual(hit.damage, G.MOVES.punch.head.damage, 'a normal punch');
  assert.ok(events.some((e) => e.type === 'nap' && e.target === 0));
  const a = g.fighters[0];
  assert.ok(a.nap > 0 && G.snapshot(g).fighters[0].nap > 0);
  // Asleep: no punching back, no blocking, no walking.
  G.setHeld(g, 0, { block: true, left: true });
  const x = a.x;
  G.pressAction(g, 0, 'punch');
  const more = punch(g, 1, 0);
  assert.ok(more.some((e) => e.type === 'hit' && e.target === 0), 'hit while napping');
  assert.ok(!more.some((e) => e.type === 'hit' && e.attacker === 0));
  assert.ok(a.x >= x - 20, "didn't walk off");
  for (const k of 'simon') G.typeKey(g, 0, k);
  assert.strictEqual(a.typing, '', 'no typing in his sleep');
  const rest = run(g, G.NAP_TICKS);
  assert.ok(rest.some((e) => e.type === 'wake' && e.target === 0));
  assert.strictEqual(a.nap, 0);
  assert.strictEqual(G.MOUSTACHE_NAP, 0.15);
  assert.strictEqual(G.NAP_TICKS, 5 * G.TICK_RATE);
});

test('most punches are just punches', () => {
  const g = fight();
  G.cheat(g, 0, 'simon');
  const events = punch(g); // rolls 0.99
  assert.ok(events.some((e) => e.type === 'hit' && e.attacker === 0));
  assert.ok(!events.some((e) => e.type === 'moustacheKO' || e.type === 'nap'));
});

test('only landed punches: kicks and blocked punches never roll', () => {
  const g = fight();
  G.cheat(g, 0, 'simon');
  g.roll(0.01, 0.01);
  punch(g, 0, 1, 'kick');
  assert.strictEqual(g.fighters[0].nap, 0);
  assert.ok(g.fighters[1].hp > 0);
  G.setHeld(g, 1, { block: true, aim: 'head' });
  G.setHeld(g, 0, { aim: 'head' });
  run(g, 60); // B gets over the kick and puts the guard up
  const events = punch(g);
  assert.ok(events.some((e) => e.type === 'block'));
  assert.ok(!events.some((e) => e.type === 'moustacheKO' || e.type === 'nap'));
});

test('no moustache, no luck', () => {
  const g = fight([0.01, 0.01]);
  const events = punch(g);
  assert.ok(!events.some((e) => e.type === 'moustacheKO' || e.type === 'nap'));
});
