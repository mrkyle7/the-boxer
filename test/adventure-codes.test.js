'use strict';

// Adventure mode: the cheat codes, turned on the creatures, and the four levels.

const test = require('node:test');
const assert = require('node:assert');
const A = require('../public/adventure.js');
const G = require('../public/game.js');

function run(g, ticks, each) {
  for (let k = 0; k < ticks; k++) {
    if (each) each(k);
    A.step(g);
  }
}

/** A game past "Ready?", no creatures unless the test adds them. */
function playing(names = ['Kyle'], opts = {}) {
  const g = A.createGame(names, opts);
  run(g, A.READY_TICKS + 1);
  g.nextSpawn = g.L.spawns.length;
  g.enemies = [];
  return g;
}

function type(g, i, word) {
  for (const k of word) A.typeKey(g, i, k);
}

/** A creature that stays put (no hopping, rolling or spitting). */
function sitter(g, type, dx, y) {
  const p = g.players[0];
  const e = A.spawnEnemy(g, { type, x: p.x + dx, y });
  e.t = -100000;
  e.cool = 99;
  return e;
}

test('every code from the ring works in the adventure', () => {
  assert.deepStrictEqual(Object.keys(A.CODES).sort(), Object.keys(G.CODES).sort());
});

test('typing a code sets it off; letters show partway; a hit wipes them', () => {
  const g = playing();
  const p = g.players[0];
  type(g, 0, 'jem');
  assert.strictEqual(p.typing, 'jem');
  type(g, 0, 'ini');
  assert.strictEqual(p.typing, '');
  assert.ok(p.giant > 0, 'a giant');
  assert.strictEqual(p.stats.codes, 1);
  run(g, 1);
  type(g, 0, 'dad');
  A.hurtPlayer(g, p, 0, 5, 1);
  type(g, 0, 'dy');
  assert.strictEqual(p.shoes, 0, 'the hit wiped "dad"');
});

test('no typing before "Go!"', () => {
  const g = A.createGame(['A']);
  type(g, 0, 'daddy');
  assert.strictEqual(g.players[0].shoes, 0);
});

test('zeffen: a flip forward that lands twice', () => {
  const g = playing();
  const e = sitter(g, 'snowman', 230);
  type(g, 0, 'zeffen');
  assert.strictEqual(g.players[0].move, 'flip');
  e.maxHp = e.hp = 100;
  run(g, 60);
  assert.strictEqual(e.hp, 50, 'two hits of 25');
});

test('kalya: over the top of it, and a kick in the back', () => {
  const g = playing();
  const p = g.players[0];
  const e = sitter(g, 'snowman', 150);
  e.maxHp = e.hp = 100;
  type(g, 0, 'kalya');
  run(g, 60);
  assert.ok(p.x > e.x, 'landed behind it');
  assert.strictEqual(e.hp, 70);
});

test('luna: teleports right next to the nearest creature and kicks it', () => {
  const g = playing();
  const p = g.players[0];
  const e = sitter(g, 'frog', 600);
  type(g, 0, 'luna');
  assert.ok(Math.abs(p.x - e.x) < 100, 'beside it');
  run(g, 20);
  assert.strictEqual(e.hp, A.CREATURES.frog.hp - A.MOVES.kick.damage);
});

test('louise reels a creature in; tamzin cartwheels at it', () => {
  const g = playing();
  const e = sitter(g, 'snowman', 300);
  const from = e.x;
  type(g, 0, 'louise');
  run(g, 50);
  assert.ok(e.x < from - 100, 'pulled in');
  assert.ok(e.hp <= A.CREATURES.snowman.hp - 30 || e.dead);

  const h = playing();
  const f = sitter(h, 'snowman', 250);
  f.maxHp = f.hp = 100;
  type(h, 0, 'tamzin');
  run(h, 50);
  assert.strictEqual(f.hp, 70);
});

test('grandpa: super fast, or a charge at the nearest creature', () => {
  let sawTurbo = false;
  let sawCharge = false;
  for (let seed = 1; seed < 20 && !(sawTurbo && sawCharge); seed++) {
    const g = playing(['A'], { seed });
    sitter(g, 'snowman', 400);
    type(g, 0, 'grandpa');
    if (g.players[0].turbo > 0) sawTurbo = true;
    if (g.players[0].dash > 0) sawCharge = true;
  }
  assert.ok(sawTurbo && sawCharge);
});

test('lizzie: a rugby charge and a shoulder smash', () => {
  const g = playing();
  const e = sitter(g, 'snowman', 400);
  e.maxHp = e.hp = 100;
  type(g, 0, 'lizzie');
  run(g, 60);
  assert.strictEqual(e.hp, 100 - A.RUGBY_DAMAGE);
});

