'use strict';

// "harrison": a surprise move or power, picked at random.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

/** A fight where the "random" pick is the given surprise. */
function fight(surprise, names = ['A', 'B']) {
  const k = G.SURPRISES.indexOf(surprise);
  const g = G.createGame(names, { random: () => (k + 0.5) / G.SURPRISES.length });
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

function harrison(g, i = 0) {
  for (const k of 'harrison') G.typeKey(g, i, k);
  const events = g.events.slice();
  g.events = [];
  return events.find((e) => e.type === 'harrison');
}

test('harrison picks one of the surprises at random', () => {
  const seen = new Set();
  for (const s of G.SURPRISES) {
    const g = fight(s);
    seen.add(harrison(g).surprise);
  }
  assert.deepStrictEqual([...seen].sort(), [...G.SURPRISES].sort());
  assert.ok(G.SURPRISES.length >= 4);
});

test('zap: lightning on whoever you are fighting, through a guard', () => {
  const g = fight('zap');
  G.setHeld(g, 1, { block: true });
  run(g, 2);
  const ev = harrison(g);
  assert.strictEqual(ev.target, 1);
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.ZAP_DAMAGE);
});

test('banana: they slip, get hurt, and are down for a bit', () => {
  const g = fight('banana');
  harrison(g);
  const b = g.fighters[1];
  assert.strictEqual(b.hp, G.MAX_HP - G.BANANA_DAMAGE);
  assert.ok(b.slip > 0);
  G.pressAction(g, 1, 'punch');
  run(g, 30);
  assert.notStrictEqual(b.state, 'attack', "can't punch from the floor");
  run(g, 60);
  assert.strictEqual(b.slip, 0);
});

test('freeze: everyone else stuck in ice for three seconds, still hittable', () => {
  const g = fight('freeze', ['A', 'B', 'C']);
  const ev = harrison(g);
  assert.deepStrictEqual(ev.targets.sort(), [1, 2]);
  const b = g.fighters[1];
  const x = b.x;
  G.setHeld(g, 1, { left: true });
  G.pressAction(g, 1, 'kick');
  run(g, 60);
  assert.strictEqual(b.x, x, "can't move");
  assert.notStrictEqual(b.move, 'kick', "can't attack");
  assert.strictEqual(g.fighters[0].frozen, 0, 'not you');
  run(g, G.FREEZE_TICKS);
  assert.strictEqual(b.frozen, 0);
  assert.ok(b.x < x, 'moving again once it melts');
});

test('zoom: you run nearly twice as fast for six seconds', () => {
  const g = fight('zoom');
  harrison(g);
  const [a, b] = g.fighters;
  const stride = () => {
    a.x = 500;
    b.x = 850;
    G.setHeld(g, 0, { right: true });
    run(g, 10);
    G.setHeld(g, 0, {});
    return a.x - 500;
  };
  const fast = stride();
  run(g, G.ZOOM_TICKS);
  const slow = stride();
  assert.ok(fast > slow * 1.6, `${fast} vs ${slow}`);
});

test('snack: health and stamina back', () => {
  const g = fight('snack');
  g.fighters[0].hp = 40;
  g.fighters[0].stamina = 5;
  harrison(g);
  assert.strictEqual(g.fighters[0].hp, 40 + G.SNACK_HEAL);
  assert.strictEqual(g.fighters[0].stamina, G.MAX_STAMINA);
  g.fighters[0].hp = 95;
  harrison(g);
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP, 'never more than full');
});

test('a zap can knock someone out', () => {
  const g = fight('zap');
  g.fighters[1].hp = 10;
  harrison(g);
  const events = run(g, 2);
  assert.strictEqual(g.fighters[1].state, 'ko');
  assert.ok(events.some((e) => e.type === 'roundEnd' && e.winner === 0));
});
