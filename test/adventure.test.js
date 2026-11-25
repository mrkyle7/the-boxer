'use strict';

// Adventure mode: the platformer (public/adventure.js) and its rooms.

const test = require('node:test');
const assert = require('node:assert');
const A = require('../public/adventure.js');

function run(g, ticks, each) {
  for (let k = 0; k < ticks; k++) {
    if (each) each(k);
    A.step(g);
  }
}

/** A game past "Ready?", with no creatures coming unless a test adds them. */
function playing(names = ['Kyle']) {
  const g = A.createGame(names);
  run(g, A.READY_TICKS + 1);
  assert.strictEqual(g.phase, 'run');
  g.nextSpawn = A.LEVELS[0].spawns.length;
  g.enemies = [];
  return g;
}

test('a team of one to four, three lives each, standing on the ground', () => {
  const g = A.createGame(['A', 'B', 'C']);
  assert.strictEqual(g.mode, 'adventure');
  assert.strictEqual(g.lives, 9);
  run(g, 5);
  for (const p of g.players) {
    assert.strictEqual(p.y, A.GROUND_Y);
    assert.strictEqual(p.hp, A.MAX_HP);
  }
});

test('nobody moves until "Go!"', () => {
  const g = A.createGame(['A']);
  run(g, 30, () => A.setHeld(g, 0, { right: true }));
  assert.strictEqual(g.players[0].x, 120);
});

test('walking right scrolls the camera forward, never back', () => {
  const g = playing();
  run(g, 120, () => A.setHeld(g, 0, { right: true }));
  const cam = g.camX;
  assert.ok(cam > 0, 'the camera followed');
  run(g, 120, () => A.setHeld(g, 0, { left: true }));
  assert.strictEqual(g.camX, cam);
  assert.ok(g.players[0].x >= g.camX + A.PLAYER_HW, 'kept on screen');
});

test('the camera never leaves a teammate behind', () => {
  const g = playing(['A', 'B']);
  run(g, 400, () => { A.setHeld(g, 0, { right: true }); A.setHeld(g, 1, {}); });
  const [a, b] = g.players;
  assert.ok(b.x >= g.camX, 'B is still on screen');
  assert.ok(a.x <= g.camX + A.VIEW_W, 'A is held at the right edge');
});

test('jump: up and back down onto the ground; letting go early is a smaller hop', () => {
  const high = playing();
  A.pressAction(high, 0, 'jump');
  let top = A.GROUND_Y;
  run(high, 60, () => { A.setHeld(high, 0, { jump: true }); top = Math.min(top, high.players[0].y); });
  assert.ok(A.GROUND_Y - top > 130, `jumped ${A.GROUND_Y - top}`);
  assert.strictEqual(high.players[0].y, A.GROUND_Y);

  const low = playing();
  A.pressAction(low, 0, 'jump');
  let lowTop = A.GROUND_Y;
  run(low, 60, () => { A.setHeld(low, 0, {}); lowTop = Math.min(lowTop, low.players[0].y); });
  assert.ok(lowTop > top + 40, 'a tap is a hop');
});

test('a punch hurts a creature in front of you, not one behind', () => {
  const g = playing();
  const p = g.players[0];
  const front = A.spawnEnemy(g, { type: 'frog', x: p.x + 50 });
  const back = A.spawnEnemy(g, { type: 'frog', x: p.x - 60 });
  A.pressAction(g, 0, 'punch');
  run(g, 12);
  assert.strictEqual(front.hp, A.CREATURES.frog.hp - A.MOVES.punch.damage);
  assert.strictEqual(back.hp, A.CREATURES.frog.hp);
});

test('a punch only lands once', () => {
  const g = playing();
  const e = A.spawnEnemy(g, { type: 'hedgehog', x: g.players[0].x + 50 });
  A.pressAction(g, 0, 'punch');
  run(g, 20);
  assert.strictEqual(e.hp, A.CREATURES.hedgehog.hp - A.MOVES.punch.damage);
});

