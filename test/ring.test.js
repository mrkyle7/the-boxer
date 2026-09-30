'use strict';

// Three and four fighters: the free-for-all in the ring seen from above.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

function ringGame(count = 3) {
  const names = ['A', 'B', 'C', 'D'].slice(0, count);
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

/** Puts fighters where given, and far-off ones out of the way in a corner. */
function place(g, spots) {
  g.fighters.forEach((f, i) => {
    const [x, y] = spots[i] || [G.RING_MAX, G.RING_MAX - i * 100];
    f.x = x;
    f.y = y;
    f.vx = 0;
    f.vy = 0;
    f.target = null;
  });
  G.step(g); // face each other
  g.events = [];
}

test('three or four fighters get the ring; two keep the side view', () => {
  assert.strictEqual(G.createGame(['A', 'B']).mode, 'side');
  assert.strictEqual(G.createGame(['A', 'B', 'C']).mode, 'ring');
  const four = G.createGame(['A', 'B', 'C', 'D']);
  assert.strictEqual(four.mode, 'ring');
  assert.strictEqual(four.fighters.length, 4);
  assert.strictEqual(G.createGame(['A', 'B', 'C', 'D', 'E']).fighters.length, 4, 'at most four');
  const spots = new Set(four.fighters.map((f) => `${f.x},${f.y}`));
  assert.strictEqual(spots.size, 4, 'everyone starts in their own corner');
  const snap = G.snapshot(four);
  assert.strictEqual(snap.mode, 'ring');
  assert.ok('y' in snap.fighters[0] && 'angle' in snap.fighters[0]);
  assert.ok(!('y' in G.snapshot(G.createGame(['A', 'B'])).fighters[0]), 'the side view sends what it always did');
});

test('in the ring fighters move in two directions, no faster diagonally, and stay inside the ropes', () => {
  const g = ringGame(3);
  place(g, [[500, 500], [200, 200], [800, 200]]);
  G.setHeld(g, 0, { down: true });
  run(g, 30);
  assert.ok(g.fighters[0].y > 600, 'moved down');
  assert.strictEqual(Math.round(g.fighters[0].x), 500);

  G.setHeld(g, 0, {});
  place(g, [[500, 500], [200, 200], [800, 200]]);
  G.setHeld(g, 0, { down: true, right: true });
  run(g, 20);
  const moved = Math.hypot(g.fighters[0].x - 500, g.fighters[0].y - 500);
  assert.ok(Math.abs(moved - 20 * 4.2) < 1, `diagonal distance ${moved}`);

  G.setHeld(g, 0, { up: true, left: true });
  run(g, 600);
  assert.ok(g.fighters[0].x >= G.RING_MIN && g.fighters[0].y >= G.RING_MIN);
});

test('up and down do nothing in the side view', () => {
  const g = G.createGame(['A', 'B']);
  while (g.phase !== 'fight') G.step(g);
  const x = g.fighters[0].x;
  G.setHeld(g, 0, { up: true, down: true });
  run(g, 20);
  assert.strictEqual(g.fighters[0].x, x);
  assert.strictEqual(g.fighters[0].state, 'idle');
});

test('each fighter faces the nearest opponent, and only switches when another is clearly nearer', () => {
  const g = ringGame(3);
  place(g, [[500, 500], [650, 500], [500, 300]]);
  assert.strictEqual(g.fighters[0].target, 1);
  assert.ok(Math.abs(g.fighters[0].angle) < 0.01, 'facing right, at B');
  // C comes slightly nearer than B: A stays on B.
  g.fighters[2].y = 360;
  run(g, 1);
  assert.strictEqual(g.fighters[0].target, 1);
  // C comes much nearer: A turns.
  g.fighters[2].y = 420;
  run(g, 1);
  assert.strictEqual(g.fighters[0].target, 2);
});

test("a punch lands on whoever is in front and in reach, and nobody else", () => {
  const g = ringGame(3);
  place(g, [[500, 500], [620, 500], [500, 380]]);
  G.pressAction(g, 0, 'punch');
  const events = run(g, 30);
  const hits = events.filter((e) => e.type === 'hit');
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].target, 1);
  assert.strictEqual(hits[0].attacker, 0);
  assert.strictEqual(g.fighters[2].hp, G.MAX_HP, 'the one beside A is untouched');
  assert.ok(g.fighters[1].x > 620, 'knocked back away from A');
});

test('the attack keeps the direction it started in', () => {
  const g = ringGame(3);
  place(g, [[500, 500], [640, 500], [500, 200]]);
  G.pressAction(g, 0, 'kick');
  run(g, 3); // wind-up has begun, facing B
  // C steps in close behind-ish A's other side; the kick still goes at B.
  g.fighters[2].x = 440;
  g.fighters[2].y = 500;
  const events = run(g, 40);
  const hit = events.find((e) => e.type === 'hit' || e.type === 'block');
  assert.ok(hit, 'the kick connected');
  assert.strictEqual(hit.target, 1);
});

