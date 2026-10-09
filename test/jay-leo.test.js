'use strict';

// "jay": a vampire for 7s (half damage, all of it drained back as health).
// "leo": a lion for 7s (punches only, 1.5x damage, no kicks, no blocking).

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

function attack(g, move) {
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 540;
  b.hp = G.MAX_HP;
  G.setHeld(g, 0, { aim: 'head' });
  G.pressAction(g, 0, move);
  return run(g, 40);
}

test('jay: a vampire hits for half, and heals by as much', () => {
  const g = fight();
  const a = g.fighters[0];
  a.hp = 50;
  type(g, 0, 'jay');
  assert.ok(G.snapshot(g).fighters[0].vampire > 0);
  const events = attack(g, 'kick');
  const dealt = Math.round(G.MOVES.kick.head.damage * 0.5); // 7
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - dealt);
  assert.strictEqual(a.hp, 50 + dealt);
  assert.ok(events.some((e) => e.type === 'drain' && e.heal === dealt));
});

test('jay: never heals above full, and wears off after seven seconds', () => {
  const g = fight();
  type(g, 0, 'jay');
  attack(g, 'kick');
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP);
  run(g, G.VAMPIRE_TICKS);
  attack(g, 'kick');
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.MOVES.kick.head.damage);
});

test('jay: cheat moves drain too', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 600;
  a.hp = 40;
  type(g, 0, 'jay');
  G.cheat(g, 0, 'zeffen');
  run(g, 60);
  assert.strictEqual(b.hp, G.MAX_HP - 2 * Math.round(25 * 0.5));
  assert.strictEqual(a.hp, 40 + 2 * Math.round(25 * 0.5));
});

test('leo: claw swipes do 1.5x, kicks do nothing', () => {
  const g = fight();
  type(g, 0, 'leo');
  assert.ok(G.snapshot(g).fighters[0].lion > 0);
  attack(g, 'punch');
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - Math.round(G.MOVES.punch.head.damage * 1.5));
  const events = attack(g, 'kick');
  assert.ok(!events.some((e) => e.type === 'hit'));
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);
});

test("leo: a lion can't block", () => {
  const g = fight();
  const [a, b] = g.fighters;
  type(g, 1, 'leo');
  a.x = 400;
  b.x = 520;
  G.setHeld(g, 1, { block: true, aim: 'head' });
  run(g, 3);
  assert.notStrictEqual(b.state, 'block');
  G.pressAction(g, 0, 'punch');
  const events = run(g, 20);
  assert.ok(events.some((e) => e.type === 'hit' && e.target === 1));
  run(g, G.LION_TICKS);
  run(g, 3);
  assert.strictEqual(b.state, 'block', 'blocking again once the lion is gone');
});
