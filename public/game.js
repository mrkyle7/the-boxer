// Shared boxing simulation. Runs authoritatively on the server; the client
// loads it too so it can read the move table when animating poses.
//
// Two fighters box side on, moving left and right ('side' mode). Three or
// four fight free-for-all in a square ring seen from above ('ring' mode):
// they move in two dimensions, each faces the nearest opponent, and an attack
// lands on whoever is in front of it and in range. The moves, frame data,
// aiming and blocking are the same in both.
//
// A fighter called Luna (any capitals) gets a helping hand: she walks a bit
// faster, her punches and kicks reach further, she steps in when an attack
// is just out of reach, and in the ring her walking bends towards the
// opponent she's heading for (aim assist).
//
// The giant fist: with fists on, every five to fifteen seconds of fighting a
// shadow appears under a random fighter (a fighter called Kyle, any capitals,
// is three times as likely to be picked), and a second later a giant fist
// slams down there. Anyone still under it takes 30 damage, guard or no guard.
//
// The cheat code: type "zeffen" in a fight for the Zeffen flip, a front flip
// at your opponent that lands twice, 25 a time, unblockable. It's aimed where they
// were when you jumped, so they can still get out of the way. While you're in
// the air nothing can touch you. Everyone can see the letters as they're
// typed, and getting hit wipes them, so the others can stop it.
//
// Another: type "luna" for the Luna vault, a flip right over your opponent
// to land behind them and kick them in the back for 30, unblockable.
//
// Two more go on you, not on them: "jemini" makes you a giant for seven
// seconds (your hits do 10% more), and "kyle" makes you invisible to the
// others for five (that's only in how they're drawn: the fight's the same).
(function (root) {
  'use strict';

  const TICK_RATE = 60;
  const RING_LEFT = 90;
  const RING_RIGHT = 910;
  const MIN_SEPARATION = 80;
  const WALK_SPEED = 4.2;
  const BLOCK_WALK_SPEED = 1.8;
  const MAX_HP = 100;
  const MAX_STAMINA = 100;
  const STAMINA_REGEN = 0.32;
  const STAMINA_REGEN_BLOCKING = 0.12;
  const ROUND_TICKS = 60 * TICK_RATE;
  const COUNTDOWN_TICKS = 90;
  const ROUND_END_TICKS = 180;
  const ROUNDS_TO_WIN = 2;
  const MAX_ROUNDS = 3;
  const INPUT_BUFFER_TICKS = 8;
  const COUNTER_MULTIPLIER = 1.4;
  const GUARD_BREAK_TICKS = 45;
  const KNOCKBACK_FRICTION = 0.82;
  const MAX_FIGHTERS = 4;
  // Luna's helping hand.
  const LUNA_SPEED = 1.2; // walks 20% faster
  const LUNA_REACH = 1.2; // punches and kicks reach 20% further
  const LUNA_LUNGE = 70; // steps in to land an attack up to this far out of reach
  const ASSIST_CONE = 0.5; // cos 60°: ring walking bends towards an opponent roughly ahead
  const ASSIST_PULL = 0.45; // ...by this much

  // The giant fist.
  const FIST_KYLE_ODDS = 3; // Kyle is this many times as likely to be under it
  const FIST_MIN_TICKS = 5 * TICK_RATE; // gap before the next one, at least...
  const FIST_MAX_TICKS = 15 * TICK_RATE; // ...and at most
  const FIST_WARN_TICKS = TICK_RATE; // the shadow shows for a second first
  const FIST_DAMAGE = 30;
  const FIST_RADIUS = 90; // centre to centre: further than this and it misses
  const FIST_KNOCKBACK = 14;
  const FIST_HITSTUN = 30;

  // The ring seen from above: a square, in the same units as the side view.
  const RING_MIN = 90;
  const RING_MAX = 910;
  const RING_CENTRE = (RING_MIN + RING_MAX) / 2;
  // An attack lands on someone within this angle of where the attacker faces.
  const HIT_ARC = 0.8;
  // A guard covers attacks from within this angle of where the defender faces.
  const GUARD_ARC = Math.PI / 2;
  // A fighter only turns to a new nearest opponent once they're this much nearer.
  const RETARGET_MARGIN = 40;
  // Corners to start from, facing the middle.
  const RING_STARTS = {
    3: [[500, 230], [265, 720], [735, 720]],
    4: [[250, 250], [750, 750], [750, 250], [250, 750]],
  };

  // Frame data. Range is measured centre-to-centre between fighters.
  // Every attack goes to the head or the tummy, whichever the attacker is
  // aiming at when it starts. A guard only covers the height it is held at.
  // Head shots hurt more; tummy shots also wind the defender (drain stamina).
  const MOVES = {
    punch: {
      startup: 6, active: 3, recovery: 10, range: 160, stamina: 8,
      blockstun: 10, blockDamage: 0, blockStamina: 6, blockKnockback: 5,
      head: { damage: 6, hitstun: 16, knockback: 10, winded: 0 },
      body: { damage: 5, hitstun: 14, knockback: 6, winded: 10 },
    },
    kick: {
      startup: 14, active: 4, recovery: 22, range: 205, stamina: 18,
      blockstun: 18, blockDamage: 2, blockStamina: 16, blockKnockback: 12,
      head: { damage: 14, hitstun: 30, knockback: 24, winded: 0 },
      body: { damage: 10, hitstun: 26, knockback: 18, winded: 20 },
    },
  };

  // The Zeffen flip (the cheat code): a crouch, a front flip through the air
  // towards the opponent, and a landing that can't be blocked. It hits twice:
  // the landing holds them where they are, and the second knocks them away.
  MOVES.flip = {
    startup: 30, active: 14, recovery: 16, range: 160, stamina: 0,
    unblockable: true,
    first: { damage: 25, hitstun: 24, knockback: 2, winded: 0 },
    head: { damage: 25, hitstun: 45, knockback: 30, winded: 0 },
    body: { damage: 25, hitstun: 45, knockback: 30, winded: 0 },
  };
  const FLIP_SECOND_AT = 10; // ticks after landing for the second hit
  const FLIP_CODE = 'zeffen';
  const FLIP_CROUCH = 5; // ticks before leaving the ground
  const FLIP_LAND_AT = 100; // aims to land this far from the opponent, in reach
  const FLIP_MAX_TRAVEL = 330; // furthest it carries you: as far as the Luna vault

  // The Luna vault (another cheat code): a flip over the opponent, landing
  // behind them, and a kick in the back. Guards only face forwards, so it
  // can't be blocked.
  MOVES.vault = {
    startup: 34, active: 6, recovery: 18, range: 150, stamina: 0,
    unblockable: true,
    head: { damage: 30, hitstun: 40, knockback: 26, winded: 0 },
    body: { damage: 30, hitstun: 40, knockback: 26, winded: 0 },
  };
  const VAULT_BEYOND = 90; // lands this far past the opponent
  const VAULT_MAX_TRAVEL = 330; // furthest it carries you

  // The power-ups: how long each lasts, and what Jemini adds to your hits.
  const JEMINI_TICKS = 7 * TICK_RATE;
  const JEMINI_DAMAGE = 1.1;
  const KYLE_TICKS = 5 * TICK_RATE;

  // Cheat codes, and the move (or power-up) each one does.
  const CODES = { [FLIP_CODE]: 'flip', luna: 'vault', jemini: 'jemini', kyle: 'kyle' };
  const POWERS = ['jemini', 'kyle'];
  const CODE_MAX = Math.max(...Object.keys(CODES).map((c) => c.length));
  const AIRBORNE_MOVES = ['flip', 'vault'];

  const AIMS = ['head', 'body'];
  const ACTIONS = ['punch', 'kick'];

  const DEFAULT_NAMES = ['Red', 'Blue', 'Green', 'Gold'];

  function createFighter(index, name, count) {
    const ring = count > 2;
    const start = ring ? RING_STARTS[count][index] : null;
    return {
      name: name || DEFAULT_NAMES[index],
      luna: isLuna(name),
      giant: 0, // ticks of Jemini left
      invisible: 0, // ticks of Kyle left
      typed: '', // the last few letters typed in the fight
      typing: '', // as much of a cheat code as they make, for everyone to see
      kyle: isKyle(name),
      x: ring ? start[0] : index === 0 ? 350 : 650,
      y: ring ? start[1] : 0,
      vx: 0,
      vy: 0,
      facing: index === 0 ? 1 : -1,
      // Ring mode: the direction faced, in radians, and who at.
      angle: ring ? Math.atan2(RING_CENTRE - start[1], RING_CENTRE - start[0]) : 0,
      target: null,
      left: false,
      hp: MAX_HP,
      stamina: MAX_STAMINA,
      state: 'idle',
      move: null,
      aim: 'head',
      hitHeight: null,
      t: 0,
      hitLanded: false,
      roundsWon: 0,
      stats: { thrown: 0, landed: 0, blocked: 0, damage: 0 },
    };
  }

  function createInput() {
    return { left: false, right: false, up: false, down: false, block: false, aim: 'head', buffered: null, bufferAge: 0 };
  }

  /**
   * A match between two to four fighters, named in order. Options:
   * fists: true for the giant fist; random: a 0..1 function (tests).
   */
  function createGame(names, options = {}) {
    const count = Math.max(2, Math.min(MAX_FIGHTERS, (names && names.length) || 2));
    const game = {
      mode: count > 2 ? 'ring' : 'side',
      phase: 'countdown',
      phaseT: 0,
      round: 1,
      timer: ROUND_TICKS,
      fighters: Array.from({ length: count }, (_, i) => createFighter(i, names && names[i], count)),
      inputs: Array.from({ length: count }, createInput),
      events: [],
      roundWinner: null,
      winner: null,
      tick: 0,
      fists: !!options.fists,
      random: options.random || Math.random,
      // Ticks until the next shadow, and the shadow when there is one.
      fist: { next: 0, warn: null },
    };
    return game;
  }

  function resetFightersForRound(game) {
    const count = game.fighters.length;
    game.fighters.forEach((f, i) => {
      const fresh = createFighter(i, f.name, count);
      fresh.roundsWon = f.roundsWon;
      fresh.stats = f.stats;
      // Someone who left the ring stays out for the rest of the match.
      if (f.left) {
        fresh.left = true;
        fresh.hp = 0;
        fresh.state = 'ko';
      }
      game.fighters[i] = fresh;
    });
    game.inputs = game.fighters.map(createInput);
  }

  function setHeld(game, index, held) {
    const input = game.inputs[index];
    input.left = !!held.left;
    input.right = !!held.right;
    input.up = !!held.up;
    input.down = !!held.down;
    input.block = !!held.block;
    if (AIMS.includes(held.aim)) input.aim = held.aim;
  }

  function pressAction(game, index, action) {
    if (!ACTIONS.includes(action)) return;
    const input = game.inputs[index];
    // A cheat move that's just gone in isn't replaced by the key that finished it.
    if (AIRBORNE_MOVES.includes(input.buffered)) return;
    input.buffered = action;
    input.bufferAge = 0;
  }

  /** A cheat code: the right word buffers its move, or turns its power-up on. */
  function cheat(game, index, code) {
    const move = CODES[String(code || '').trim().toLowerCase()];
    const input = game.inputs[index];
    if (!move || !input) return;
    if (POWERS.includes(move)) {
      power(game, index, move);
      return;
    }
    input.buffered = move;
    input.bufferAge = 0;
  }

  /** Jemini (a giant) or Kyle (invisible), straight away and for a while. */
  function power(game, index, which) {
    const f = game.fighters[index];
    if (!f || game.phase !== 'fight' || !standing(f)) return;
    if (which === 'jemini') f.giant = JEMINI_TICKS;
    else f.invisible = KYLE_TICKS;
    game.events.push({ type: which, target: index });
  }

  /**
   * A letter typed in the fight. Finishing a cheat code buffers its move;
   * `typing` is as much of a code as the last letters make, to show everyone.
   */
  function typeKey(game, index, key) {
    const f = game.fighters[index];
    if (!f || game.phase !== 'fight' || !standing(f)) return;
    const k = String(key || '').toLowerCase();
    if (!/^[a-z]$/.test(k)) return;
    f.typed = (f.typed + k).slice(-CODE_MAX);
    const done = Object.keys(CODES).find((c) => f.typed.endsWith(c));
    if (done) {
      f.typed = '';
      f.typing = '';
      cheat(game, index, done);
      return;
    }
    // The longest start of a code that the last letters end with.
    f.typing = '';
    for (const c of Object.keys(CODES)) {
      for (let n = Math.min(c.length - 1, f.typed.length); n > f.typing.length; n--) {
        if (f.typed.endsWith(c.slice(0, n))) { f.typing = c.slice(0, n); break; }
      }
    }
  }

  /** A hit knocks the cheat code out of your head. */
  function forgetTyping(f) {
    f.typed = '';
    f.typing = '';
  }

  /** Off the ground in a flip or vault, where nothing can touch you. */
  function airborne(f) {
    return f.state === 'attack' && AIRBORNE_MOVES.includes(f.move)
      && f.t >= FLIP_CROUCH && f.t < MOVES[f.move].startup;
  }

  /**
   * Aims the vault as you jump: over where your opponent is now, to land just
   * past them. Like the flip, it doesn't follow them.
   */
  function aimVault(game, f) {
    const o = opponentOf(game, f);
    let dir = game.mode === 'ring' ? { x: Math.cos(f.angle), y: Math.sin(f.angle) } : { x: f.facing, y: 0 };
    let travel = VAULT_BEYOND;
    if (o && standing(o)) {
      const dx = o.x - f.x;
      const dy = game.mode === 'ring' ? o.y - f.y : 0;
      const d = Math.hypot(dx, dy) || 1;
      dir = { x: dx / d, y: dy / d };
      travel = Math.min(VAULT_MAX_TRAVEL, d + VAULT_BEYOND);
    }
    const flight = MOVES.vault.startup - FLIP_CROUCH;
    f.flipStep = { x: (dir.x * travel) / flight, y: (dir.y * travel) / flight };
  }

  /** Landing from the vault: turn round to face who you went over. */
  function turnAround(game, f) {
    const o = opponentOf(game, f);
    if (!o || game.mode !== 'ring') return;
    f.angle = Math.atan2(o.y - f.y, o.x - f.x);
  }

  /**
   * Aims the flip as you jump: at where your opponent is now, a short way.
   * It doesn't follow them after that, so they can step out of the way.
   */
  function aimFlip(game, f) {
    const o = opponentOf(game, f);
    let dir = game.mode === 'ring' ? { x: Math.cos(f.angle), y: Math.sin(f.angle) } : { x: f.facing, y: 0 };
    let travel = FLIP_MAX_TRAVEL;
    if (o && standing(o)) {
      const dx = o.x - f.x;
      const dy = game.mode === 'ring' ? o.y - f.y : 0;
      const d = Math.hypot(dx, dy) || 1;
      dir = { x: dx / d, y: dy / d };
      travel = Math.max(0, Math.min(FLIP_MAX_TRAVEL, d - FLIP_LAND_AT));
      if (game.mode === 'ring') f.angle = Math.atan2(dy, dx);
    }
    f.flipHits = 0;
    const flight = MOVES.flip.startup - FLIP_CROUCH;
    f.flipStep = { x: (dir.x * travel) / flight, y: (dir.y * travel) / flight };
  }

  /** Counts the flip's hits: true for the second. */
  function flipHit(att) {
    if (att.move !== 'flip') return false;
    att.flipHits = (att.flipHits || 0) + 1;
    return att.flipHits === 2;
  }

  /** Through the air, the way it was aimed. */
  function flipTravel(game, f) {
    if (!f.flipStep) return;
    f.x += f.flipStep.x;
    f.y += f.flipStep.y;
  }

  function isActionable(f) {
    return f.state === 'idle' || f.state === 'walk' || f.state === 'block';
  }

  function movePhase(f) {
    if (f.state !== 'attack') return null;
    const m = MOVES[f.move];
    if (f.t < m.startup) return 'startup';
    if (f.t < m.startup + m.active) return 'active';
    return 'recovery';
  }

  function setState(f, state, move) {
    f.state = state;
    f.move = move || null;
    f.t = 0;
    f.hitLanded = false;
  }

  function tryStartAction(game, f, input) {
    const action = input.buffered;
    if (!action) return;
    const m = MOVES[action];
    if (f.stamina < m.stamina) return;
    f.stamina -= m.stamina;
    f.stats.thrown++;
    setState(f, 'attack', action);
    // The attack's height is locked in when it starts.
    f.aim = input.aim;
    input.buffered = null;
    if (action === 'flip') {
      aimFlip(game, f);
      game.events.push({ type: 'flip', attacker: game.fighters.indexOf(f) });
    } else if (action === 'vault') {
      aimVault(game, f);
      game.events.push({ type: 'vault', attacker: game.fighters.indexOf(f) });
    }
    else if (f.luna) lunge(game, f, m);
  }

  /** How far this fighter's attack reaches. */
  function reach(f, m) {
    return f.luna ? m.range * LUNA_REACH : m.range;
  }

  /** The opponent this fighter is fighting: the other one, or their target in the ring. */
  function opponentOf(game, f) {
    if (game.mode === 'ring') return f.target !== null ? game.fighters[f.target] : null;
    return game.fighters.find((o) => o !== f) || null;
  }

  /**
   * Luna's assist: an attack that's just out of reach steps in so it lands.
   * A push that friction slows (the same as knockback), so it's a quick
   * slide, not a teleport.
   */
  function lunge(game, f, m) {
    const o = opponentOf(game, f);
    if (!o || !standing(o)) return;
    const d = distance(f, o);
    const short = d - reach(f, m) + 10;
    if (short <= 0 || short > LUNGE_MAX_SHORT) return;
    // Enough push to close the gap by the time the attack is out.
    const speed = short * (1 - KNOCKBACK_FRICTION) / (1 - KNOCKBACK_FRICTION ** m.startup);
    f.vx += ((o.x - f.x) / (d || 1)) * speed;
    if (game.mode === 'ring') f.vy += ((o.y - f.y) / (d || 1)) * speed;
  }
  const LUNGE_MAX_SHORT = LUNA_LUNGE + 10;

  function updateFighterState(game, index) {
    const f = game.fighters[index];
    const input = game.inputs[index];
    const fighting = game.phase === 'fight';

    if (input.buffered) {
      input.bufferAge++;
      if (input.bufferAge > INPUT_BUFFER_TICKS) input.buffered = null;
    }
    f.t++;

    // Timed states resolve back to neutral.
    if (f.state === 'attack') {
      const m = MOVES[f.move];
      if (f.t >= m.startup + m.active + m.recovery) setState(f, 'idle');
    } else if (f.state === 'hitstun' && f.t >= f.stun) {
      setState(f, 'idle');
    } else if (f.state === 'blockstun' && f.t >= f.stun) {
      setState(f, input.block ? 'block' : 'idle');
    } else if (f.state === 'guardbreak' && f.t >= GUARD_BREAK_TICKS) {
      setState(f, 'idle');
    }

    if (fighting) {
      if (f.giant > 0) f.giant--;
      if (f.invisible > 0) f.invisible--;
    }
    if (!fighting || f.state === 'ko') return;
    if (airborne(f)) flipTravel(game, f);
    if (f.state === 'attack' && f.move === 'vault' && f.t === MOVES.vault.startup) turnAround(game, f);
    // The flip's second hit, if the first landed.
    if (f.state === 'attack' && f.move === 'flip' && f.t === MOVES.flip.startup + FLIP_SECOND_AT && f.flipHits === 1) {
      f.hitLanded = false;
    }

    if (isActionable(f)) {
      f.aim = input.aim;
      tryStartAction(game, f, input);
    }

    if (isActionable(f)) {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      // Up and down only mean anything in the ring.
      const dirY = game.mode === 'ring' ? (input.down ? 1 : 0) - (input.up ? 1 : 0) : 0;
      const wantBlock = input.block;
      const next = wantBlock ? 'block' : dir !== 0 || dirY !== 0 ? 'walk' : 'idle';
      if (next !== f.state) {
        f.state = next;
        f.t = 0;
      }
      const speed = (wantBlock ? BLOCK_WALK_SPEED : WALK_SPEED) * (f.luna ? LUNA_SPEED : 1);
      // Diagonals are no faster than straight lines.
      const norm = dir !== 0 && dirY !== 0 ? Math.SQRT1_2 : 1;
      let mx = dir * norm;
      let my = dirY * norm;
      if (f.luna && game.mode === 'ring' && (mx || my)) [mx, my] = assistWalk(game, f, mx, my);
      f.x += mx * speed;
      f.y += my * speed;
    }

    const regen = f.state === 'block' ? STAMINA_REGEN_BLOCKING
      : f.state === 'attack' ? 0 : STAMINA_REGEN;
    f.stamina = Math.min(MAX_STAMINA, f.stamina + regen);
  }

  /**
   * Luna's aim assist in the ring: walking roughly towards an opponent (within
   * 60°) bends her path towards them. It only bends where she's going.
   */
  function assistWalk(game, f, mx, my) {
    let best = null;
    let bestScore = Infinity;
    for (const o of game.fighters) {
      if (o === f || !standing(o)) continue;
      const vx = o.x - f.x;
      const vy = o.y - f.y;
      const d = Math.hypot(vx, vy);
      if (d < 1) continue;
      const cos = (vx * mx + vy * my) / d;
      if (cos < ASSIST_CONE) continue;
      const score = d * (2 - cos);
      if (score < bestScore) { bestScore = score; best = { x: vx / d, y: vy / d }; }
    }
    if (!best) return [mx, my];
    const x = mx * (1 - ASSIST_PULL) + best.x * ASSIST_PULL;
    const y = my * (1 - ASSIST_PULL) + best.y * ASSIST_PULL;
    const n = Math.hypot(x, y) || 1;
    return [x / n, y / n];
  }

  // ---- Ring mode: facing, pushing apart, hits ---------------------------------

  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }
  const standing = (f) => f.hp > 0 && !f.left && f.state !== 'ko';

  /** Everyone faces their nearest opponent, turning to a new one only once they're clearly nearer. */
  function faceTargets(game) {
    game.fighters.forEach((f, i) => {
      if (!standing(f)) return;
      let best = null;
      let bestD = Infinity;
      game.fighters.forEach((o, j) => {
        if (j === i || !standing(o)) return;
        const d = distance(f, o);
        if (d < bestD) { best = j; bestD = d; }
      });
      if (best === null) { f.target = null; return; }
      const current = f.target !== null && game.fighters[f.target] && standing(game.fighters[f.target])
        ? f.target : null;
      if (current === null || distance(f, game.fighters[current]) - bestD > RETARGET_MARGIN) f.target = best;
      // An attack goes where it was aimed when it started.
      if (f.state !== 'attack') f.angle = angleTo(f, game.fighters[f.target]);
    });
  }

  function applyRingPhysics(game) {
    for (const f of game.fighters) {
      f.x += f.vx;
      f.y += f.vy;
      f.vx *= KNOCKBACK_FRICTION;
      f.vy *= KNOCKBACK_FRICTION;
      if (Math.abs(f.vx) < 0.05) f.vx = 0;
      if (Math.abs(f.vy) < 0.05) f.vy = 0;
    }
    // Push overlapping fighters apart (a couple of passes settles a crowd),
    // keeping everyone inside the ropes. Fighters who are down or have left
    // don't get in the way.
    const inRing = game.fighters.filter((f) => !f.left);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < inRing.length; i++) {
        for (let j = i + 1; j < inRing.length; j++) {
          const a = inRing[i];
          const b = inRing[j];
          if (!standing(a) || !standing(b) || airborne(a) || airborne(b)) continue;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          if (d >= MIN_SEPARATION) continue;
          if (d < 0.01) { dx = 1; dy = 0; d = 1; }
          const push = (MIN_SEPARATION - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
      for (const f of inRing) {
        f.x = Math.max(RING_MIN, Math.min(RING_MAX, f.x));
        f.y = Math.max(RING_MIN, Math.min(RING_MAX, f.y));
      }
    }
  }

  function resolveRingHits(game) {
    const pending = [];
    game.fighters.forEach((att, i) => {
      if (movePhase(att) !== 'active' || att.hitLanded) return;
      const m = MOVES[att.move];
      // Whoever is nearest in front of the attacker, within reach.
      let def = null;
      let bestD = Infinity;
      game.fighters.forEach((o, j) => {
        if (j === i || !standing(o) || airborne(o)) return;
        const d = distance(att, o);
        if (d > reach(att, m) || d >= bestD) return;
        // The flip lands on whoever is nearest, whichever way they are.
        if (!m.unblockable && angleDiff(att.angle, angleTo(att, o)) > HIT_ARC) return;
        def = j;
        bestD = d;
      });
      if (def === null) return;
      const d = game.fighters[def];
      att.hitLanded = true;
      pending.push({
        attacker: i, defender: def, move: att.move, height: att.aim, second: flipHit(att),
        defPhase: movePhase(d), defState: d.state, defAim: d.aim,
        // A guard only covers what's in front of it.
        faced: angleDiff(d.angle, angleTo(d, att)) <= GUARD_ARC,
      });
    });
    applyHits(game, pending, (att, def) => {
      const d = distance(att, def) || 1;
      return { x: (def.x - att.x) / d, y: (def.y - att.y) / d };
    });
  }

  function applyPhysics(game) {
    const [a, b] = game.fighters;
    for (const f of game.fighters) {
      f.x += f.vx;
      f.vx *= KNOCKBACK_FRICTION;
      if (Math.abs(f.vx) < 0.05) f.vx = 0;
    }
    // Keep fighters apart, then inside the ropes. If one is pinned against
    // the ropes, the other gets pushed back instead.
    const left = a.x <= b.x ? a : b;
    const right = left === a ? b : a;
    const gap = right.x - left.x;
    // Someone in the air goes over the other, not into them.
    const over = airborne(a) || airborne(b);
    if (gap < MIN_SEPARATION && !over) {
      const push = (MIN_SEPARATION - gap) / 2;
      left.x -= push;
      right.x += push;
    }
    for (const f of game.fighters) f.x = Math.max(RING_LEFT, Math.min(RING_RIGHT, f.x));
    if (right.x - left.x < MIN_SEPARATION && !over) {
      if (left.x <= RING_LEFT) right.x = left.x + MIN_SEPARATION;
      else left.x = right.x - MIN_SEPARATION;
    }
    left.facing = 1;
    right.facing = -1;
  }

  function resolveHits(game) {
    const pending = [];
    game.fighters.forEach((att, i) => {
      if (movePhase(att) !== 'active' || att.hitLanded) return;
      const def = game.fighters[1 - i];
      const m = MOVES[att.move];
      if (Math.abs(def.x - att.x) > reach(att, m)) return;
      if (def.state === 'ko' || airborne(def)) return;
      att.hitLanded = true;
      pending.push({
        attacker: i, defender: 1 - i, move: att.move, height: att.aim, second: flipHit(att),
        defPhase: movePhase(def), defState: def.state, defAim: def.aim, faced: true,
      });
    });
    applyHits(game, pending, (att, def) => ({ x: def.x >= att.x ? 1 : -1, y: 0 }));
  }

  /**
   * Resolves hits simultaneously so trades are symmetric. `direction` gives
   * the unit vector the defender is knocked along.
   */
  function applyHits(game, pending, direction) {
    for (const hit of pending) {
      const att = game.fighters[hit.attacker];
      const def = game.fighters[hit.defender];
      const m = MOVES[hit.move];
      const push = direction(att, def);
      const guarding = hit.defState === 'block' || hit.defState === 'blockstun';
      const blocking = guarding && hit.defAim === hit.height && hit.faced && !m.unblockable;
      const ev = { target: hit.defender, attacker: hit.attacker, move: hit.move, height: hit.height };

      if (blocking) {
        def.hp = Math.max(0, def.hp - m.blockDamage);
        def.stamina -= m.blockStamina;
        att.stats.blocked++;
        att.stats.damage += m.blockDamage;
        def.vx += push.x * m.blockKnockback;
        def.vy += push.y * m.blockKnockback;
        if (def.stamina <= 0) {
          def.stamina = 0;
          setState(def, 'guardbreak');
          game.events.push({ type: 'guardbreak', ...ev });
        } else {
          setState(def, 'blockstun');
          def.stun = m.blockstun;
          game.events.push({ type: 'block', ...ev });
        }
      } else {
        const h = hit.move === 'flip' && !hit.second ? m.first : m[hit.height];
        const counter = !m.unblockable && (hit.defPhase === 'startup' || hit.defPhase === 'recovery'
          || hit.defState === 'guardbreak');
        const damage = Math.round(h.damage * (counter ? COUNTER_MULTIPLIER : 1) * (att.giant > 0 ? JEMINI_DAMAGE : 1));
        def.hp = Math.max(0, def.hp - damage);
        def.stamina = Math.max(0, def.stamina - h.winded);
        att.stats.landed++;
        att.stats.damage += damage;
        def.vx += push.x * h.knockback;
        def.vy += push.y * h.knockback;
        setState(def, 'hitstun');
        def.stun = h.hitstun;
        def.hitHeight = hit.height;
        forgetTyping(def);
        // Guarding the wrong height (or the wrong way) is worth telling the defender about.
        game.events.push({ type: 'hit', ...ev, damage, counter, wrongGuard: guarding, ...(hit.second ? { second: true } : {}) });
      }
      if (def.hp <= 0) {
        setState(def, 'ko');
        game.events.push({ type: 'ko', target: hit.defender });
      }
    }
  }

  function endRound(game, winner) {
    game.phase = 'roundEnd';
    game.phaseT = 0;
    game.roundWinner = winner;
    if (winner !== null) game.fighters[winner].roundsWon++;
    game.events.push({ type: 'roundEnd', winner, round: game.round });
  }

  /** Who's ahead: the one index with the most of `score`, or null if it's shared. */
  function leader(fighters, score, among) {
    let best = null;
    let bestScore = -Infinity;
    let shared = false;
    fighters.forEach((f, i) => {
      if (among && !among(f)) return;
      const v = score(f);
      if (v > bestScore) { best = i; bestScore = v; shared = false; } else if (v === bestScore) shared = true;
    });
    return shared ? null : best;
  }

  function checkRingRoundOver(game) {
    const up = game.fighters.filter(standing);
    // The last one standing takes the round (nobody, if the last ones went down together).
    if (up.length <= 1) {
      endRound(game, up.length ? game.fighters.indexOf(up[0]) : null);
      return;
    }
    if (game.timer <= 0) endRound(game, leader(game.fighters, (f) => f.hp, standing));
  }

  function checkRoundOver(game) {
    if (game.mode === 'ring') return checkRingRoundOver(game);
    const [a, b] = game.fighters;
    const aDown = a.hp <= 0;
    const bDown = b.hp <= 0;
    if (aDown || bDown) {
      endRound(game, aDown && bDown ? null : aDown ? 1 : 0);
      return;
    }
    if (game.timer <= 0) {
      endRound(game, a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1);
    }
  }

  function step(game) {
    game.tick++;
    game.phaseT++;

    if (game.phase === 'matchEnd') return game;

    if (game.phase === 'countdown' && game.phaseT >= COUNTDOWN_TICKS) {
      game.phase = 'fight';
      game.phaseT = 0;
      game.events.push({ type: 'fight', round: game.round });
      game.fist = { next: nextFist(game), warn: null };
    }

    if (game.phase === 'roundEnd' && game.phaseT >= ROUND_END_TICKS) {
      const stillIn = game.fighters.filter((f) => !f.left).length;
      if (game.fighters.some((f) => f.roundsWon >= ROUNDS_TO_WIN) || game.round >= MAX_ROUNDS || stillIn < 2) {
        game.phase = 'matchEnd';
        game.phaseT = 0;
        game.winner = leader(game.fighters, (f) => f.roundsWon);
        game.events.push({ type: 'matchEnd', winner: game.winner });
        return game;
      }
      game.round++;
      game.timer = ROUND_TICKS;
      game.phase = 'countdown';
      game.phaseT = 0;
      game.roundWinner = null;
      resetFightersForRound(game);
      return game;
    }

    game.fighters.forEach((_, i) => updateFighterState(game, i));
    if (game.mode === 'ring') {
      faceTargets(game);
      applyRingPhysics(game);
    } else {
      applyPhysics(game);
    }

    if (game.phase === 'fight') {
      if (game.mode === 'ring') resolveRingHits(game);
      else resolveHits(game);
      if (game.fists) updateFist(game);
      game.timer--;
      checkRoundOver(game);
    }
    return game;
  }

  // ---- The giant fist --------------------------------------------------------

  function nextFist(game) {
    return FIST_MIN_TICKS + Math.floor(game.random() * (FIST_MAX_TICKS - FIST_MIN_TICKS + 1));
  }

  /** Counts down to the next shadow, then the slam a second after it. */
  function updateFist(game) {
    const fist = game.fist;
    if (!fist.warn) {
      if (fist.next-- > 0) return;
      const up = game.fighters.filter(standing);
      if (!up.length) return;
      // Anyone can be picked, but Kyle is more likely to be.
      const weight = (f) => (f.kyle ? FIST_KYLE_ODDS : 1);
      let pick = game.random() * up.reduce((sum, f) => sum + weight(f), 0);
      let target = up[up.length - 1];
      for (const f of up) {
        pick -= weight(f);
        if (pick < 0) { target = f; break; }
      }
      // It comes down where they were when the shadow appeared: move and it misses.
      fist.warn = { x: target.x, y: target.y, t: 0, target: game.fighters.indexOf(target) };
      game.events.push({ type: 'fistWarn', x: fist.warn.x, y: fist.warn.y, target: fist.warn.target });
      return;
    }
    if (++fist.warn.t < FIST_WARN_TICKS) return;
    const { x, y } = fist.warn;
    const ring = game.mode === 'ring';
    const hit = [];
    game.fighters.forEach((f, i) => {
      if (!standing(f) || airborne(f)) return; // flipped clean over it
      const dx = f.x - x;
      const dy = ring ? f.y - y : 0;
      const d = Math.hypot(dx, dy);
      if (d > FIST_RADIUS) return;
      hit.push(i);
      f.hp = Math.max(0, f.hp - FIST_DAMAGE);
      // Knocked out from under it (any way at all if it landed right on them).
      const ax = d > 1 ? dx / d : i % 2 ? 1 : -1;
      const ay = d > 1 ? dy / d : 0;
      f.vx += ax * FIST_KNOCKBACK;
      if (ring) f.vy += ay * FIST_KNOCKBACK;
      setState(f, 'hitstun');
      f.stun = FIST_HITSTUN;
      forgetTyping(f);
      f.hitHeight = 'head';
    });
    game.events.push({ type: 'fist', x, y, hits: hit, damage: FIST_DAMAGE });
    for (const i of hit) {
      if (game.fighters[i].hp <= 0) {
        setState(game.fighters[i], 'ko');
        game.events.push({ type: 'ko', target: i });
      }
    }
    game.fist = { next: nextFist(game), warn: null };
  }

  /**
   * A fighter whose player left: down for the rest of the match. In the ring
   * the others fight on; one on one, the match is over.
   */
  function removeFighter(game, index) {
    const f = game.fighters[index];
    if (!f || f.left) return;
    f.left = true;
    f.hp = 0;
    setState(f, 'ko');
    game.events.push({ type: 'left', target: index });
  }

  /** Luna (any capitals) gets the helping hand. */
  function isKyle(name) {
    return String(name || '').trim().toLowerCase() === 'kyle';
  }

  function isLuna(name) {
    return String(name || '').trim().toLowerCase() === 'luna';
  }

  // Compact view sent over the wire each broadcast.
  function snapshot(game) {
    const ring = game.mode === 'ring';
    return {
      mode: game.mode,
      phase: game.phase,
      phaseT: game.phaseT,
      round: game.round,
      timer: game.timer,
      roundWinner: game.roundWinner,
      winner: game.winner,
      tick: game.tick,
      ...(game.fist.warn ? { fist: { x: game.fist.warn.x, y: Math.round(game.fist.warn.y), t: game.fist.warn.t } } : {}),
      fighters: game.fighters.map((f) => ({
        name: f.name,
        ...(f.luna ? { luna: true } : {}),
        ...(f.typing ? { typing: f.typing } : {}),
        ...(f.giant > 0 ? { giant: f.giant } : {}),
        ...(f.invisible > 0 ? { invisible: f.invisible } : {}),
        x: Math.round(f.x * 10) / 10,
        ...(ring ? { y: Math.round(f.y * 10) / 10, angle: Math.round(f.angle * 1000) / 1000, left: f.left } : {}),
        facing: f.facing,
        hp: f.hp,
        stamina: Math.round(f.stamina),
        state: f.state,
        move: f.move,
        aim: f.aim,
        hitHeight: f.hitHeight,
        t: f.t,
        roundsWon: f.roundsWon,
        stats: f.stats,
      })),
    };
  }

  const api = {
    TICK_RATE, RING_LEFT, RING_RIGHT, MIN_SEPARATION, MAX_HP, MAX_STAMINA,
    ROUND_TICKS, COUNTDOWN_TICKS, ROUND_END_TICKS, ROUNDS_TO_WIN, MAX_ROUNDS,
    MOVES, AIMS, ACTIONS, GUARD_BREAK_TICKS,
    MAX_FIGHTERS, RING_MIN, RING_MAX, HIT_ARC, GUARD_ARC, LUNA_SPEED, LUNA_REACH,
    FIST_MIN_TICKS, FIST_MAX_TICKS, FIST_WARN_TICKS, FIST_DAMAGE, FIST_RADIUS,
    createGame, step, setHeld, pressAction, snapshot, movePhase, removeFighter, isLuna,
    cheat, typeKey, airborne, FLIP_CODE, CODES, JEMINI_TICKS, JEMINI_DAMAGE, KYLE_TICKS, FLIP_CROUCH, FLIP_MAX_TRAVEL, FIST_KYLE_ODDS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoxerGame = api;
})(typeof self !== 'undefined' ? self : this);