test('a guard only covers attacks from the front', () => {
  const front = ringGame(3);
  place(front, [[500, 500], [620, 500], [900, 900]]);
  G.setHeld(front, 1, { block: true, aim: 'head' });
  run(front, 2);
  G.pressAction(front, 0, 'punch');
  assert.ok(run(front, 30).some((e) => e.type === 'block'), 'blocked from the front');

  const side = ringGame(3);
  // B faces C (nearest, up and to the right), so A's punch comes from behind B's shoulder.
  place(side, [[500, 500], [620, 500], [680, 440]]);
  assert.strictEqual(side.fighters[1].target, 2);
  G.setHeld(side, 1, { block: true, aim: 'head' });
  run(side, 2);
  G.pressAction(side, 0, 'punch');
  const events = run(side, 30);
  const hit = events.find((e) => e.type === 'hit' && e.target === 1);
  assert.ok(hit, 'hit from the side despite the guard');
  assert.strictEqual(hit.wrongGuard, true);
});

test('the last one standing takes the round', () => {
  const g = ringGame(3);
  place(g, [[500, 500], [620, 500], [300, 300]]);
  g.fighters[1].hp = 3;
  g.fighters[2].hp = 0;
  g.fighters[2].state = 'ko';
  G.pressAction(g, 0, 'punch');
  const events = run(g, 30);
  const end = events.find((e) => e.type === 'roundEnd');
  assert.ok(end);
  assert.strictEqual(end.winner, 0);
  assert.strictEqual(g.fighters[0].roundsWon, 1);
});

test('at the bell the healthiest fighter still standing takes the round; a tie takes nobody', () => {
  const g = ringGame(4);
  g.fighters[0].hp = 40;
  g.fighters[1].hp = 70;
  g.fighters[2].hp = 90;
  g.fighters[2].state = 'ko'; // down, so out of it
  g.fighters[3].hp = 55;
  g.timer = 1;
  const end = run(g, 1).find((e) => e.type === 'roundEnd');
  assert.strictEqual(end.winner, 1);

  const tie = ringGame(3);
  tie.fighters[0].hp = 50;
  tie.fighters[1].hp = 50;
  tie.fighters[2].hp = 20;
  tie.timer = 1;
  assert.strictEqual(run(tie, 1).find((e) => e.type === 'roundEnd').winner, null);
});

test('first to two rounds wins the match; knocked-out fighters are back up for the next round', () => {
  const g = ringGame(3);
  g.fighters[1].roundsWon = 1;
  g.fighters[0].hp = 0;
  g.fighters[0].state = 'ko';
  g.fighters[2].hp = 0;
  g.fighters[2].state = 'ko';
  run(g, 1);
  assert.strictEqual(g.phase, 'roundEnd');
  run(g, G.ROUND_END_TICKS + 1);
  assert.strictEqual(g.phase, 'matchEnd');
  assert.strictEqual(g.winner, 1);

  const next = ringGame(3);
  next.fighters[0].hp = 0;
  next.fighters[0].state = 'ko';
  next.fighters[2].hp = 0;
  next.fighters[2].state = 'ko';
  run(next, G.ROUND_END_TICKS + 2);
  assert.strictEqual(next.round, 2);
  assert.ok(next.fighters.every((f) => f.hp === G.MAX_HP && f.state !== 'ko'));
});

test('a player who leaves is out for the rest of the match, and the others fight on', () => {
  const g = ringGame(3);
  G.removeFighter(g, 2);
  assert.ok(run(g, 1).some((e) => e.type === 'left' && e.target === 2) || g.fighters[2].left);
  assert.strictEqual(g.phase, 'fight', 'two are still standing');
  g.fighters[1].hp = 0;
  g.fighters[1].state = 'ko';
  run(g, G.ROUND_END_TICKS + 2);
  assert.strictEqual(g.fighters[0].roundsWon, 1);
  assert.strictEqual(g.round, 2);
  assert.strictEqual(g.fighters[2].left, true, 'still out');
  assert.strictEqual(g.fighters[2].hp, 0);
});

test('fighters are pushed apart, not stacked', () => {
  const g = ringGame(4);
  place(g, [[500, 500], [505, 500], [500, 505], [505, 505]]);
  run(g, 3);
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const d = Math.hypot(g.fighters[i].x - g.fighters[j].x, g.fighters[i].y - g.fighters[j].y);
      assert.ok(d >= G.MIN_SEPARATION - 1, `${i} and ${j} are ${d} apart`);
    }
  }
});
