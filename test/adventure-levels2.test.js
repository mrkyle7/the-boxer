'use strict';

// Levels 5 to 8: their new kinds of creature, and their bosses.

const test = require('node:test');
const assert = require('node:assert');
const A = require('../public/adventure.js');

function run(g, ticks, each) {
  for (let k = 0; k < ticks; k++) {
    if (each) each(k);
    A.step(g);
  }
}

/** A level with nothing spawning by itself: just what the test puts there. */
function playing(level, names = ['A']) {
  const g = A.createGame(names, { level });
  run(g, A.READY_TICKS + 1);
  g.nextSpawn = g.L.spawns.length;
  g.enemies = [];
  return g;
}

function stand(g, p, x) {
  g.camX = Math.max(0, x - 400);
  p.x = x;
  p.y = A.surfaceBelow(g.L, x, -100);
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
}

test('a sandworm tunnels under you (out of reach), then bursts up and can be hit', () => {
  const g = playing(4);
  const p = g.players[0];
  stand(g, p, 1000);
  const e = A.spawnEnemy(g, { type: 'sandworm', x: 1200 });
  let hiddenSeen = false;
  let up = false;
  run(g, 400, () => {
    p.invuln = 5;
    stand(g, p, 1000);
    if (e.hidden) {
      hiddenSeen = true;
      const hp = e.hp;
      A.hurtEnemy(g, e, 10, 1, 0, 0);
      assert.strictEqual(e.hp, hp, 'nothing touches it underground');
    }
    if (e.state === 'up') up = true;
  });
  assert.ok(hiddenSeen);
  assert.ok(up, 'it came up');
  assert.ok(Math.abs(e.x - 1000) < 60, 'under you');
});

test('a scorpion rears up, then dashes at you; landing on it hurts', () => {
  const g = playing(4);
  const p = g.players[0];
  stand(g, p, 1000);
  const e = A.spawnEnemy(g, { type: 'scorpion', x: 1250 });
  const states = new Set();
  let fastest = 0;
  run(g, 300, () => { p.invuln = 5; stand(g, p, 1000); states.add(e.state); fastest = Math.max(fastest, Math.abs(e.vx)); });
  assert.ok(states.has('rear') && states.has('dash'));
  assert.ok(fastest > 6);
  assert.ok(A.CREATURES.scorpion.spikes);
});

test('bombers fly over and drop things on you', () => {
  for (const [level, type, drop] of [[4, 'vulture', 'egg'], [6, 'cottoncloud', 'gumdrop'], [7, 'ufo', 'laser']]) {
    const g = playing(level);
    const p = g.players[0];
    stand(g, p, 600);
    A.spawnEnemy(g, { type, x: 900, y: 240 });
    let dropped = false;
    run(g, 400, () => { p.invuln = 5; stand(g, p, 600); if (g.projectiles.some((pr) => pr.type === drop)) dropped = true; });
    assert.ok(dropped, `${type} drops a ${drop}`);
  }
});

test('a fish leaps up out of the water in its hole, and drops back in', () => {
  const g = playing(5);
  const p = g.players[0];
  stand(g, p, 1150);
  const e = A.spawnEnemy(g, { type: 'fish', x: 1330, y: A.GROUND_Y });
  let top = Infinity;
  let back = false;
  run(g, 400, (k) => {
    p.invuln = 5;
    stand(g, p, 1150);
    top = Math.min(top, e.y);
    if (k > 150 && e.state === 'wait') back = true;
  });
  assert.ok(top < A.GROUND_Y - 150, `leapt high (${top})`);
  assert.ok(back);
  assert.ok(!e.dead, 'still alive down there');
});

test('a jellyfish bobs up and down where it is, and is spiky', () => {
  const g = playing(5);
  const p = g.players[0];
  stand(g, p, 400);
  const e = A.spawnEnemy(g, { type: 'jellyfish', x: 700, y: 260 });
  let lo = Infinity;
  let hi = -Infinity;
  run(g, 300, () => { lo = Math.min(lo, e.y); hi = Math.max(hi, e.y); });
  assert.ok(hi - lo > 50);
  assert.ok(Math.abs(e.x - 700) < 1);
  assert.ok(A.CREATURES.jellyfish.spikes);
});

test('monkeys and cupcakes lob things in an arc', () => {
  for (const [level, type, shot] of [[5, 'monkey', 'coconut'], [6, 'cupcake', 'sprinkle']]) {
    const g = playing(level);
    const p = g.players[0];
    stand(g, p, 500);
    A.spawnEnemy(g, { type, x: 800 });
    let arc = false;
    run(g, 400, () => {
      p.invuln = 5;
      stand(g, p, 500);
      if (g.projectiles.some((pr) => pr.type === shot && pr.gravity && pr.vy < 0)) arc = true;
    });
    assert.ok(arc, `${type} lobs`);
  }
});

