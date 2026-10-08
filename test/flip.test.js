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

test('the flip hits twice, 25 a time, through a guard', () => {
  const g = fight();
  g.fighters[0].x = 400;
  g.fighters[1].x = 600;
  G.setHeld(g, 1, { block: true, aim: 'head' });
  run(g, 2);
  G.cheat(g, 0, 'zeffen');
  const events = run(g, FLIP_TICKS + 2);
  const hits = events.filter((e) => e.type === 'hit' && e.move === 'flip');
  assert.strictEqual(hits.length, 2, 'two hits');
  assert.deepStrictEqual(hits.map((h) => h.damage), [25, 25]);
  assert.ok(!hits[0].second && hits[1].second);
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
  g.fighters[0].x = 400;
  g.fighters[1].x = 600;
  G.cheat(g, 0, 'zeffen');
  run(g, G.MOVES.flip.startup + G.MOVES.flip.active + G.MOVES.flip.recovery + 50);
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - 50);
  g.fighters[0].x = 400;
  g.fighters[1].x = 600;
  G.cheat(g, 0, 'zeffen');
  run(g, G.MOVES.flip.startup + G.MOVES.flip.active + G.MOVES.flip.recovery + 2);
  assert.strictEqual(g.fighters[1].hp, 0);
  assert.strictEqual(g.fighters[1].state, 'ko');
});

test('in the ring it lands on the one you are fighting, even from behind', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 400; a.y = 500;
  b.x = 600; b.y = 500;
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

test('it only reaches about a quarter as far as it used to: from across the ring it falls short', () => {
  const g = fight();
  g.fighters[0].x = 300;
  g.fighters[1].x = 700;
  G.cheat(g, 0, 'zeffen');
  const events = run(g, FLIP_TICKS + 2);
  assert.ok(!events.some((e) => e.type === 'hit' && e.move === 'flip'));
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);
  // It still carried them forward.
  assert.ok(Math.abs(g.fighters[0].x - (300 + G.FLIP_MAX_TRAVEL)) < 2);
  assert.ok(G.FLIP_MAX_TRAVEL + G.MOVES.flip.range <= 230, 'about a quarter of the old reach (around 800)');
});

test("it's aimed when you jump, so stepping away dodges it", () => {
  const g = fight();
  g.fighters[0].x = 400;
  g.fighters[1].x = 600;
  G.cheat(g, 0, 'zeffen');
  run(g, 2);
  G.setHeld(g, 1, { right: true }); // B backs off while A is in the air
  const events = run(g, FLIP_TICKS);
  assert.ok(!events.some((e) => e.type === 'hit' && e.move === 'flip'), 'missed');
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);

  // In the ring, stepping to the side works too.
  const r = fight(['A', 'B', 'C']);
  const [a, b, c] = r.fighters;
  a.x = 400; a.y = 500;
  b.x = 600; b.y = 500;
  c.x = 850; c.y = 880;
  a.target = null;
  run(r, 1);
  G.cheat(r, 0, 'zeffen');
  run(r, 2);
  G.setHeld(r, 1, { up: true });
  const ringEvents = run(r, FLIP_TICKS);
  assert.ok(!ringEvents.some((e) => e.type === 'hit' && e.move === 'flip'), 'missed in the ring');
});

test('typing it a letter at a time works, and a wrong letter starts again', () => {
  const g = fight();
  for (const k of 'zefxzeffe') G.typeKey(g, 0, k);
  assert.strictEqual(g.fighters[0].typing, 'zeffe');
  assert.strictEqual(G.snapshot(g).fighters[0].typing, 'zeffe', 'everyone can see it going in');
  G.typeKey(g, 0, 'N');
  assert.ok(run(g, 2).some((e) => e.type === 'flip' && e.attacker === 0));
  assert.strictEqual(g.fighters[0].typing, '');
});

test('getting hit while typing it wipes the letters', () => {
  const g = fight();
  g.fighters[0].x = 400;
  g.fighters[1].x = 520;
  for (const k of 'zeff') G.typeKey(g, 1, k);
  G.pressAction(g, 0, 'punch');
  run(g, 12);
  assert.strictEqual(g.fighters[1].typing, '', 'wiped');
  for (const k of 'en') G.typeKey(g, 1, k);
  assert.ok(!run(g, 30).some((e) => e.type === 'flip'), 'finishing the word now does nothing');
});