test('knocking a creature out scores, and every sixth drops a heart', () => {
  const g = playing();
  for (let k = 0; k < A.DROP_EVERY; k++) {
    const e = A.spawnEnemy(g, { type: 'bee', x: g.players[0].x + 300, y: 300 });
    A.hurtEnemy(g, e, 99, 1, 0, 0);
    assert.ok(e.dead);
  }
  assert.strictEqual(g.score, A.CREATURES.bee.score * A.DROP_EVERY);
  assert.strictEqual(g.players[0].stats.kos, A.DROP_EVERY);
  assert.strictEqual(g.extra.length, 1);
  assert.strictEqual(g.extra[0].type, 'heart');
});

test('jumping on a slime squashes it and bounces you up', () => {
  const g = playing();
  const p = g.players[0];
  const e = A.spawnEnemy(g, { type: 'slime', x: p.x });
  e.t = -1000; // no hopping away
  p.y = A.GROUND_Y - 33; // just above its head
  p.vy = 6;
  p.onGround = false;
  A.step(g);
  assert.strictEqual(e.hp, A.CREATURES.slime.hp - A.STOMP_DAMAGE);
  assert.ok(p.vy < 0, 'bounced');
  assert.strictEqual(p.hp, A.MAX_HP);
});

test('a curled-up hedgehog is spiky: punches bounce off and landing on it hurts', () => {
  const g = playing();
  const p = g.players[0];
  const e = A.spawnEnemy(g, { type: 'hedgehog', x: p.x + 50 });
  e.state = 'curl';
  e.spiky = true;
  e.shelled = true;
  e.t = -1000;
  A.hurtEnemy(g, e, 10, 1, 0, 0);
  assert.strictEqual(e.hp, A.CREATURES.hedgehog.hp);
  e.x = p.x;
  p.y = A.GROUND_Y - 33; // just above its head
  p.vy = 6;
  p.onGround = false;
  A.step(g);
  assert.ok(p.hp < A.MAX_HP);
});

test('bumping into a creature hurts, a guard facing it takes most of it', () => {
  const g = playing();
  const p = g.players[0];
  assert.ok(A.hurtPlayer(g, p, 0, 10, -1));
  assert.strictEqual(p.hp, 90);
  assert.strictEqual(p.state, 'hitstun');
  // Can't be hit again straight away.
  assert.ok(!A.hurtPlayer(g, p, 0, 10, -1));

  const h = playing();
  const q = h.players[0];
  A.setHeld(h, 0, { block: true });
  A.step(h);
  assert.strictEqual(q.state, 'block');
  A.hurtPlayer(h, q, 0, 10, -1); // from in front (facing right, pushed left)
  assert.strictEqual(q.hp, A.MAX_HP - Math.ceil(10 * A.BLOCK_SHARE));
});

test('falling down a pit costs a life, and you drop back in', () => {
  const g = playing();
  const p = g.players[0];
  p.x = 1460; // over the first pit
  g.camX = 1000;
  p.y = 520;
  p.onGround = false;
  run(g, 30);
  assert.strictEqual(p.state, 'ko');
  assert.ok(p.fell);
  run(g, A.KO_TICKS + 120);
  assert.strictEqual(g.lives, A.LIVES_EACH - 1);
  assert.strictEqual(p.hp, A.MAX_HP);
  assert.ok(p.onGround, 'landed on solid ground');
  assert.ok(A.surfaceBelow(g.L, p.x, p.y - 1) === p.y);
});

test('out of lives: game over when the whole team is out', () => {
  const g = playing(['A', 'B']);
  g.lives = 0;
  A.hurtPlayer(g, g.players[0], 0, 999, 1);
  run(g, A.KO_TICKS + 1);
  assert.ok(g.players[0].out);
  assert.strictEqual(g.phase, 'run', 'B fights on');
  A.hurtPlayer(g, g.players[1], 1, 999, 1);
  run(g, A.KO_TICKS + 1);
  assert.strictEqual(g.phase, 'lost');
  run(g, A.END_TICKS + 1);
  assert.ok(g.over);
  assert.ok(!g.won);
});

