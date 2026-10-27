'use strict';

// "tony": a chess piece for 7s, picked at random, each with its own trick.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

/** A fight where Tony (fighter 0) will turn into `piece`. */
function fight(piece, names = ['A', 'B']) {
  const r = piece ? (G.PIECES.indexOf(piece) + 0.5) / G.PIECES.length : 0;
  const g = G.createGame(names, { random: () => r });
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

/** Fighter `from` punches `to` from `gap` away; the hit (or block), if any. */
function punch(g, from, to, gap, held = {}) {
  const a = g.fighters[from];
  const b = g.fighters[to];
  a.x = 300;
  b.x = 300 + gap;
  a.vx = b.vx = 0;
  G.setHeld(g, from, { aim: 'head' });
  G.setHeld(g, to, held);
  run(g, 2);
  G.pressAction(g, from, 'punch');
  const events = run(g, 30);
  return events.find((e) => (e.type === 'hit' || e.type === 'block') && e.target === to);
}

const NORMAL = G.MOVES.punch.head.damage;

test('tony turns you into a chess piece, at random, for ten seconds', () => {
  const seen = new Set();
  for (const p of G.PIECES) {
    const g = fight(p);
    type(g, 0, 'tony');
    const e = run(g, 1).find((ev) => ev.type === 'tony');
    assert.strictEqual(e.piece, p);
    assert.strictEqual(G.snapshot(g).fighters[0].piece, p);
    seen.add(e.piece);
    run(g, G.CHESS_TICKS);
    assert.strictEqual(g.fighters[0].chess, 0);
    assert.ok(!('piece' in G.snapshot(g).fighters[0]), 'back to normal');
  }
  assert.strictEqual(seen.size, 6);
  assert.strictEqual(G.CHESS_TICKS, 10 * G.TICK_RATE);
});

test('a pawn hits softly, but three hits and it promotes to a queen', () => {
  const g = fight('pawn');
  G.cheat(g, 0, 'tony');
  const first = punch(g, 0, 1, 120);
  assert.strictEqual(first.damage, Math.round(NORMAL * 0.75));
  punch(g, 0, 1, 120);
  g.events = [];
  const [a] = g.fighters;
  a.x = 300; g.fighters[1].x = 420;
  G.pressAction(g, 0, 'punch');
  const events = run(g, 30);
  assert.ok(events.some((e) => e.type === 'promote' && e.target === 0));
  assert.strictEqual(g.fighters[0].piece, 'queen');
  assert.strictEqual(punch(g, 0, 1, 120).damage, Math.round(NORMAL * 1.5));
});

test('a knight leaps over the guard, and from further away', () => {
  const g = fight('knight');
  G.cheat(g, 0, 'tony');
  const hit = punch(g, 0, 1, 120, { block: true, aim: 'head' });
  assert.strictEqual(hit.type, 'hit', 'not blocked');
  const far = G.MOVES.punch.range * 1.4;
  assert.ok(punch(g, 0, 1, far), 'reaches further');
  assert.ok(!punch(fight(), 0, 1, far), 'a normal punch falls short');
});

test('a bishop heals 5 with every hit', () => {
  const g = fight('bishop');
  G.cheat(g, 0, 'tony');
  g.fighters[0].hp = 50;
  const hit = punch(g, 0, 1, 120);
  assert.strictEqual(hit.damage, NORMAL);
  assert.strictEqual(g.fighters[0].hp, 55);
});

test("a rook hits harder, takes half, and won't be pushed back", () => {
  const g = fight('rook');
  G.cheat(g, 0, 'tony');
  assert.strictEqual(punch(g, 0, 1, 120).damage, Math.round(NORMAL * 1.25));
  const hit = punch(g, 1, 0, -120);
  assert.strictEqual(hit.damage, Math.round(NORMAL * 0.5));
  assert.strictEqual(g.fighters[0].x, 180, 'not budged');
});

test('a queen: 1.5x damage, more reach, and quick', () => {
  const g = fight('queen');
  G.cheat(g, 0, 'tony');
  assert.strictEqual(punch(g, 0, 1, 120).damage, Math.round(NORMAL * 1.5));
  assert.ok(punch(g, 0, 1, G.MOVES.punch.range * 1.2));
  const q = g.fighters[0];
  q.x = 300;
  G.setHeld(g, 0, { right: true });
  run(g, 10);
  const moved = q.x - 300;
  const n = fight();
  n.fighters[0].x = 300;
  G.setHeld(n, 0, { right: true });
  run(n, 10);
  assert.ok(moved > (n.fighters[0].x - 300) * 1.4, 'faster');
});

test('a king takes no damage, hits softly and moves slowly', () => {
  const g = fight('king');
  G.cheat(g, 0, 'tony');
  const hit = punch(g, 1, 0, -120);
  assert.strictEqual(hit.damage, 0);
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP);
  assert.strictEqual(punch(g, 0, 1, 120).damage, Math.round(NORMAL * 0.5));
});

test('the king is safe from the giant fist too', () => {
  const g = G.createGame(['Kyle', 'B'], { fists: true, random: () => 0 });
  while (g.phase !== 'fight') G.step(g);
  G.cheat(g, 0, 'tony');
  g.fighters[0].piece = 'king';
  g.fighters[0].x = 200;
  g.fighters[1].x = 800;
  const events = run(g, G.FIST_MIN_TICKS + G.FIST_WARN_TICKS); // the first one, while still a king
  const fist = events.find((e) => e.type === 'fist');
  assert.ok(fist && fist.hits.includes(0));
  assert.strictEqual(g.fighters[0].hp, G.MAX_HP);
});
