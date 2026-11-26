'use strict';

// Adventure mode's secrets. (Spoilers!)

const test = require('node:test');
const assert = require('node:assert');
const A = require('../public/adventure.js');

function run(g, ticks, each) {
  for (let k = 0; k < ticks; k++) {
    if (each) each(k);
    A.step(g);
  }
}

/** Sets this game's secret rooms: room k's way in is ways[k]; the golden glove in room `golden`. */
function setRooms(g, ways, golden = 0) {
  g.secretWays = ways.slice();
  g.roomNpcs = ways.map((w, k) => ['bunny', 'ghost', 'penguin', 'dragon', 'camel'][k]);
  g.goldenRoom = golden;
  const goldens = g.L.pickups.filter((pk) => pk.type === 'golden');
  g.taken = g.taken.filter((id) => !goldens.some((pk) => pk.id === id));
  for (const pk of goldens) if (pk.room !== golden) g.taken.push(pk.id);
}

/** The first way in of this kind ('door', 'pit') with or without a rock in front. */
const doorWay = (g, rock) => g.L.doors.find((d) => !d.exit && (rock === undefined || (d.rock !== null) === rock));

function playing(names = ['A'], level = 0, ways = [0, 1]) {
  const g = A.createGame(names, { level });
  setRooms(g, ways);
  run(g, A.READY_TICKS + 1);
  g.nextSpawn = g.L.spawns.length;
  g.enemies = [];
  return g;
}

/** Puts the team at x, with the camera following. */
function goTo(g, x) {
  g.camX = Math.max(0, x - 300);
  g.players.forEach((p, k) => {
    p.x = x - k * 30;
    p.y = A.surfaceBelow(g.L, p.x, -100);
    p.vx = 0;
    p.vy = 0;
    p.onGround = true;
  });
}

function pressDown(g, i = 0) {
  A.setHeld(g, i, { down: true });
  A.step(g);
  A.setHeld(g, i, {});
  A.step(g);
}

test('every level has room for five secret rooms, plenty of ways in, golden gloves and a hidden stair', () => {
  for (const L of A.LEVELS) {
    assert.strictEqual(L.rooms.length, 5, L.name);
    assert.ok(L.ways >= 5, `${L.name}: enough ways in for five rooms`);
    for (const d of L.doors.filter((q) => !q.exit)) assert.ok(d.x < L.arenaX && d.y < A.VIEW_H, `${L.name}: a door at ${d.x} before the boss, on the ground`);
    L.rooms.forEach((room, k) => {
      assert.ok(L.doors.some((d) => d.exit && d.room === k), `${L.name}: a way out of room ${k}`);
      assert.ok(L.pickups.some((p) => p.type === 'golden' && p.room === k && p.x > room.x0 && p.x < room.x0 + A.VIEW_W));
      assert.ok(room.x0 > L.end, 'off to the side, where the camera never goes');
    });
    assert.ok(L.platforms.filter((p) => p.hidden).length >= 2, `${L.name}: a hidden stair`);
  }
});

test('each game: two to five secret rooms, with ways in, residents and the golden glove picked at random', () => {
  const counts = new Set();
  const firstWays = new Set();
  const npcs = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const g = A.createGame(['A'], { seed });
    const n = g.secretWays.length;
    counts.add(n);
    assert.ok(n >= 2 && n <= 5);
    assert.strictEqual(new Set(g.secretWays).size, n, 'each room its own way in');
    assert.strictEqual(g.roomNpcs.length, n);
    assert.ok(g.goldenRoom >= 0 && g.goldenRoom < n);
    // Only one golden glove left to find.
    const golden = g.L.pickups.filter((pk) => pk.type === 'golden' && !g.taken.includes(pk.id));
    assert.deepStrictEqual(golden.map((pk) => pk.room), [g.goldenRoom]);
    firstWays.add(g.secretWays[0]);
    g.roomNpcs.forEach((x) => npcs.add(x));
  }
  assert.deepStrictEqual([...counts].sort(), [2, 3, 4, 5]);
  assert.ok(firstWays.size >= 5, 'the ways in move about');
  assert.ok(npcs.size >= 6, 'and so do the residents');
});

