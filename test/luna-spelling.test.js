'use strict';

// The player called Luna: two letters into a cheat code, nothing can touch
// her until she finishes it, gets a letter wrong or stops typing. She can't
// attack while she spells.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

function fight(names = ['Luna', 'B'], opts) {
  const g = G.createGame(names, opts);
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

/** B punches Luna from close by: did it land? */
function bPunches(g) {
  g.fighters[0].x = 400;
  g.fighters[1].x = 500;
  G.pressAction(g, 1, 'punch');
  return run(g, 25).some((e) => e.type === 'hit' && e.target === 0);
}

test('one letter in, she can still be hit', () => {
  const g = fight();
  type(g, 0, 'g');
  assert.ok(bPunches(g));
});

test('two letters of a code in, nothing lands, and she keeps her letters', () => {
  const g = fight();
  type(g, 0, 'gr');
  assert.ok(G.snapshot(g).fighters[0].spelling);
  assert.ok(!bPunches(g));
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP);
  assert.strictEqual(g.fighters[0].typing, 'gr', 'still spelling');
  type(g, 0, 'andpa');
  assert.ok(g.fighters[0].turbo > 0, 'and finishes the word');
  assert.ok(!G.snapshot(g).fighters[0].spelling);
  assert.ok(bPunches(g), 'done spelling: she can be hit again');
});

test('a wrong letter ends it', () => {
  const g = fight();
  type(g, 0, 'grx');
  assert.ok(!G.snapshot(g).fighters[0].spelling);
  assert.ok(bPunches(g));
});

test('stopping for a moment ends it', () => {
  const g = fight();
  type(g, 0, 'gr');
  run(g, G.LUNA_SPELL_GAP);
  assert.ok(!G.snapshot(g).fighters[0].spelling);
  assert.ok(bPunches(g));
});

test("she can't attack while she spells", () => {
  const g = fight();
  g.fighters[0].x = 400;
  g.fighters[1].x = 500;
  type(g, 0, 'gr');
  G.pressAction(g, 0, 'punch');
  assert.ok(!run(g, 25).some((e) => e.type === 'hit' && e.target === 1));
});

test('the giant fist misses her too', () => {
  const g = fight(['Luna', 'B'], { fists: true, random: () => 0 });
  run(g, G.FIST_MIN_TICKS + G.FIST_WARN_TICKS - 20);
  const events = [];
  for (const k of 'grand') { G.typeKey(g, 0, k); events.push(...run(g, 6)); }
  const fist = events.find((e) => e.type === 'fist');
  assert.ok(fist, 'it came down');
  assert.ok(!fist.hits.includes(0));
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP);
});

test('only for a player called Luna', () => {
  const g = fight(['Bella', 'B']);
  type(g, 0, 'gr');
  assert.ok(!G.snapshot(g).fighters[0].spelling);
  assert.ok(bPunches(g));
});
