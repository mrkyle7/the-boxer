'use strict';

// Bots: computer fighters at three levels, playing through the same controls.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');
const { createBot, botTick, LEVELS, CODE_POOL } = require('../bot.js');

/** A whole match between bots at these levels; the game at the end. */
function match(levels, opts = {}) {
  const names = levels.map((l, i) => `${l}${i}`);
  const g = G.createGame(names, { fists: true, ...opts });
  const bots = levels.map((l) => createBot(l));
  const events = [];
  for (let t = 0; g.phase !== 'matchEnd' && t < 8 * 60 * G.TICK_RATE; t++) {
    bots.forEach((b, i) => botTick(g, i, b));
    G.step(g);
    events.push(...g.events);
    g.events = [];
  }
  return { g, events };
}

function wins(a, b, n = 12) {
  let won = 0;
  for (let k = 0; k < n; k++) if (match([a, b]).g.winner === 0) won++;
  return won;
}

test('three levels, each with its own name', () => {
  assert.deepStrictEqual(Object.keys(LEVELS), ['easy', 'medium', 'hard']);
  assert.strictEqual(createBot('nonsense').level, 'medium');
});

test('a bot fights: it moves in, lands hits, and finishes the match', () => {
  const { g, events } = match(['medium', 'medium']);
  assert.strictEqual(g.phase, 'matchEnd');
  assert.ok(events.filter((e) => e.type === 'hit').length > 10);
});

test('the levels are in order: hard beats medium beats easy (nearly always)', () => {
  assert.ok(wins('hard', 'easy') >= 11, 'hard v easy');
  assert.ok(wins('medium', 'easy') >= 10, 'medium v easy');
  assert.ok(wins('hard', 'medium') >= 8, 'hard v medium');
});

test('an easy bot is beatable: it barely lands a glove on someone who keeps hitting it', () => {
  // A plain "player" who just walks in and punches, every chance it gets.
  let won = 0;
  for (let k = 0; k < 6; k++) {
    const g = G.createGame(['You', 'Bot']);
    const bot = createBot('easy');
    for (let t = 0; g.phase !== 'matchEnd' && t < 8 * 60 * G.TICK_RATE; t++) {
      const [a, b] = g.fighters;
      G.setHeld(g, 0, { right: b.x - a.x > 140 });
      if (t % 20 === 0) G.pressAction(g, 0, 'punch');
      botTick(g, 1, bot);
      G.step(g);
      g.events = [];
    }
    if (g.winner === 0) won++;
  }
  assert.ok(won >= 4, `beat the easy bot ${won} of 6`);
});

test('bots type cheat codes a letter at a time', () => {
  const { events } = match(['hard', 'hard']);
  const codes = events.filter((e) => CODE_POOL.some((c) => e.type === c || e.type === G.CODES[c]));
  assert.ok(codes.length > 0, 'used a code');
});

test('in the flood, bots grab the boat or swim', () => {
  const g = G.createGame(['A', 'B']);
  while (g.phase !== 'fight') G.step(g);
  const bots = [createBot('medium'), createBot('medium')];
  G.cheat(g, 0, 'water');
  const events = [];
  for (let t = 0; t < 12 * G.TICK_RATE; t++) {
    bots.forEach((b, i) => botTick(g, i, b));
    G.step(g);
    events.push(...g.events);
    g.events = [];
  }
  assert.ok(events.some((e) => e.type === 'boat'), 'someone took the boat');
  assert.ok(events.some((e) => e.type === 'swim'), 'the other swam');
  assert.ok(!events.some((e) => e.type === 'sank'), 'nobody sank');
});

test('four bots in the ring play it out without a hitch', () => {
  const { g } = match(['easy', 'medium', 'hard', 'hard']);
  assert.strictEqual(g.phase, 'matchEnd');
});