test('coins score, hearts heal, and a 1UP brings back someone who was out', () => {
  const g = playing(['A', 'B']);
  const [a, b] = g.players;
  const coin = A.LEVELS[0].pickups.find((pk) => pk.type === 'coin' && pk.y > 400);
  a.x = coin.x;
  A.step(g);
  assert.strictEqual(g.score, A.COIN_SCORE);
  assert.strictEqual(a.stats.coins, 1);

  a.hp = 20;
  g.extra.push({ id: 'h', type: 'heart', x: a.x, y: a.y - 40 });
  A.step(g);
  assert.strictEqual(a.hp, 20 + A.HEART_HEAL);

  b.out = true;
  const life = A.LEVELS[0].pickups.find((pk) => pk.type === 'life');
  g.camX = life.x - 500;
  a.x = life.x;
  a.y = life.y + 40;
  const lives = g.lives;
  A.step(g);
  A.step(g);
  assert.ok(!b.out, 'B is back');
  assert.strictEqual(g.lives, lives);
});

test('reaching the arena brings on the boss, tougher with more players', () => {
  const solo = playing();
  solo.players[0].x = A.LEVELS[0].arenaX + 500;
  solo.camX = A.LEVELS[0].arenaX - 1;
  run(solo, 2);
  assert.strictEqual(solo.phase, 'bossIntro');
  assert.strictEqual(solo.boss.type, 'rhino');
  assert.strictEqual(solo.boss.maxHp, A.CREATURES.rhino.hp);
  run(solo, A.BOSS_INTRO_TICKS);
  assert.strictEqual(solo.phase, 'boss');
  assert.strictEqual(solo.boss.y, A.GROUND_Y, 'landed');

  const team = playing(['A', 'B', 'C']);
  team.players.forEach((p) => { p.x = A.LEVELS[0].arenaX + 500; });
  team.camX = A.LEVELS[0].arenaX - 1;
  run(team, 2);
  assert.ok(team.boss.maxHp > solo.boss.maxHp);
});

test('the rhino charges into the ropes and is left dizzy, taking extra damage', () => {
  const g = playing();
  const p = g.players[0];
  p.x = A.LEVELS[0].arenaX + 500;
  g.camX = A.LEVELS[0].arenaX - 1;
  run(g, 2);
  p.x = A.LEVELS[0].arenaX + 100;
  run(g, A.BOSS_INTRO_TICKS + 1, () => { p.invuln = 5; });
  const boss = g.boss;
  let dizzy = false;
  run(g, 600, () => { p.invuln = 5; if (boss.state === 'dizzy') dizzy = true; });
  assert.ok(dizzy, 'went dizzy');
  boss.state = 'dizzy';
  const hp = boss.hp;
  A.hurtEnemy(g, boss, 10, 1, 0, 0);
  assert.strictEqual(hp - boss.hp, 15);
});

test('beating a boss clears the level: on to the next, everyone back in with full health', () => {
  const g = playing(['A', 'B']);
  g.players.forEach((p) => { p.x = A.LEVELS[0].arenaX + 500; });
  g.camX = A.LEVELS[0].arenaX - 1;
  run(g, A.BOSS_INTRO_TICKS + 5);
  g.players[0].hp = 30;
  g.players[1].out = true;
  const score = g.score;
  A.hurtEnemy(g, g.boss, 9999, 1, 0, 0);
  assert.strictEqual(g.phase, 'cleared');
  assert.ok(g.score > score);
  run(g, A.CLEARED_TICKS + 1);
  assert.strictEqual(g.level, 1);
  assert.strictEqual(g.L.name, 'Spooky Forest');
  assert.strictEqual(g.phase, 'ready');
  assert.strictEqual(g.camX, 0);
  assert.strictEqual(g.boss, null);
  for (const p of g.players) {
    assert.strictEqual(p.hp, A.MAX_HP);
    assert.ok(!p.out);
  }
});

test('beating the last boss wins the game', () => {
  const g = A.createGame(['A'], { level: A.LEVELS.length - 1 });
  run(g, A.READY_TICKS + 1);
  g.players[0].x = g.L.arenaX + 500;
  g.camX = g.L.arenaX - 1;
  run(g, A.BOSS_INTRO_TICKS + 5);
  assert.strictEqual(g.boss.type, 'robo');
  A.hurtEnemy(g, g.boss, 9999, 1, 0, 0);
  assert.strictEqual(g.phase, 'won');
  run(g, A.END_TICKS + 1);
  assert.ok(g.over);
  assert.ok(g.won);
});

