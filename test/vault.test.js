'use strict';

// The Luna vault: type "luna" to flip over your opponent and kick them in the back.

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

const VAULT_TICKS = G.MOVES.vault.startup + G.MOVES.vault.active;
const type = (g, i, word) => { for (const k of word) G.typeKey(g, i, k); };

test('typing luna vaults over them, lands behind, and kicks them in the back for 30', () => {
  const g = fight();
  g.fighters[0].x = 400;
  g.fighters[1].x = 600;
  G.setHeld(g, 1, { block: true, aim: 'head' }); // guarding, facing A
  run(g, 2);
  type(g, 0, 'luna');
  const events = run(g, VAULT_TICKS + 2);
  assert.ok(events.some((e) => e.type === 'vault' && e.attacker === 0));
  assert.ok(g.fighters[0].x > g.fighters[1].x, 'A ended up on the other side of B');
  const hit = events.find((e) => e.type === 'hit' && e.move === 'vault');
  assert.ok(hit, 'the kick landed');
  assert.strictEqual(hit.damage, 30);
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - 30);
  assert.ok(!events.some((e) => e.type === 'block'), "a guard doesn't cover your back");
  assert.strictEqual(g.fighters[0].facing, -1, 'A turned round to face B');
});

test("the A in luna (punch) doesn't throw a punch instead", () => {
  const g = fight();
  g.fighters[0].x = 400;
  g.fighters[1].x = 600;
  for (const k of 'lun') G.typeKey(g, 0, k);
  G.typeKey(g, 0, 'a');
  G.pressAction(g, 0, 'punch'); // the A key is also punch
  run(g, 2);
  assert.strictEqual(g.fighters[0].move, 'vault');
});

test('in the ring it lands behind them too', () => {
  const g = fight(['A', 'B', 'C']);
  const [a, b, c] = g.fighters;
  a.x = 400; a.y = 500;
  b.x = 600; b.y = 500;
  c.x = 850; c.y = 880;
  a.target = null;
  run(g, 1);
  type(g, 0, 'luna');
  const events = run(g, VAULT_TICKS + 2);
  assert.ok(a.x > b.x + 40, 'past B');
  const hit = events.find((e) => e.type === 'hit' && e.move === 'vault');
  assert.ok(hit);
  assert.strictEqual(hit.target, 1);
  assert.strictEqual(c.hp, G.MAX_HP);
});

test('both codes work, and showing what is typed picks the right one', () => {
  const g = fight();
  type(g, 0, 'lu');
  assert.strictEqual(g.fighters[0].typing, 'lu');
  type(g, 0, 'zef');
  assert.strictEqual(g.fighters[0].typing, 'zef');
  type(g, 0, 'x');
  assert.strictEqual(g.fighters[0].typing, '');
  assert.ok(['luna', 'zeffen'].every((c) => c in G.CODES));
});

test('nothing touches you while you vault, and a hit while typing wipes it', () => {
  const g = fight();
  g.fighters[0].x = 400;
  g.fighters[1].x = 520;
  type(g, 1, 'lun');
  G.pressAction(g, 0, 'punch');
  run(g, 12);
  assert.strictEqual(g.fighters[1].typing, '');
  G.typeKey(g, 1, 'a');
  run(g, 20);
  assert.notStrictEqual(g.fighters[1].move, 'vault');
});
