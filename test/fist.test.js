'use strict';

// The giant fist: every five to fifteen seconds a shadow, then a slam for 30.
// Kyle is more likely to be under it.

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
    const g = fistGame(['Kyle', 'B'], r);
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
  const g = fistGame(['B', 'kyle'], 0.5);
  G.setHeld(g, 0, { block: true });
  G.setHeld(g, 1, { block: true });
  const events = [];
  while (!events.some((e) => e.type === 'fist')) events.push(...run(g, 1));
  const fist = events.find((e) => e.type === 'fist');
  const target = events.find((e) => e.type === 'fistWarn').target;
  assert.ok(fist.hits.includes(target));
  assert.strictEqual(g.fighters[target].hp, G.MAX_HP - 30);
  assert.strictEqual(g.fighters[target].state, 'hitstun');
});

test('walking out from under the shadow dodges it', () => {
  const g = fistGame(['Kyle', 'B']);
  const events = run(g, G.FIST_MIN_TICKS);
  assert.strictEqual(events.find((e) => e.type === 'fistWarn').target, 0);
  G.setHeld(g, 0, { left: true }); // away from B
  const after = run(g, G.FIST_WARN_TICKS);
  const fist = after.find((e) => e.type === 'fist');
  assert.deepStrictEqual(fist.hits, []);
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP);
});

test('it hits everyone under it, and can knock someone out', () => {
  const g = fistGame(['KYLE', 'B', 'C']);
  run(g, G.FIST_MIN_TICKS - 1);
  // Put B right beside Kyle, Kyle on 20 health.
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
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - 30, 'B was under it too');
  assert.strictEqual(g.fighters[2].hp, G.MAX_HP, 'C was far away');
  assert.ok(events.some((e) => e.type === 'ko' && e.target === 0));
  assert.strictEqual(g.phase, 'fight', 'Kyle is out; B and C fight on');
});

test('Kyle is three times as likely to be picked, but anyone can be', () => {
  // A, Kyle, B: the picks split 1 : 3 : 1.
  const pick = (r) => {
    const g = fistGame(['A', 'Kyle', 'B'], r);
    return run(g, G.FIST_MAX_TICKS).find((e) => e.type === 'fistWarn').target;
  };
  assert.strictEqual(pick(0.1), 0);
  assert.strictEqual(pick(0.25), 1);
  assert.strictEqual(pick(0.75), 1);
  assert.strictEqual(pick(0.9), 2);
  assert.strictEqual(G.FIST_KYLE_ODDS, 3);
});

test('with no Kyle it still comes, for anyone', () => {
  const targets = new Set();
  for (const r of [0.1, 0.5, 0.9]) {
    const g = fistGame(['A', 'B', 'C'], r);
    targets.add(run(g, G.FIST_MAX_TICKS).find((e) => e.type === 'fistWarn').target);
  }
  assert.deepStrictEqual([...targets].sort(), [0, 1, 2]);
});

test('it keeps coming: the next shadow is five to fifteen seconds after the slam', () => {
  const g = fistGame(['Kyle', 'B'], 0.5);
  g.timer = 100000;
  const events = run(g, 3 * (G.FIST_MAX_TICKS + G.FIST_WARN_TICKS));
  assert.ok(events.filter((e) => e.type === 'fist').length >= 2);
});

test('the snapshot shows the shadow while it is on its way, and only then', () => {
  const g = fistGame(['Kyle', 'B']);
  run(g, G.FIST_MIN_TICKS - 1);
  assert.ok(!('fist' in G.snapshot(g)));
  run(g, 10);
  const s = G.snapshot(g).fist;
  assert.ok(s && s.t > 0 && typeof s.x === 'number');
  run(g, G.FIST_WARN_TICKS);
  assert.ok(!('fist' in G.snapshot(g)));
});
