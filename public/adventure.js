// Adventure mode: a side-scrolling platformer. You are the boxer; the
// enemies are creatures, and at the end of each level there's a boss. Four
// levels: the Sunny Meadow (Big Horn the rhino), the Spooky Forest (Count
// Hoot the owl), the Frosty Peaks (Frostbite the yeti) and the Volcano (the
// Silverback). One to four play together, co-op. Like game.js it runs
// authoritatively on the server, and the client loads it too for the level
// layouts and the constants it draws with.
//
// The world is in pixels, y downward, the same as the canvas: the camera
// shows VIEW_W x VIEW_H of it and only ever scrolls forward. Everyone has to
// stay on screen: the camera follows whoever is out in front, but never
// leaves anyone behind, and at the end it locks on the boss's ring.
//
// Punch (quick) and kick (slower, further, harder) hit whatever is in front
// of you; jump on most creatures' heads to squash them, but not on anything
// spiky. Hold block to soak up most of a hit from the front (shockwaves go
// under a guard: jump them). The team shares a pool of lives; fall down a
// hole or run out of health and you lose one, and drop back in a moment
// later. When the last one is gone, it's game over. Beat a boss and it's on
// to the next level, everyone back in with full health.
//
// The cheat codes from the ring work here too, turned on the creatures (see
// cheat() below): type the word while you play.

