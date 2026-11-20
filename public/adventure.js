// Adventure mode: a side-scrolling platformer. You are the boxer; the
// enemies are creatures (slimes, bees, hedgehogs, frogs) and at the end of
// the level there's a boss, Big Horn the rhino. One to four play together,
// co-op. Like game.js it runs authoritatively on the server, and the client
// loads it too for the level layout and the constants it draws with.
//
// The world is in pixels, y downward, the same as the canvas: the camera
// shows VIEW_W x VIEW_H of it and only ever scrolls forward. Everyone has to
// stay on screen: the camera follows whoever is out in front, but never
// leaves anyone behind, and at the end it locks on the boss's arena.
//
// Punch (quick, chest height) and kick (slower, further, low enough for the
// little ones) hit whatever is in front of you; jump on most creatures'
// heads to squash them, but not on a hedgehog curled up in a spiky ball.
// Hold block to soak up most of a hit from the front (shockwaves go under a
// guard: jump them). The team shares a pool of lives; fall down a pit or run
// out of health and you lose one, and drop back in a moment later. When the
// last one is gone, it's game over.

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
  const END_TICKS = 150;
  const DROP_EVERY = 6; // every sixth creature down drops a heart

  // Frame data, in ticks. Reach is from your middle; top and bottom are
  // heights above your feet.
  const MOVES = {
    punch: { startup: 5, active: 4, recovery: 9, reach: 74, top: 100, bottom: 6, damage: 10, knock: 5 },
    kick: { startup: 10, active: 5, recovery: 15, reach: 96, top: 72, bottom: 4, damage: 16, knock: 10 },
  };

  const CREATURES = {
    slime: { hw: 22, h: 30, hp: 20, damage: 8, score: 100 },
    bee: { hw: 18, h: 26, hp: 12, damage: 8, score: 120, flying: true },
    hedgehog: { hw: 24, h: 30, hp: 30, damage: 10, score: 200 },
    frog: { hw: 24, h: 34, hp: 24, damage: 8, score: 150 },
    rhino: { hw: 70, h: 150, hp: 260, damage: 10, score: 5000 },
  };
  const BOSS_HP_PER_EXTRA = 140; // more players, a tougher rhino
  const BOSS_NAME = 'Big Horn';
  const CHARGE_DAMAGE = 16;
  const WAVE_DAMAGE = 12;
  const WAVE_SPEED = 6.5;
  const BOULDER_DAMAGE = 14;
  const BOULDER_GRAVITY = 0.35;
  const BUBBLE_DAMAGE = 8;
  const BUBBLE_SPEED = 5;

  // ---- The level --------------------------------------------------------------
  //
  // Solids are blocks of ground (from their top all the way down); platforms
  // can be jumped up through and stood on. Gaps in the ground are pits.

  const LEVEL_END = 7200;
  const ARENA_X = LEVEL_END - VIEW_W; // the camera locks here for the boss

  function buildLevel() {
    const solids = [];
    const platforms = [];
    const spawns = [];
    const pickups = [];
    const ground = (x0, x1, y = GROUND_Y) => solids.push({ x: x0, y, w: x1 - x0, h: VIEW_H + 300 - y });
    const plat = (x, y, w) => platforms.push({ x, y, w });
    const coins = (x, y, n, gap = 40) => { for (let k = 0; k < n; k++) pickups.push({ type: 'coin', x: x + k * gap, y }); };
    const coinArc = (x, y, n) => {
      for (let k = 0; k < n; k++) {
        const u = n > 1 ? k / (n - 1) : 0.5;
        pickups.push({ type: 'coin', x: x + k * 36, y: y - Math.sin(u * Math.PI) * 70 });
      }
    };
    const enemy = (type, x, y) => spawns.push({ type, x, y });

    // 1. The meadow.
    ground(-200, 1400);
    plat(480, 380, 170);
    plat(780, 320, 150);
    coins(250, 440, 4);
    coins(505, 340, 4);
    coins(800, 280, 3);
    enemy('slime', 760);
    enemy('slime', 1060);
    enemy('slime', 1300);

    // 2. A first pit, and a step up.
    coinArc(1390, 400, 5);
    ground(1520, 2000);
    ground(2000, 2420, 426);
    enemy('bee', 1760, 300);
    enemy('hedgehog', 1900);
    enemy('frog', 2280);
    coins(2060, 386, 5);

    // 3. A pit with a stepping stone, then the floating platforms.
    plat(2475, 420, 90);
    coins(2490, 380, 2);
    ground(2600, 3600);
    plat(2800, 370, 160);
    plat(3050, 290, 160);
    plat(3300, 370, 160);
    coins(2820, 330, 4);
    coins(3330, 330, 4);
    pickups.push({ type: 'heart', x: 3130, y: 250 });
    enemy('slime', 2760);
    enemy('slime', 2960);
    enemy('bee', 3150, 200);
    enemy('hedgehog', 3420);

    // 4. Frog pond.
    coinArc(3590, 400, 5);
    ground(3740, 4800);
    plat(3990, 380, 130);
    plat(4400, 360, 150);
    plat(4620, 250, 110);
    pickups.push({ type: 'life', x: 4675, y: 205 });
    coins(4420, 320, 4);
    enemy('frog', 3980);
    enemy('bee', 4120, 280);
    enemy('frog', 4340);
    enemy('bee', 4520, 240);
    enemy('hedgehog', 4660);
    enemy('slime', 4760);

    // 5. Up the steps to the arena.
    coinArc(4795, 410, 4);
    ground(4900, 5300);
    ground(5300, 5500, 426);
    ground(5500, 5700, 366);
    ground(5700, 5900, 426);
    ground(5900, LEVEL_END + 200);
    coins(5530, 326, 4);
    enemy('hedgehog', 5120);
    enemy('slime', 5240);
    enemy('frog', 5620);
    enemy('bee', 5820, 260);
    enemy('slime', 6020);
    enemy('hedgehog', 6150);
    pickups.push({ type: 'heart', x: 6100, y: 430 });

    spawns.sort((a, b) => a.x - b.x);
    pickups.forEach((p, k) => { p.id = k; });
    return { solids, platforms, spawns, pickups, end: LEVEL_END, arenaX: ARENA_X };
  }

  const LEVEL = buildLevel();

  // ---- Bodies and the ground --------------------------------------------------

  const spans = (s, x0, x1) => x1 > s.x && x0 < s.x + s.w;

  /** The top of the ground (or platform) right under x, at or below y. */
  function surfaceBelow(x, y) {
    let best = Infinity;
    for (const s of LEVEL.solids) if (x >= s.x && x <= s.x + s.w && s.y >= y - 1 && s.y < best) best = s.y;
    for (const p of LEVEL.platforms) if (x >= p.x && x <= p.x + p.w && p.y >= y - 1 && p.y < best) best = p.y;
    return best;
  }

  /** Is there something to stand on at x, no more than a step down from y? */
  function footing(x, y) {
    return surfaceBelow(x, y) <= y + 70;
  }

  /**
   * Moves a body (x is its middle, y its feet) by its speed, stopping it at
   * walls and landing it on ground and platforms.
   */
  function moveBody(b, hw, h) {
    b.hitWall = 0;
    b.x += b.vx;
    for (const s of LEVEL.solids) {
      if (b.y > s.y + 0.5 && b.y - h < s.y + s.h && spans(s, b.x - hw, b.x + hw)) {
        if (b.x < s.x + s.w / 2) { b.x = s.x - hw; b.hitWall = 1; } else { b.x = s.x + s.w + hw; b.hitWall = -1; }
      }
    }
    const prevY = b.y;
    b.y += b.vy;
    b.onGround = false;
    if (b.vy >= 0) {
      let land = Infinity;
      for (const s of LEVEL.solids) if (spans(s, b.x - hw, b.x + hw) && prevY <= s.y + 0.5 && b.y >= s.y) land = Math.min(land, s.y);
      if (!b.dropping) {
        for (const p of LEVEL.platforms) if (spans(p, b.x - hw, b.x + hw) && prevY <= p.y + 0.5 && b.y >= p.y) land = Math.min(land, p.y);
      }
      if (land < Infinity) { b.y = land; b.vy = 0; b.onGround = true; }
    }
  }

  const overlap = (ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) => ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;

  // ---- Making a game ----------------------------------------------------------

  function makePlayer(name, i, n) {
    return {
      name, x: 120 + i * 60 - (n - 1) * 20, y: GROUND_Y, vx: 0, vy: 0, onGround: true,
      facing: 1, state: 'idle', move: null, t: 0, hp: MAX_HP,
      invuln: 0, coyote: 0, jumpBuf: 0, act: null, actBuf: 0, jumping: false,
      held: { left: false, right: false, jump: false, block: false, down: false },
      hits: [], out: false, left: false, fell: false,
      stats: { kos: 0, coins: 0, damage: 0, falls: 0 },
    };
  }

  function createGame(names) {
    const n = names.length;
    return {
      mode: 'adventure',
      phase: 'ready',
      tick: 0,
      phaseT: 0,
      camX: 0,
      lives: LIVES_EACH * n,
      score: 0,
      players: names.map((name, i) => makePlayer(name, i, n)),
      enemies: [],
      projectiles: [],
      taken: [], // ids of pickups collected
      extra: [], // pickups dropped by creatures
      nextSpawn: 0,
      nextId: 1,
      kills: 0,
      boss: null,
      over: false,
      won: false,
      events: [],
    };
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

  function canAct(p) {
    if (p.state === 'idle' || p.state === 'walk' || p.state === 'block') return true;
    // A punch can be chained into the next once it has landed.
    if (p.state === 'attack' && p.move === 'punch') {
      const m = MOVES.punch;
      return p.t >= m.startup + m.active + 3;
    }
    return false;
  }

  function stepPlayer(g, p, i) {
    if (p.out) return;
    p.t++;
    if (p.state === 'ko') {
      if (p.t >= KO_TICKS) respawn(g, p, i);
      return;
    }
    if (p.invuln > 0) p.invuln--;
    if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.actBuf > 0) p.actBuf--; else p.act = null;
    if (p.coyote > 0) p.coyote--;
    const h = p.held;
    const frozen = g.phase === 'ready' || g.phase === 'won' || g.phase === 'lost';
    const want = frozen ? 0 : (h.right ? 1 : 0) - (h.left ? 1 : 0);

    if (p.state === 'hitstun' && p.t >= HURT_TICKS) setState(p, 'idle');
    if (p.state === 'attack') {
      const m = MOVES[p.move];
      if (p.t >= m.startup + m.active + m.recovery) setState(p, 'idle');
    }
    if (!frozen && p.act && canAct(p)) {
      setState(p, 'attack', p.act);
      p.hits = [];
      p.act = null;
      p.actBuf = 0;
      g.events.push({ type: 'swing', i, move: p.move });
    }
    if (p.state === 'block' && (!h.block || !p.onGround)) setState(p, 'idle');
    if ((p.state === 'idle' || p.state === 'walk') && h.block && p.onGround && !frozen) setState(p, 'block');

    // Jumping (out of a guard too).
    const free = p.state === 'idle' || p.state === 'walk' || p.state === 'block';
    if (!frozen && p.jumpBuf > 0 && free && (p.onGround || p.coyote > 0)) {
      if (h.down && p.onGround && onPlatform(p)) {
        p.dropping = 10; // down + jump: drop through the platform
      } else {
        p.vy = JUMP_V;
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

    // Walking.
    if (p.state === 'idle' || p.state === 'walk') {
      if (want) p.facing = want;
      if (p.onGround) p.vx = want * WALK;
      else p.vx += Math.max(-AIR_ACCEL, Math.min(AIR_ACCEL, want * WALK - p.vx));
      if (p.onGround) {
        const st = want ? 'walk' : 'idle';
        if (p.state !== st) { p.state = st; }
      }
    } else if (p.state === 'attack') {
      if (p.onGround) p.vx *= 0.7;
      else p.vx += Math.max(-AIR_ACCEL / 2, Math.min(AIR_ACCEL / 2, want * WALK - p.vx));
    } else if (p.state === 'block') {
      p.vx = 0;
    } else if (p.state === 'hitstun') {
      p.vx *= 0.9;
    }

    p.prevY = p.y;
    p.vy = Math.min(MAX_FALL, p.vy + GRAVITY);
    if (p.dropping) p.dropping--;
    moveBody(p, PLAYER_HW, PLAYER_H);
    if (p.onGround) {
      p.coyote = COYOTE;
      if (footing(p.x - PLAYER_HW, p.y) && footing(p.x + PLAYER_HW, p.y)) p.safeX = p.x;
    }

    // Everyone stays on screen.
    const lo = g.camX + PLAYER_HW + 4;
    const hi = g.camX + VIEW_W - PLAYER_HW - 4;
    if (p.x < lo) p.x = lo;
    if (p.x > hi) p.x = hi;

    if (p.y > VIEW_H + 150) {
      // Down a pit.
      p.fell = true;
      p.stats.falls++;
      knockOut(g, p, i);
    }
  }

  function onPlatform(p) {
    return LEVEL.platforms.some((pl) => Math.abs(pl.y - p.y) < 1 && spans(pl, p.x - PLAYER_HW, p.x + PLAYER_HW))
      && !LEVEL.solids.some((s) => Math.abs(s.y - p.y) < 1 && spans(s, p.x - PLAYER_HW, p.x + PLAYER_HW));
  }

  /** The box an attack covers right now, or null if it isn't out. */
  function attackBox(p) {
    if (p.state !== 'attack') return null;
    const m = MOVES[p.move];
    if (p.t < m.startup || p.t >= m.startup + m.active) return null;
    const x0 = p.facing > 0 ? p.x : p.x - m.reach;
    return { x0, x1: x0 + m.reach, y0: p.y - m.top, y1: p.y - m.bottom, move: m };
  }

  /**
   * Hurts a player. dir is the way the hit pushes them. A guard facing the
   * hit takes most of it, unless it can't be blocked.
   */
  function hurtPlayer(g, p, i, damage, dir, knock = 8, unblockable = false) {
    if (down(p) || p.invuln > 0 || g.phase === 'won') return false;
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
    setState(p, 'hitstun');
    p.hitHeight = 'head';
    p.vx = dir * knock;
    p.vy = -5;
    p.onGround = false;
    p.invuln = INVULN_TICKS;
    g.events.push({ type: 'hurt', i, x: p.x, y: p.y - 70, damage });
    if (p.hp <= 0) knockOut(g, p, i);
    return true;
  }

  function knockOut(g, p, i) {
    p.hp = 0;
    setState(p, 'ko');
    p.vx = 0;
    p.vy = 0;
    g.events.push({ type: 'ko', i, x: p.x, y: p.y, fell: p.fell });
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
    const mates = g.players.filter((q) => q !== p && !down(q));
    let x = mates.length ? Math.min(...mates.map((q) => q.x)) : (p.safeX || p.x);
    x = Math.max(g.camX + 120, Math.min(g.camX + VIEW_W - 120, x));
    for (let k = 0; k < 60 && surfaceBelow(x, -100) > VIEW_H; k++) x += 20;
    Object.assign(p, {
      x, y: -40, vx: 0, vy: 0, onGround: false, hp: MAX_HP, fell: false,
      invuln: RESPAWN_INVULN, jumping: false, dropping: 0,
    });
    setState(p, 'idle');
    g.events.push({ type: 'respawn', i });
  }

  function checkLost(g) {
    if (g.over) return;
    if (g.players.every((p) => p.out)) {
      g.phase = 'lost';
      g.phaseT = 0;
      g.events.push({ type: 'gameOver' });
    }
  }

  // ---- Creatures ------------------------------------------------------------------

  function spawnEnemy(g, def) {
    const c = CREATURES[def.type];
    const y = def.y !== undefined ? def.y : surfaceBelow(def.x, -100);
    const e = {
      id: g.nextId++, type: def.type, x: def.x, y, vx: 0, vy: 0, onGround: !c.flying,
      facing: -1, state: def.type === 'bee' ? 'hover' : 'idle', t: (g.nextId * 37) % 60,
      hp: c.hp, maxHp: c.hp, hurt: 0, dead: false, ax: def.x, ay: y, cool: def.type === 'bee' ? 60 : 0, spiky: false,
    };
    g.enemies.push(e);
    return e;
  }

  function nearestPlayer(g, x, y = 0) {
    let best = null;
    let bestD = Infinity;
    g.players.forEach((p, i) => {
      if (down(p)) return;
      const d = Math.abs(p.x - x) + Math.abs(p.y - y) * 0.3;
      if (d < bestD) { bestD = d; best = { p, i, d }; }
    });
    return best;
  }

  const setE = (e, state) => { e.state = state; e.t = 0; };

  function walker(e, c, speed, dir) {
    // Walk, but turn at a wall or the edge of a drop.
    if (!footing(e.x + dir * (c.hw + 6), e.y)) dir = -dir;
    e.facing = dir;
    e.vx = speed * dir;
  }

  function stepEnemy(g, e) {
    const c = CREATURES[e.type];
    e.t++;
    if (e.hurt > 0) e.hurt--;
    if (e.dead) {
      if (e.type === 'rhino') { e.vx = 0; return; }
      e.vy = Math.min(MAX_FALL, e.vy + GRAVITY);
      e.y += e.vy;
      e.x += e.vx;
      return;
    }
    const target = nearestPlayer(g, e.x, e.y);
    const tdx = target ? target.p.x - e.x : 0;
    const near = target && Math.abs(tdx) < 560;
    const toward = tdx >= 0 ? 1 : -1;

    if (e.hurt > 6 && e.type !== 'rhino') {
      // Knocked back: just fly.
      e.vx *= 0.9;
    } else if (e.type === 'slime') {
      if (e.onGround) {
        e.vx = 0;
        if (e.t >= 70) {
          e.t = 0;
          const dir = near ? toward : (e.facing || -1);
          if (footing(e.x + dir * 70, e.y)) {
            e.facing = dir;
            e.vy = -7.5;
            e.vx = dir * 2.4;
          } else {
            e.facing = -dir;
          }
        }
      }
    } else if (e.type === 'bee') {
      stepBee(g, e, target);
    } else if (e.type === 'hedgehog') {
      if (e.state === 'idle' || e.state === 'walk') {
        e.spiky = false;
        if (e.state === 'idle') setE(e, 'walk');
        walker(e, c, 1.1, near ? toward : (e.facing || -1));
        if (e.t >= 150 && near) { setE(e, 'curl'); e.facing = toward; }
      } else if (e.state === 'curl') {
        e.spiky = true;
        e.vx = 0;
        if (e.t >= 30) { setE(e, 'roll'); g.events.push({ type: 'roll', x: e.x }); }
      } else if (e.state === 'roll') {
        e.vx = e.facing * 6.5;
        if (e.hitWall) { e.facing = -e.facing; e.vx = e.facing * 6.5; }
        if (e.t >= 100) setE(e, 'uncurl');
      } else if (e.state === 'uncurl') {
        e.vx *= 0.8;
        if (e.t >= 20) e.spiky = false;
        if (e.t >= 40) setE(e, 'walk');
      }
    } else if (e.type === 'frog') {
      if (e.onGround) {
        e.vx = 0;
        if (e.state === 'spit') {
          if (e.t === 18) {
            g.projectiles.push({ id: g.nextId++, type: 'bubble', x: e.x + e.facing * 28, y: e.y - 24, vx: e.facing * BUBBLE_SPEED, vy: 0, t: 0, by: e.id });
            g.events.push({ type: 'spit', x: e.x });
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
            if (footing(e.x + toward * 90, e.y)) { e.vy = -10; e.vx = toward * 2.6; }
          }
        }
      }
    } else if (e.type === 'rhino') {
      stepRhino(g, e, target);
    }

    if (!c.flying) {
      e.vy = Math.min(MAX_FALL, e.vy + GRAVITY);
      moveBody(e, c.hw, c.h);
      if (e.hitWall && e.type === 'slime') e.facing = -e.facing;
      if (e.y > VIEW_H + 150) { e.dead = true; e.gone = true; }
    } else {
      e.x += e.vx;
      e.y += e.vy;
    }
  }

  function stepBee(g, e, target) {
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
      if (e.t >= 60 || e.y >= e.ty + 30 || !footingAbove(e)) { setE(e, 'hover'); e.cool = 120; }
    }
  }

  // A diving bee pulls up before it goes into the ground.
  function footingAbove(e) {
    return surfaceBelow(e.x, e.y) > e.y + 20;
  }

  // ---- The boss -------------------------------------------------------------------

  const arenaLeft = () => ARENA_X + CREATURES.rhino.hw + 8;
  const arenaRight = () => ARENA_X + VIEW_W - CREATURES.rhino.hw - 8;

  function spawnBoss(g) {
    const n = g.players.filter((p) => !p.left).length;
    const e = spawnEnemy(g, { type: 'rhino', x: ARENA_X + VIEW_W - 220, y: -220 });
    e.maxHp = e.hp = CREATURES.rhino.hp + BOSS_HP_PER_EXTRA * Math.max(0, n - 1);
    e.state = 'enter';
    e.t = 0;
    e.onGround = false;
    e.pattern = 0;
    e.angry = false;
    g.boss = e;
  }

  const BOSS_PATTERN = ['charge', 'stomp', 'charge', 'throw'];

  function stepRhino(g, e, target) {
    const toward = target ? (target.p.x >= e.x ? 1 : -1) : e.facing;
    const fast = e.angry ? 1.25 : 1;
    switch (e.state) {
      case 'enter':
        e.vx = 0;
        if (e.onGround && e.t > 1) {
          g.events.push({ type: 'quake', x: e.x, big: true });
          setE(e, 'roar');
        }
        break;
      case 'roar':
        e.vx = 0;
        if (e.t === 10) g.events.push({ type: 'roar' });
        if (e.t >= 70) setE(e, 'idle');
        break;
      case 'idle':
        e.facing = toward;
        e.vx = toward * 1.2 * fast;
        if (e.t >= (e.angry ? 40 : 70) && g.phase === 'boss') {
          let next = BOSS_PATTERN[e.pattern++ % BOSS_PATTERN.length];
          if (next === 'throw' && !e.angry) next = 'stomp';
          setE(e, next === 'charge' ? 'windup' : next);
          e.stomps = e.angry ? 2 : 1;
        }
        break;
      case 'windup':
        // Pawing the ground, head down.
        e.facing = toward;
        e.vx = 0;
        if (e.t % 15 === 0) g.events.push({ type: 'paw', x: e.x });
        if (e.t >= 50 / fast) { setE(e, 'charge'); g.events.push({ type: 'charge' }); }
        break;
      case 'charge':
        e.vx = e.facing * 9 * fast;
        if ((e.facing > 0 && e.x >= arenaRight()) || (e.facing < 0 && e.x <= arenaLeft()) || e.t > 200) {
          e.x = Math.max(arenaLeft(), Math.min(arenaRight(), e.x));
          e.vx = -e.facing * 3;
          e.vy = -6;
          setE(e, 'dizzy');
          g.events.push({ type: 'quake', x: e.x + e.facing * 70, crash: true });
        }
        break;
      case 'dizzy':
        if (e.onGround) e.vx *= 0.85;
        if (e.t >= (e.angry ? 120 : 160)) setE(e, 'idle');
        break;
      case 'stomp':
        if (e.t === 1) { e.vy = -15; e.vx = toward * 2; e.facing = toward; }
        if (e.t > 5 && e.onGround) {
          e.vx = 0;
          for (const dir of [-1, 1]) {
            g.projectiles.push({ id: g.nextId++, type: 'wave', x: e.x + dir * 60, y: e.y, vx: dir * WAVE_SPEED * fast, vy: 0, t: 0 });
          }
          g.events.push({ type: 'quake', x: e.x });
          e.stomps--;
          if (e.stomps > 0) setE(e, 'stomp'); else { setE(e, 'idle'); }
          e.t = e.stomps > 0 ? -20 : 0;
        }
        break;
      case 'throw':
        e.vx = 0;
        e.facing = toward;
        if (e.t > 0 && e.t % 30 === 0 && e.t <= 90) {
          const tg = nearestPlayer(g, e.x + toward * 400) || target;
          const tx = tg ? tg.p.x : e.x + toward * 300;
          const flight = 60;
          const sx = e.x + toward * 50;
          const sy = e.y - 150;
          g.projectiles.push({
            id: g.nextId++, type: 'boulder', x: sx, y: sy,
            vx: (tx - sx) / flight, vy: (GROUND_Y - 20 - sy) / flight - 0.5 * BOULDER_GRAVITY * flight, t: 0,
          });
          g.events.push({ type: 'throw' });
        }
        if (e.t >= 120) setE(e, 'idle');
        break;
      case 'dead':
        break;
    }
    if (e.state !== 'enter') {
      if (e.x < arenaLeft()) e.x = arenaLeft();
      if (e.x > arenaRight()) e.x = arenaRight();
    }
  }

  // ---- Hits -------------------------------------------------------------------

  function hurtEnemy(g, e, damage, dir, knock, byIndex) {
    if (e.dead) return;
    const p = g.players[byIndex];
    if (e.spiky) {
      g.events.push({ type: 'clink', x: e.x, y: e.y - 20 });
      return;
    }
    if (e.type === 'rhino') {
      if (e.state === 'enter' || e.state === 'roar') return;
      if (e.state === 'dizzy') damage = Math.round(damage * 1.5);
    }
    e.hp -= damage;
    e.hurt = 14;
    if (p) p.stats.damage += damage;
    g.events.push({ type: 'hit', x: e.x, y: e.y - CREATURES[e.type].h / 2, damage, big: damage >= 15 });
    if (e.type !== 'rhino') {
      e.vx = dir * knock * 0.8;
      if (!CREATURES[e.type].flying) { e.vy = -3; e.onGround = false; } else e.vy = -1;
      if (e.type === 'bee') { setE(e, 'hover'); e.cool = 90; }
    }
    if (e.type === 'rhino' && !e.angry && e.hp <= e.maxHp / 2) {
      e.angry = true;
      g.events.push({ type: 'angry' });
    }
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
      e.state = 'dead';
      e.t = 0;
      g.score += CREATURES[e.type].score;
      if (p) p.stats.kos++;
      g.events.push({ type: 'down', x: e.x, y: e.y, kind: e.type, score: CREATURES[e.type].score });
      if (e.type === 'rhino') {
        e.vx = 0;
        g.phase = 'won';
        g.phaseT = 0;
        g.won = true;
        g.projectiles = [];
        g.events.push({ type: 'victory' });
      } else {
        e.vy = -7;
        e.vx = dir * 3;
        if (++g.kills % DROP_EVERY === 0) {
          g.extra.push({ id: `d${g.nextId++}`, type: 'heart', x: e.x, y: Math.min(e.y - 20, GROUND_Y - 30) });
        }
      }
    }
  }

  function interact(g) {
    g.players.forEach((p, i) => {
      if (down(p)) return;
      const box = attackBox(p);
      const px0 = p.x - PLAYER_HW;
      const px1 = p.x + PLAYER_HW;
      const py0 = p.y - PLAYER_H;

      for (const e of g.enemies) {
        if (e.dead) continue;
        const c = CREATURES[e.type];
        const ex0 = e.x - c.hw;
        const ex1 = e.x + c.hw;
        const ey0 = e.y - c.h;
        // My punch or kick.
        if (box && !p.hits.includes(e.id) && overlap(box.x0, box.y0, box.x1, box.y1, ex0, ey0, ex1, e.y)) {
          p.hits.push(e.id);
          hurtEnemy(g, e, box.move.damage, p.facing, box.move.knock, i);
          if (e.dead) continue;
        }
        if (!overlap(px0, py0, px1, p.y, ex0, ey0, ex1, e.y)) continue;
        // Landing on its head.
        const stomp = p.vy > 0 && p.prevY !== undefined && p.prevY <= ey0 + 14;
        if (stomp) {
          if (e.spiky) {
            hurtPlayer(g, p, i, c.damage, p.x < e.x ? -1 : 1, 6, true);
            p.vy = STOMP_BOUNCE;
            continue;
          }
          p.vy = p.held.jump ? JUMP_V * 0.9 : STOMP_BOUNCE;
          p.jumping = p.held.jump;
          p.y = ey0;
          g.events.push({ type: 'stomp', i, x: e.x, y: ey0 });
          hurtEnemy(g, e, e.type === 'rhino' ? 8 : STOMP_DAMAGE, p.x < e.x ? 1 : -1, 2, i);
          continue;
        }
        // Bumping into it.
        if (e.hurt > 6 && e.type !== 'rhino') continue;
        if (e.type === 'rhino' && (e.state === 'dizzy' || e.state === 'enter')) continue;
        const dir = p.x < e.x ? -1 : 1;
        const charging = e.type === 'rhino' && e.state === 'charge';
        const rolling = e.type === 'hedgehog' && e.state === 'roll';
        hurtPlayer(g, p, i, charging ? CHARGE_DAMAGE : c.damage, dir, charging ? 14 : rolling ? 10 : 7, charging);
      }

      // Projectiles.
      for (const pr of g.projectiles) {
        if (pr.gone) continue;
        if (pr.type === 'wave') {
          // Rolls along the ground: only hits feet on the ground near it.
          if (Math.abs(pr.x - p.x) < 24 + PLAYER_HW && p.y > pr.y - 30) {
            if (hurtPlayer(g, p, i, WAVE_DAMAGE, pr.vx > 0 ? 1 : -1, 8, true)) p.vy = -9;
          }
          continue;
        }
        const r = pr.type === 'boulder' ? 26 : 14;
        if (box && overlap(box.x0, box.y0, box.x1, box.y1, pr.x - r, pr.y - r, pr.x + r, pr.y + r)) {
          // Punched out of the air.
          pr.gone = true;
          g.events.push({ type: 'smash', x: pr.x, y: pr.y, kind: pr.type });
          continue;
        }
        if (overlap(px0, py0, px1, p.y, pr.x - r, pr.y - r, pr.x + r, pr.y + r)) {
          const dir = pr.vx > 0 ? 1 : pr.vx < 0 ? -1 : (p.x < pr.x ? -1 : 1);
          if (hurtPlayer(g, p, i, pr.type === 'boulder' ? BOULDER_DAMAGE : BUBBLE_DAMAGE, dir, 8)) {
            pr.gone = true;
            g.events.push({ type: 'smash', x: pr.x, y: pr.y, kind: pr.type });
          }
        }
      }

      // Coins, hearts and extra lives.
      const grab = (pk) => overlap(px0, py0, px1, p.y, pk.x - 16, pk.y - 16, pk.x + 16, pk.y + 16);
      for (const pk of LEVEL.pickups) {
        if (g.taken.includes(pk.id) || !grab(pk)) continue;
        g.taken.push(pk.id);
        collect(g, p, i, pk);
      }
      g.extra = g.extra.filter((pk) => {
        if (!grab(pk)) return true;
        collect(g, p, i, pk);
        return false;
      });
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

  function stepProjectiles(g) {
    for (const pr of g.projectiles) {
      pr.t++;
      if (pr.type === 'boulder') pr.vy += BOULDER_GRAVITY;
      pr.x += pr.vx;
      pr.y += pr.vy;
      if (pr.type === 'boulder' && pr.vy > 0 && pr.y + 20 >= surfaceBelow(pr.x, pr.y - pr.vy - 20)) {
        pr.gone = true;
        g.events.push({ type: 'smash', x: pr.x, y: pr.y, kind: 'boulder' });
      }
      if (pr.type === 'bubble' && pr.t > 150) pr.gone = true;
      if (pr.x < g.camX - 100 || pr.x > g.camX + VIEW_W + 100 || pr.y > VIEW_H + 100) pr.gone = true;
    }
    g.projectiles = g.projectiles.filter((pr) => !pr.gone);
  }

  // ---- The camera ------------------------------------------------------------

  function updateCamera(g) {
    if (g.boss) { g.camX = ARENA_X; return; }
    const alive = g.players.filter((p) => !down(p) && p.y > 0);
    if (!alive.length) return;
    const xs = alive.map((p) => p.x);
    const want = Math.min(Math.max(...xs) - VIEW_W * 0.45, Math.min(...xs) - 60);
    g.camX = Math.max(0, Math.min(ARENA_X, Math.max(g.camX, want)));
    if (g.camX >= ARENA_X && g.phase === 'run') {
      g.phase = 'bossIntro';
      g.phaseT = 0;
      // The little ones clear off.
      g.enemies = [];
      g.projectiles = [];
      spawnBoss(g);
      g.events.push({ type: 'boss', name: BOSS_NAME });
    }
  }

  function spawnAhead(g) {
    const spawns = LEVEL.spawns;
    while (g.nextSpawn < spawns.length && spawns[g.nextSpawn].x < g.camX + VIEW_W + 80) {
      spawnEnemy(g, spawns[g.nextSpawn++]);
    }
    g.enemies = g.enemies.filter((e) => {
      if (e.type === 'rhino') return true;
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
      g.events.push({ type: 'go' });
    }
    if (g.phase === 'bossIntro' && g.phaseT >= BOSS_INTRO_TICKS) {
      g.phase = 'boss';
      g.phaseT = 0;
    }
    if ((g.phase === 'won' || g.phase === 'lost') && g.phaseT >= END_TICKS) {
      g.over = true;
      return;
    }
    g.players.forEach((p, i) => stepPlayer(g, p, i));
    if (g.phase !== 'ready' && g.phase !== 'lost') {
      for (const e of g.enemies) stepEnemy(g, e);
      if (g.phase !== 'won') stepProjectiles(g);
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
      phase: g.phase,
      phaseT: g.phaseT,
      camX: r1(g.camX),
      lives: g.lives,
      score: g.score,
      players: g.players.map((p) => ({
        name: p.name, x: r1(p.x), y: r1(p.y), vy: r1(p.vy), facing: p.facing, state: p.state, move: p.move, t: p.t,
        hp: Math.max(0, p.hp), invuln: p.invuln, onGround: p.onGround, out: p.out, left: p.left, fell: p.fell,
        stats: p.stats,
      })),
      enemies: g.enemies.map((e) => ({
        id: e.id, type: e.type, x: r1(e.x), y: r1(e.y), facing: e.facing, state: e.state, t: e.t,
        hp: e.hp, maxHp: e.maxHp, hurt: e.hurt, dead: e.dead, spiky: e.spiky, angry: !!e.angry,
      })),
      projectiles: g.projectiles.map((pr) => ({ id: pr.id, type: pr.type, x: r1(pr.x), y: r1(pr.y), t: pr.t })),
      pickups: LEVEL.pickups.filter((pk) => near(pk.x) && !g.taken.includes(pk.id)).map((pk) => pk.id),
      extra: g.extra.filter((pk) => near(pk.x)),
      boss: g.boss ? { name: BOSS_NAME, hp: g.boss.hp, maxHp: g.boss.maxHp } : null,
    };
  }

  const api = {
    TICK_RATE, VIEW_W, VIEW_H, GROUND_Y, GRAVITY, WALK, JUMP_V, MAX_HP, LIVES_EACH,
    PLAYER_HW, PLAYER_H, MOVES, CREATURES, LEVEL, LEVEL_END, ARENA_X, BOSS_NAME,
    KO_TICKS, READY_TICKS, BOSS_INTRO_TICKS, END_TICKS, HEART_HEAL, COIN_SCORE, STOMP_DAMAGE,
    CHARGE_DAMAGE, WAVE_DAMAGE, BOULDER_DAMAGE, BUBBLE_DAMAGE, BLOCK_SHARE, DROP_EVERY,
    createGame, step, setHeld, pressAction, removePlayer, snapshot, surfaceBelow,
    spawnEnemy, spawnBoss, hurtEnemy, hurtPlayer, attackBox,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoxerAdventure = api;
})(typeof self !== 'undefined' ? self : this);
