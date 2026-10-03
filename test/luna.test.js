'use strict';

// A fighter called Luna gets a helping hand: faster feet, longer reach, a
// step in when an attack is just short, and aim assist when walking in the ring.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../public/game.js');

function fightingGame(names) {
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

function placeAt(g, distance) {
  g.fighters[0].x = 500 - distance / 2;
  g.fighters[1].x = 500 + distance / 2;
}

// Does fighter 0's punch land from this far away?
function punchLands(name, distance) {
  const g = fightingGame([name, 'Bob']);
  placeAt(g, distance);
  G.pressAction(g, 0, 'punch');
  return run(g, 40).some((e) => e.type === 'hit' && e.attacker === 0);
}

test('only a fighter called Luna (any capitals) gets the helping hand', () => {
  for (const name of ['luna', 'Luna', ' LUNA ']) assert.ok(G.isLuna(name), name);
  for (const name of ['Lunar', 'Luna Smith', 'Bob', '', undefined]) assert.ok(!G.isLuna(name), name);
  const snap = G.snapshot(G.createGame(['Luna', 'Bob']));
  assert.strictEqual(snap.fighters[0].luna, true);
  assert.strictEqual(snap.fighters[1].luna, undefined);
});

test('Luna walks a bit faster', () => {
  const walked = (name) => {
    const g = fightingGame([name, 'Bob']);
    placeAt(g, 600);
    const x = g.fighters[0].x;
    G.setHeld(g, 0, { left: true });
    run(g, 20);
    return x - g.fighters[0].x;
  };
  const luna = walked('Luna');
  const other = walked('Ann');
  assert.ok(Math.abs(luna / other - G.LUNA_SPEED) < 0.01, `${luna} vs ${other}`);
});

test("Luna's punches reach further", () => {
  const range = G.MOVES.punch.range;
  assert.strictEqual(punchLands('Ann', range + 20), false);
  assert.strictEqual(punchLands('Luna', range + 20), true);
});

test("Luna's kicks reach further too", () => {
  const g = fightingGame(['luna', 'Bob']);
  placeAt(g, G.MOVES.kick.range + 30);
  G.pressAction(g, 0, 'kick');
  assert.ok(run(g, 60).some((e) => e.type === 'hit' && e.move === 'kick' && e.attacker === 0));
});

test('Luna steps in when an attack is just out of reach, but not from across the ring', () => {
  const lunaReach = G.MOVES.punch.range * G.LUNA_REACH;
  assert.strictEqual(punchLands('Luna', lunaReach + 50), true);
  assert.strictEqual(punchLands('Ann', lunaReach + 50), false);
  assert.strictEqual(punchLands('Luna', lunaReach + 150), false);
});

test('in the ring, Luna walking roughly towards an opponent bends towards them', () => {
  const bend = (name) => {
    const g = fightingGame([name, 'Bob', 'Cat']);
    const [me, bob, cat] = g.fighters;
    Object.assign(me, { x: 300, y: 500 });
    Object.assign(bob, { x: 600, y: 650 }); // ahead and off to one side
    Object.assign(cat, { x: 900, y: 120 });
    G.setHeld(g, 0, { right: true });
    run(g, 20);
    return me.y - 500;
  };
  assert.ok(bend('Luna') > 10, 'drifts towards Bob');
  assert.ok(Math.abs(bend('Ann')) < 1, 'walks straight');
});