test('the hidden stairs can be climbed: each step is a jump from the one before', () => {
  for (const L of A.LEVELS) {
    for (const h of L.platforms.filter((p) => p.hidden)) {
      const from = L.platforms.some((q) => q !== h && q.y > h.y && q.y - h.y <= 100
        && h.x - (q.x + q.w) <= 90 && h.x - (q.x + q.w) >= -q.w);
      assert.ok(from, `${L.name}: a hidden step at ${h.x} can be reached`);
    }
  }
});

test('a hidden platform holds you up, and shows once someone stands on it', () => {
  const g = playing();
  const k = g.L.platforms.findIndex((p) => p.hidden);
  const pl = g.L.platforms[k];
  const p = g.players[0];
  g.camX = pl.x - 300;
  p.x = pl.x + pl.w / 2;
  p.y = pl.y - 40;
  p.onGround = false;
  run(g, 30);
  assert.strictEqual(p.y, pl.y, 'stood on it');
  assert.ok(g.revealed.includes(k));
  assert.ok(A.snapshot(g).revealed.includes(k));
  assert.strictEqual(g.secrets, 1);
  // The second step is the same secret.
  const k2 = g.L.platforms.findIndex((q, n) => q.hidden && n !== k);
  const p2 = g.L.platforms[k2];
  p.x = p2.x + p2.w / 2;
  p.y = p2.y - 40;
  run(g, 30);
  assert.ok(g.revealed.includes(k2));
  assert.strictEqual(g.secrets, 1);
});

test('a door behind a cracked rock: closed until the rock is broken', () => {
  const g = playing(['A', 'B']);
  const d = doorWay(g, true);
  setRooms(g, [d.way]);
  assert.notStrictEqual(d.rock, null);
  goTo(g, d.x);
  pressDown(g);
  assert.strictEqual(g.inRoom, null, 'the rock is in the way');
  const p = g.players[0];
  p.x = d.x - 50;
  p.facing = 1;
  for (let n = 0; n < A.ROCK_HITS; n++) {
    assert.ok(!g.broken.includes(d.rock));
    A.pressAction(g, 0, 'punch');
    run(g, 20);
  }
  assert.ok(g.broken.includes(d.rock));
  p.x = d.x;
  pressDown(g);
  assert.ok(g.inRoom, 'in');
});

test('in through the door: the whole team goes; the creatures wait outside for you', () => {
  const g = playing(['A', 'B'], 1); // the forest's need no rock
  const d = doorWay(g);
  setRooms(g, [g.L.pits[0].way, d.way], 1); // this door is the second room's, which has the glove
  goTo(g, d.x);
  const e = A.spawnEnemy(g, { type: 'goo', x: d.x + 400 });
  pressDown(g);
  assert.ok(g.inRoom);
  assert.strictEqual(g.inRoom.room, 1);
  const room = g.L.rooms[1];
  assert.strictEqual(g.camX, room.x0);
  for (const p of g.players) assert.ok(p.x > room.x0 && p.x < room.x0 + A.VIEW_W);
  assert.strictEqual(g.enemies.length, 0);
  assert.strictEqual(g.secrets, 1);
  // Nothing spawns in here, however long you stay.
  run(g, 300);
  assert.strictEqual(g.enemies.length, 0);
  // The golden glove.
  const gold = g.L.pickups.find((pk) => pk.type === 'golden' && pk.room === 1);
  const p = g.players[0];
  p.x = gold.x;
  p.y = gold.y + 40;
  A.step(g);
  assert.deepStrictEqual(g.golden, [1]);
  // And out again, back where you came in, creature and all.
  const exit = g.L.doors.find((q) => q.exit && q.room === 1);
  p.x = exit.x;
  p.y = exit.y;
  p.vy = 0;
  run(g, 3);
  pressDown(g);
  assert.strictEqual(g.inRoom, null);
  assert.ok(Math.abs(p.x - d.x) < 80);
  assert.ok(g.enemies.includes(e));
  // Going back in doesn't count again.
  goTo(g, d.x);
  pressDown(g);
  assert.strictEqual(g.secrets, 1);
});

