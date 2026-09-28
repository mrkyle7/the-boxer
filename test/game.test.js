'use strict';

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

function fightingGame() {
  const g = G.createGame(['A', 'B']);
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

function placeAt(g, distance) {
  g.fighters[0].x = 500 - distance / 2;
  g.fighters[1].x = 500 + distance / 2;
}

test('no one can act during the countdown', () => {
  const g = G.createGame(['A', 'B']);
  G.setHeld(g, 0, { right: true });
  const x = g.fighters[0].x;
  G.step(g);
  assert.strictEqual(g.phase, 'countdown');
  assert.strictEqual(g.fighters[0].x, x);
});

test('fighters walk and cannot pass through each other or the ropes', () => {
  const g = fightingGame();
  G.setHeld(g, 0, { right: true });
  G.setHeld(g, 1, { left: true });
  run(g, 300);
  const [a, b] = g.fighters;
  assert.ok(b.x - a.x >= G.MIN_SEPARATION - 0.001);
  G.setHeld(g, 0, { left: true });
  G.setHeld(g, 1, { right: true });
  run(g, 600);
  assert.strictEqual(g.fighters[0].x, G.RING_LEFT);
  assert.strictEqual(g.fighters[1].x, G.RING_RIGHT);
});

test('a punch in range lands, costs stamina and deals head damage', () => {
  const g = fightingGame();
  placeAt(g, 120);
  G.pressAction(g, 0, 'punch');
  const events = run(g, 30);
  const hit = events.find((e) => e.type === 'hit');
  assert.ok(hit, 'punch should land');
  assert.strictEqual(hit.target, 1);
  assert.strictEqual(hit.height, 'head');
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.MOVES.punch.head.damage);
  assert.strictEqual(g.fighters[0].stats.landed, 1);
  assert.ok(g.fighters[0].stamina < G.MAX_STAMINA);
});

test('a punch out of range whiffs, but a kick reaches further', () => {
  const g = fightingGame();
  const gap = G.MOVES.punch.range + 20;
  placeAt(g, gap);
  G.pressAction(g, 0, 'punch');
  let events = run(g, 30);
  assert.ok(!events.some((e) => e.type === 'hit'));
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);
  assert.strictEqual(g.fighters[0].stats.thrown, 1);

  assert.ok(G.MOVES.kick.range > gap);
  placeAt(g, gap);
  G.pressAction(g, 0, 'kick');
  events = run(g, 50);
  assert.ok(events.some((e) => e.type === 'hit' && e.move === 'kick'));
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.MOVES.kick.head.damage);
});

test('aiming at the tummy lands a body shot that drains stamina', () => {
  const g = fightingGame();
  placeAt(g, 120);
  G.setHeld(g, 0, { aim: 'body' });
  G.pressAction(g, 0, 'kick');
  const before = g.fighters[1].stamina;
  let hit;
  for (let i = 0; i < 30 && !hit; i++) hit = run(g, 1).find((e) => e.type === 'hit');
  assert.strictEqual(hit.height, 'body');
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.MOVES.kick.body.damage);
  assert.ok(g.fighters[1].stamina <= before - G.MOVES.kick.body.winded);
});

test('a block only stops attacks at the height it covers', () => {
  const g = fightingGame();
  placeAt(g, 110);
  G.setHeld(g, 1, { block: true, aim: 'head' });
  run(g, 2);
  G.pressAction(g, 0, 'punch');
  let events = run(g, 30);
  assert.ok(events.some((e) => e.type === 'block' && e.height === 'head'));
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);

  placeAt(g, 110);
  G.setHeld(g, 0, { aim: 'body' });
  G.pressAction(g, 0, 'punch');
  events = run(g, 30);
  const hit = events.find((e) => e.type === 'hit');
  assert.ok(hit && hit.wrongGuard, 'tummy punch should get past a high guard');
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.MOVES.punch.body.damage);

  // Guarding low stops it.
  G.setHeld(g, 1, { block: true, aim: 'body' });
  run(g, 30);
  const hp = g.fighters[1].hp;
  placeAt(g, 110);
  G.pressAction(g, 0, 'punch');
  events = run(g, 30);
  assert.ok(events.some((e) => e.type === 'block' && e.height === 'body'));
  assert.strictEqual(g.fighters[1].hp, hp);
});

test('blocked kicks chip through the guard', () => {
  const g = fightingGame();
  placeAt(g, 110);
  G.setHeld(g, 1, { block: true });
  run(g, 2);
  G.pressAction(g, 0, 'kick');
  run(g, 50);
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP - G.MOVES.kick.blockDamage);
});

