'use strict';

// "kyle": invisible for ten seconds. You walk through people, nobody turns
// to face you, and ending it inside someone throws you out for 10 damage.

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

test('kyle walks straight through the other one, who keeps facing the old way', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400; b.x = 500;
  G.cheat(g, 0, 'kyle');
  G.setHeld(g, 0, { right: true });
  run(g, 60);
  assert.ok(a.x > b.x + G.MIN_SEPARATION, 'out the other side');
  assert.strictEqual(b.facing, -1, "B didn't turn round");
  assert.strictEqual(a.facing, -1, 'Kyle turned to face B');
});

test("so B's punches go the wrong way, but Kyle can hit B in the back", () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400; b.x = 500;
  G.cheat(g, 0, 'kyle');
  G.setHeld(g, 0, { right: true });
  run(g, 25);
  G.setHeld(g, 0, {});
  a.x = b.x + 110;
  G.pressAction(g, 1, 'punch');
  assert.ok(!run(g, 30).some((e) => e.type === 'hit' && e.target === 0), 'B swung at thin air');
  G.pressAction(g, 0, 'punch');
  assert.ok(run(g, 30).some((e) => e.type === 'hit' && e.target === 1), 'Kyle hit B');
});

test('in the ring nobody turns towards Kyle, and Kyle goes through people', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 500; a.y = 500;
  b.x = 560; b.y = 500; // right next to A
  c.x = 300; c.y = 300;
  G.cheat(g, 0, 'kyle');
  run(g, 2);
  assert.strictEqual(b.target, 2, 'B looks at C, not the nearer Kyle');
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < G.MIN_SEPARATION, 'not pushed apart');
});

test('ending it inside someone: 10 damage to Kyle, and thrown out', () => {
  const g = fight();
  const [a, b] = g.fighters;
  G.cheat(g, 0, 'kyle');
  run(g, G.KYLE_TICKS - 5);
  a.x = 500; b.x = 510;
  const events = run(g, 10);
  assert.ok(events.some((e) => e.type === 'stuck' && e.target === 0));
  assert.strictEqual(a.hp, G.MAX_HP - G.KYLE_STUCK_DAMAGE);
  assert.strictEqual(b.hp, G.MAX_HP);
  assert.ok(b.x - a.x > 30, 'thrown back out');
  assert.strictEqual(G.KYLE_STUCK_DAMAGE, 10);
});

test('ending it in the clear does nothing', () => {
  const g = fight();
  const [a, b] = g.fighters;
  G.cheat(g, 0, 'kyle');
  a.x = 300; b.x = 700;
  const events = run(g, G.KYLE_TICKS + 5);
  assert.ok(!events.some((e) => e.type === 'stuck'));
  assert.strictEqual(a.hp, G.MAX_HP);
});
