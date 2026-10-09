'use strict';

// "daniel": spiky for five seconds. Hits on you split 30:70, you:them.

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

function kickB(g) {
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 560;
  G.setHeld(g, 0, { aim: 'head' });
  G.pressAction(g, 0, 'kick');
  return run(g, 30);
}

test('daniel: a kick on a spiky fighter splits 30:70', () => {
  const g = fight();
  const [a, b] = g.fighters;
  type(g, 1, 'daniel');
  assert.ok(G.snapshot(g).fighters[1].spiky > 0, 'everyone can see the spikes');
  const events = kickB(g);
  const full = G.MOVES.kick.head.damage; // 14
  const keep = Math.round(full * 0.3);
  assert.strictEqual(b.hp, G.MAX_HP - keep);
  assert.strictEqual(a.hp, G.MAX_HP - (full - keep));
  assert.ok(events.some((e) => e.type === 'spiked' && e.target === 0 && e.damage === full - keep));
});

test('daniel: the spikes go after five seconds', () => {
  const g = fight();
  type(g, 1, 'daniel');
  run(g, G.SPIKY_TICKS);
  assert.strictEqual(g.fighters[1].spiky, 0);
  kickB(g);
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.MOVES.kick.head.damage);
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP);
});

test('daniel: works on cheat moves too, and can knock out the attacker', () => {
  const g = fight();
  const [a, b] = g.fighters;
  a.x = 400;
  b.x = 600;
  a.hp = 20;
  type(g, 1, 'daniel');
  G.cheat(g, 0, 'zeffen');
  const events = run(g, 60);
  assert.strictEqual(a.state, 'ko');
  assert.ok(events.some((e) => e.type === 'ko' && e.target === 0));
  assert.ok(b.hp > G.MAX_HP - 25, 'B only took 30% of it');
});

test("daniel: the giant fist has nobody to spike, so it lands in full", () => {
  const g = G.createGame(['Kyle', 'B'], { fists: true, random: () => 0 });
  while (g.phase !== 'fight') G.step(g);
  run(g, G.FIST_MIN_TICKS); // the shadow is under Kyle
  for (const k of 'daniel') G.typeKey(g, 0, k);
  assert.ok(g.fighters[0].spiky > 0);
  run(g, G.FIST_WARN_TICKS);
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP - G.FIST_DAMAGE);
});