test('a player leaving is out, and the snapshot carries what the client draws', () => {
  const g = playing(['A', 'B']);
  A.removePlayer(g, 1);
  assert.ok(g.players[1].out && g.players[1].left);
  const s = A.snapshot(g);
  assert.strictEqual(s.mode, 'adventure');
  assert.strictEqual(s.players.length, 2);
  assert.ok(Array.isArray(s.pickups) && s.pickups.length > 0);
  assert.strictEqual(s.boss, null);
  JSON.stringify(s);
});

// ---- Rooms ---------------------------------------------------------------------

const WebSocket = require('ws');
const { createServer } = require('../server.js');

const fakeAuth = {
  player: async () => null,
  loginUrl: () => 'https://cheetahmoongames.com/login',
  guestSeen() {},
};

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d);
    const i = waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  return {
    ws,
    open: () => new Promise((r) => ws.once('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    next(pred, ms = 4000) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        waiters.push({ pred, resolve });
        setTimeout(() => reject(new Error('timed out waiting for message')), ms).unref();
      });
    },
  };
}

async function withServer(fn) {
  const server = createServer({ auth: fakeAuth });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const clients = [];
  try {
    await fn(async () => { const c = client(port); clients.push(c); await c.open(); return c; });
  } finally {
    clients.forEach((c) => c.ws.terminate());
    await new Promise((r) => server.close(r));
  }
}

test('a solo adventure starts straight away, and walking right moves you', async () => {
  await withServer(async (connect) => {
    const a = await connect();
    a.send({ t: 'hello', name: 'Solo' });
    a.send({ t: 'adventure', solo: true });
    const start = await a.next((m) => m.t === 'start');
    assert.strictEqual(start.mode, 'adventure');
    assert.deepStrictEqual(start.names, ['Solo']);
    a.send({ t: 'input', right: true });
    let s;
    do { s = (await a.next((m) => m.t === 'state')).s; } while (s.phase !== 'run' || s.players[0].x < 200);
    assert.strictEqual(s.mode, 'adventure');
    // Cheat codes work here too.
    for (const k of 'daddy') a.send({ t: 'type', k });
    do { s = (await a.next((m) => m.t === 'state')).s; } while (!s.players[0].shoes);
  });
});

test('friends join an adventure room and the host starts it, no opponent needed', async () => {
  await withServer(async (connect) => {
    const host = await connect();
    host.send({ t: 'hello', name: 'Host' });
    host.send({ t: 'adventure', level: 2 });
    const room = await host.next((m) => m.t === 'room');
    assert.strictEqual(room.kind, 'adventure');
    assert.strictEqual(room.level, 2, 'starting on the Frosty Peaks');
    // No bots in an adventure.
    host.send({ t: 'addBot', level: 'easy' });
    const friend = await connect();
    friend.send({ t: 'hello', name: 'Pal' });
    friend.send({ t: 'join', code: room.code });
    const both = await host.next((m) => m.t === 'room' && m.players.length === 2);
    assert.deepStrictEqual(both.players, ['Host', 'Pal']);
    assert.deepStrictEqual(both.bots, [null, null]);
    host.send({ t: 'start' });
    const s1 = await host.next((m) => m.t === 'start');
    const s2 = await friend.next((m) => m.t === 'start');
    assert.strictEqual(s1.mode, 'adventure');
    assert.deepStrictEqual([s1.you, s2.you], [0, 1]);
    const st = (await friend.next((m) => m.t === 'state')).s;
    assert.strictEqual(st.players.length, 2);
    assert.strictEqual(st.lives, 2 * A.LIVES_EACH);
    assert.strictEqual(st.level, 2);

    // One leaves: the other plays on.
    friend.send({ t: 'leave' });
    const left = await host.next((m) => m.t === 'playerLeft');
    assert.strictEqual(left.name, 'Pal');
    const after = (await host.next((m) => m.t === 'state' && m.s.players[1].left)).s;
    assert.ok(after.players[1].out);
  });
});

test('a solo host can start an adventure room on their own', async () => {
  await withServer(async (connect) => {
    const host = await connect();
    host.send({ t: 'adventure' });
    await host.next((m) => m.t === 'room');
    host.send({ t: 'start' });
    const start = await host.next((m) => m.t === 'start');
    assert.strictEqual(start.mode, 'adventure');
  });
});
