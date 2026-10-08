'use strict';

// The giant fist: every five to fifteen seconds a shadow, then a slam for 30.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

/** A game with fists on, in the fight, with a fixed "random" number. */
function fistGame(names, r = 0) {
  const g = G.createGame(names, { fists: true, random: () => r });
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

const first = (events, type) => events.findIndex((e) => e.type === type);

test('no fist unless fists are on', () => {
  const g = G.createGame(['A', 'B']);
  while (g.phase !== 'fight') G.step(g);
  const events = run(g, G.FIST_MAX_TICKS + G.FIST_WARN_TICKS + 10);
  assert.ok(!events.some((e) => e.type === 'fistWarn' || e.type === 'fist'));
});

test('the shadow comes five to fifteen seconds in, and the fist a second after it', () => {
  for (const [r, wait] of [[0, G.FIST_MIN_TICKS], [0.999, G.FIST_MAX_TICKS]]) {
    const g = fistGame(['A', 'B'], r);
    const events = [];
    for (let i = 0; i < wait + G.FIST_WARN_TICKS; i++) events.push(...run(g, 1).map((e) => ({ ...e, at: i + 1 })));
    const warn = events.find((e) => e.type === 'fistWarn');
    const fist = events.find((e) => e.type === 'fist');
    assert.strictEqual(warn.at, wait, `shadow after ${wait / 60}s`);
    assert.strictEqual(fist.at - warn.at, G.FIST_WARN_TICKS);
    assert.strictEqual(fist.damage, 30);
  }
  assert.strictEqual(G.FIST_MIN_TICKS, 5 * G.TICK_RATE);
  assert.strictEqual(G.FIST_MAX_TICKS, 15 * G.TICK_RATE);
});

test('whoever stays under it takes 30, guard or no guard', () => {
  const g = fistGame(['A', 'B']);
  G.setHeld(g, 0, { block: true });
  G.setHeld(g, 1, { block: true });
  const events = run(g, G.FIST_MIN_TICKS + G.FIST_WARN_TICKS);
  const fist = events.find((e) => e.type === 'fist');
  const target = events.find((e) => e.type === 'fistWarn').target;
  assert.ok(fist.hits.includes(target));
  assert.strictEqual(g.fighters[target].hp, G.MAX_HP - 30);
  assert.strictEqual(g.fighters[target].state, 'hitstun');
});

test('walking out from under the shadow dodges it', () => {
  const g = fistGame(['A', 'B']); // random 0: aims at A
  const events = run(g, G.FIST_MIN_TICKS);
  assert.strictEqual(events.find((e) => e.type === 'fistWarn').target, 0);
  G.setHeld(g, 0, { left: true }); // away from B
  const after = run(g, G.FIST_WARN_TICKS);
  const fist = after.find((e) => e.type === 'fist');
  assert.deepStrictEqual(fist.hits, []);
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP);
});

test('in the ring it can catch more than one, and can knock someone out', () => {
  const g = fistGame(['A', 'B', 'C']);
  run(g, G.FIST_MIN_TICKS - 1);
  // Put B and C close to where A is, A on 20 health.
  const a = g.fighters[0];
  g.fighters[1].x = a.x + 60;
  g.fighters[1].y = a.y;
  g.fighters[2].x = 800;
  g.fighters[2].y = 800;
  a.hp = 20;
  const warn = run(g, 1).find((e) => e.type === 'fistWarn');
  assert.strictEqual(warn.target, 0);
  // Hold still (the fighters were pushed apart a little) and let it land.
  const events = run(g, G.FIST_WARN_TICKS);
  const fist = events.find((e) => e.type === 'fist');
  assert.deepStrictEqual(fist.hits.sort(), [0, 1]);
  assert.strictEqual(g.fighters[2].hp, G.MAX_HP, 'C was far away');
  assert.ok(events.some((e) => e.type === 'ko' && e.target === 0));
  assert.strictEqual(g.phase, 'fight', 'A is out; B and C fight on');
});

test('it keeps coming: the next shadow is five to fifteen seconds after the slam', () => {
  const g = fistGame(['A', 'B'], 0.5);
  g.timer = 100000;
  const events = run(g, 3 * (G.FIST_MAX_TICKS + G.FIST_WARN_TICKS));
  assert.ok(events.filter((e) => e.type === 'fist').length >= 2);
});

test('the snapshot shows the shadow while it is on its way, and only then', () => {
  const g = fistGame(['A', 'B']);
  run(g, G.FIST_MIN_TICKS - 1);
  assert.ok(!('fist' in G.snapshot(g)));
  run(g, 10);
  const s = G.snapshot(g).fist;
  assert.ok(s && s.t > 0 && typeof s.x === 'number');
  run(g, G.FIST_WARN_TICKS);
  assert.ok(!('fist' in G.snapshot(g)));
});
