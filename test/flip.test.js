'use strict';

// The cheat code: "zeffen" for the Zeffen flip, unblockable, 50 damage.

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

const FLIP_TICKS = G.MOVES.flip.startup + G.MOVES.flip.active;

test('only the right word does it (any capitals)', () => {
  for (const word of ['nope', 'zeffe', 'zeffenx', '', null]) {
    const g = fight();
    G.cheat(g, 0, word);
    assert.ok(!run(g, 2).some((e) => e.type === 'flip'), `"${word}" did nothing`);
  }
  const g = fight();
  G.cheat(g, 0, 'ZefFen');
  assert.ok(run(g, 2).some((e) => e.type === 'flip' && e.attacker === 0));
});

test('the flip carries you across the ring and lands for 50 through a guard', () => {
  const g = fight();
  g.fighters[0].x = 200;
  g.fighters[1].x = 700;
  G.setHeld(g, 1, { block: true, aim: 'head' });
  run(g, 2);
  G.cheat(g, 0, 'zeffen');
  const events = run(g, FLIP_TICKS + 2);
  const hit = events.find((e) => e.type === 'hit' && e.move === 'flip');
  assert.ok(hit, 'it landed');
  assert.strictEqual(hit.damage, 50);
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - 50);
  assert.ok(!events.some((e) => e.type === 'block'));
});

test("nothing touches you in the air: a punch goes under, and so does the giant fist", () => {
  const g = fight();
  g.fighters[0].x = 400;
  g.fighters[1].x = 520;
  G.cheat(g, 0, 'zeffen');
  run(g, G.FLIP_CROUCH + 1);
  assert.ok(G.airborne(g.fighters[0]));
  G.pressAction(g, 1, 'punch');
  const events = run(g, 12);
  assert.ok(!events.some((e) => (e.type === 'hit' || e.type === 'block') && e.target === 0), 'the punch missed');
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP);
});

test('you can flip over the giant fist', () => {
  const g = G.createGame(['Kyle', 'B'], { fists: true, random: () => 0 });
  while (g.phase !== 'fight') G.step(g);
  g.fighters[0].x = 200;
  g.fighters[1].x = 800;
  run(g, G.FIST_MIN_TICKS); // the shadow appears under Kyle
  run(g, G.FIST_WARN_TICKS - 10);
  G.cheat(g, 0, 'zeffen');
  const events = run(g, 12);
  const fist = events.find((e) => e.type === 'fist');
  assert.ok(fist);
  assert.ok(!fist.hits.includes(0), 'Kyle was in the air');
});

test('it can be done again, and needs no stamina', () => {
  const g = fight();
  g.fighters[0].stamina = 0;
  G.cheat(g, 0, 'zeffen');
  run(g, G.MOVES.flip.startup + G.MOVES.flip.active + G.MOVES.flip.recovery + 50);
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - 50);
  G.cheat(g, 0, 'zeffen');
  run(g, G.MOVES.flip.startup + G.MOVES.flip.active + G.MOVES.flip.recovery + 2);
  assert.strictEqual(g.fighters[1].hp, 0);
  assert.strictEqual(g.fighters[1].state, 'ko');
});

test('in the ring it lands on the one you are fighting, even from behind', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 300; a.y = 500;
  b.x = 700; b.y = 500;
  c.x = 850; c.y = 880;
  a.target = null;
  run(g, 1); // A faces B
  // B turns its back on A, and guards.
  b.angle = 0;
  G.setHeld(g, 1, { block: true, aim: 'head' });
  G.cheat(g, 0, 'zeffen');
  const events = run(g, FLIP_TICKS + 2);
  const hit = events.find((e) => e.type === 'hit' && e.move === 'flip');
  assert.ok(hit);
  assert.strictEqual(hit.target, 1);
  assert.strictEqual(b.hp, G.MAX_HP - 50);
  assert.strictEqual(c.hp, G.MAX_HP);
});

test('in the ring it reaches right across from where everyone starts', () => {
  for (const count of [3, 4]) {
    const g = fight(['A', 'B', 'C', 'D'].slice(0, count));
    run(g, 1);
    const target = g.fighters[0].target;
    G.cheat(g, 0, 'zeffen');
    const hit = run(g, FLIP_TICKS + 2).find((e) => e.type === 'hit' && e.move === 'flip');
    assert.ok(hit, `${count} fighters: it landed`);
    assert.strictEqual(hit.target, target);
  }
});
