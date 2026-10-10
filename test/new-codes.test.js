'use strict';

// louise (dance, 30), kalya (the old vault), luna (teleport), tamzin (cartwheel, 30), grandpa (super fast, 3s).

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
const ticks = (m) => G.MOVES[m].startup + G.MOVES[m].active + 2;

test('louise: a dance that bumps them for 30, through a guard', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 560;
  G.setHeld(g, 1, { block: true });
  run(g, 2);
  type(g, 0, 'louise');
  const events = run(g, ticks('dance'));
  assert.ok(events.some((e) => e.type === 'dance' && e.attacker === 0));
  const hit = events.find((e) => e.type === 'hit' && e.move === 'dance');
  assert.ok(hit);
  assert.strictEqual(hit.damage, 30);
  assert.strictEqual(b.hp, G.MAX_HP - 30);
  assert.strictEqual(a.x, 400, 'danced on the spot');
});

test('louise: the dance reels them in for the bump', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 150;
  b.x = 650;
  type(g, 0, 'louise');
  const events = run(g, G.MOVES.dance.startup - 1);
  assert.strictEqual(a.x, 150, 'Louise stays put');
  assert.ok(Math.abs(b.x - (150 + G.DANCE_PULL_TO)) < 2, `pulled in to ${b.x}`);
  events.push(...run(g, 10));
  assert.ok(events.some((e) => e.type === 'hit' && e.move === 'dance' && e.target === 1));
  assert.strictEqual(b.hp, G.MAX_HP - 30);
});

test('louise: from right across the ring they come closer, but may not get there in time', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 100;
  b.x = 900;
  type(g, 0, 'louise');
  const events = run(g, G.MOVES.dance.startup + G.MOVES.dance.active + 2);
  assert.ok(b.x < 600, 'pulled a long way');
  assert.ok(!events.some((e) => e.type === 'hit'), 'but the bump missed');
});

test('louise in the ring: pulls the nearest one in, not the others', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 200; a.y = 200;
  b.x = 800; b.y = 800;
  c.x = 600; c.y = 250;
  type(g, 0, 'louise');
  const events = run(g, G.MOVES.dance.startup - 1);
  assert.ok(Math.hypot(c.x - a.x, c.y - a.y) < 140, 'C pulled in');
  assert.ok(Math.hypot(b.x - 800, b.y - 800) < 1, 'B left where they were');
  events.push(...run(g, 10));
  assert.ok(events.some((e) => e.type === 'hit' && e.move === 'dance' && e.target === 2));
  assert.strictEqual(b.hp, G.MAX_HP);
});

test('tamzin: a cartwheel across at them for 30', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 250;
  b.x = 650;
  type(g, 0, 'tamzin');
  const events = run(g, ticks('cartwheel'));
  assert.ok(events.some((e) => e.type === 'cartwheel'));
  assert.ok(a.x > 450, 'cartwheeled over to them');
  const hit = events.find((e) => e.type === 'hit' && e.move === 'cartwheel');
  assert.ok(hit);
  assert.strictEqual(hit.damage, 30);
});

test("tamzin: you're on your hands, not in the air, so you can be hit mid-cartwheel", () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 520;
  type(g, 0, 'tamzin');
  run(g, G.FLIP_CROUCH + 1);
  assert.ok(!G.untouchable(a));
  G.pressAction(g, 1, 'punch');
  assert.ok(run(g, 10).some((e) => e.type === 'hit' && e.target === 0));
});

test('kalya: the vault that luna used to do', () => {
  assert.strictEqual(G.CODES.kalya, 'vault');
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 600;
  type(g, 0, 'kalya');
  run(g, ticks('vault'));
  assert.ok(a.x > b.x);
  assert.strictEqual(b.hp, G.MAX_HP - 30);
});

test('luna: teleports you right beside the nearest opponent', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 150;
  b.x = 800;
  type(g, 0, 'luna');
  const ev = g.events.find((e) => e.type === 'teleport');
  assert.ok(ev);
  assert.strictEqual(ev.from.x, 150);
  assert.strictEqual(a.x, 800 - G.TELEPORT_GAP, 'on your side of them');
  // Against the ropes: the other side.
  a.x = 600;
  b.x = 870;
  run(g, 1);
  type(g, 0, 'luna');
  assert.ok(Math.abs(a.x - b.x) <= G.TELEPORT_GAP + 1);
});

test('luna in the ring: next to the nearest, facing them', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 150; a.y = 150;
  b.x = 700; b.y = 700;
  c.x = 850; c.y = 200;
  type(g, 0, 'luna');
  const d = Math.hypot(a.x - c.x, a.y - c.y);
  assert.ok(Math.abs(d - G.TELEPORT_GAP) < 1, 'beside C, the nearest');
  assert.ok(Math.abs(a.angle - Math.atan2(c.y - a.y, c.x - a.x)) < 0.01);
});

test('grandpa: super fast for three seconds', () => {
  const g = fight();
  const [a, b] = g.fighters;
  const stride = () => {
    a.x = 300;
    b.x = 880;
    G.setHeld(g, 0, { right: true });
    run(g, 10);
    G.setHeld(g, 0, {});
    return a.x - 300;
  };
  type(g, 0, 'grandpa');
  assert.ok(G.snapshot(g).fighters[0].turbo > 0);
  const fast = stride();
  run(g, G.GRANDPA_TICKS);
  const slow = stride();
  assert.ok(fast > slow * 2.3, `${fast} vs ${slow}`);
});