test('fart: a green cloud that poisons what it drifts through', () => {
  const g = playing();
  const e = sitter(g, 'snowman', 300);
  e.maxHp = e.hp = 100;
  type(g, 0, 'fart');
  run(g, 200);
  assert.ok(e.poison, 'poisoned');
  const hp = e.hp;
  run(g, A.POISON_EVERY);
  assert.strictEqual(e.hp, hp - A.POISON_DAMAGE);
});

test('water: a flood. Creatures float about helpless; boat and swim only work in it', () => {
  const g = playing();
  const p = g.players[0];
  type(g, 0, 'boat');
  assert.ok(!p.boat, 'no boat without water');
  const e = sitter(g, 'slime', 300);
  type(g, 0, 'water');
  assert.ok(g.flood > 0);
  type(g, 0, 'boat');
  assert.ok(p.boat);
  run(g, 120);
  assert.ok(e.hp < A.CREATURES.slime.hp, 'it takes on water');
  // Touching it does nothing while it bobs about.
  e.x = p.x;
  e.y = p.y;
  run(g, 2);
  assert.strictEqual(p.hp, A.MAX_HP);
  run(g, A.FLOOD_TICKS);
  assert.strictEqual(g.flood, 0);
  assert.ok(!p.boat);
});

test('in a flood, the holes fill up: you swim instead of falling', () => {
  const g = playing();
  const p = g.players[0];
  type(g, 0, 'water');
  p.x = 1460;
  g.camX = 1000;
  p.y = 500;
  p.onGround = false;
  run(g, 60);
  assert.notStrictEqual(p.state, 'ko');
  assert.ok(p.y < 560);
});

test('kyle: invisible, and the creatures walk right through you', () => {
  const g = playing();
  const p = g.players[0];
  type(g, 0, 'kyle');
  const e = sitter(g, 'slime', 0);
  run(g, 10);
  assert.strictEqual(p.hp, A.MAX_HP);
  assert.ok(e);
});

test('shree: the giant fist comes down on the nearest creatures', () => {
  const g = playing();
  const a = sitter(g, 'snowman', 300);
  const b = sitter(g, 'snowman', 600);
  a.maxHp = a.hp = 100;
  b.maxHp = b.hp = 100;
  type(g, 0, 'shree');
  run(g, A.FIST_WARN + 60);
  assert.strictEqual(a.hp, 100 - A.FIST_DAMAGE);
  assert.strictEqual(b.hp, 100 - A.FIST_DAMAGE);
});

test('shaan shrinks it, priya freezes it, bear sticks it in honey', () => {
  for (const [code, check] of [['shaan', (e) => e.shrunk > 0], ['priya', (e) => e.frozen > 0], ['bear', (e) => e.sticky > 0]]) {
    const g = playing();
    const e = sitter(g, 'snowman', 200);
    type(g, 0, code);
    run(g, 40);
    assert.ok(check(e), code);
  }
});

test('a frozen creature can’t hurt you; a shrunk one only half as much', () => {
  const g = playing();
  const p = g.players[0];
  const e = sitter(g, 'slime', 0);
  e.frozen = 100;
  run(g, 3);
  assert.strictEqual(p.hp, A.MAX_HP);
  e.frozen = 0;
  e.shrunk = 100;
  run(g, 2);
  assert.strictEqual(p.hp, A.MAX_HP - Math.ceil(A.CREATURES.slime.damage / 2));
});

test('parimal: a car that drives through the creatures', () => {
  const g = playing();
  const p = g.players[0];
  const e = sitter(g, 'snowman', 300);
  e.maxHp = e.hp = 100;
  type(g, 0, 'parimal');
  run(g, 60);
  assert.strictEqual(e.hp, 100 - A.CAR_DAMAGE);
  assert.strictEqual(p.hp, A.MAX_HP, 'nothing hurts you in the car');
});

test('daniel: spikes. Bump into something and it gets most of it back', () => {
  const g = playing();
  const p = g.players[0];
  type(g, 0, 'daniel');
  const e = sitter(g, 'snowman', 0);
  e.maxHp = e.hp = 100;
  run(g, 2);
  const dmg = A.CREATURES.snowman.damage;
  assert.strictEqual(p.hp, A.MAX_HP - Math.ceil(dmg * 0.3));
  assert.strictEqual(e.hp, 100 - Math.ceil(dmg * 0.7));
});

