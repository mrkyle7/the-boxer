'use strict';

// "daddy": fast shoes for ten seconds.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

function fight() {
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

const type = (g, i, word) => { for (const k of word) G.typeKey(g, i, k); };

/** How far fighter 0 walks left in 20 ticks. */
function walk(g) {
  const a = g.fighters[0];
  a.x = 600;
  g.fighters[1].x = 900;
  G.setHeld(g, 0, { left: true });
  run(g, 20);
  G.setHeld(g, 0, {});
  return 600 - a.x;
}

test('daddy: fast shoes, nearly twice the speed, for ten seconds', () => {
  const g = fight();
  const normal = walk(g);
  type(g, 0, 'daddy');
  assert.ok(run(g, 1).some((e) => e.type === 'daddy' && e.target === 0));
  assert.ok(G.snapshot(g).fighters[0].shoes > 0);
  const fast = walk(g);
  assert.ok(Math.abs(fast / normal - G.DADDY_SPEED) < 0.05, `${fast} vs ${normal}`);
  run(g, G.DADDY_TICKS);
  assert.ok(!('shoes' in G.snapshot(g).fighters[0]), 'shoes off');
  assert.ok(Math.abs(walk(g) - normal) < 0.5, 'back to normal');
  assert.strictEqual(G.DADDY_TICKS, 10 * G.TICK_RATE);
});