test('an attack keeps the height it started with', () => {
  const g = fightingGame();
  placeAt(g, 110);
  G.pressAction(g, 0, 'kick');
  run(g, 3);
  G.setHeld(g, 0, { aim: 'body' });
  const events = run(g, 30);
  assert.strictEqual(events.find((e) => e.type === 'hit').height, 'head');
});

test('hitting an opponent mid-attack is a counter for extra damage', () => {
  const g = fightingGame();
  placeAt(g, 100);
  G.pressAction(g, 1, 'kick');  // slow startup
  G.pressAction(g, 0, 'punch'); // fast, lands during the kick's startup
  const events = run(g, 12);
  const hit = events.find((e) => e.type === 'hit' && e.target === 1);
  assert.ok(hit && hit.counter, 'expected a counter hit');
  assert.strictEqual(hit.damage, Math.round(G.MOVES.punch.head.damage * 1.4));
});

test('attacks need stamina', () => {
  const g = fightingGame();
  placeAt(g, 400);
  g.fighters[0].stamina = G.MOVES.kick.stamina - 1;
  G.pressAction(g, 0, 'kick');
  run(g, 1);
  assert.notStrictEqual(g.fighters[0].state, 'attack');
});

test('a guard with no stamina breaks', () => {
  const g = fightingGame();
  placeAt(g, 100);
  G.setHeld(g, 1, { block: true });
  run(g, 2);
  g.fighters[1].stamina = 5;
  G.pressAction(g, 0, 'kick');
  const events = run(g, 30);
  assert.ok(events.some((e) => e.type === 'guardbreak'));
  assert.strictEqual(g.fighters[1].state, 'guardbreak');
});

test('knocking someone out wins the round and the match after two', () => {
  const g = fightingGame();
  for (let round = 1; round <= 2; round++) {
    while (g.phase !== 'fight') run(g, 1);
    placeAt(g, 100);
    g.fighters[1].hp = 3;
    G.pressAction(g, 0, 'punch');
    const events = run(g, 20);
    assert.ok(events.some((e) => e.type === 'ko' && e.target === 1));
    assert.ok(events.some((e) => e.type === 'roundEnd' && e.winner === 0));
    assert.strictEqual(g.fighters[0].roundsWon, round);
    run(g, G.ROUND_END_TICKS + 1);
  }
  assert.strictEqual(g.phase, 'matchEnd');
  assert.strictEqual(g.winner, 0);
});

test('the round timer decides on health', () => {
  const g = fightingGame();
  g.fighters[0].hp = 40;
  g.timer = 2;
  const events = run(g, 3);
  const end = events.find((e) => e.type === 'roundEnd');
  assert.ok(end);
  assert.strictEqual(end.winner, 1);
});

test('a new round resets health but keeps rounds won and stats', () => {
  const g = fightingGame();
  placeAt(g, 100);
  g.fighters[1].hp = 2;
  G.pressAction(g, 0, 'punch');
  run(g, 20);
  run(g, G.ROUND_END_TICKS + 2);
  assert.strictEqual(g.round, 2);
  assert.strictEqual(g.phase, 'countdown');
  assert.strictEqual(g.fighters[1].hp, G.MAX_HP);
  assert.strictEqual(g.fighters[0].roundsWon, 1);
  assert.strictEqual(g.fighters[0].stats.landed, 1);
});

test('random brawling never breaks positions or lets fighters cross', () => {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let fight = 0; fight < 100; fight++) {
    const g = G.createGame(['A', 'B']);
    for (let t = 0; t < 3000; t++) {
      for (const i of [0, 1]) {
        if (rnd() < 0.1) {
          G.setHeld(g, i, { left: rnd() < 0.5, right: rnd() < 0.5, block: rnd() < 0.4, aim: rnd() < 0.5 ? 'head' : 'body' });
        }
        if (rnd() < 0.05) G.pressAction(g, i, rnd() < 0.5 ? 'punch' : 'kick');
      }
      G.step(g);
      const [a, b] = g.fighters;
      assert.ok(Number.isFinite(a.x) && Number.isFinite(b.x), `bad position at tick ${t}`);
      assert.ok(Number.isFinite(a.hp) && Number.isFinite(b.stamina));
      assert.ok(b.x - a.x >= G.MIN_SEPARATION - 0.001, `fighters overlapped at tick ${t}`);
    }
  }
});

test('unknown actions are ignored', () => {
  const g = fightingGame();
  G.pressAction(g, 0, 'teleport');
  G.setHeld(g, 0, { aim: 'feet' });
  G.pressAction(g, 0, '__proto__');
  run(g, 5);
  assert.strictEqual(g.fighters[0].state, 'idle');
  assert.strictEqual(g.fighters[0].aim, 'head');
});