test('edward: time stops for the creatures, not for you', () => {
  const g = playing();
  const p = g.players[0];
  const e = A.spawnEnemy(g, { type: 'bee', x: p.x + 300, y: 300 });
  type(g, 0, 'edward');
  const at = { x: e.x, y: e.y };
  A.setHeld(g, 0, { right: true });
  run(g, 60);
  assert.deepStrictEqual({ x: e.x, y: e.y }, at);
  assert.ok(p.x > 200, 'I can still move');
});

test('spreadbury / mamtora: snacks float down; catch one for health', () => {
  const g = playing();
  const p = g.players[0];
  type(g, 0, 'spreadbury');
  assert.strictEqual(g.theme, 'usa');
  assert.strictEqual(g.snacks.length, 2);
  p.hp = 20;
  const sn = g.snacks[0];
  sn.t = 1;
  sn.x = p.x;
  sn.y = p.y - 80;
  run(g, 2);
  assert.strictEqual(p.hp, 20 + A.SNACK_HEAL);
  const h = playing();
  type(h, 0, 'mamtora');
  assert.strictEqual(h.theme, 'india');
  assert.strictEqual(h.snacks[0].kind, 'dosa');
});

test('jay heals by what he deals; ludo and leo hit harder, and no kicks', () => {
  const g = playing();
  const p = g.players[0];
  type(g, 0, 'jay');
  p.hp = 50;
  const e = sitter(g, 'snowman', 50);
  e.maxHp = e.hp = 100;
  A.pressAction(g, 0, 'punch');
  run(g, 12);
  assert.strictEqual(e.hp, 95);
  assert.strictEqual(p.hp, 55);

  for (const code of ['ludo', 'leo']) {
    const h = playing();
    type(h, 0, code);
    const f = sitter(h, 'snowman', 50);
    f.maxHp = f.hp = 100;
    A.pressAction(h, 0, 'kick');
    run(h, 3);
    assert.strictEqual(h.players[0].state, 'idle', `${code}: no kicks`);
    A.pressAction(h, 0, 'punch');
    run(h, 12);
    assert.strictEqual(f.hp, 85, code);
  }
});

test('tony: a chess piece. The king takes no damage', () => {
  const g = playing();
  const p = g.players[0];
  type(g, 0, 'tony');
  assert.ok(A.PIECES.includes(p.piece));
  p.piece = 'king';
  assert.ok(!A.hurtPlayer(g, p, 0, 50, 1));
  assert.strictEqual(p.hp, A.MAX_HP);
});

test('daddy: fast shoes', () => {
  const slow = playing();
  const fast = playing();
  type(fast, 0, 'daddy');
  run(slow, 30, () => A.setHeld(slow, 0, { right: true }));
  run(fast, 30, () => A.setHeld(fast, 0, { right: true }));
  assert.ok(fast.players[0].x - 120 > (slow.players[0].x - 120) * 1.5);
});

test('mummy: a cuddle for anything that comes close, and she steals its health', () => {
  const g = playing();
  const p = g.players[0];
  p.hp = 50;
  type(g, 0, 'mummy');
  const e = sitter(g, 'snowman', 80);
  e.maxHp = e.hp = 100;
  run(g, 2);
  assert.ok(e.cuddled > 0);
  run(g, 70);
  assert.strictEqual(e.hp, 100 - A.CUDDLE_STEAL);
  assert.strictEqual(p.hp, 50 + A.CUDDLE_STEAL);
});

test('simon: a moustache for the level', () => {
  const g = playing();
  type(g, 0, 'simon');
  assert.ok(g.players[0].moustache);
});

test('blake: a dragon. Punch breathes fire, reaching further and setting it alight', () => {
  const g = playing();
  type(g, 0, 'blake');
  const e = sitter(g, 'snowman', 200);
  e.maxHp = e.hp = 100;
  A.pressAction(g, 0, 'punch');
  run(g, 25);
  assert.strictEqual(g.players[0].move === 'fire' || e.burning > 0, true);
  assert.ok(e.burning > 0);
  const hp = e.hp;
  run(g, 61);
  assert.ok(e.hp < hp, 'burning');
});

test('briony: pies in the face, and they blunder about harmlessly', () => {
  const g = playing();
  const e = sitter(g, 'snowman', 300);
  e.maxHp = e.hp = 100;
  type(g, 0, 'briony');
  run(g, A.JUGGLE_TICKS + 100);
  assert.ok(e.hp <= 100 - A.PIE_DAMAGE);
  assert.ok(e.confused > 0);
});