test('every golden glove: golden gloves for everyone, hitting harder', () => {
  const g = playing(['A', 'B']);
  g.golden = A.LEVELS.map((L, k) => k).slice(1);
  g.inRoom = { room: 0, camX: 0, x: 0, y: A.GROUND_Y };
  g.camX = g.L.rooms[0].x0;
  const gold = g.L.pickups.find((pk) => pk.type === 'golden');
  const p = g.players[0];
  p.x = gold.x;
  p.y = gold.y + 40;
  A.step(g);
  assert.strictEqual(g.golden.length, A.LEVELS.length);
  assert.ok(g.players.every((q) => q.gold));
  assert.ok(g.events.some((e) => e.type === 'goldenAll'));
  // And they keep them on the next level.
  A.loadLevel(g, 1);
  assert.ok(g.players.every((q) => q.gold));
});

test('stand about doing nothing for long enough and something happens', () => {
  const g = playing();
  let saw = false;
  run(g, A.IDLE_TICKS + 2, () => { if (g.events.some((e) => e.type === 'idle')) saw = true; });
  saw = saw || g.events.some((e) => e.type === 'idle');
  assert.ok(saw);
});

test('each room found is a secret of its own', () => {
  const g = playing(['A'], 1);
  const doors = g.L.doors.filter((q) => !q.exit);
  setRooms(g, [doors[0].way, doors[1].way]);
  for (const [k, d] of [[0, doors[0]], [1, doors[1]]]) {
    goTo(g, d.x);
    pressDown(g);
    assert.strictEqual(g.inRoom.room, k);
    const exit = g.L.doors.find((q) => q.exit && q.room === k);
    goTo(g, exit.x);
    pressDown(g);
  }
  assert.strictEqual(g.secrets, 2);
});

test("a door that isn't one of this game's ways in doesn't open", () => {
  const g = playing(['A'], 1);
  setRooms(g, g.L.pits.map((q) => q.way)); // the forest's rooms are down holes this time
  for (const d of g.L.doors.filter((q) => !q.exit)) {
    goTo(g, d.x);
    pressDown(g);
    assert.strictEqual(g.inRoom, null);
  }
});

test('down the right hole: into the secret room, no life lost', () => {
  const g = playing(['A'], 0);
  const pit = g.L.pits[0];
  setRooms(g, [pit.way]);
  const lives = g.lives;
  goTo(g, pit.x0 - 40);
  const p = g.players[0];
  p.x = (pit.x0 + pit.x1) / 2;
  p.y = A.GROUND_Y + 10;
  p.onGround = false;
  run(g, 40);
  assert.ok(g.inRoom, 'in the room');
  assert.strictEqual(g.lives, lives);
  assert.strictEqual(g.secrets, 1);
  // ...and the way out comes back up past the hole.
  const exit = g.L.doors.find((q) => q.exit && q.room === 0);
  goTo(g, exit.x);
  pressDown(g);
  assert.strictEqual(g.inRoom, null);
  assert.ok(g.players[0].x > pit.x1);
});

test('any other hole is still a hole', () => {
  const g = playing(['A'], 0);
  setRooms(g, [g.L.pits[0].way]);
  const lives = g.lives;
  goTo(g, 1360);
  const p = g.players[0];
  p.x = 1460; // the first gap, not the secret one
  p.y = A.GROUND_Y + 10;
  p.onGround = false;
  run(g, 120);
  assert.strictEqual(g.inRoom, null);
  assert.ok(g.lives < lives || p.fell || p.state === 'ko');
});