test('a gummy bear takes big leaps at you', () => {
  const g = playing(6);
  const p = g.players[0];
  stand(g, p, 500);
  const e = A.spawnEnemy(g, { type: 'gummy', x: 900 });
  const x0 = e.x;
  run(g, 200, () => { p.invuln = 5; stand(g, p, 500); });
  assert.ok(e.x < x0 - 100, 'came at you');
});

test('an alien blinks out of reach and pops up beside you, then zaps', () => {
  const g = playing(7);
  const p = g.players[0];
  stand(g, p, 500);
  const e = A.spawnEnemy(g, { type: 'alien', x: 1000 });
  let hidden = false;
  let zapped = false;
  run(g, 300, () => {
    p.invuln = 5;
    stand(g, p, 500);
    if (e.hidden) hidden = true;
    if (g.projectiles.some((pr) => pr.type === 'zap')) zapped = true;
  });
  assert.ok(hidden);
  assert.ok(Math.abs(e.x - 500) < 250, 'beside you');
  assert.ok(zapped);
});

test('on the moon you jump much higher', () => {
  const height = (level) => {
    const g = playing(level);
    const p = g.players[0];
    stand(g, p, 200);
    const y0 = p.y;
    let top = y0;
    A.pressAction(g, 0, 'jump');
    run(g, 120, () => { A.setHeld(g, 0, { jump: true }); top = Math.min(top, p.y); });
    return y0 - top;
  };
  assert.ok(height(7) > height(0) * 1.4);
});

test('each new boss comes in and fights through its moves without trouble', () => {
  for (let level = 4; level < 8; level++) {
    const g = A.createGame(['A', 'B'], { level });
    run(g, A.READY_TICKS + 1);
    g.players.forEach((p) => { p.x = g.L.arenaX + 500; });
    g.camX = g.L.arenaX - 1;
    run(g, 2);
    run(g, A.BOSS_INTRO_TICKS);
    const b = g.boss;
    assert.strictEqual(b.type, g.L.boss);
    const states = new Set();
    run(g, 2500, () => { g.players.forEach((p) => { p.invuln = 5; p.hp = 100; }); states.add(b.state); });
    const pattern = A.BOSSES[b.type].pattern.filter((m) => !A.BOSSES[b.type].angryOnly.includes(m));
    for (const m of pattern) assert.ok(states.has(m === 'charge' ? 'windup' : m), `${b.type} did ${m}`);
    A.hurtEnemy(g, b, 9999, 1, 0, 0);
    assert.ok(b.dead);
  }
});

test('levels 5 to 8 can be played through for a while with no trouble', () => {
  for (let level = 4; level < 8; level++) {
    const g = A.createGame(['A', 'B'], { level, seed: level });
    run(g, 60 * 60, (k) => {
      g.players.forEach((p, i) => {
        p.invuln = 5;
        A.setHeld(g, i, { right: true, jump: k % 50 < 20 });
        if (k % 60 === 0) A.pressAction(g, i, 'punch');
      });
    });
    assert.ok(g.players[0].x > 1000, `${g.L.name}: got along`);
    JSON.stringify(A.snapshot(g));
  }
});

test('a save point is the start of the level you are on: carrying on plays it again', () => {
  const g = A.createGame(['A'], { level: 1 });
  run(g, A.READY_TICKS + 1);
  g.score = 1500; // earned before this level...
  g.golden = [0];
  A.loadLevel(g, 2); // ...and now on to level 3
  g.score = 2600; // halfway through it
  g.lives = 1;
  g.secrets = 4;
  const save = A.progress(g);
  assert.deepStrictEqual(save, { level: 2, score: 1500, lives: A.LIVES_EACH, golden: [0], secrets: 0, from: 1 });
  // Carrying on, alone or with a friend.
  const back = A.createGame(['A'], { resume: save });
  assert.strictEqual(back.level, 2);
  assert.strictEqual(back.score, 1500);
  assert.strictEqual(back.lives, A.LIVES_EACH, 'the lives it had when the level began');
  assert.deepStrictEqual(back.golden, [0]);
  assert.strictEqual(back.from, 1, 'remembers where the adventure began');
  const two = A.createGame(['A', 'B'], { resume: save });
  assert.strictEqual(two.lives, A.LIVES_EACH * 2, 'a friend brings their own lives');
});

test('a save can carry every golden glove (gold for everyone) and never sets impossible values', () => {
  const all = A.LEVELS.map((L, k) => k);
  const g = A.createGame(['A'], { resume: { level: 99, score: -5, lives: 0, golden: [...all, 42, 'x'], secrets: 3, from: 2 } });
  assert.strictEqual(g.level, A.LEVELS.length - 1);
  assert.strictEqual(g.score, 0);
  assert.strictEqual(g.lives, 1);
  assert.deepStrictEqual(g.golden, all);
  assert.ok(g.players[0].gold);
});