test('paul: a lullaby, and every creature on screen falls asleep till it’s hit', () => {
  const g = playing();
  const p = g.players[0];
  const e = sitter(g, 'slime', 300);
  type(g, 0, 'paul');
  run(g, A.PIANO_TICKS + 2);
  assert.ok(e.asleep > 0);
  e.x = p.x;
  run(g, 2);
  assert.strictEqual(p.hp, A.MAX_HP, 'asleep: harmless');
  A.hurtEnemy(g, e, 1, 1, 0, 0);
  assert.strictEqual(e.asleep, 0, 'woken up');
});

test('supercalifragilisticexpialidocious: invincible for the rest of this level and the next, once', () => {
  const g = playing();
  const p = g.players[0];
  type(g, 0, 'supercalifragilisticexpialidocious');
  assert.strictEqual(p.invincible, 2);
  assert.ok(!A.hurtPlayer(g, p, 0, 50, 1));
  // Falling down a hole just pops you back up.
  p.y = 800;
  run(g, 1);
  assert.notStrictEqual(p.state, 'ko');
  p.invincible = 0;
  type(g, 0, 'supercalifragilisticexpialidocious');
  assert.strictEqual(p.invincible, 0, 'once a game');
});

test('harrison: a different code every time', () => {
  const seen = new Set();
  for (let seed = 1; seed < 30; seed++) {
    const g = playing(['A'], { seed });
    sitter(g, 'snowman', 300);
    type(g, 0, 'harrison');
    seen.add(g.events.find((e) => e.type === 'harrison').code);
  }
  assert.ok(seen.size > 5);
});

// ---- The levels ------------------------------------------------------------------

test('four levels, each with its own creatures and boss', () => {
  assert.strictEqual(A.LEVELS.length, 4);
  assert.deepStrictEqual(A.LEVELS.map((L) => L.boss), ['rhino', 'owl', 'yeti', 'gorilla']);
  for (const L of A.LEVELS) {
    assert.ok(L.spawns.length > 15, L.name);
    for (const s of L.spawns) assert.ok(A.CREATURES[s.type], `${L.name}: ${s.type}`);
    assert.ok(L.pickups.some((p) => p.type === 'life'), `${L.name} has a 1UP`);
    assert.strictEqual(A.surfaceBelow(L, L.arenaX + 10, 0), A.GROUND_Y, 'a flat arena');
    assert.strictEqual(A.surfaceBelow(L, L.end - 10, 0), A.GROUND_Y);
    assert.strictEqual(A.surfaceBelow(L, 120, 0), A.GROUND_Y, 'somewhere to start');
  }
});

test('you can start on any level', () => {
  for (let level = 0; level < 4; level++) {
    const g = A.createGame(['A'], { level });
    assert.strictEqual(g.level, level);
    assert.strictEqual(A.snapshot(g).level, level);
  }
});

function bossFight(level) {
  const g = A.createGame(['A'], { level });
  run(g, A.READY_TICKS + 1);
  const p = g.players[0];
  p.x = g.L.arenaX + 500;
  g.camX = g.L.arenaX - 1;
  run(g, 2);
  run(g, A.BOSS_INTRO_TICKS);
  return g;
}

test('Count Hoot flies out of reach, then swoops; miss and he’s stuck, dazed, on the ground', () => {
  const g = bossFight(1);
  const p = g.players[0];
  const owl = g.boss;
  assert.ok(owl.y < A.GROUND_Y - 200, 'up in the air');
  let dizzy = false;
  run(g, 900, () => { p.invuln = 5; if (owl.state === 'dizzy' && owl.y >= A.GROUND_Y - 1) dizzy = true; });
  assert.ok(dizzy);
});

test('Frostbite bowls snowballs; the Silverback leaps and makes rocks fall', () => {
  const y = bossFight(2);
  let snowroll = false;
  run(y, 1500, () => { y.players[0].invuln = 5; if (y.projectiles.some((pr) => pr.type === 'snowroll')) snowroll = true; });
  assert.ok(snowroll);

  const g = bossFight(3);
  let leapt = false;
  let rocks = false;
  run(g, 1800, () => {
    g.players[0].invuln = 5;
    if (g.boss.state === 'leap') leapt = true;
    if (g.projectiles.some((pr) => pr.type === 'rock')) rocks = true;
  });
  assert.ok(leapt && rocks);
});

test('the Frosty Peaks are slippery', () => {
  const g = playing(['A'], { level: 2 });
  const p = g.players[0];
  run(g, 3, () => A.setHeld(g, 0, { right: true }));
  assert.ok(p.vx < A.WALK, 'takes a while to get going');
  run(g, 60, () => A.setHeld(g, 0, { right: true }));
  run(g, 3, () => A.setHeld(g, 0, {}));
  assert.ok(p.vx > 1, 'and to stop');
});
