'use strict';

// shree (steer the giant fist), shaan (shrink them), parimal (the car), and jumping.

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

test('shree: steer the fist with left and right, punch to drop it on them', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 300;
  b.x = 600;
  type(g, 0, 'shree');
  assert.ok(a.shree);
  assert.ok(G.snapshot(g).fighters[0].shree, 'everyone can see where it is');
  G.setHeld(g, 0, { right: true });
  run(g, 34); // 9 a tick: from 300 to about 600
  G.setHeld(g, 0, {});
  assert.strictEqual(a.x, 300, 'A stays put while steering');
  assert.ok(Math.abs(a.shree.x - 600) < 12, `the shadow went to ${a.shree.x}`);
  G.pressAction(g, 0, 'punch');
  const events = run(g, G.SHREE_DROP_TICKS + 2);
  const slam = events.find((e) => e.type === 'shreeSlam');
  assert.deepStrictEqual(slam.hits, [1]);
  assert.strictEqual(b.hp, G.MAX_HP - G.FIST_DAMAGE);
  assert.strictEqual(a.shree, null, 'back to normal');
  assert.notStrictEqual(a.move, 'punch', "the punch went into the fist, not a real punch");
});

test("shree: it never lands on you, and dodging out from under it works", () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 300;
  b.x = 600;
  type(g, 0, 'shree');
  G.pressAction(g, 0, 'punch'); // straight down on your own spot
  const events = run(g, G.SHREE_DROP_TICKS + 2);
  assert.deepStrictEqual(events.find((e) => e.type === 'shreeSlam').hits, []);
  assert.strictEqual(a.hp, G.MAX_HP);
});

test('shree: a hit while steering cancels it', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 520;
  type(g, 0, 'shree');
  G.pressAction(g, 1, 'punch');
  const events = run(g, 15);
  assert.ok(events.some((e) => e.type === 'shreeCancel'));
  assert.strictEqual(a.shree, null);
  assert.ok(!events.some((e) => e.type === 'shreeSlam'));
});

test("shree: if you don't punch, it drops by itself", () => {
  const g = fight();
  type(g, 0, 'shree');
  const events = run(g, G.SHREE_TICKS + G.SHREE_DROP_TICKS + 2);
  assert.ok(events.some((e) => e.type === 'shreeSlam'));
});

test('shree in the ring: up and down move it too', () => {
  const g = fight(['A', 'B', 'C']);
  const a = g.fighters[0];
  type(g, 0, 'shree');
  const y = a.shree.y;
  G.setHeld(g, 0, { down: true });
  run(g, 10);
  assert.ok(a.shree.y > y + 60);
});

test('shaan: shrinks who you are fighting, and they hit 10% softer', () => {
  const g = fight();
  const [a, b] = g.fighters;
  type(g, 0, 'shaan');
  assert.ok(b.tiny > 0);
  assert.ok(G.snapshot(g).fighters[1].tiny > 0);
  a.x = 400;
  b.x = 560;
  G.setHeld(g, 1, { aim: 'head' });
  G.pressAction(g, 1, 'kick');
  const hit = run(g, 30).find((e) => e.type === 'hit');
  assert.strictEqual(hit.damage, Math.round(G.MOVES.kick.head.damage * G.SHAAN_DAMAGE));
  run(g, G.SHAAN_TICKS);
  assert.strictEqual(b.tiny, 0, 'back to size after seven seconds');
});

test('shaan on a Jemini giant: back to normal size, not tiny', () => {
  const g = fight();
  const b = g.fighters[1];
  type(g, 1, 'jemini');
  assert.ok(b.giant > 0);
  type(g, 0, 'shaan');
  const ev = g.events.find((e) => e.type === 'shaan');
  assert.ok(ev.unbig);
  assert.strictEqual(b.giant, 0);
  assert.strictEqual(b.tiny, 0);
});

test('parimal: a car drives at the nearest fighter and knocks them flying', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 200;
  b.x = 700;
  type(g, 0, 'parimal');
  assert.ok(a.car);
  run(g, G.CAR_REV_TICKS);
  assert.strictEqual(a.x, 200, 'revs on the spot first');
  const events = run(g, 60);
  assert.ok(events.some((e) => e.type === 'carHit' && e.target === 1));
  assert.strictEqual(b.hp, G.MAX_HP - G.CAR_DAMAGE);
  assert.ok(a.x > 600, 'drove on through');
  assert.ok(events.some((e) => e.type === 'carStop'));
  assert.strictEqual(a.car, null);
});

test('parimal one on one: jumping over it dodges it', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 200;
  b.x = 700;
  type(g, 0, 'parimal');
  run(g, G.CAR_REV_TICKS + 12); // off it goes: jump now
  G.pressAction(g, 1, 'jump');
  const events = run(g, 40);
  assert.ok(!events.some((e) => e.type === 'carHit'), 'jumped clean over');
  assert.strictEqual(b.hp, G.MAX_HP);
});

test('parimal in the ring: stepping to the side dodges it', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 200; a.y = 500;
  b.x = 650; b.y = 500;
  c.x = 850; c.y = 880;
  type(g, 0, 'parimal');
  run(g, G.CAR_REV_TICKS - 10); // they see it revving, and step aside
  G.setHeld(g, 1, { up: true });
  const events = run(g, 60);
  assert.ok(!events.some((e) => e.type === 'carHit' && e.target === 1));
  assert.strictEqual(b.hp, G.MAX_HP);
});

test("the one driving can't be hit", () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 520;
  G.pressAction(g, 1, 'punch');
  run(g, 3);
  type(g, 0, 'parimal');
  run(g, 10);
  assert.strictEqual(a.hp, G.MAX_HP);
});

test('jumping is one on one only, and costs a little stamina', () => {
  const g = fight();
  const a = g.fighters[0];
  G.pressAction(g, 0, 'jump');
  run(g, 1);
  assert.strictEqual(a.move, 'jump');
  assert.ok(a.stamina < G.MAX_STAMINA);
  run(g, G.JUMP_CROUCH + 1);
  assert.ok(G.airborne(a));
  const r = fight(['A', 'B', 'C']);
  G.pressAction(r, 0, 'jump');
  run(r, 2);
  assert.notStrictEqual(r.fighters[0].move, 'jump');
});

test('all the codes are there', () => {
  for (const c of ['zeffen', 'luna', 'jemini', 'kyle', 'harrison', 'shree', 'shaan', 'parimal']) assert.ok(c in G.CODES, c);
  const g = fight();
  type(g, 0, 'shr');
  assert.strictEqual(g.fighters[0].typing, 'shr');
  type(g, 0, 'sha');
  assert.strictEqual(g.fighters[0].typing, 'sha');
});

test('one on one, jumping as it sets off, or as it comes, clears it (too early and you land in its way)', () => {
  for (const wait of [G.CAR_REV_TICKS - 4, G.CAR_REV_TICKS + 10, G.CAR_REV_TICKS + 18]) {
    const g = fight();
    const [a, b] = g.fighters;
    a.x = 650;
    b.x = 350;
    type(g, 0, 'parimal');
    run(g, wait);
    G.pressAction(g, 1, 'jump');
    const events = run(g, 80);
    assert.ok(!events.some((e) => e.type === 'carHit'), `jumped after ${wait} ticks`);
  }
});

test('jumping the moment it starts revving is too early', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 650;
  b.x = 350;
  type(g, 0, 'parimal');
  G.pressAction(g, 1, 'jump');
  assert.ok(run(g, 80).some((e) => e.type === 'carHit'));
});
