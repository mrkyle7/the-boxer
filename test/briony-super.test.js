'use strict';

// "briony": a clown juggles, then throws pies at the nearest head.
// "supercalifragilisticexpialidocious": invincible for two rounds, once a match.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

const SUPER = 'supercalifragilisticexpialidocious';

function fight(names = ['A', 'B'], options = {}) {
  const g = G.createGame(names, options);
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
const ACT = G.CLOWN_TICKS + 80; // the act plus the last pie's flight

test('briony: juggles, then three pies at their head, 10 each, fruit on the face', () => {
  const g = fight();
  type(g, 0, 'briony');
  assert.ok(g.fighters[0].clown, 'a clown');
  assert.ok(G.snapshot(g).fighters[0].clown);
  // Juggling first: nothing thrown yet.
  const early = run(g, G.JUGGLE_TICKS - 1);
  assert.ok(!early.some((e) => e.type === 'pieThrow'));
  const events = run(g, ACT);
  const hits = events.filter((e) => e.type === 'pieHit');
  assert.strictEqual(events.filter((e) => e.type === 'pieThrow').length, G.PIES);
  assert.strictEqual(hits.length, G.PIES);
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.PIES * G.PIE_DAMAGE);
  assert.ok(hits.every((e) => G.PIE_FLAVOURS.includes(e.flavour)));
  assert.ok(G.PIE_FLAVOURS.includes(g.fighters[1].pieFlavour));
  assert.ok(G.snapshot(g).fighters[1].pieFace > 0);
  assert.strictEqual(g.fighters[0].clown, null, 'the act is over');
  run(g, G.PIE_FACE_TICKS);
  assert.strictEqual(g.fighters[1].pieFace, 0, 'face wiped clean in time');
});

test('briony: blueberry or raspberry, at random', () => {
  for (const [r, flavour] of [[0.1, 'blueberry'], [0.9, 'raspberry']]) {
    const g = fight(['A', 'B'], { random: () => r });
    type(g, 0, 'briony');
    run(g, ACT);
    assert.strictEqual(g.fighters[1].pieFlavour, flavour);
  }
});

test('briony: a guard up at the head, facing, stops the pies', () => {
  const g = fight();
  type(g, 0, 'briony');
  G.setHeld(g, 1, { block: true, aim: 'head' });
  const events = run(g, ACT);
  assert.strictEqual(events.filter((e) => e.type === 'pieBlocked').length, G.PIES);
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);
  assert.ok(!g.fighters[1].pieFace);
});

test('briony: guarding the tummy is no good against a pie', () => {
  const g = fight();
  type(g, 0, 'briony');
  G.setHeld(g, 1, { block: true, aim: 'body' });
  const events = run(g, ACT);
  assert.ok(events.some((e) => e.type === 'pieHit'));
  assert.ok(g.fighters[1].hp < G.MAX_HP);
});

test('briony: the clown stands still, and a hit makes them drop the balls', () => {
  const g = fight();
  const f = g.fighters[0];
  f.x = 450;
  g.fighters[1].x = 530;
  type(g, 0, 'briony');
  const x = f.x;
  G.setHeld(g, 0, { left: true });
  run(g, 10);
  assert.strictEqual(f.x, x, 'no walking while juggling');
  G.setHeld(g, 0, {});
  G.pressAction(g, 1, 'punch');
  const events = run(g, 30);
  assert.ok(events.some((e) => e.type === 'clownDrop'));
  assert.strictEqual(f.clown, null);
  assert.ok(!run(g, ACT).some((e) => e.type === 'pieThrow'), 'no pies once the balls are dropped');
});

test('super: no code inside it goes off on the way', () => {
  const g = fight();
  const events = [];
  for (const k of SUPER) {
    G.typeKey(g, 0, k);
    events.push(...g.events);
    g.events = [];
  }
  assert.deepStrictEqual(events.map((e) => e.type), ['super']);
  assert.strictEqual(g.fighters[0].invincible, G.SUPER_ROUNDS);
});

test('super: nothing hurts you, punches, kicks, fist, poison or pies', () => {
  const g = fight(['A', 'B'], { fists: true });
  const f = g.fighters[0];
  type(g, 0, SUPER);
  f.poison = true;
  f.poisonT = 1;
  f.x = 450;
  g.fighters[1].x = 530;
  for (let i = 0; i < 20; i++) {
    G.pressAction(g, 1, i % 2 ? 'kick' : 'punch');
    run(g, 40);
  }
  type(g, 1, 'briony');
  run(g, ACT);
  type(g, 1, 'fart');
  run(g, 200);
  assert.strictEqual(f.hp, G.MAX_HP);
  assert.ok(G.snapshot(g).fighters[0].invincible);
});

test('super: lasts this round and the next, then it is gone, and only once a match', () => {
  const g = fight();
  type(g, 0, SUPER);
  // Round 1: knock B out.
  g.fighters[1].hp = 0;
  run(g, 2);
  assert.strictEqual(g.phase, 'roundEnd');
  while (g.phase !== 'fight') G.step(g);
  assert.strictEqual(g.round, 2);
  assert.strictEqual(g.fighters[0].invincible, 1, 'still invincible in round 2');
  g.fighters[0].x = 450;
  g.fighters[1].x = 530;
  G.pressAction(g, 1, 'punch');
  run(g, 40);
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP);
  // Round 2 ends on the clock; round 3 is fair game.
  g.timer = 1;
  run(g, 2);
  while (g.phase !== 'fight' && g.phase !== 'matchEnd') G.step(g);
  assert.strictEqual(g.round, 3, 'a level round 2, so on to round 3');
  assert.strictEqual(g.fighters[0].invincible, 0);
  type(g, 0, SUPER);
  assert.strictEqual(g.fighters[0].invincible, 0, 'once a match');
});