(function (root) {
  'use strict';

  const TICK_RATE = 60;
  const VIEW_W = 1000;
  const VIEW_H = 560;
  const GROUND_Y = 486;
  const GRAVITY = 0.7;
  const MAX_FALL = 16;
  const WALK = 4.2;
  const AIR_ACCEL = 0.6;
  const ICE_ACCEL = 0.18; // on the Frosty Peaks the ground is slippery
  const JUMP_V = -14.5;
  const JUMP_CUT = -6; // let go of jump early for a little hop
  const COYOTE = 6; // ticks after running off a ledge you can still jump
  const JUMP_BUFFER = 8; // ticks a jump pressed just before landing is kept
  const ACTION_BUFFER = 8;
  const MAX_HP = 100;
  const LIVES_EACH = 3; // the team's pool: three per player
  const PLAYER_HW = 20;
  const PLAYER_H = 104;
  const HURT_TICKS = 20;
  const INVULN_TICKS = 70;
  const KO_TICKS = 100;
  const RESPAWN_INVULN = 120;
  const BLOCK_SHARE = 0.2; // what still gets through a guard
  const STOMP_DAMAGE = 14;
  const STOMP_BOUNCE = -10;
  const HEART_HEAL = 35;
  const COIN_SCORE = 10;
  const READY_TICKS = 90;
  const BOSS_INTRO_TICKS = 150;
  const CLEARED_TICKS = 240;
  const END_TICKS = 150;
  const DROP_EVERY = 6; // every sixth creature down drops a heart
  const WATER_Y = GROUND_Y - 40; // the surface when it floods

  // Frame data, in ticks. Reach is from your middle; top and bottom are
  // heights above your feet. The cheat-code moves have the same timing as in
  // the ring (game.js), so the client can use the same poses.
  const MOVES = {
    punch: { startup: 5, active: 4, recovery: 9, reach: 74, top: 100, bottom: 6, damage: 10, knock: 5 },
    kick: { startup: 10, active: 5, recovery: 15, reach: 96, top: 72, bottom: 4, damage: 16, knock: 10 },
    flip: { startup: 30, active: 14, recovery: 16, reach: 85, top: 130, bottom: 0, damage: 25, knock: 10, around: true, twice: 7, safe: [6, 44], travel: 260 },
    vault: { startup: 34, active: 6, recovery: 18, reach: 100, top: 120, bottom: 0, damage: 30, knock: 14, safe: [4, 34] },
    dance: { startup: 42, active: 6, recovery: 14, reach: 100, top: 120, bottom: 0, damage: 30, knock: 12 },
    cartwheel: { startup: 32, active: 8, recovery: 14, reach: 100, top: 120, bottom: 0, damage: 30, knock: 12, travel: 240, safe: [0, 32] },
    fart: { startup: 24, active: 1, recovery: 22, reach: 0, top: 0, bottom: 0, damage: 0, knock: 0, noHit: true },
    fire: { startup: 8, active: 12, recovery: 12, reach: 230, top: 110, bottom: 10, damage: 8, knock: 4, burn: true },
  };

  // The creatures, by how they behave: hoppers hop at you, flyers hover and
  // dive, rollers curl up and roll at you (immune to hits while curled, and
  // spiky ones hurt to land on), shooters spit things.
  const CREATURES = {
    slime: { kind: 'hopper', hw: 22, h: 30, hp: 20, damage: 8, score: 100 },
    goo: { kind: 'hopper', hw: 22, h: 30, hp: 24, damage: 8, score: 110 },
    iceblob: { kind: 'hopper', hw: 22, h: 30, hp: 26, damage: 8, score: 120 },
    lavablob: { kind: 'hopper', hw: 22, h: 30, hp: 28, damage: 10, score: 130 },
    bee: { kind: 'flyer', hw: 18, h: 26, hp: 12, damage: 8, score: 120, flying: true },
    bat: { kind: 'flyer', hw: 20, h: 24, hp: 14, damage: 8, score: 120, flying: true },
    snowbird: { kind: 'flyer', hw: 18, h: 24, hp: 14, damage: 8, score: 130, flying: true },
    imp: { kind: 'flyer', hw: 18, h: 30, hp: 18, damage: 10, score: 150, flying: true },
    hedgehog: { kind: 'roller', hw: 24, h: 30, hp: 30, damage: 10, score: 200, spikes: true },
    snail: { kind: 'roller', hw: 24, h: 32, hp: 34, damage: 9, score: 180 },
    penguin: { kind: 'roller', hw: 22, h: 40, hp: 30, damage: 10, score: 200 },
    crab: { kind: 'roller', hw: 26, h: 28, hp: 36, damage: 10, score: 220, spikes: true },
    frog: { kind: 'shooter', hw: 24, h: 34, hp: 24, damage: 8, score: 150, shot: 'bubble' },
    mushroom: { kind: 'shooter', hw: 22, h: 40, hp: 26, damage: 8, score: 160, shot: 'spore' },
    snowman: { kind: 'shooter', hw: 24, h: 56, hp: 30, damage: 8, score: 170, shot: 'snowball' },
    lizard: { kind: 'shooter', hw: 26, h: 30, hp: 30, damage: 10, score: 190, shot: 'fireball' },
    rhino: { kind: 'boss', hw: 70, h: 150, hp: 260, damage: 10, score: 5000 },
    owl: { kind: 'boss', hw: 60, h: 120, hp: 240, damage: 10, score: 6000, flying: true },
    yeti: { kind: 'boss', hw: 70, h: 150, hp: 300, damage: 11, score: 7000 },
    gorilla: { kind: 'boss', hw: 75, h: 160, hp: 340, damage: 12, score: 9000 },
  };

  // The bosses: who they are, and the moves they cycle through. Moves in
  // `angryOnly` only come out once they're down to half health.
  const BOSSES = {
    rhino: { name: 'Big Horn', title: 'Champion of the jungle', pattern: ['charge', 'stomp', 'charge', 'throw'], angryOnly: ['throw'], rock: 'boulder' },
    owl: { name: 'Count Hoot', title: 'Lord of the night', pattern: ['swoop', 'rain', 'swoop', 'swoop'], angryOnly: [], fall: 'feather' },
    yeti: { name: 'Frostbite', title: 'King of the mountain', pattern: ['charge', 'roll', 'stomp', 'roll'], angryOnly: [], fall: 'icicle' },
    gorilla: { name: 'Silverback', title: 'Undefeated, undisputed', pattern: ['leap', 'throw', 'charge', 'beat'], angryOnly: [], rock: 'lavarock', fall: 'rock' },
  };
  const BOSS_HP_PER_EXTRA = 0.55; // each extra player adds this much of its health
  const CHARGE_DAMAGE = 16;
  const WAVE_DAMAGE = 12;
  const WAVE_SPEED = 6.5;
  const BOULDER_DAMAGE = 14;
  const ROCK_GRAVITY = 0.35;
  const SHOT_DAMAGE = 8;
  const SHOT_SPEED = 5;
  const FALL_DAMAGE = 12; // feathers, icicles and rocks from above
  const FALL_WARN = 45; // they hang there shaking this long first
  const SNOWROLL_DAMAGE = 14;
  const HOVER_Y = GROUND_Y - 300; // where the owl flies, out of reach

  // ---- Cheat codes -------------------------------------------------------------

  const POWER_TICKS = 10 * TICK_RATE;
  const CODES = {
    zeffen: 'flip', kalya: 'vault', luna: 'luna', louise: 'dance', tamzin: 'cartwheel', grandpa: 'grandpa',
    fart: 'fart', water: 'water', boat: 'boat', swim: 'swim', jemini: 'jemini', kyle: 'kyle', harrison: 'harrison',
    shree: 'shree', shaan: 'shaan', parimal: 'parimal', priya: 'priya', daniel: 'daniel', edward: 'edward',
    spreadbury: 'spreadbury', mamtora: 'mamtora', jay: 'jay', leo: 'leo', ludo: 'ludo', tony: 'tony', daddy: 'daddy',
    mummy: 'mummy', bear: 'bear', simon: 'simon', lizzie: 'lizzie', blake: 'blake', briony: 'briony', paul: 'paul',
    supercalifragilisticexpialidocious: 'super',
  };
  const CODE_MAX = Math.max(...Object.keys(CODES).map((c) => c.length));
  // Harrison picks one of these at random.
  const HARRISON_POOL = Object.keys(CODES).filter((c) => !['harrison', 'boat', 'swim', 'supercalifragilisticexpialidocious'].includes(c));
  const GIANT_DAMAGE = 1.25;
  const GIANT_REACH = 1.4;
  const TURBO_SPEED = 1.6; // grandpa
  const SHOES_SPEED = 1.8; // daddy
  const DASH_SPEED = 11; // lizzie's rugby charge, grandpa's charge
  const DASH_MAX = 90;
  const RUGBY_DAMAGE = 20;
  const CAR_TICKS = 150;
  const CAR_SPEED = 11;
  const CAR_DAMAGE = 30;
  const FIST_WARN = 50;
  const FIST_DAMAGE = 30;
  const FIST_RADIUS = 70;
  const RAY_SPEED = 14;
  const FREEZE_TICKS = 4 * TICK_RATE;
  const SHRINK_TICKS = POWER_TICKS;
  const STOP_TICKS = 6 * TICK_RATE; // edward
  const FLOOD_TICKS = POWER_TICKS; // water
  const FLOOD_DAMAGE = 2; // each second, to creatures caught in it
  const SNACK_HEAL = 50;
  const SNACK_FALL = 1.4;
  const PAWN_PROMOTES = 3;
  const BISHOP_HEAL = 5;
  const PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  const CHESS = {
    pawn: { damage: 0.75, reach: 1, speed: 1 },
    knight: { damage: 1, reach: 1.5, speed: 1, jump: 1.2 },
    bishop: { damage: 1, reach: 1, speed: 1 },
    rook: { damage: 1.25, reach: 1, speed: 0.6, takes: 0.5 },
    queen: { damage: 1.5, reach: 1.25, speed: 1.5 },
    king: { damage: 0.5, reach: 1, speed: 0.5, takes: 0 },
  };
  const LOVE_RADIUS = 120;
  const CUDDLE_TICKS = TICK_RATE;
  const CUDDLE_STEAL = 10;
  const HONEY_SPEED = 8;
  const HONEY_RANGE = 260;
  const STICKY_TICKS = POWER_TICKS;
  const MOUSTACHE_KO = 0.11;
  const MOUSTACHE_NAP = 0.14;
  const NAP_TICKS = 5 * TICK_RATE;
  const FIRE_COOL = 2 * TICK_RATE;
  const BURN_TICKS = 5 * TICK_RATE;
  const JUGGLE_TICKS = TICK_RATE;
  const PIES = 3;
  const PIE_EVERY = 20;
  const PIE_DAMAGE = 10;
  const PIE_SPEED = 12;
  const CONFUSED_TICKS = 5 * TICK_RATE;
  const PIANO_TICKS = 2 * TICK_RATE;
  const BOSS_NAP = 4 * TICK_RATE; // a boss only nods off for a moment
  const CLOUD_SPEED = 3.2;
  const POISON_DAMAGE = 3;
  const POISON_EVERY = 2 * TICK_RATE;
  const SPIKY_KEEP = 0.3; // daniel: what you still take

  // ---- The levels ----------------------------------------------------------------
  //
  // Solids are blocks of ground (from their top all the way down); platforms
  // can be jumped up through and stood on. Gaps in the ground are holes (full
  // of lava on the Volcano: just as deadly).

  const LEVEL_END = 7200;

  function makeLevel(info, build) {
    const solids = [];
    const platforms = [];
    const spawns = [];
    const pickups = [];
    const h = {
      ground: (x0, x1, y = GROUND_Y) => solids.push({ x: x0, y, w: x1 - x0, h: VIEW_H + 300 - y }),
      plat: (x, y, w) => platforms.push({ x, y, w }),
      coins: (x, y, n, gap = 40) => { for (let k = 0; k < n; k++) pickups.push({ type: 'coin', x: x + k * gap, y }); },
      coinArc: (x, y, n) => {
        for (let k = 0; k < n; k++) {
          const u = n > 1 ? k / (n - 1) : 0.5;
          pickups.push({ type: 'coin', x: x + k * 36, y: y - Math.sin(u * Math.PI) * 70 });
        }
      },
      heart: (x, y) => pickups.push({ type: 'heart', x, y }),
      life: (x, y) => pickups.push({ type: 'life', x, y }),
      enemy: (type, x, y) => spawns.push({ type, x, y }),
    };
    build(h);
    spawns.sort((a, b) => a.x - b.x);
    pickups.forEach((p, k) => { p.id = k; });
    return { ...info, solids, platforms, spawns, pickups, end: LEVEL_END, arenaX: LEVEL_END - VIEW_W };
  }

  const meadow = makeLevel({ name: 'Sunny Meadow', theme: 'meadow', boss: 'rhino' }, (L) => {
    L.ground(-200, 1400);
    L.plat(480, 380, 170);
    L.plat(780, 320, 150);
    L.coins(250, 440, 4);
    L.coins(505, 340, 4);
    L.coins(800, 280, 3);
    L.enemy('slime', 760);
    L.enemy('slime', 1060);
    L.enemy('slime', 1300);

    L.coinArc(1390, 400, 5);
    L.ground(1520, 2000);
    L.ground(2000, 2420, 426);
    L.enemy('bee', 1760, 300);
    L.enemy('hedgehog', 1900);
    L.enemy('frog', 2280);
    L.coins(2060, 386, 5);

    L.plat(2475, 420, 90);
    L.coins(2490, 380, 2);
    L.ground(2600, 3600);
    L.plat(2800, 370, 160);
    L.plat(3050, 290, 160);
    L.plat(3300, 370, 160);
    L.coins(2820, 330, 4);
    L.coins(3330, 330, 4);
    L.heart(3130, 250);
    L.enemy('slime', 2760);
    L.enemy('slime', 2960);
    L.enemy('bee', 3150, 200);
    L.enemy('hedgehog', 3420);

    L.coinArc(3590, 400, 5);
    L.ground(3740, 4800);
    L.plat(3990, 380, 130);
    L.plat(4400, 360, 150);
    L.plat(4620, 250, 110);
    L.life(4675, 205);
    L.coins(4420, 320, 4);
    L.enemy('frog', 3980, GROUND_Y);
    L.enemy('bee', 4120, 280);
    L.enemy('frog', 4340);
    L.enemy('bee', 4520, 240);
    L.enemy('hedgehog', 4660, GROUND_Y);
    L.enemy('slime', 4760);

    L.coinArc(4795, 410, 4);
    L.ground(4900, 5300);
    L.ground(5300, 5500, 426);
    L.ground(5500, 5700, 366);
    L.ground(5700, 5900, 426);
    L.ground(5900, LEVEL_END + 200);
    L.coins(5530, 326, 4);
    L.enemy('hedgehog', 5120);
    L.enemy('slime', 5240);
    L.enemy('frog', 5620);
    L.enemy('bee', 5820, 260);
    L.enemy('slime', 6020);
    L.enemy('hedgehog', 6150);
    L.heart(6100, 430);
  });

  const forest = makeLevel({ name: 'Spooky Forest', theme: 'forest', boss: 'owl' }, (L) => {
    L.ground(-200, 1200);
    L.plat(400, 380, 140);
    L.plat(650, 300, 140);
    L.plat(900, 380, 140);
    L.coins(420, 340, 3);
    L.coins(670, 260, 3);
    L.coins(920, 340, 3);
    L.enemy('mushroom', 760, GROUND_Y);
    L.enemy('bat', 960, 260);
    L.enemy('goo', 1120);

    L.coinArc(1190, 400, 4);
    L.ground(1340, 2200);
    L.ground(1700, 1900, 420);
    L.enemy('snail', 1500);
    L.enemy('bat', 1800, 250);
    L.enemy('mushroom', 2060);
    L.coins(1720, 380, 4);

    // Stepping stones over a wide hole.
    L.plat(2260, 420, 80);
    L.plat(2400, 380, 80);
    L.coins(2280, 380, 2);
    L.coins(2420, 340, 2);
    L.ground(2500, 3800);
    L.plat(2700, 360, 120);
    L.plat(2900, 280, 120);
    L.plat(3100, 200, 120);
    L.plat(3350, 320, 140);
    L.heart(3160, 160);
    L.coins(2720, 320, 3);
    L.coins(2920, 240, 3);
    L.enemy('goo', 2650);
    L.enemy('goo', 2820, GROUND_Y);
    L.enemy('snail', 3000, GROUND_Y);
    L.enemy('bat', 3200, 180);
    L.enemy('mushroom', 3500);
    L.enemy('bat', 3650, 250);

    L.coinArc(3790, 400, 4);
    L.ground(3940, 5000);
    L.ground(4400, 4700, 426);
    L.enemy('snail', 4100);
    L.enemy('bat', 4300, 280);
    L.enemy('mushroom', 4550);
    L.enemy('goo', 4850);
    L.coins(4430, 386, 6);

    L.coinArc(4990, 410, 4);
    L.ground(5130, LEVEL_END + 200);
    L.plat(5400, 380, 150);
    L.plat(5700, 300, 120);
    L.life(5760, 255);
    L.enemy('goo', 5300);
    L.enemy('bat', 5500, 260);
    L.enemy('snail', 5800, GROUND_Y);
    L.enemy('mushroom', 6000);
    L.enemy('goo', 6120);
    L.heart(6150, 430);
  });

  const snow = makeLevel({ name: 'Frosty Peaks', theme: 'snow', boss: 'yeti', ice: true }, (L) => {
    L.ground(-200, 1300);
    L.plat(500, 380, 160);
    L.coins(520, 340, 4);
    L.coins(800, 440, 5);
    L.enemy('penguin', 720);
    L.enemy('snowman', 1000);
    L.enemy('iceblob', 1220);

    L.coinArc(1290, 400, 4);
    L.ground(1440, 1800);
    L.ground(1800, 2000, 426);
    L.ground(2000, 2300, 366);
    L.enemy('snowbird', 1620, 280);
    L.enemy('penguin', 1750);
    L.enemy('snowman', 2180);
    L.coins(2030, 326, 5);

    L.ground(2460, 3500);
    L.plat(2700, 370, 150);
    L.plat(2950, 300, 150);
    L.plat(3200, 370, 150);
    L.coins(2970, 260, 4);
    L.enemy('iceblob', 2600);
    L.enemy('penguin', 2820, GROUND_Y);
    L.enemy('snowbird', 3000, 200);
    L.enemy('snowman', 3300, GROUND_Y);
    L.enemy('iceblob', 3420);

    L.coinArc(3490, 400, 4);
    L.ground(3640, 4700);
    L.plat(4100, 360, 140);
    L.plat(4350, 260, 110);
    L.life(4405, 215);
    L.heart(4140, 320);
    L.enemy('penguin', 3800);
    L.enemy('penguin', 4000);
    L.enemy('snowman', 4300, GROUND_Y);
    L.enemy('snowbird', 4500, 260);

    L.coinArc(4690, 410, 4);
    L.ground(4820, 5200);
    L.ground(5200, 5400, 426);
    L.ground(5400, LEVEL_END + 200);
    L.coins(5220, 386, 4);
    L.enemy('snowman', 5000);
    L.enemy('iceblob', 5150);
    L.enemy('snowbird', 5500, 260);
    L.enemy('penguin', 5700);
    L.enemy('snowman', 6000);
    L.enemy('penguin', 6150);
    L.heart(6100, 430);
  });

  const volcano = makeLevel({ name: 'Volcano', theme: 'volcano', boss: 'gorilla', lava: true }, (L) => {
    L.ground(-200, 1200);
    L.plat(450, 380, 150);
    L.plat(750, 320, 150);
    L.coins(470, 340, 3);
    L.coins(770, 280, 3);
    L.enemy('lavablob', 650);
    L.enemy('imp', 900, 280);
    L.enemy('crab', 1100);

    L.coinArc(1190, 400, 4);
    L.ground(1350, 1750);
    L.ground(1750, 2200, 426);
    L.enemy('lizard', 1550);
    L.enemy('imp', 1700, 260);
    L.enemy('crab', 1900);
    L.enemy('lavablob', 2100);

    L.plat(2270, 420, 70);
    L.plat(2400, 390, 70);
    L.coins(2285, 380, 1);
    L.coins(2415, 350, 1);
    L.ground(2520, 3700);
    L.plat(2750, 360, 140);
    L.plat(3000, 280, 140);
    L.plat(3250, 360, 140);
    L.coins(3020, 240, 4);
    L.enemy('crab', 2700);
    L.enemy('lizard', 2950, GROUND_Y);
    L.enemy('imp', 3050, 200);
    L.enemy('lavablob', 3300, GROUND_Y);
    L.enemy('crab', 3500);
    L.enemy('imp', 3600, 260);

    L.coinArc(3690, 400, 4);
    L.ground(3850, 4200);
    L.ground(4200, 4500, 426);
    L.ground(4500, 4700, 366);
    L.ground(4700, 4900);
    L.heart(4600, 320);
    L.coins(4230, 386, 6);
    L.enemy('lizard', 4000);
    L.enemy('crab', 4150);
    L.enemy('lizard', 4620);
    L.enemy('imp', 4800, 240);

    L.coinArc(4890, 410, 4);
    L.ground(5030, LEVEL_END + 200);
    L.plat(5300, 380, 140);
    L.plat(5550, 300, 120);
    L.life(5610, 255);
    L.enemy('lavablob', 5200);
    L.enemy('crab', 5400, GROUND_Y);
    L.enemy('imp', 5650, 240);
    L.enemy('lizard', 5900);
    L.enemy('crab', 6050);
    L.enemy('lavablob', 6150);
    L.heart(6100, 430);
  });

  const LEVELS = [meadow, forest, snow, volcano];

  // ---- Bodies and the ground --------------------------------------------------

  const spans = (s, x0, x1) => x1 > s.x && x0 < s.x + s.w;

  /** The top of the ground (or platform) right under x, at or below y. */
  function surfaceBelow(L, x, y) {
    let best = Infinity;
    for (const s of L.solids) if (x >= s.x && x <= s.x + s.w && s.y >= y - 1 && s.y < best) best = s.y;
    for (const p of L.platforms) if (x >= p.x && x <= p.x + p.w && p.y >= y - 1 && p.y < best) best = p.y;
    return best;
  }

  /** Is there something to stand on at x, no more than a step down from y? */
  function footing(L, x, y) {
    return surfaceBelow(L, x, y) <= y + 70;
  }

  /**
   * Moves a body (x is its middle, y its feet) by its speed, stopping it at
   * walls and landing it on ground and platforms.
   */
  function moveBody(L, b, hw, h, k = 1) {
    b.hitWall = 0;
    b.x += b.vx * k;
    for (const s of L.solids) {
      if (b.y > s.y + 0.5 && b.y - h < s.y + s.h && spans(s, b.x - hw, b.x + hw)) {
        if (b.x < s.x + s.w / 2) { b.x = s.x - hw; b.hitWall = 1; } else { b.x = s.x + s.w + hw; b.hitWall = -1; }
      }
    }
    const prevY = b.y;
    b.y += b.vy * k;
    b.onGround = false;
    if (b.vy >= 0) {
      let land = Infinity;
      for (const s of L.solids) if (spans(s, b.x - hw, b.x + hw) && prevY <= s.y + 0.5 && b.y >= s.y) land = Math.min(land, s.y);
      if (!b.dropping) {
        for (const p of L.platforms) if (spans(p, b.x - hw, b.x + hw) && prevY <= p.y + 0.5 && b.y >= p.y) land = Math.min(land, p.y);
      }
      if (land < Infinity) { b.y = land; b.vy = 0; b.onGround = true; }
    }
  }

  const overlap = (ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) => ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;

  /** A steady pseudo-random number (mulberry32), so a game can be replayed. */
  function rand(g) {
    g.seed = (g.seed + 0x6D2B79F5) | 0;
    let t = g.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---- Making a game ----------------------------------------------------------

  function makePlayer(name) {
    return {
      name, x: 120, y: GROUND_Y, vx: 0, vy: 0, onGround: true,
      facing: 1, state: 'idle', move: null, t: 0, hp: MAX_HP,
      invuln: 0, coyote: 0, jumpBuf: 0, act: null, actBuf: 0, jumping: false,
      held: { left: false, right: false, jump: false, block: false, down: false },
      hits: [], out: false, left: false, fell: false,
      typed: '', typing: '', superUsed: false, invincible: 0,
      stats: { kos: 0, coins: 0, damage: 0, falls: 0, codes: 0 },
      ...noPowers(),
    };
  }

  /** Everything a cheat code can put on you, switched off. */
  function noPowers() {
    return {
      giant: 0, invisible: 0, turbo: 0, shoes: 0, spiky: 0, vampire: 0, lion: 0, sword: 0,
      piece: null, chess: 0, pawnHits: 0, dragon: 0, fireCool: 0, love: 0, hugging: 0, hugged: [],
      moustache: false, nap: 0, dash: 0, dashKind: null, dashTarget: null, car: 0, carHits: [],
      clown: 0, piano: 0, boat: false, swim: false, flipFrom: 0, vaultTo: 0,
    };
  }

  function createGame(names, opts = {}) {
    const n = names.length;
    const g = {
      mode: 'adventure',
      level: 0,
      L: LEVELS[0],
      phase: 'ready',
      tick: 0,
      phaseT: 0,
      camX: 0,
      lives: LIVES_EACH * n,
      score: 0,
      seed: opts.seed === undefined ? 1 : opts.seed | 0,
      players: names.map((name) => makePlayer(name)),
      over: false,
      won: false,
      events: [],
    };
    loadLevel(g, Math.max(0, Math.min(LEVELS.length - 1, opts.level | 0)));
    return g;
  }

  /** Sets up a level: everyone in at the start, back on their feet. */
  function loadLevel(g, level) {
    g.level = level;
    g.L = LEVELS[level];
    g.phase = 'ready';
    g.phaseT = 0;
    g.camX = 0;
    g.enemies = [];
    g.projectiles = [];
    g.taken = [];
    g.extra = [];
    g.nextSpawn = 0;
    g.nextId = (g.nextId || 0) + 1;
    g.kills = g.kills || 0;
    g.boss = null;
    g.fists = [];
    g.snacks = [];
    g.theme = null;
    g.themeT = 0;
    g.flood = 0;
    g.stopped = 0;
    const live = g.players.filter((p) => !p.left);
    live.forEach((p, k) => {
      Object.assign(p, noPowers(), {
        x: 120 + k * 60 - (live.length - 1) * 20, y: GROUND_Y, vx: 0, vy: 0, onGround: true,
        facing: 1, hp: MAX_HP, out: false, fell: false, invuln: 0, typed: '', typing: '',
      });
      setState(p, 'idle');
    });
  }

  // ---- Input ----------------------------------------------------------------

  function setHeld(g, i, h) {
    const p = g.players[i];
    if (!p || !h) return;
    for (const k of ['left', 'right', 'jump', 'block', 'down']) p.held[k] = Boolean(h[k]);
  }

  function pressAction(g, i, a) {
    const p = g.players[i];
    if (!p) return;
    if (a === 'jump') { p.jumpBuf = JUMP_BUFFER; return; }
    if (a === 'punch' || a === 'kick') { p.act = a; p.actBuf = ACTION_BUFFER; }
  }

  /**
   * A letter typed while playing. Finishing a cheat code sets it off;
   * `typing` is as much of a code as the last letters make, shown over your
   * head for everyone to see.
   */
  function typeKey(g, i, key) {
    const p = g.players[i];
    if (!p || down(p) || p.nap > 0 || !['run', 'boss', 'bossIntro'].includes(g.phase)) return;
    const k = String(key || '').toLowerCase();
    if (!/^[a-z]$/.test(k)) return;
    p.typed = (p.typed + k).slice(-CODE_MAX);
    const done = Object.keys(CODES).find((c) => p.typed.endsWith(c));
    if (done) {
      p.typed = '';
      p.typing = '';
      cheat(g, i, done);
      return;
    }
    p.typing = '';
    for (const c of Object.keys(CODES)) {
      for (let n = Math.min(c.length - 1, p.typed.length); n > p.typing.length; n--) {
        if (p.typed.endsWith(c.slice(0, n))) { p.typing = c.slice(0, n); break; }
      }
    }
  }

  function removePlayer(g, i) {
    const p = g.players[i];
    if (!p) return;
    p.left = true;
    p.out = true;
    checkLost(g);
  }

  // ---- Players ------------------------------------------------------------------

  function setState(p, state, move = null) {
    p.state = state;
    p.move = move;
    p.t = 0;
  }

  const down = (p) => p.out || p.state === 'ko';
  const busy = (p) => p.nap > 0 || p.car > 0 || p.dash > 0 || p.clown > 0 || p.piano > 0;

  function canAct(p) {
    if (busy(p)) return false;
    if (p.state === 'idle' || p.state === 'walk' || p.state === 'block') return true;
    // A punch can be chained into the next once it has landed.
    if (p.state === 'attack' && p.move === 'punch') {
      const m = MOVES.punch;
      return p.t >= m.startup + m.active + 3;
    }
    return false;
  }

  function speedOf(g, p) {
    let k = 1;
    if (p.turbo > 0) k *= TURBO_SPEED;
    if (p.shoes > 0) k *= SHOES_SPEED;
    if (p.piece) k *= CHESS[p.piece].speed;
    if (g.flood > 0 && !p.boat && p.y > WATER_Y) k *= p.swim ? 0.9 : 0.55;
    return k;
  }

  /** Up in the air in a flip or vault: sailing over everything. */
  function flying(p) {
    if (p.state !== 'attack') return false;
    const m = MOVES[p.move];
    return !!m.safe && p.t >= m.safe[0] && p.t < m.safe[1];
  }

  /** Out of harm's way: mid-flip, in a car, invincible, a king. */
  function shielded(p) {
    return p.invincible > 0 || p.car > 0 || p.piece === 'king' || flying(p);
  }

  function stepPlayer(g, p, i) {
    if (p.out) return;
    p.t++;
    if (p.state === 'ko') {
      if (p.t >= KO_TICKS) respawn(g, p, i);
      return;
    }
    tickPowers(g, p, i);
    if (p.invuln > 0) p.invuln--;
    if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.actBuf > 0) p.actBuf--; else p.act = null;
    if (p.coyote > 0) p.coyote--;
    const h = p.held;
    const frozen = ['ready', 'won', 'lost', 'cleared'].includes(g.phase) || busy(p);
    const want = frozen ? 0 : (h.right ? 1 : 0) - (h.left ? 1 : 0);
    const L = g.L;

    if (p.state === 'hitstun' && p.t >= HURT_TICKS) setState(p, 'idle');
    if (p.state === 'attack') {
      const m = MOVES[p.move];
      if (p.t >= m.startup + m.active + m.recovery) setState(p, 'idle');
    }
    if (!frozen && p.act && canAct(p)) startAttack(g, p, i, p.act);
    if (p.state === 'block' && (!h.block || !p.onGround)) setState(p, 'idle');
    if ((p.state === 'idle' || p.state === 'walk') && h.block && p.onGround && !frozen && !p.lion) setState(p, 'block');

    // Swimming in a flood: jump any time, to swim up.
    const swimming = g.flood > 0 && !p.boat && p.y > WATER_Y + 20;
    const free = p.state === 'idle' || p.state === 'walk' || p.state === 'block';
    if (!frozen && p.jumpBuf > 0 && free && (p.onGround || p.coyote > 0 || swimming)) {
      if (h.down && p.onGround && onPlatform(L, p)) {
        p.dropping = 10; // down + jump: drop through the platform
      } else {
        const jump = p.piece === 'knight' ? CHESS.knight.jump : 1;
        p.vy = JUMP_V * jump * (swimming && !p.onGround ? 0.6 : 1);
        p.jumping = true;
        g.events.push({ type: 'jump', i });
      }
      if (p.state === 'block') setState(p, 'idle');
      p.onGround = false;
      p.coyote = 0;
      p.jumpBuf = 0;
    }
    if (p.jumping && !h.jump && p.vy < JUMP_CUT) p.vy = JUMP_CUT;
    if (p.vy >= 0) p.jumping = false;

    const speed = WALK * speedOf(g, p);
    if (p.car > 0) {
      stepCar(g, p, i);
    } else if (p.dash > 0) {
      stepDash(g, p, i);
    } else if (p.state === 'idle' || p.state === 'walk') {
      if (want) p.facing = want;
      if (p.onGround && !L.ice) p.vx = want * speed;
      else {
        const acc = p.onGround ? ICE_ACCEL : AIR_ACCEL;
        p.vx += Math.max(-acc, Math.min(acc, want * speed - p.vx));
      }
      if (p.onGround) {
        const st = want ? 'walk' : 'idle';
        if (p.state !== st) p.state = st;
      }
    } else if (p.state === 'attack') {
      stepSpecialMove(g, p, i);
      if (!MOVES[p.move].travel && p.move !== 'vault') {
        if (p.onGround) p.vx *= L.ice ? 0.95 : 0.7;
        else p.vx += Math.max(-AIR_ACCEL / 2, Math.min(AIR_ACCEL / 2, want * speed - p.vx));
      }
    } else if (p.state === 'block') {
      p.vx = L.ice ? p.vx * 0.9 : 0;
    } else if (p.state === 'hitstun') {
      p.vx *= 0.9;
    }
    if (busy(p) && !p.car && !p.dash) p.vx = p.onGround ? 0 : p.vx;

    p.prevY = p.y;
    const grav = g.flood > 0 && p.y > WATER_Y ? GRAVITY * 0.45 : GRAVITY;
    p.vy = Math.min(g.flood > 0 && p.y > WATER_Y ? 5 : MAX_FALL, p.vy + grav);
    // Holes fill with water in a flood: you float back up and can swim over.
    if (g.flood > 0 && p.y > GROUND_Y + 30) p.vy = Math.min(p.vy, -2);
    if (p.dropping) p.dropping--;
    moveBody(L, p, PLAYER_HW, PLAYER_H);
    if (p.onGround) {
      p.coyote = COYOTE;
      if (footing(L, p.x - PLAYER_HW, p.y) && footing(L, p.x + PLAYER_HW, p.y)) p.safeX = p.x;
    }

    // Everyone stays on screen.
    const lo = g.camX + PLAYER_HW + 4;
    const hi = g.camX + VIEW_W - PLAYER_HW - 4;
    if (p.x < lo) p.x = lo;
    if (p.x > hi) p.x = hi;

    if (p.y > VIEW_H + 150) {
      // Down a hole.
      p.fell = true;
      p.stats.falls++;
      if (p.invincible > 0) {
        // Invincible: just pops back up out of it.
        p.fell = false;
        p.y = -40;
        p.vy = 0;
        p.x = respawnX(g, p);
      } else knockOut(g, p, i);
    }
  }

  function onPlatform(L, p) {
    return L.platforms.some((pl) => Math.abs(pl.y - p.y) < 1 && spans(pl, p.x - PLAYER_HW, p.x + PLAYER_HW))
      && !L.solids.some((s) => Math.abs(s.y - p.y) < 1 && spans(s, p.x - PLAYER_HW, p.x + PLAYER_HW));
  }

  /** Punch or kick, as changed by whatever you've turned into. */
  function startAttack(g, p, i, a) {
    let move = a;
    if (p.dragon > 0 && a === 'punch') {
      if (p.fireCool > 0) return;
      move = 'fire';
      p.fireCool = FIRE_COOL;
    }
    if ((p.lion > 0 || p.sword > 0) && a === 'kick') return; // punches only
    setState(p, 'attack', move);
    p.hits = [];
    p.act = null;
    p.actBuf = 0;
    g.events.push({ type: 'swing', i, move });
  }

  /** Movement during the cheat-code moves. */
  function stepSpecialMove(g, p, i) {
    const m = MOVES[p.move];
    if (p.move === 'flip' || p.move === 'cartwheel') {
      const from = p.move === 'flip' ? 8 : 0;
      p.vx = p.t >= from && p.t < m.startup ? p.facing * (m.travel / (m.startup - from)) : 0;
      if (p.move === 'flip' && p.t === 8 && p.onGround) { p.vy = -9; p.onGround = false; }
    } else if (p.move === 'vault') {
      // Up and over to the spot behind them, then turn round and kick.
      if (p.t >= 4 && p.t < m.startup) {
        const left = m.startup - p.t;
        p.vx = (p.vaultTo - p.x) / left;
        if (p.t === 4) { p.vy = -12; p.onGround = false; }
      } else p.vx = 0;
      if (p.t === m.startup) p.facing = -p.facing;
    } else if (p.move === 'dance') {
      // Reeling the nearest creature in on a ribbon.
      if (p.t < m.startup) {
        const e = nearestEnemy(g, p.x, 520);
        if (e && !isBoss(e)) {
          const to = p.x + p.facing * 70;
          e.x += Math.sign(to - e.x) * Math.min(8, Math.abs(to - e.x));
          e.pulled = 2;
        }
      }
    } else if (p.move === 'fart' && p.t === m.startup) {
      const e = nearestEnemy(g, p.x, 900);
      const dir = e ? (e.x > p.x ? 1 : -1) : p.facing;
      g.projectiles.push({ id: g.nextId++, type: 'cloud', mine: true, owner: i, x: p.x + dir * 40, y: p.y - 60, vx: dir * CLOUD_SPEED, vy: 0, t: 0, life: 240, hit: [] });
      g.events.push({ type: 'fart', i });
    }
  }

  function damageOf(p, m) {
    let d = m.damage;
    if (p.giant > 0) d *= GIANT_DAMAGE;
    if (p.vampire > 0) d *= 0.5;
    if ((p.lion > 0 || p.sword > 0) && p.move === 'punch') d *= 1.5;
    if (p.piece) d *= CHESS[p.piece].damage;
    return Math.max(1, Math.round(d));
  }

  function reachOf(p, m) {
    let r = m.reach;
    if (p.giant > 0) r *= GIANT_REACH;
    if (p.sword > 0 && p.move === 'punch') r *= 1.25;
    if (p.piece) r *= CHESS[p.piece].reach;
    return r;
  }

  /** The box an attack covers right now, or null if it isn't out. */
  function attackBox(p) {
    if (p.state !== 'attack') return null;
    const m = MOVES[p.move];
    if (m.noHit || p.t < m.startup || p.t >= m.startup + m.active) return null;
    if (m.twice && p.t === m.startup + m.twice) p.hits = [];
    const reach = reachOf(p, m);
    const x0 = m.around ? p.x - reach : p.facing > 0 ? p.x : p.x - reach;
    const x1 = m.around ? p.x + reach : x0 + reach;
    const scale = p.giant > 0 ? 1.3 : 1;
    return { x0, x1, y0: p.y - m.top * scale, y1: p.y - m.bottom, move: m, damage: damageOf(p, m) };
  }

  /**
   * Hurts a player. dir is the way the hit pushes them. A guard facing the
   * hit takes most of it, unless it can't be blocked.
   */
  function hurtPlayer(g, p, i, damage, dir, knock = 8, unblockable = false) {
    if (down(p) || p.invuln > 0 || g.phase === 'won' || g.phase === 'cleared' || shielded(p)) return false;
    forgetTyping(p);
    if (p.piece === 'rook') { damage = Math.ceil(damage * CHESS.rook.takes); knock = 0; }
    if (p.clown > 0 || p.piano > 0) { p.clown = 0; p.piano = 0; g.events.push({ type: 'interrupted', i }); }
    p.nap = 0;
    if (!unblockable && p.state === 'block' && p.facing === -dir) {
      const d = Math.ceil(damage * BLOCK_SHARE);
      p.hp -= d;
      p.vx = dir * 3;
      p.invuln = 20;
      g.events.push({ type: 'block', i, x: p.x + p.facing * 20, y: p.y - 70 });
      if (p.hp <= 0) knockOut(g, p, i);
      return true;
    }
    p.hp -= damage;
    p.dash = 0;
    setState(p, 'hitstun');
    p.vx = dir * knock;
    p.vy = knock ? -5 : 0;
    p.onGround = !knock && p.onGround;
    p.invuln = INVULN_TICKS;
    g.events.push({ type: 'hurt', i, x: p.x, y: p.y - 70, damage });
    if (p.hp <= 0) knockOut(g, p, i);
    return true;
  }

  function forgetTyping(p) {
    p.typed = '';
    p.typing = '';
  }

  function knockOut(g, p, i) {
    p.hp = 0;
    setState(p, 'ko');
    p.vx = 0;
    p.vy = 0;
    p.car = 0;
    p.dash = 0;
    forgetTyping(p);
    g.events.push({ type: 'ko', i, x: p.x, y: p.y, fell: p.fell });
  }

  function respawnX(g, p) {
    const mates = g.players.filter((q) => q !== p && !down(q));
    let x = mates.length ? Math.min(...mates.map((q) => q.x)) : (p.safeX || p.x);
    x = Math.max(g.camX + 120, Math.min(g.camX + VIEW_W - 120, x));
    for (let k = 0; k < 60 && surfaceBelow(g.L, x, -100) > VIEW_H; k++) x += 20;
    return x;
  }

  function respawn(g, p, i) {
    if (g.lives <= 0) {
      p.out = true;
      g.events.push({ type: 'out', i });
      checkLost(g);
      return;
    }
    g.lives--;
    // Back in near where they were, or with whoever is still going.
    Object.assign(p, noPowers(), {
      x: respawnX(g, p), y: -40, vx: 0, vy: 0, onGround: false, hp: MAX_HP, fell: false,
      invuln: RESPAWN_INVULN, jumping: false, dropping: 0,
    });
    setState(p, 'idle');
    g.events.push({ type: 'respawn', i });
  }

  function checkLost(g) {
    if (g.over || g.phase === 'won') return;
    if (g.players.every((p) => p.out)) {
      g.phase = 'lost';
      g.phaseT = 0;
      g.events.push({ type: 'gameOver' });
    }
  }

  // ---- Power-ups ticking down ----------------------------------------------

  function tickPowers(g, p, i) {
    for (const k of ['giant', 'invisible', 'turbo', 'shoes', 'spiky', 'vampire', 'lion', 'sword', 'dragon', 'love', 'fireCool']) {
      if (p[k] > 0) p[k]--;
    }
    if (p.chess > 0 && --p.chess === 0) p.piece = null;
    if (p.nap > 0) { p.nap--; if (p.state !== 'ko') { p.state = 'idle'; p.vx = 0; } }
    if (p.hugging > 0) p.hugging--;
    if (p.love === 0 && p.hugged.length) p.hugged = [];
    if (p.boat && g.flood === 0) p.boat = false;
    if (p.swim && g.flood === 0) p.swim = false;

    // Briony's clown: juggle, then pies at the nearest creatures.
    if (p.clown > 0) {
      p.clown++;
      const at = p.clown - JUGGLE_TICKS;
      if (at > 0 && at % PIE_EVERY === 0 && at / PIE_EVERY <= PIES) {
        const targets = enemiesOnScreen(g).filter((e) => !e.dead).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
        const e = targets[(at / PIE_EVERY - 1) % Math.max(1, targets.length)];
        const tx = e ? e.x : p.x + p.facing * 400;
        const ty = e ? e.y - sizeOf(e).h * 0.7 : p.y - 70;
        const sx = p.x + p.facing * 20;
        const sy = p.y - 110;
        const d = Math.max(1, Math.hypot(tx - sx, ty - sy));
        g.projectiles.push({ id: g.nextId++, type: 'pie', mine: true, owner: i, x: sx, y: sy, vx: ((tx - sx) / d) * PIE_SPEED, vy: ((ty - sy) / d) * PIE_SPEED, t: 0, life: 90 });
        g.events.push({ type: 'pieThrow', i });
      }
      if (at >= PIE_EVERY * PIES + 20) p.clown = 0;
    }
    // Paul's piano: a lullaby, and every creature on screen nods off.
    if (p.piano > 0) {
      p.piano++;
      if (p.piano >= PIANO_TICKS) {
        p.piano = 0;
        for (const e of enemiesOnScreen(g)) {
          if (e.dead) continue;
          e.asleep = isBoss(e) ? BOSS_NAP : 1e9;
        }
        g.events.push({ type: 'lullaby', i });
      }
    }
    // Mummy's love: cuddle anyone who comes close, once each.
    if (p.love > 0) {
      for (const e of g.enemies) {
        if (e.dead || e.cuddled || p.hugged.includes(e.id)) continue;
        if (Math.abs(e.x - p.x) < LOVE_RADIUS && Math.abs(e.y - p.y) < LOVE_RADIUS) {
          p.hugged.push(e.id);
          e.cuddled = CUDDLE_TICKS;
          e.cuddledBy = i;
          p.hugging = CUDDLE_TICKS;
          g.events.push({ type: 'cuddle', i, x: e.x, y: e.y });
        }
      }
    }
  }

  // ---- The cheat codes ----------------------------------------------------------

  function enemiesOnScreen(g) {
    return g.enemies.filter((e) => !e.dead && e.x > g.camX - 40 && e.x < g.camX + VIEW_W + 40 && e.state !== 'enter');
  }

  function nearestEnemy(g, x, within = Infinity, ahead = 0) {
    let best = null;
    let bestD = within;
    for (const e of enemiesOnScreen(g)) {
      if (ahead && Math.sign(e.x - x) !== ahead) continue;
      const d = Math.abs(e.x - x);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /** What each code does in the adventure (the ring's, turned on creatures). */
  function cheat(g, i, code) {
    const p = g.players[i];
    let what = CODES[code];
    if (!p || !what) return;
    if (what === 'harrison') {
      code = HARRISON_POOL[Math.floor(rand(g) * HARRISON_POOL.length)];
      what = CODES[code];
      g.events.push({ type: 'harrison', i, code });
    }
    const near = nearestEnemy(g, p.x);
    const ev = { type: 'cheat', i, code, what };
    const moveCode = ['flip', 'vault', 'dance', 'cartwheel', 'fart', 'luna'].includes(what);
    if (moveCode && (busy(p) || p.state === 'hitstun')) return;
    switch (what) {
      case 'flip':
        setState(p, 'attack', 'flip');
        p.hits = [];
        break;
      case 'vault': {
        const e = nearestEnemy(g, p.x, 450, p.facing) || nearestEnemy(g, p.x, 450);
        if (e) p.facing = e.x > p.x ? 1 : -1;
        const over = e ? e.x + p.facing * (sizeOf(e).hw + 70) : p.x + p.facing * 260;
        p.vaultTo = Math.max(g.camX + 40, Math.min(g.camX + VIEW_W - 40, over));
        setState(p, 'attack', 'vault');
        p.hits = [];
        break;
      }
      case 'luna': {
        // Teleport right next to the nearest creature and kick it.
        if (near) {
          const side = near.x > p.x ? -1 : 1;
          const flies = CREATURES[near.type].flying;
          let x = near.x + side * (sizeOf(near).hw + 50);
          if (!flies && !footing(g.L, x, near.y)) x = near.x - side * (sizeOf(near).hw + 50);
          const y = flies ? surfaceBelow(g.L, x, near.y) : near.y;
          if (y < VIEW_H) {
            ev.from = { x: p.x, y: p.y };
            p.x = Math.max(g.camX + 30, Math.min(g.camX + VIEW_W - 30, x));
            p.y = y;
            p.vx = 0;
            p.vy = 0;
            p.facing = near.x > p.x ? 1 : -1;
          }
        }
        startAttack(g, p, i, 'kick');
        break;
      }
      case 'dance':
        setState(p, 'attack', 'dance');
        p.hits = [];
        break;
      case 'cartwheel':
        if (near) p.facing = near.x > p.x ? 1 : -1;
        setState(p, 'attack', 'cartwheel');
        p.hits = [];
        break;
      case 'grandpa':
        if (rand(g) < 0.5) {
          p.turbo = POWER_TICKS;
          ev.what = 'turbo';
        } else {
          startDash(g, p, 'charge');
          ev.what = 'charge';
        }
        break;
      case 'lizzie':
        startDash(g, p, 'rugby');
        break;
      case 'fart':
        if (near) p.facing = near.x > p.x ? -1 : 1; // turned round, bottom at them
        setState(p, 'attack', 'fart');
        break;
      case 'water':
        g.flood = FLOOD_TICKS;
        for (const e of enemiesOnScreen(g)) if (isBoss(e)) hurtEnemy(g, e, 20, 0, 0, i);
        break;
      case 'boat':
        if (!g.flood) return;
        p.boat = true;
        break;
      case 'swim':
        if (!g.flood) return;
        p.swim = true;
        break;
      case 'jemini':
        p.giant = POWER_TICKS;
        break;
      case 'kyle':
        p.invisible = POWER_TICKS;
        break;
      case 'shree': {
        // The giant fist, down on the three nearest creatures in turn.
        const targets = enemiesOnScreen(g).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, 3);
        if (!targets.length) targets.push({ x: p.x + p.facing * 250, id: null });
        targets.forEach((e, k) => g.fists.push({ id: g.nextId++, x: e.x, target: e.id, t: -k * 40, owner: i }));
        break;
      }
      case 'shaan':
      case 'priya':
      case 'bear': {
        const dir = near ? (near.x > p.x ? 1 : -1) : p.facing;
        p.facing = dir;
        const type = what === 'shaan' ? 'shrinkray' : what === 'priya' ? 'freezeray' : 'honey';
        const speed = what === 'bear' ? HONEY_SPEED : RAY_SPEED;
        const ty = near ? near.y - sizeOf(near).h / 2 : p.y - 60;
        const sy = p.y - 70;
        const life = what === 'bear' ? Math.round(HONEY_RANGE / HONEY_SPEED) : 80;
        g.projectiles.push({
          id: g.nextId++, type, mine: true, owner: i, x: p.x + dir * 30, y: sy,
          vx: dir * speed, vy: near ? Math.max(-4, Math.min(4, (ty - sy) / Math.max(10, Math.abs(near.x - p.x) / speed))) : 0,
          t: 0, life,
        });
        break;
      }
      case 'parimal':
        p.car = CAR_TICKS;
        p.carHits = [];
        setState(p, 'idle');
        if (near) p.facing = near.x > p.x ? 1 : -1;
        break;
      case 'daniel':
        p.spiky = POWER_TICKS;
        break;
      case 'edward':
        g.stopped = STOP_TICKS;
        break;
      case 'spreadbury':
      case 'mamtora':
        g.theme = what === 'spreadbury' ? 'usa' : 'india';
        g.themeT = POWER_TICKS;
        for (let k = 0; k < 2; k++) {
          g.snacks.push({
            id: g.nextId++, kind: what === 'spreadbury' ? 'hotdog' : 'dosa',
            x: g.camX + 120 + rand(g) * (VIEW_W - 240), y: -60, t: -(60 + Math.floor(rand(g) * 300)),
          });
        }
        break;
      case 'jay':
        p.vampire = POWER_TICKS;
        break;
      case 'leo':
        p.lion = POWER_TICKS;
        if (p.state === 'block') setState(p, 'idle');
        break;
      case 'ludo':
        p.sword = POWER_TICKS;
        break;
      case 'tony':
        p.piece = PIECES[Math.floor(rand(g) * PIECES.length)];
        p.chess = POWER_TICKS;
        p.pawnHits = 0;
        ev.piece = p.piece;
        break;
      case 'daddy':
        p.shoes = POWER_TICKS;
        break;
      case 'mummy':
        p.love = POWER_TICKS;
        p.hugged = [];
        break;
      case 'simon':
        p.moustache = true;
        break;
      case 'blake':
        p.dragon = POWER_TICKS;
        p.fireCool = 0;
        break;
      case 'briony':
        if (busy(p)) return;
        p.clown = 1;
        setState(p, 'idle');
        break;
      case 'paul':
        if (busy(p)) return;
        p.piano = 1;
        setState(p, 'idle');
        break;
      case 'super':
        if (p.superUsed) return;
        p.superUsed = true;
        p.invincible = 2; // the rest of this level and all of the next
        break;
    }
    p.stats.codes++;
    g.events.push(ev);
  }

  function startDash(g, p, kind) {
    const e = nearestEnemy(g, p.x, 900);
    p.dash = DASH_MAX;
    p.dashKind = kind;
    p.dashTarget = e ? e.id : null;
    p.facing = e ? (e.x > p.x ? 1 : -1) : p.facing;
    setState(p, 'walk');
  }

  /** Lizzie's rugby charge (a shoulder smash) or grandpa's (a kick). */
  function stepDash(g, p, i) {
    p.dash--;
    const e = g.enemies.find((q) => q.id === p.dashTarget && !q.dead);
    if (e) p.facing = e.x > p.x ? 1 : -1;
    p.vx = p.facing * DASH_SPEED;
    p.state = 'walk';
    const close = e && Math.abs(e.x - p.x) < sizeOf(e).hw + 50;
    if (close || p.dash === 0 || p.hitWall) {
      p.dash = 0;
      p.vx = 0;
      if (p.dashKind === 'rugby') {
        for (const q of g.enemies) {
          if (!q.dead && Math.abs(q.x - p.x) < sizeOf(q).hw + 90 && Math.abs(q.y - p.y) < 120) hurtEnemy(g, q, RUGBY_DAMAGE, p.facing, 16, i, true);
        }
        g.events.push({ type: 'smash', i, x: p.x + p.facing * 40, y: p.y - 60, kind: 'rugby' });
        setState(p, 'idle');
      } else {
        startAttack(g, p, i, 'kick');
      }
    }
  }

  /** Parimal's car: drives straight on, through anything in its way. */
  function stepCar(g, p, i) {
    p.car--;
    p.vx = p.facing * CAR_SPEED;
    p.state = 'idle';
    // Hops the holes.
    if (p.onGround && !footing(g.L, p.x + p.facing * 50, p.y)) { p.vy = JUMP_V; p.onGround = false; }
    for (const e of g.enemies) {
      if (e.dead || p.carHits.includes(e.id)) continue;
      const s = sizeOf(e);
      if (overlap(p.x - 50, p.y - 60, p.x + 50, p.y, e.x - s.hw, e.y - s.h, e.x + s.hw, e.y)) {
        p.carHits.push(e.id);
        hurtEnemy(g, e, CAR_DAMAGE, p.facing, 14, i, true);
        g.events.push({ type: 'honk', i });
      }
    }
    if (p.car === 0 || p.x >= g.camX + VIEW_W - PLAYER_HW - 6 || p.x <= g.camX + PLAYER_HW + 6) {
      p.car = 0;
      p.vx = 0;
      g.events.push({ type: 'carDone', i, x: p.x, y: p.y });
    }
  }

  // ---- Creatures ------------------------------------------------------------------

  const isBoss = (e) => CREATURES[e.type].kind === 'boss';

  /** Its size, shrunk by Shaan's ray. */
  function sizeOf(e) {
    const c = CREATURES[e.type];
    const k = e.shrunk > 0 ? 0.55 : 1;
    return { hw: c.hw * k, h: c.h * k };
  }

  function spawnEnemy(g, def) {
    const c = CREATURES[def.type];
    const y = def.y !== undefined ? def.y : surfaceBelow(g.L, def.x, -100);
    const e = {
      id: g.nextId++, type: def.type, x: def.x, y, vx: 0, vy: 0, onGround: !c.flying,
      facing: -1, state: c.kind === 'flyer' ? 'hover' : 'idle', t: (g.nextId * 37) % 60,
      hp: c.hp, maxHp: c.hp, hurt: 0, dead: false, ax: def.x, ay: y, cool: c.kind === 'flyer' ? 60 : 0, spiky: false, shelled: false,
      frozen: 0, asleep: 0, sticky: 0, shrunk: 0, confused: 0, cuddled: 0, burning: 0, poison: false,
    };
    g.enemies.push(e);
    return e;
  }

  function nearestPlayer(g, x, y = 0) {
    let best = null;
    let bestD = Infinity;
    g.players.forEach((p, i) => {
      if (down(p) || p.invisible > 0) return; // they can't see Kyle
      const d = Math.abs(p.x - x) + Math.abs(p.y - y) * 0.3;
      if (d < bestD) { bestD = d; best = { p, i, d }; }
    });
    return best;
  }

  const setE = (e, state) => { e.state = state; e.t = 0; };

  function walker(g, e, speed, dir) {
    // Walk, but turn at a wall or the edge of a drop.
    if (!footing(g.L, e.x + dir * (sizeOf(e).hw + 6), e.y)) dir = -dir;
    e.facing = dir;
    e.vx = speed * dir;
  }

  /** Out of it: frozen, asleep, being cuddled, or floating in a flood. */
  const helpless = (g, e) => e.frozen > 0 || e.asleep > 0 || e.cuddled > 0 || (g.flood > 0 && !CREATURES[e.type].flying && !isBoss(e));

  /** Can it hurt you just by touching you? */
  const harmful = (g, e) => !e.dead && !helpless(g, e) && e.confused <= 0 && !(e.hurt > 6 && !isBoss(e));

  function stepStatus(g, e) {
    if (e.frozen > 0) e.frozen--;
    if (e.sticky > 0) e.sticky--;
    if (e.shrunk > 0) e.shrunk--;
    if (e.confused > 0) e.confused--;
    if (e.asleep > 0) e.asleep--;
    if (e.pulled > 0) e.pulled--;
    if (e.cuddled > 0 && --e.cuddled === 0) {
      // The cuddle's over: Mummy keeps some of its health.
      const p = g.players[e.cuddledBy];
      if (p && !down(p)) p.hp = Math.min(MAX_HP, p.hp + CUDDLE_STEAL);
      hurtEnemy(g, e, CUDDLE_STEAL, 0, 0, e.cuddledBy, true);
    }
    if (e.dead) return;
    if (e.burning > 0) {
      e.burning--;
      if (e.burning % TICK_RATE === 0) hurtEnemy(g, e, 1, 0, 0, e.burnBy, true, true);
    }
    if (e.poison && !e.dead && (g.tick - e.poisonAt) % POISON_EVERY === 0) hurtEnemy(g, e, POISON_DAMAGE, 0, 0, e.poisonBy, true, true);
    if (g.flood > 0 && !CREATURES[e.type].flying && !isBoss(e) && !e.dead && g.flood % TICK_RATE === 0) {
      hurtEnemy(g, e, FLOOD_DAMAGE, 0, 0, -1, true, true);
    }
  }

  function stepEnemy(g, e) {
    const c = CREATURES[e.type];
    e.t++;
    if (e.hurt > 0) e.hurt--;
    stepStatus(g, e);
    if (e.dead) {
      if (isBoss(e)) {
        e.vx = 0;
        if (c.flying && e.y < GROUND_Y) { e.vy = Math.min(MAX_FALL, e.vy + GRAVITY); e.y = Math.min(GROUND_Y, e.y + e.vy); }
        return;
      }
      e.vy = Math.min(MAX_FALL, e.vy + GRAVITY);
      e.y += e.vy;
      e.x += e.vx;
      return;
    }
    const target = nearestPlayer(g, e.x, e.y);
    const tdx = target ? target.p.x - e.x : 0;
    const near = target && Math.abs(tdx) < 560;
    const toward = tdx >= 0 ? 1 : -1;

    if (helpless(g, e) || e.pulled > 0) {
      e.vx = 0;
      if (g.flood > 0 && !c.flying && !isBoss(e)) {
        // Bobbing about on the surface.
        e.vy = 0;
        e.y += (WATER_Y + 10 - e.y) * 0.05;
        return;
      }
      // A frozen or sleeping flyer drops to the ground; a boss just hangs there.
      if (c.flying) e.vy = !isBoss(e) && (e.frozen > 0 || e.asleep > 0) ? Math.min(6, e.vy + 0.4) : 0;
    } else if (e.hurt > 6 && !isBoss(e)) {
      // Knocked back: just fly.
      e.vx *= 0.9;
    } else if (e.confused > 0) {
      // Pie in the face: blundering about.
      e.spiky = false;
      e.shelled = false;
      if (c.flying) { e.vx = Math.sin(e.t * 0.1) * 2; e.vy = Math.cos(e.t * 0.13) * 1; } else {
        if (e.t % 50 === 0) e.facing = -e.facing;
        if (isBoss(e)) e.vx = e.facing * 1.5; else walker(g, e, 1, e.facing || 1);
      }
    } else if (c.kind === 'hopper') {
      if (e.onGround) {
        e.vx = 0;
        if (e.t >= 70) {
          e.t = 0;
          const dir = near ? toward : (e.facing || -1);
          if (footing(g.L, e.x + dir * 70, e.y)) {
            e.facing = dir;
            e.vy = -7.5;
            e.vx = dir * 2.4;
          } else {
            e.facing = -dir;
          }
        }
      }
    } else if (c.kind === 'flyer') {
      stepFlyer(g, e, target);
    } else if (c.kind === 'roller') {
      stepRoller(g, e, c, near, toward);
    } else if (c.kind === 'shooter') {
      stepShooter(g, e, c, near, toward, tdx);
    } else if (c.kind === 'boss') {
      stepBoss(g, e, target);
    }

    const k = e.sticky > 0 ? 0.5 : 1;
    if (isBoss(e) && c.flying) {
      if (e.state !== 'dizzy' && e.state !== 'dead') { e.x += e.vx * k; e.y += e.vy * k; }
      else { e.vy = Math.min(MAX_FALL, e.vy + GRAVITY); e.y = Math.min(GROUND_Y, e.y + e.vy); e.onGround = e.y >= GROUND_Y; }
    } else if (!c.flying) {
      e.vy = Math.min(MAX_FALL, e.vy + GRAVITY);
      const s = sizeOf(e);
      moveBody(g.L, e, s.hw, s.h, k);
      if (e.hitWall && c.kind === 'hopper') e.facing = -e.facing;
      if (e.y > VIEW_H + 150) {
        e.dead = true;
        e.gone = true;
        if (isBoss(e)) bossDown(g, e);
      }
    } else {
      e.x += e.vx * k;
      e.y += e.vy * k;
      if (e.vy > 0) {
        const floor = surfaceBelow(g.L, e.x, e.y - e.vy * k - 1);
        if (e.y > floor) { e.y = floor; e.vy = 0; }
      }
      if (e.y > VIEW_H + 100) { e.dead = true; e.gone = true; }
    }
  }

  function stepRoller(g, e, c, near, toward) {
    if (e.state === 'idle' || e.state === 'walk') {
      e.spiky = false;
      e.shelled = false;
      if (e.state === 'idle') setE(e, 'walk');
      walker(g, e, 1.1, near ? toward : (e.facing || -1));
      if (e.t >= 150 && near) { setE(e, 'curl'); e.facing = toward; }
    } else if (e.state === 'curl') {
      e.shelled = true;
      e.spiky = !!c.spikes;
      e.vx = 0;
      if (e.t >= 30) { setE(e, 'roll'); g.events.push({ type: 'roll', x: e.x }); }
    } else if (e.state === 'roll') {
      e.vx = e.facing * 6.5;
      if (e.hitWall) { e.facing = -e.facing; e.vx = e.facing * 6.5; }
      if (e.t >= 100) setE(e, 'uncurl');
    } else if (e.state === 'uncurl') {
      e.vx *= 0.8;
      if (e.t >= 20) { e.spiky = false; e.shelled = false; }
      if (e.t >= 40) setE(e, 'walk');
    }
  }

  function stepShooter(g, e, c, near, toward, tdx) {
    if (!e.onGround) return;
    e.vx = 0;
    if (e.state === 'spit') {
      if (e.t === 18) {
        const s = sizeOf(e);
        g.projectiles.push({ id: g.nextId++, type: c.shot, x: e.x + e.facing * (s.hw + 6), y: e.y - s.h * 0.65, vx: e.facing * SHOT_SPEED, vy: 0, t: 0, life: 150 });
        g.events.push({ type: 'spit', x: e.x, kind: c.shot });
      }
      if (e.t >= 36) setE(e, 'idle');
    } else if (e.t >= 100 && near) {
      e.facing = toward;
      if (Math.abs(tdx) < 420 && e.cool <= 0) {
        setE(e, 'spit');
        e.cool = 2;
      } else {
        e.t = 0;
        e.cool--;
        // Frogs and lizards hop; snowmen and mushrooms stay put.
        if ((e.type === 'frog' || e.type === 'lizard') && footing(g.L, e.x + toward * 90, e.y)) { e.vy = -10; e.vx = toward * 2.6; }
      }
    }
  }

  function stepFlyer(g, e, target) {
    if (e.cool > 0) e.cool--;
    if (target && Math.abs(target.p.x - e.ax) < 520) {
      // Drift along after them.
      e.ax += Math.sign(target.p.x - e.ax) * 0.6;
    }
    if (e.state === 'hover' || e.state === 'idle') {
      const tx = e.ax + Math.sin(e.t * 0.03) * 70;
      const ty = e.ay + Math.sin(e.t * 0.08) * 14;
      e.vx = (tx - e.x) * 0.08;
      e.vy = (ty - e.y) * 0.08;
      if (Math.abs(e.vx) > 0.3) e.facing = e.vx > 0 ? 1 : -1;
      if (target && e.cool <= 0 && Math.abs(target.p.x - e.x) < 300 && target.p.y > e.y) {
        setE(e, 'aim');
        e.tx = target.p.x;
        e.ty = target.p.y - 60;
      }
    } else if (e.state === 'aim') {
      // A buzz on the spot before it dives.
      e.vx = 0;
      e.vy = 0;
      e.facing = e.tx > e.x ? 1 : -1;
      if (e.t >= 24) {
        setE(e, 'dive');
        const dx = e.tx - e.x;
        const dy = e.ty - e.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        e.vx = (dx / d) * 6.5;
        e.vy = (dy / d) * 6.5;
        g.events.push({ type: 'buzz', x: e.x });
      }
    } else if (e.state === 'dive') {
      if (e.t >= 60 || e.y >= e.ty + 30 || surfaceBelow(g.L, e.x, e.y) <= e.y + 20) { setE(e, 'hover'); e.cool = 120; }
    }
  }

  // ---- The bosses -------------------------------------------------------------------

  const arenaLeft = (g, e) => g.L.arenaX + sizeOf(e).hw + 8;
  const arenaRight = (g, e) => g.L.arenaX + VIEW_W - sizeOf(e).hw - 8;

  function spawnBoss(g) {
    const type = g.L.boss;
    const n = g.players.filter((p) => !p.left).length;
    const c = CREATURES[type];
    const e = spawnEnemy(g, { type, x: g.L.arenaX + VIEW_W - 220, y: -220 });
    e.maxHp = e.hp = Math.round(c.hp * (1 + BOSS_HP_PER_EXTRA * Math.max(0, n - 1)));
    e.state = 'enter';
    e.t = 0;
    e.onGround = false;
    e.pattern = 0;
    e.angry = false;
    g.boss = e;
  }

  function fallFrom(g, kind, x) {
    // Hangs in sight at the top of the screen, shaking, before it drops.
    g.projectiles.push({ id: g.nextId++, type: kind, x, y: 26, vx: 0, vy: 0, t: 0, warn: FALL_WARN, life: 400 });
  }

  function stepBoss(g, e, target) {
    const B = BOSSES[e.type];
    const c = CREATURES[e.type];
    const toward = target ? (target.p.x >= e.x ? 1 : -1) : e.facing;
    const tx = target ? target.p.x : e.x;
    const fast = e.angry ? 1.25 : 1;
    const flyer = !!c.flying;
    const hover = (speed) => {
      // The owl: up out of reach, drifting after you.
      e.vx = Math.max(-speed, Math.min(speed, (tx - e.x) * 0.03));
      e.vy = (HOVER_Y + Math.sin(e.t * 0.06) * 18 - e.y) * 0.06;
      if (Math.abs(e.vx) > 0.2) e.facing = e.vx > 0 ? 1 : -1;
    };
    switch (e.state) {
      case 'enter':
        e.vx = 0;
        if (flyer) {
          e.vy = Math.max(2, (HOVER_Y - e.y) * 0.05);
          if (e.y >= HOVER_Y - 5) { e.vy = 0; setE(e, 'roar'); g.events.push({ type: 'quake', x: e.x, big: false }); }
        } else if (e.onGround && e.t > 1) {
          g.events.push({ type: 'quake', x: e.x, big: true });
          setE(e, 'roar');
        }
        break;
      case 'roar':
        e.vx = 0;
        if (flyer) hover(0.5);
        if (e.t === 10) g.events.push({ type: 'roar', kind: e.type });
        if (e.t >= 70) setE(e, 'idle');
        break;
      case 'idle':
        if (flyer) hover(3 * fast);
        else {
          e.facing = toward;
          e.vx = toward * 1.2 * fast;
        }
        if (e.t >= (e.angry ? 40 : 70) && g.phase === 'boss') {
          let next = B.pattern[e.pattern++ % B.pattern.length];
          if (B.angryOnly.includes(next) && !e.angry) next = 'stomp';
          setE(e, next === 'charge' ? 'windup' : next);
          e.stomps = e.angry ? 2 : 1;
        }
        break;
      case 'windup':
        // Pawing the ground, head down.
        e.facing = toward;
        e.vx = 0;
        if (e.t % 15 === 0) g.events.push({ type: 'paw', x: e.x });
        if (e.t >= 50 / fast) { setE(e, 'charge'); g.events.push({ type: 'charge', kind: e.type }); }
        break;
      case 'charge':
        e.vx = e.facing * 9 * fast;
        if ((e.facing > 0 && e.x >= arenaRight(g, e)) || (e.facing < 0 && e.x <= arenaLeft(g, e)) || e.t > 200) {
          e.x = Math.max(arenaLeft(g, e), Math.min(arenaRight(g, e), e.x));
          e.vx = -e.facing * 3;
          e.vy = -6;
          setE(e, 'dizzy');
          g.events.push({ type: 'quake', x: e.x + e.facing * 70, crash: true });
        }
        break;
      case 'dizzy':
        if (e.onGround || flyer) e.vx *= 0.85;
        if (e.t >= (e.angry ? 120 : 160)) {
          setE(e, flyer ? 'rise' : 'idle');
        }
        break;
      case 'rise':
        // The owl, back up into the air.
        e.vx = 0;
        e.vy = -4;
        if (e.y <= HOVER_Y) setE(e, 'idle');
        break;
      case 'stomp':
      case 'leap':
        if (e.t === 1) {
          e.facing = toward;
          if (e.state === 'leap') {
            e.vy = -17;
            const flight = (2 * 17) / GRAVITY;
            const land = Math.max(arenaLeft(g, e), Math.min(arenaRight(g, e), tx));
            e.vx = (land - e.x) / flight;
          } else {
            e.vy = -15;
            e.vx = toward * 2;
          }
        }
        if (e.t > 5 && e.onGround) {
          e.vx = 0;
          for (const dir of [-1, 1]) {
            g.projectiles.push({ id: g.nextId++, type: 'wave', x: e.x + dir * 60, y: e.y, vx: dir * WAVE_SPEED * fast, vy: 0, t: 0, life: 300 });
          }
          if (B.fall && e.angry && e.state === 'stomp') {
            for (let k = 0; k < 4; k++) fallFrom(g, B.fall, g.L.arenaX + 120 + rand(g) * (VIEW_W - 240));
          }
          g.events.push({ type: 'quake', x: e.x });
          e.stomps--;
          const again = e.stomps > 0;
          setE(e, again ? e.state : 'idle');
          if (again) e.t = -20;
        }
        break;
      case 'throw':
        e.vx = 0;
        e.facing = toward;
        if (e.t > 0 && e.t % 30 === 0 && e.t <= 90) {
          const tg = nearestPlayer(g, e.x + toward * 400) || target;
          const aim = tg ? tg.p.x : e.x + toward * 300;
          const flight = 60;
          const sx = e.x + toward * 50;
          const sy = e.y - 150;
          g.projectiles.push({
            id: g.nextId++, type: B.rock || 'boulder', x: sx, y: sy, gravity: ROCK_GRAVITY, life: 300,
            vx: (aim - sx) / flight, vy: (GROUND_Y - 20 - sy) / flight - 0.5 * ROCK_GRAVITY * flight, t: 0,
          });
          g.events.push({ type: 'throw' });
        }
        if (e.t >= 120) setE(e, 'idle');
        break;
      case 'roll':
        // Frostbite bowls a giant snowball along the ground: jump it.
        e.vx = 0;
        e.facing = toward;
        if (e.t === 30 || (e.angry && e.t === 80)) {
          g.projectiles.push({ id: g.nextId++, type: 'snowroll', x: e.x + toward * 80, y: GROUND_Y, vx: toward * 6.5 * fast, vy: 0, t: 0, life: 300 });
          g.events.push({ type: 'throw' });
        }
        if (e.t >= (e.angry ? 120 : 80)) setE(e, 'idle');
        break;
      case 'beat':
        // The Silverback beats his chest, and rocks come down.
        e.vx = 0;
        e.facing = toward;
        if (e.t % 12 === 0) g.events.push({ type: 'paw', x: e.x });
        if (e.t === 50) g.events.push({ type: 'roar', kind: e.type });
        if (e.t >= 60) setE(e, 'rain');
        break;
      case 'rain':
        if (flyer) hover(1.5);
        else e.vx = 0;
        if (e.t === 1) {
          const n = e.angry ? 7 : 5;
          const gap = (VIEW_W - 160) / n;
          const off = rand(g) * gap;
          for (let k = 0; k < n; k++) fallFrom(g, B.fall || 'rock', g.L.arenaX + 80 + off + k * gap);
          // And one right over whoever's nearest.
          if (target) fallFrom(g, B.fall || 'rock', target.p.x);
          g.events.push({ type: 'flap', kind: e.type });
        }
        if (e.t >= 90) setE(e, 'idle');
        break;
      case 'swoop':
        // Count Hoot: up over you, then a dive. Miss, and he's stuck in the
        // ground, dazed.
        if (e.t < 50) {
          e.vx = Math.max(-6, Math.min(6, (tx - e.x) * 0.1));
          e.vy = (HOVER_Y - 40 - e.y) * 0.1;
          e.facing = toward;
          e.diveX = tx;
        } else {
          const dx = e.diveX - e.x;
          e.vx = Math.max(-8, Math.min(8, dx * 0.08)) * fast;
          e.vy = 11 * fast;
          if (e.y >= GROUND_Y) {
            e.y = GROUND_Y;
            e.vx = 0;
            e.vy = 0;
            setE(e, 'dizzy');
            g.events.push({ type: 'quake', x: e.x, crash: true });
          }
        }
        if (e.state === 'swoop' && e.t === 50) g.events.push({ type: 'screech' });
        break;
      case 'dead':
        break;
    }
    if (e.state !== 'enter') {
      if (e.x < arenaLeft(g, e)) e.x = arenaLeft(g, e);
      if (e.x > arenaRight(g, e)) e.x = arenaRight(g, e);
    }
  }

  // ---- Hits -------------------------------------------------------------------

  /**
   * Hurts a creature. `quiet` is damage that isn't a blow (poison, fire,
   * water): it doesn't wake or knock anything about.
   */
  function hurtEnemy(g, e, damage, dir, knock, byIndex, unstoppable = false, quiet = false) {
    if (e.dead) return;
    const p = g.players[byIndex];
    if (e.shelled && !unstoppable) {
      g.events.push({ type: 'clink', x: e.x, y: e.y - 20, spiky: e.spiky });
      return;
    }
    const boss = isBoss(e);
    if (boss && (e.state === 'enter' || e.state === 'roar')) return;
    if (boss && e.state === 'dizzy') damage = Math.round(damage * 1.5);
    if (e.shrunk > 0) damage = Math.round(damage * 1.5);
    damage = Math.max(1, damage);
    e.hp -= damage;
    if (!quiet) {
      e.hurt = 14;
      e.asleep = 0;
    }
    if (p) p.stats.damage += damage;
    const s = sizeOf(e);
    g.events.push({ type: 'hit', x: e.x, y: e.y - s.h / 2, damage, big: damage >= 15, quiet });
    if (!boss && !quiet && !e.frozen && !e.cuddled) {
      e.vx = dir * knock * 0.8;
      if (!CREATURES[e.type].flying) { e.vy = -3; e.onGround = false; } else e.vy = -1;
      if (CREATURES[e.type].kind === 'flyer') { setE(e, 'hover'); e.cool = 90; }
    }
    if (boss && !e.angry && e.hp <= e.maxHp / 2) {
      e.angry = true;
      g.events.push({ type: 'angry', kind: e.type });
    }
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
      e.state = 'dead';
      e.t = 0;
      g.score += CREATURES[e.type].score;
      if (p) p.stats.kos++;
      g.events.push({ type: 'down', x: e.x, y: e.y, kind: e.type, score: CREATURES[e.type].score });
      if (boss) bossDown(g, e);
      else {
        e.vy = -7;
        e.vx = (dir || 1) * 3;
        if (++g.kills % DROP_EVERY === 0) {
          g.extra.push({ id: `d${g.nextId++}`, type: 'heart', x: e.x, y: Math.min(e.y - 20, GROUND_Y - 30) });
        }
      }
    }
  }

  function bossDown(g, e) {
    e.vx = 0;
    e.state = 'dead';
    g.projectiles = [];
    g.fists = [];
    if (g.level >= LEVELS.length - 1) {
      g.phase = 'won';
      g.won = true;
      g.events.push({ type: 'victory' });
    } else {
      g.phase = 'cleared';
      g.events.push({ type: 'cleared', level: g.level });
    }
    g.phaseT = 0;
  }

  /** A player's blow landing on a creature, with whatever they've turned into. */
  function playerHits(g, p, i, e, box) {
    let damage = box.damage;
    const m = box.move;
    if (p.moustache && p.move === 'punch') {
      const r = rand(g);
      if (r < MOUSTACHE_KO) {
        damage = isBoss(e) ? damage + 40 : 999;
        g.events.push({ type: 'moustache', i, x: e.x, y: e.y - 40 });
      } else if (r < MOUSTACHE_KO + MOUSTACHE_NAP) {
        p.nap = NAP_TICKS;
        g.events.push({ type: 'nap', i });
      }
    }
    const before = e.hp;
    // The knight leaps a shell; fire goes straight through one.
    const unstoppable = p.piece === 'knight' || m.burn;
    hurtEnemy(g, e, damage, p.facing, m.knock * (p.giant > 0 ? 1.4 : 1), i, unstoppable);
    const dealt = Math.max(0, before - Math.max(0, e.hp));
    if (!dealt) return;
    if (m.burn) { e.burning = BURN_TICKS; e.burnBy = i; }
    if (p.vampire > 0) p.hp = Math.min(MAX_HP, p.hp + dealt);
    if (p.piece === 'bishop') p.hp = Math.min(MAX_HP, p.hp + BISHOP_HEAL);
    if (p.piece === 'pawn' && ++p.pawnHits >= PAWN_PROMOTES) {
      p.piece = 'queen';
      g.events.push({ type: 'promote', i });
    }
  }

  function interact(g) {
    g.players.forEach((p, i) => {
      if (down(p)) return;
      const box = attackBox(p);
      const px0 = p.x - PLAYER_HW;
      const px1 = p.x + PLAYER_HW;
      const py0 = p.y - PLAYER_H;
      const stopped = g.stopped > 0;

      for (const e of g.enemies) {
        if (e.dead) continue;
        const c = CREATURES[e.type];
        const s = sizeOf(e);
        const ex0 = e.x - s.hw;
        const ex1 = e.x + s.hw;
        const ey0 = e.y - s.h;
        // My punch or kick.
        if (box && !p.hits.includes(e.id) && overlap(box.x0, box.y0, box.x1, box.y1, ex0, ey0, ex1, e.y)) {
          p.hits.push(e.id);
          playerHits(g, p, i, e, box);
          if (e.dead) continue;
        }
        if (p.invisible > 0 || p.car > 0 || flying(p)) continue; // walks (drives, flips) right through
        if (!overlap(px0, py0, px1, p.y, ex0, ey0, ex1, e.y)) continue;
        // Landing on its head.
        const stomp = p.vy > 0 && p.prevY !== undefined && p.prevY <= ey0 + 14;
        if (stomp) {
          if (e.spiky && !stopped && !e.frozen) {
            hurtPlayer(g, p, i, c.damage, p.x < e.x ? -1 : 1, 6, true);
            p.vy = STOMP_BOUNCE;
            continue;
          }
          p.vy = p.held.jump ? JUMP_V * 0.9 : STOMP_BOUNCE;
          p.jumping = p.held.jump;
          p.y = ey0;
          g.events.push({ type: 'stomp', i, x: e.x, y: ey0 });
          if (!e.shelled) hurtEnemy(g, e, isBoss(e) ? 8 : STOMP_DAMAGE, p.x < e.x ? 1 : -1, 2, i);
          continue;
        }
        // Bumping into it.
        if (stopped || !harmful(g, e)) continue;
        if (isBoss(e) && (e.state === 'dizzy' || e.state === 'enter' || e.state === 'rise')) continue;
        const dir = p.x < e.x ? -1 : 1;
        const charging = isBoss(e) && (e.state === 'charge' || e.state === 'swoop');
        const rolling = c.kind === 'roller' && e.state === 'roll';
        let damage = charging ? CHARGE_DAMAGE : c.damage;
        if (e.shrunk > 0) damage = Math.ceil(damage / 2);
        if (p.spiky > 0) {
          // Daniel's spikes: it gets most of it back.
          if (p.invuln > 0) continue;
          hurtEnemy(g, e, Math.ceil(damage * (1 - SPIKY_KEEP)), -dir, 8, i, true);
          damage = Math.ceil(damage * SPIKY_KEEP);
        }
        hurtPlayer(g, p, i, damage, dir, charging ? 14 : rolling ? 10 : 7, charging);
      }

      // Things flying at you.
      for (const pr of g.projectiles) {
        if (pr.gone || pr.mine || pr.warn > 0) continue;
        if (stopped) continue;
        if (pr.type === 'wave' || pr.type === 'snowroll') {
          // Along the ground: only hits feet on the ground near it.
          const r = pr.type === 'snowroll' ? 34 : 24;
          if (Math.abs(pr.x - p.x) < r + PLAYER_HW && p.y > pr.y - (pr.type === 'snowroll' ? 50 : 30)) {
            if (hurtPlayer(g, p, i, pr.type === 'snowroll' ? SNOWROLL_DAMAGE : WAVE_DAMAGE, pr.vx > 0 ? 1 : -1, 8, true)) p.vy = -9;
          }
          continue;
        }
        const r = ['boulder', 'lavarock'].includes(pr.type) ? 26 : ['icicle', 'rock'].includes(pr.type) ? 18 : 14;
        if (box && overlap(box.x0, box.y0, box.x1, box.y1, pr.x - r, pr.y - r, pr.x + r, pr.y + r)) {
          // Punched out of the air.
          pr.gone = true;
          g.events.push({ type: 'smash', x: pr.x, y: pr.y, kind: pr.type });
          continue;
        }
        if (overlap(px0, py0, px1, p.y, pr.x - r, pr.y - r, pr.x + r, pr.y + r)) {
          const dir = pr.vx > 0 ? 1 : pr.vx < 0 ? -1 : (p.x < pr.x ? -1 : 1);
          const fall = ['feather', 'icicle', 'rock'].includes(pr.type);
          const damage = ['boulder', 'lavarock'].includes(pr.type) ? BOULDER_DAMAGE : fall ? FALL_DAMAGE : SHOT_DAMAGE;
          if (hurtPlayer(g, p, i, damage, dir, 8, fall)) {
            pr.gone = true;
            g.events.push({ type: 'smash', x: pr.x, y: pr.y, kind: pr.type });
          }
        }
      }

      // Coins, hearts and extra lives.
      const grab = (pk) => overlap(px0, py0, px1, p.y, pk.x - 16, pk.y - 16, pk.x + 16, pk.y + 16);
      for (const pk of g.L.pickups) {
        if (g.taken.includes(pk.id) || !grab(pk)) continue;
        g.taken.push(pk.id);
        collect(g, p, i, pk);
      }
      g.extra = g.extra.filter((pk) => {
        if (!grab(pk)) return true;
        collect(g, p, i, pk);
        return false;
      });
      // Hotdogs and dosas: catch them on the way down.
      for (const sn of g.snacks) {
        if (sn.caught || sn.t < 0 || sn.splat) continue;
        if (overlap(px0 - 10, py0 - 20, px1 + 10, p.y, sn.x - 20, sn.y - 14, sn.x + 20, sn.y + 14)) {
          sn.caught = true;
          p.hp = Math.min(MAX_HP, p.hp + SNACK_HEAL);
          g.events.push({ type: 'snack', i, x: sn.x, y: sn.y, kind: sn.kind });
        }
      }
    });
  }

  function collect(g, p, i, pk) {
    if (pk.type === 'coin') {
      g.score += COIN_SCORE;
      p.stats.coins++;
    } else if (pk.type === 'heart') {
      p.hp = Math.min(MAX_HP, p.hp + HEART_HEAL);
    } else if (pk.type === 'life') {
      g.lives++;
      // Anyone already out comes straight back in with it.
      const q = g.players.find((o) => o.out && !o.left);
      if (q) {
        q.out = false;
        setState(q, 'ko');
        q.t = KO_TICKS - 1;
      }
    }
    g.events.push({ type: 'pickup', i, kind: pk.type, x: pk.x, y: pk.y });
  }

  /** The players' own shots: clouds, rays, honey and pies. */
  function myShotHits(g, pr) {
    const r = pr.type === 'cloud' ? 40 : 16;
    for (const e of g.enemies) {
      if (e.dead || e.state === 'enter') continue;
      const s = sizeOf(e);
      if (!overlap(pr.x - r, pr.y - r, pr.x + r, pr.y + r, e.x - s.hw, e.y - s.h, e.x + s.hw, e.y)) continue;
      if (pr.type === 'cloud') {
        if (pr.hit.includes(e.id)) continue;
        pr.hit.push(e.id);
        if (!e.poison) { e.poison = true; e.poisonAt = g.tick + 1; e.poisonBy = pr.owner; }
        g.events.push({ type: 'poisoned', x: e.x, y: e.y - s.h });
        continue;
      }
      pr.gone = true;
      if (pr.type === 'shrinkray') { e.shrunk = SHRINK_TICKS; g.events.push({ type: 'shrunk', x: e.x, y: e.y }); }
      if (pr.type === 'freezeray') { e.frozen = isBoss(e) ? FREEZE_TICKS / 2 : FREEZE_TICKS; e.vx = 0; g.events.push({ type: 'frozen', x: e.x, y: e.y }); }
      if (pr.type === 'honey') { e.sticky = STICKY_TICKS; g.events.push({ type: 'sticky', x: e.x, y: e.y }); }
      if (pr.type === 'pie') {
        hurtEnemy(g, e, PIE_DAMAGE, Math.sign(pr.vx) || 1, 3, pr.owner, true);
        e.confused = isBoss(e) ? CONFUSED_TICKS / 2 : CONFUSED_TICKS;
        e.pieFlavour = (e.id % 2) ? 'blueberry' : 'raspberry';
        g.events.push({ type: 'pieSplat', x: pr.x, y: pr.y });
      }
      return;
    }
  }

  function stepProjectiles(g) {
    const frozenWorld = g.stopped > 0;
    for (const pr of g.projectiles) {
      if (frozenWorld && !pr.mine) continue;
      pr.t++;
      if (pr.warn > 0) {
        // Hanging up there, shaking, before it drops.
        if (--pr.warn === 0) pr.vy = 2;
        continue;
      }
      if (pr.gravity) pr.vy += pr.gravity;
      if (['feather', 'icicle', 'rock'].includes(pr.type)) pr.vy = Math.min(pr.type === 'feather' ? 6 : 12, pr.vy + 0.5);
      pr.x += pr.vx;
      pr.y += pr.vy;
      if (pr.vy > 0 && !['wave', 'snowroll'].includes(pr.type) && !pr.mine) {
        const floor = surfaceBelow(g.L, pr.x, pr.y - pr.vy - 20);
        if (pr.y + 14 >= floor) {
          pr.gone = true;
          g.events.push({ type: 'smash', x: pr.x, y: floor - 10, kind: pr.type });
        }
      }
      if (pr.mine) myShotHits(g, pr);
      if (pr.life && pr.t > pr.life) pr.gone = true;
      if (pr.x < g.camX - 100 || pr.x > g.camX + VIEW_W + 100 || pr.y > VIEW_H + 100) pr.gone = true;
    }
    g.projectiles = g.projectiles.filter((pr) => !pr.gone);
  }

  /** Shree's giant fists, and the snacks floating down. */
  function stepFistsAndSnacks(g) {
    for (const f of g.fists) {
      f.t++;
      const e = f.target && g.enemies.find((q) => q.id === f.target && !q.dead);
      if (e && f.t < FIST_WARN - 10) f.x += Math.sign(e.x - f.x) * Math.min(6, Math.abs(e.x - f.x));
      if (f.t === FIST_WARN) {
        for (const q of g.enemies) {
          if (!q.dead && Math.abs(q.x - f.x) < FIST_RADIUS + sizeOf(q).hw) hurtEnemy(g, q, FIST_DAMAGE, 0, 0, f.owner, true);
        }
        g.events.push({ type: 'fist', x: f.x });
      }
    }
    g.fists = g.fists.filter((f) => f.t < FIST_WARN + 25);
    for (const sn of g.snacks) {
      sn.t++;
      if (sn.t <= 0 || sn.caught || sn.splat) continue;
      sn.y += SNACK_FALL;
      const floor = surfaceBelow(g.L, sn.x, sn.y);
      if (sn.y >= floor - 8) {
        sn.splat = true;
        sn.y = floor - 4;
        g.events.push({ type: 'splat', x: sn.x, y: sn.y, kind: sn.kind });
      }
    }
    for (const sn of g.snacks) if (sn.splat) sn.splatT = (sn.splatT || 0) + 1;
    g.snacks = g.snacks.filter((sn) => !sn.caught && !(sn.splatT > 90));
  }

  // ---- The camera ------------------------------------------------------------

  function updateCamera(g) {
    if (g.boss) { g.camX = g.L.arenaX; return; }
    const alive = g.players.filter((p) => !down(p) && p.y > 0);
    if (!alive.length) return;
    const xs = alive.map((p) => p.x);
    const want = Math.min(Math.max(...xs) - VIEW_W * 0.45, Math.min(...xs) - 60);
    g.camX = Math.max(0, Math.min(g.L.arenaX, Math.max(g.camX, want)));
    if (g.camX >= g.L.arenaX && g.phase === 'run') {
      g.phase = 'bossIntro';
      g.phaseT = 0;
      // The little ones clear off.
      g.enemies = [];
      g.projectiles = g.projectiles.filter((pr) => pr.mine);
      spawnBoss(g);
      const B = BOSSES[g.L.boss];
      g.events.push({ type: 'boss', name: B.name, title: B.title, kind: g.L.boss });
    }
  }

  function spawnAhead(g) {
    const spawns = g.L.spawns;
    while (g.nextSpawn < spawns.length && spawns[g.nextSpawn].x < g.camX + VIEW_W + 80) {
      spawnEnemy(g, spawns[g.nextSpawn++]);
    }
    g.enemies = g.enemies.filter((e) => {
      if (isBoss(e)) return true;
      if (e.gone) return false;
      if (e.dead && (e.t > 50 || e.y > VIEW_H + 100)) return false;
      return e.x > g.camX - 250;
    });
  }

  // ---- The tick --------------------------------------------------------------

  function step(g) {
    if (g.over) return;
    g.tick++;
    g.phaseT++;
    if (g.phase === 'ready' && g.phaseT >= READY_TICKS) {
      g.phase = 'run';
      g.phaseT = 0;
      g.events.push({ type: 'go', level: g.level, name: g.L.name });
    }
    if (g.phase === 'bossIntro' && g.phaseT >= BOSS_INTRO_TICKS) {
      g.phase = 'boss';
      g.phaseT = 0;
    }
    if (g.phase === 'cleared' && g.phaseT >= CLEARED_TICKS) {
      for (const p of g.players) if (p.invincible > 0) p.invincible--;
      loadLevel(g, g.level + 1);
      g.events.push({ type: 'level', level: g.level, name: g.L.name });
      return;
    }
    if ((g.phase === 'won' || g.phase === 'lost') && g.phaseT >= END_TICKS) {
      g.over = true;
      return;
    }
    if (g.themeT > 0 && --g.themeT === 0) { g.theme = null; g.snacks = []; }
    if (g.flood > 0) g.flood--;
    const stopped = g.stopped > 0;
    if (stopped) g.stopped--;
    g.players.forEach((p, i) => stepPlayer(g, p, i));
    if (g.phase !== 'ready' && g.phase !== 'lost') {
      if (!stopped) for (const e of g.enemies) stepEnemy(g, e);
      else for (const e of g.enemies) if (e.dead) stepEnemy(g, e);
      if (g.phase !== 'won' && g.phase !== 'cleared') stepProjectiles(g);
      stepFistsAndSnacks(g);
    }
    if (g.phase === 'run' || g.phase === 'boss' || g.phase === 'bossIntro') interact(g);
    updateCamera(g);
    spawnAhead(g);
  }

  // ---- What goes over the wire -------------------------------------------------

  const r1 = (v) => Math.round(v * 10) / 10;

  function snapshot(g) {
    const near = (x) => x > g.camX - 120 && x < g.camX + VIEW_W + 120;
    return {
      mode: 'adventure',
      level: g.level,
      phase: g.phase,
      phaseT: g.phaseT,
      camX: r1(g.camX),
      lives: g.lives,
      score: g.score,
      theme: g.theme,
      flood: g.flood,
      stopped: g.stopped,
      players: g.players.map((p) => ({
        name: p.name, x: r1(p.x), y: r1(p.y), vy: r1(p.vy), facing: p.facing, state: p.state, move: p.move, t: p.t,
        hp: Math.max(0, p.hp), invuln: p.invuln, onGround: p.onGround, out: p.out, left: p.left, fell: p.fell,
        typing: p.typing, giant: p.giant, invisible: p.invisible, turbo: p.turbo, shoes: p.shoes, spiky: p.spiky,
        vampire: p.vampire, lion: p.lion, sword: p.sword, piece: p.piece, chess: p.chess, dragon: p.dragon,
        love: p.love, hug: p.hugging > 0, moustache: p.moustache, nap: p.nap, invincible: p.invincible,
        dash: p.dash, dashKind: p.dashKind, car: p.car, clown: p.clown, piano: p.piano, boat: p.boat, swim: p.swim,
        stats: p.stats,
      })),
      enemies: g.enemies.map((e) => ({
        id: e.id, type: e.type, x: r1(e.x), y: r1(e.y), facing: e.facing, state: e.state, t: e.t,
        hp: e.hp, maxHp: e.maxHp, hurt: e.hurt, dead: e.dead, spiky: e.spiky, shelled: e.shelled, angry: !!e.angry,
        frozen: e.frozen, asleep: e.asleep > 0, sticky: e.sticky, shrunk: e.shrunk, confused: e.confused,
        cuddled: e.cuddled, burning: e.burning, poison: e.poison, pie: e.pieFlavour,
      })),
      projectiles: g.projectiles.map((pr) => ({ id: pr.id, type: pr.type, x: r1(pr.x), y: r1(pr.y), t: pr.t, warn: pr.warn || 0, dir: Math.sign(pr.vx) })),
      pickups: g.L.pickups.filter((pk) => near(pk.x) && !g.taken.includes(pk.id)).map((pk) => pk.id),
      extra: g.extra.filter((pk) => near(pk.x)),
      fists: g.fists.map((f) => ({ id: f.id, x: r1(f.x), t: f.t })),
      snacks: g.snacks.filter((sn) => sn.t > 0).map((sn) => ({ id: sn.id, kind: sn.kind, x: r1(sn.x), y: r1(sn.y), splat: !!sn.splat })),
      boss: g.boss ? { name: BOSSES[g.boss.type].name, hp: g.boss.hp, maxHp: g.boss.maxHp } : null,
    };
  }

  const api = {
    TICK_RATE, VIEW_W, VIEW_H, GROUND_Y, GRAVITY, WALK, JUMP_V, MAX_HP, LIVES_EACH, WATER_Y,
    PLAYER_HW, PLAYER_H, MOVES, CREATURES, BOSSES, LEVELS, LEVEL_END,
    KO_TICKS, READY_TICKS, BOSS_INTRO_TICKS, CLEARED_TICKS, END_TICKS, HEART_HEAL, COIN_SCORE, STOMP_DAMAGE,
    CHARGE_DAMAGE, WAVE_DAMAGE, BOULDER_DAMAGE, SHOT_DAMAGE, BLOCK_SHARE, DROP_EVERY,
    CODES, POWER_TICKS, FIST_WARN, FIST_DAMAGE, CAR_DAMAGE, RUGBY_DAMAGE, FREEZE_TICKS, PIANO_TICKS, JUGGLE_TICKS,
    SNACK_HEAL, CUDDLE_STEAL, LOVE_RADIUS, PIE_DAMAGE, POISON_DAMAGE, POISON_EVERY, STOP_TICKS, FLOOD_TICKS, CHESS, PIECES,
    createGame, loadLevel, step, setHeld, pressAction, typeKey, cheat, removePlayer, snapshot, surfaceBelow,
    spawnEnemy, spawnBoss, hurtEnemy, hurtPlayer, attackBox, sizeOf,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoxerAdventure = api;
})(typeof self !== 'undefined' ? self : this);
