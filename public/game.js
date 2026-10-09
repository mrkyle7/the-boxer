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
// Another: type "kalya" for the vault, a flip right over your opponent
// to land behind them and kick them in the back for 30, unblockable.
// "luna" teleports you to just beside the nearest opponent; "louise" dances
// (ending in a hip-bump for 30); "tamzin" cartwheels across at them for 30;
// "grandpa" makes you super fast for three seconds.
//
// Two more go on you, not on them: "jemini" makes you a giant for seven
// seconds (your hits do 10% more), and "kyle" makes you invisible to the
// others for five (that's only in how they're drawn: the fight's the same).
//
// Three more: "shree" puts you in charge of the giant fist (left and right
// to move it, punch to drop it; a hit on you while you steer cancels it);
// "shaan" shrinks the one you're fighting (their hits do 10% less), or just
// brings a Jemini giant back down to size; and "parimal" puts you in a car
// that drives at the nearest fighter, who has to get out of the way (to the
// side in the ring, or jump over it one on one: space to jump. A jump only
// gets you over the car: punches and the rest still hit you in the air).
//
// "spreadbury" turns the whole fight USA-themed for ten seconds, and two
// hotdogs come floating down at random moments (slower than the giant fist,
// with a shadow where they'll land). Whoever catches one before it hits the
// floor (reaching up for it as it comes down) gets half their health back. "mamtora" is the same, but India,
// and dosas.
//
// "edward" secretly pauses the fight for three seconds: everything looks
// the same and everyone keeps fighting, but no hit does any damage and the
// clock doesn't move. Stamina still goes down (and back up) as normal.
//
// "jay" makes you a vampire for seven seconds: your hits do half damage, and
// drain it, healing you by as much as they take. "leo" makes you a lion for
// seven: punches only (a swipe of the claws) for 1.5x damage, no kicks, and
// no blocking.
//
// "daniel" makes you spiky for five seconds: anyone who hits you takes 70%
// of it back, and you take only the other 30%.
//
// "priya" fires a freeze ray at whoever you're fighting: three seconds in a
// block of ice, unless they block it (guarding, facing it).
//
// And "harrison": a surprise. One of a handful of moves and powers, picked
// at random each time (see SURPRISES).
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
  const FLIP_MAX_TRAVEL = 330; // furthest it carries you: as far as the vault

  // The vault (Kalya, another cheat code): a flip over the opponent, landing
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

  // Louise's dance: a groove on the spot (a shimmy, a spin, a spin back) that
  // finishes with a hip-bump for 30 on whoever is near enough.
  MOVES.dance = {
    startup: 42, active: 6, recovery: 14, range: 190, stamina: 0,
    unblockable: true,
    head: { damage: 30, hitstun: 40, knockback: 28, winded: 0 },
    body: { damage: 30, hitstun: 40, knockback: 28, winded: 0 },
  };
  // Tamzin's cartwheel: hand over hand across the ring at them, feet first, for 30.
  MOVES.cartwheel = {
    startup: 32, active: 8, recovery: 14, range: 160, stamina: 0,
    unblockable: true,
    head: { damage: 30, hitstun: 40, knockback: 26, winded: 0 },
    body: { damage: 30, hitstun: 40, knockback: 26, winded: 0 },
  };
  // Luna: a teleport, to just beside the nearest opponent.
  const TELEPORT_GAP = 100;
  // Grandpa: super fast.
  const GRANDPA_TICKS = 3 * TICK_RATE;
  const GRANDPA_SPEED = 2.6;

  // The power-ups: how long each lasts, and what Jemini adds to your hits.
  const JEMINI_TICKS = 7 * TICK_RATE;
  const JEMINI_DAMAGE = 1.1;
  const KYLE_TICKS = 5 * TICK_RATE;

  // Cheat codes, and the move (or power-up) each one does.
  const CODES = {
    [FLIP_CODE]: 'flip', kalya: 'vault', luna: 'luna', louise: 'dance', tamzin: 'cartwheel', grandpa: 'grandpa', jemini: 'jemini', kyle: 'kyle', harrison: 'harrison',
    shree: 'shree', shaan: 'shaan', parimal: 'parimal', priya: 'priya', daniel: 'daniel', edward: 'edward', spreadbury: 'spreadbury', mamtora: 'mamtora', jay: 'jay', leo: 'leo',
  };
  const POWERS = ['luna', 'grandpa', 'jemini', 'kyle', 'harrison', 'shree', 'shaan', 'parimal', 'priya', 'daniel', 'edward', 'spreadbury', 'mamtora', 'jay', 'leo'];

  // Jay: a vampire. Leo: a lion.
  const VAMPIRE_TICKS = 7 * TICK_RATE;
  const VAMPIRE_DAMAGE = 0.5; // hits do half...
  const LION_TICKS = 7 * TICK_RATE;
  const LION_DAMAGE = 1.5;

  // Spreadbury: USA! USA! and two hotdogs from the sky. Mamtora: India, and dosas.
  const THEMES = { spreadbury: { theme: 'usa', treat: 'hotdog' }, mamtora: { theme: 'india', treat: 'dosa' } };
  const USA_TICKS = 10 * TICK_RATE;
  const HOTDOGS = 2;
  const HOTDOG_FIRST = TICK_RATE; // the drops come at random between these
  const HOTDOG_LAST = 7 * TICK_RATE;
  const HOTDOG_FALL_TICKS = Math.round(2.5 * TICK_RATE); // the fist's warning is one second
  const HOTDOG_CATCH_RADIUS = 85;
  const HOTDOG_HEAL = MAX_HP / 2;
  // How far down it has to come before you can reach up and grab it (as a
  // share of the fall): about head height. Jumping reaches it sooner.
  const HOTDOG_REACH_AT = 0.55;
  const HOTDOG_JUMP_REACH_AT = 0.3;

  // Edward: the secret pause button.
  const PAUSE_TICKS = 3 * TICK_RATE;

  // Daniel: spiky. Hits on you split 30:70, you:them.
  const SPIKY_TICKS = 5 * TICK_RATE;
  const SPIKY_KEEP = 0.3;

  // Priya: a freeze ray. An icy bolt that flies at whoever you're fighting
  // and freezes them for three seconds, unless they're guarding (facing it).
  const RAY_SPEED = 18;
  const RAY_RANGE = 1100; // fizzles out after this far
  const RAY_HIT_RADIUS = 50;
  const RAY_FREEZE_TICKS = 3 * TICK_RATE;

  // Shree: steering the giant fist.
  const SHREE_TICKS = 6 * TICK_RATE; // drops by itself if you haven't punched by then
  const SHREE_SPEED = 9; // how fast its shadow moves
  const SHREE_DROP_TICKS = 16; // from the punch to the slam
  // Shaan: shrunk.
  const SHAAN_TICKS = 7 * TICK_RATE;
  const SHAAN_DAMAGE = 0.9;
  // Parimal: the car.
  const CAR_REV_TICKS = 30; // revs on the spot for half a second first: time to get out of the way
  const CAR_SPEED = 10;
  const CAR_TICKS = CAR_REV_TICKS + 60; // the longest it goes for
  const CAR_DAMAGE = 30;
  const CAR_HIT_RADIUS = 75;
  const CAR_KNOCKBACK = 32;

  // Harrison's surprises: one of these, at random.
  //  zap: lightning strikes whoever you're fighting, for 25 (no guard stops it)
  //  banana: they slip on a banana skin, 15, and are down for a second and a bit
  //  freeze: everyone else is frozen in a block of ice for three seconds
  //  zoom: you run nearly twice as fast for six seconds
  //  snack: a quick snack puts 30 health and all your stamina back
  const SURPRISES = ['zap', 'banana', 'freeze', 'zoom', 'snack'];
  const ZAP_DAMAGE = 25;
  const BANANA_DAMAGE = 15;
  const BANANA_TICKS = 80;
  const FREEZE_TICKS = 3 * TICK_RATE;
  const ZOOM_TICKS = 6 * TICK_RATE;
  const ZOOM_SPEED = 1.8;
  const SNACK_HEAL = 30;
  const CODE_MAX = Math.max(...Object.keys(CODES).map((c) => c.length));
  const AIRBORNE_MOVES = ['flip', 'vault', 'jump'];

  // Jumping (one on one only): up and down again, over a car (or anything).
  const JUMP_CROUCH = 2; // off the ground quick
  MOVES.jump = {
    startup: 40, active: 0, recovery: 6, range: 0, stamina: 12,
    head: { damage: 0, hitstun: 0, knockback: 0, winded: 0 },
    body: { damage: 0, hitstun: 0, knockback: 0, winded: 0 },
  };

  const AIMS = ['head', 'body'];
  const ACTIONS = ['punch', 'kick', 'jump'];

  const DEFAULT_NAMES = ['Red', 'Blue', 'Green', 'Gold'];

  function createFighter(index, name, count) {
    const ring = count > 2;
    const start = ring ? RING_STARTS[count][index] : null;
    return {
      name: name || DEFAULT_NAMES[index],
      luna: isLuna(name),
      giant: 0, // ticks of Jemini left
      spiky: 0, // ticks of Daniel's spikes left
      vampire: 0, // ticks of Jay's vampire left
      lion: 0, // ticks of Leo's lion left
      tiny: 0, // ticks of being shrunk by Shaan left
      shree: null, // steering the giant fist: { x, y, t, drop }
      car: null, // driving: { dx, dy, t, hit }
      frozen: 0, // ticks left in a block of ice
      fast: 0, // ticks of zooming left
      turbo: 0, // ticks of Grandpa's super speed left
      slip: 0, // ticks left on the floor after a banana skin
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
      bolts: [], // Priya's freeze rays in flight
      usa: 0, // ticks of the theme (Spreadbury's USA, Mamtora's India) left
      theme: null, // 'usa' or 'india'
      hotdogs: [], // { x, y, at (tick of the USA it drops), t (ticks falling, or -1 waiting) }
      paused: 0, // ticks of Edward's secret pause left
      pausedBy: null,
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
    if (action === 'jump' && game.mode === 'ring') return; // one on one only
    if (action === 'kick' && game.fighters[index] && game.fighters[index].lion > 0) return; // lions swipe, they don't kick
    const input = game.inputs[index];
    // A cheat move that's just gone in isn't replaced by the key that finished it.
    if (['flip', 'vault', 'dance', 'cartwheel'].includes(input.buffered)) return;
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

  /** Jemini (a giant), Kyle (invisible) or Harrison (a surprise), straight away. */
  function power(game, index, which) {
    const f = game.fighters[index];
    if (!f || game.phase !== 'fight' || !standing(f)) return;
    if (which === 'harrison') {
      surprise(game, index);
      return;
    }
    if (which === 'shree') {
      if (f.shree || f.car) return;
      f.shree = { x: f.x, y: f.y, t: 0, drop: -1 };
      setState(f, 'idle');
      game.inputs[index].buffered = null;
      game.events.push({ type: 'shree', attacker: index });
      return;
    }
    if (which === 'shaan') {
      const o = foeOf(game, f);
      if (!o) return;
      // A Jemini giant just comes back down to size; anyone else shrinks.
      const unbig = o.giant > 0;
      if (unbig) o.giant = 0;
      else o.tiny = SHAAN_TICKS;
      game.events.push({ type: 'shaan', attacker: index, target: game.fighters.indexOf(o), unbig });
      return;
    }
    if (THEMES[which]) {
      const { theme, treat } = THEMES[which];
      game.usa = USA_TICKS;
      game.theme = theme;
      // Two drops at random moments (at least a second apart), at random spots.
      const first = HOTDOG_FIRST + Math.floor(game.random() * (HOTDOG_LAST - HOTDOG_FIRST - TICK_RATE));
      const second = first + TICK_RATE + Math.floor(game.random() * (HOTDOG_LAST - first - TICK_RATE + 1));
      const ring = game.mode === 'ring';
      const spot = () => ({
        x: (ring ? RING_MIN : RING_LEFT) + 40 + game.random() * ((ring ? RING_MAX - RING_MIN : RING_RIGHT - RING_LEFT) - 80),
        y: ring ? RING_MIN + 40 + game.random() * (RING_MAX - RING_MIN - 80) : 0,
      });
      game.hotdogs = [first, second].slice(0, HOTDOGS).map((at) => ({ ...spot(), at, t: -1, kind: treat }));
      game.usaT = 0;
      game.events.push({ type: 'theme', theme, attacker: index });
      return;
    }
    if (which === 'edward') {
      game.paused = PAUSE_TICKS;
      game.pausedBy = index;
      game.events.push({ type: 'edward', attacker: index });
      return;
    }
    if (which === 'luna') {
      teleport(game, f);
      return;
    }
    if (which === 'grandpa') {
      f.turbo = GRANDPA_TICKS;
      game.events.push({ type: 'grandpa', target: index });
      return;
    }
    if (which === 'jay') {
      f.vampire = VAMPIRE_TICKS;
      game.events.push({ type: 'jay', target: index });
      return;
    }
    if (which === 'leo') {
      f.lion = LION_TICKS;
      const input = game.inputs[index];
      if (input.buffered === 'kick') input.buffered = null;
      if (f.state === 'block') setState(f, 'idle');
      game.events.push({ type: 'leo', target: index });
      return;
    }
    if (which === 'daniel') {
      f.spiky = SPIKY_TICKS;
      game.events.push({ type: 'daniel', target: index });
      return;
    }
    if (which === 'priya') {
      const o = foeOf(game, f);
      if (!o) return;
      const dx = o.x - f.x;
      const dy = game.mode === 'ring' ? o.y - f.y : 0;
      const d = Math.hypot(dx, dy) || 1;
      // Fired at where they are now: it flies straight, it doesn't follow them.
      game.bolts.push({ owner: index, x: f.x, y: f.y, dx: dx / d, dy: dy / d, dist: 0 });
      if (game.mode === 'ring') f.angle = Math.atan2(dy, dx);
      game.events.push({ type: 'priya', attacker: index, target: game.fighters.indexOf(o) });
      return;
    }
    if (which === 'parimal') {
      if (f.car || f.shree) return;
      const others = game.fighters.filter((o) => o !== f && standing(o));
      if (!others.length) return;
      const o = others.reduce((a, b) => (distance(f, a) <= distance(f, b) ? a : b));
      const dx = o.x - f.x;
      const dy = game.mode === 'ring' ? o.y - f.y : 0;
      const d = Math.hypot(dx, dy) || 1;
      // Aimed where they are now: it doesn't steer after them.
      f.car = { dx: dx / d, dy: dy / d, t: 0, hit: [] };
      if (game.mode === 'ring') f.angle = Math.atan2(dy, dx);
      setState(f, 'idle');
      game.inputs[index].buffered = null;
      game.events.push({ type: 'parimal', attacker: index, target: game.fighters.indexOf(o) });
      return;
    }
    if (which === 'jemini') {
      f.giant = JEMINI_TICKS;
      f.tiny = 0;
    } else {
      f.invisible = KYLE_TICKS;
    }
    game.events.push({ type: which, target: index });
  }

  /** Whoever you're fighting, or the nearest one up if they're not. */
  function foeOf(game, f) {
    const o = opponentOf(game, f);
    if (o && standing(o) && o !== f) return o;
    const others = game.fighters.filter((x) => x !== f && standing(x));
    if (!others.length) return null;
    return others.reduce((a, b) => (distance(f, a) <= distance(f, b) ? a : b));
  }

  /** Steering the giant fist: move its shadow, punch to drop it. */
  function steerFist(game, f, input) {
    const s = f.shree;
    s.t++;
    const ring = game.mode === 'ring';
    if (s.drop < 0) {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const dirY = ring ? (input.down ? 1 : 0) - (input.up ? 1 : 0) : 0;
      const norm = dir && dirY ? Math.SQRT1_2 : 1;
      s.x = Math.max(ring ? RING_MIN : RING_LEFT, Math.min(ring ? RING_MAX : RING_RIGHT, s.x + dir * norm * SHREE_SPEED));
      if (ring) s.y = Math.max(RING_MIN, Math.min(RING_MAX, s.y + dirY * norm * SHREE_SPEED));
      if (input.buffered === 'punch' || s.t >= SHREE_TICKS) s.drop = 0;
      input.buffered = null;
      return;
    }
    if (++s.drop < SHREE_DROP_TICKS) return;
    // Down it comes, on anyone under it but you.
    const index = game.fighters.indexOf(f);
    const hits = [];
    game.fighters.forEach((o, i) => {
      if (o === f || !standing(o) || untouchable(o)) return;
      const d = Math.hypot(o.x - s.x, ring ? o.y - s.y : 0);
      if (d > FIST_RADIUS) return;
      hits.push(i);
    });
    f.shree = null;
    game.events.push({ type: 'shreeSlam', attacker: index, x: s.x, y: s.y, hits, damage: game.paused > 0 ? 0 : FIST_DAMAGE });
    for (const i of hits) {
      const o = game.fighters[i];
      const pseudo = { x: s.x, y: s.y, stats: f.stats };
      hurt(game, pseudo, o, FIST_DAMAGE, FIST_HITSTUN, FIST_KNOCKBACK, index);
    }
  }

  /** Driving: straight on, knocking down whoever's in the way, until it stops. */
  function drive(game, f) {
    const c = f.car;
    c.t++;
    if (c.t <= CAR_REV_TICKS) return; // brrm brrm
    const ring = game.mode === 'ring';
    const x0 = f.x;
    const y0 = f.y;
    f.x = Math.max(ring ? RING_MIN : RING_LEFT, Math.min(ring ? RING_MAX : RING_RIGHT, f.x + c.dx * CAR_SPEED));
    if (ring) f.y = Math.max(RING_MIN, Math.min(RING_MAX, f.y + c.dy * CAR_SPEED));
    const index = game.fighters.indexOf(f);
    game.fighters.forEach((o, i) => {
      if (o === f || c.hit.includes(i) || !standing(o) || untouchable(o) || airborne(o)) return; // jumped over it
      if (Math.hypot(o.x - f.x, ring ? o.y - f.y : 0) > CAR_HIT_RADIUS) return;
      c.hit.push(i);
      game.events.push({ type: 'carHit', attacker: index, target: i });
      hurt(game, f, o, CAR_DAMAGE, 40, CAR_KNOCKBACK);
    });
    // Out of road (the ropes), or out of petrol.
    const stuck = Math.abs(f.x - x0) < 1 && Math.abs(f.y - y0) < 1;
    if (c.t >= CAR_TICKS || stuck) {
      f.car = null;
      game.events.push({ type: 'carStop', attacker: index });
    }
  }

  /** Knocked about: the cheat code goes out of your head, and you let go of the fist. */
  function knocked(game, f) {
    forgetTyping(f);
    if (f.shree) {
      f.shree = null;
      game.events.push({ type: 'shreeCancel', attacker: game.fighters.indexOf(f) });
    }
  }

  /** Harrison: one of the surprises, at random. */
  function surprise(game, index) {
    const f = game.fighters[index];
    const others = game.fighters.filter((o) => o !== f && standing(o));
    let pick = SURPRISES[Math.floor(game.random() * SURPRISES.length)];
    // The ones that need someone to do it to, when there's nobody up.
    if (!others.length && ['zap', 'banana', 'freeze'].includes(pick)) pick = 'snack';
    const ev = { type: 'harrison', surprise: pick, attacker: index };
    // Whoever you're fighting (or the nearest, in the ring).
    const foe = () => foeOf(game, f);
    if (pick === 'zap') {
      const o = foe();
      ev.target = game.fighters.indexOf(o);
      game.events.push(ev);
      hurt(game, f, o, ZAP_DAMAGE, 30, 6);
    } else if (pick === 'banana') {
      const o = foe();
      ev.target = game.fighters.indexOf(o);
      game.events.push(ev);
      o.slip = BANANA_TICKS;
      hurt(game, f, o, BANANA_DAMAGE, BANANA_TICKS, 0);
    } else if (pick === 'freeze') {
      ev.targets = others.map((o) => game.fighters.indexOf(o));
      game.events.push(ev);
      for (const o of others) {
        o.frozen = FREEZE_TICKS;
        if (o.state !== 'hitstun') setState(o, 'idle');
        o.vx = 0;
        o.vy = 0;
      }
    } else if (pick === 'zoom') {
      f.fast = ZOOM_TICKS;
      game.events.push(ev);
    } else {
      f.hp = Math.min(MAX_HP, f.hp + SNACK_HEAL);
      f.stamina = MAX_STAMINA;
      game.events.push(ev);
    }
  }

  /**
   * Daniel's spikes: a spiky fighter takes 30% of a hit, and whoever hit them
   * gets the other 70% back. Returns what the spiky one takes.
   */
  function spikes(game, def, att, damage) {
    if (game.paused > 0) return 0; // Edward's secret pause: nothing hurts, either way
    if (!(def.spiky > 0) || !att || att === def || !game.fighters.includes(att) || !standing(att)) return damage;
    const keep = Math.round(damage * SPIKY_KEEP);
    const back = damage - keep;
    if (back <= 0) return damage;
    att.hp = Math.max(0, att.hp - back);
    def.stats.damage += back;
    const ai = game.fighters.indexOf(att);
    game.events.push({ type: 'spiked', target: ai, attacker: game.fighters.indexOf(def), damage: back });
    if (att.hp <= 0) {
      setState(att, 'ko');
      game.events.push({ type: 'ko', target: ai });
    }
    return keep;
  }

  /**
   * Luna's teleport: gone, and straight back just beside the nearest
   * opponent (on your side of them if there's room), facing them.
   */
  function teleport(game, f) {
    const others = game.fighters.filter((o) => o !== f && standing(o));
    if (!others.length) return;
    const o = others.reduce((a, b) => (distance(f, a) <= distance(f, b) ? a : b));
    const from = { x: f.x, y: f.y };
    const ring = game.mode === 'ring';
    if (ring) {
      const dx = f.x - o.x;
      const dy = f.y - o.y;
      const d = Math.hypot(dx, dy) || 1;
      let x = o.x + (dx / d) * TELEPORT_GAP;
      let y = o.y + (dy / d) * TELEPORT_GAP;
      // Pinned against the ropes: the other side of them instead.
      if (x < RING_MIN || x > RING_MAX || y < RING_MIN || y > RING_MAX) {
        x = o.x - (dx / d) * TELEPORT_GAP;
        y = o.y - (dy / d) * TELEPORT_GAP;
      }
      f.x = Math.max(RING_MIN, Math.min(RING_MAX, x));
      f.y = Math.max(RING_MIN, Math.min(RING_MAX, y));
      f.angle = Math.atan2(o.y - f.y, o.x - f.x);
    } else {
      const side = f.x <= o.x ? -1 : 1;
      let x = o.x + side * TELEPORT_GAP;
      if (x < RING_LEFT || x > RING_RIGHT) x = o.x - side * TELEPORT_GAP;
      f.x = Math.max(RING_LEFT, Math.min(RING_RIGHT, x));
    }
    f.vx = 0;
    f.vy = 0;
    game.events.push({ type: 'teleport', attacker: game.fighters.indexOf(f), target: game.fighters.indexOf(o), from, to: { x: f.x, y: f.y } });
  }

  /** Jay's vampire: whatever a hit takes off them, it gives back to you. */
  function drain(game, att, damage) {
    if (!att || !(att.vampire > 0) || damage <= 0 || !game.fighters.includes(att) || !standing(att)) return;
    const before = att.hp;
    att.hp = Math.min(MAX_HP, att.hp + damage);
    if (att.hp > before) game.events.push({ type: 'drain', target: game.fighters.indexOf(att), heal: att.hp - before });
  }

  /** Damage that isn't a punch or kick: no guard stops it. */
  function hurt(game, att, def, damage, stun, knockback, attIndex) {
    if (!def || !standing(def)) return;
    const i = game.fighters.indexOf(def);
    const hitter = attIndex !== undefined ? game.fighters[attIndex] : att;
    if (hitter && hitter.vampire > 0) damage = Math.round(damage * VAMPIRE_DAMAGE);
    damage = spikes(game, def, hitter, damage);
    def.hp = Math.max(0, def.hp - damage);
    drain(game, hitter, damage);
    att.stats.landed++;
    att.stats.damage += damage;
    const dx = def.x - att.x;
    const dy = game.mode === 'ring' ? def.y - att.y : 0;
    const d = Math.hypot(dx, dy) || 1;
    def.vx += (dx / d) * knockback;
    def.vy += (dy / d) * knockback;
    setState(def, 'hitstun');
    def.stun = stun;
    def.hitHeight = 'head';
    knocked(game, def);
    game.events.push({ type: 'hurt', target: i, attacker: attIndex !== undefined ? attIndex : game.fighters.indexOf(att), damage });
    if (def.hp <= 0) {
      def.slip = 0;
      setState(def, 'ko');
      game.events.push({ type: 'ko', target: i });
    }
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

  /** Off the ground in a flip, vault or jump, where nothing can touch you. */
  function airborne(f) {
    const crouch = f.move === 'jump' ? JUMP_CROUCH : FLIP_CROUCH;
    return f.state === 'attack' && AIRBORNE_MOVES.includes(f.move)
      && f.t >= crouch && f.t < MOVES[f.move].startup;
  }

  /**
   * In a flip or vault, or in a car: out of reach. (A plain jump only gets
   * you over a car: anything else can still hit you on the way up.)
   */
  function untouchable(f) {
    return (airborne(f) && f.move !== 'jump') || !!f.car;
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
  function aimFlip(game, f, move = 'flip') {
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
    const flight = MOVES[move].startup - FLIP_CROUCH;
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
    if (action !== 'jump') f.stats.thrown++;
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
    } else if (action === 'dance') {
      f.flipStep = null;
      game.events.push({ type: 'dance', attacker: game.fighters.indexOf(f) });
    } else if (action === 'cartwheel') {
      aimFlip(game, f, 'cartwheel');
      game.events.push({ type: 'cartwheel', attacker: game.fighters.indexOf(f) });
    } else if (action === 'jump') {
      f.flipStep = null; // straight up and down
    } else if (f.luna) lunge(game, f, m);
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
      if (f.fast > 0) f.fast--;
      if (f.turbo > 0) f.turbo--;
      if (f.slip > 0) f.slip--;
      if (f.frozen > 0) f.frozen--;
      if (f.tiny > 0) f.tiny--;
      if (f.spiky > 0) f.spiky--;
      if (f.vampire > 0) f.vampire--;
      if (f.lion > 0) f.lion--;
    }
    if (!fighting || f.state === 'ko') return;
    // Frozen solid: no moving, no attacking (but you can still be hit).
    if (f.frozen > 0) {
      input.buffered = null;
      return;
    }
    // Steering the giant fist, or driving: your fighter stands (or sits) still.
    if (f.shree) {
      steerFist(game, f, input);
      return;
    }
    if (f.car) {
      input.buffered = null;
      drive(game, f);
      return;
    }
    if (airborne(f)) flipTravel(game, f);
    // Cartwheeling across (on your hands, not in the air: you can be hit).
    if (f.state === 'attack' && f.move === 'cartwheel' && f.t >= FLIP_CROUCH && f.t < MOVES.cartwheel.startup) flipTravel(game, f);
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
      const wantBlock = input.block && !(f.lion > 0); // lions don't block
      const next = wantBlock ? 'block' : dir !== 0 || dirY !== 0 ? 'walk' : 'idle';
      if (next !== f.state) {
        f.state = next;
        f.t = 0;
      }
      const speed = (wantBlock ? BLOCK_WALK_SPEED : WALK_SPEED) * (f.luna ? LUNA_SPEED : 1) * (f.fast > 0 ? ZOOM_SPEED : 1) * (f.turbo > 0 ? GRANDPA_SPEED : 1);
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
          if (!standing(a) || !standing(b) || untouchable(a) || untouchable(b)) continue;
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
        if (j === i || !standing(o) || untouchable(o)) return;
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
    const over = untouchable(a) || untouchable(b);
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
      if (def.state === 'ko' || untouchable(def)) return;
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
        def.hp = Math.max(0, def.hp - (game.paused > 0 ? 0 : m.blockDamage));
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
        const full = Math.round(h.damage * (counter ? COUNTER_MULTIPLIER : 1) * (att.giant > 0 ? JEMINI_DAMAGE : 1) * (att.tiny > 0 ? SHAAN_DAMAGE : 1)
          * (att.lion > 0 ? LION_DAMAGE : 1) * (att.vampire > 0 ? VAMPIRE_DAMAGE : 1));
        const damage = spikes(game, def, att, full);
        def.hp = Math.max(0, def.hp - damage);
        drain(game, att, damage);
        def.stamina = Math.max(0, def.stamina - h.winded);
        att.stats.landed++;
        att.stats.damage += damage;
        def.vx += push.x * h.knockback;
        def.vy += push.y * h.knockback;
        setState(def, 'hitstun');
        def.stun = h.hitstun;
        def.hitHeight = hit.height;
        knocked(game, def);
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
      game.bolts = [];
      game.paused = 0;
      game.usa = 0;
      game.theme = null;
      game.hotdogs = [];
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
      updateBolts(game);
      updateUsa(game);
      // Edward's secret pause: the clock stands still till it's over.
      if (game.paused > 0) {
        game.paused--;
        if (game.paused === 0) game.events.push({ type: 'unpause', attacker: game.pausedBy });
      } else {
        game.timer--;
      }
      checkRoundOver(game);
    }
    return game;
  }

  // ---- The giant fist --------------------------------------------------------

  function nextFist(game) {
    return FIST_MIN_TICKS + Math.floor(game.random() * (FIST_MAX_TICKS - FIST_MIN_TICKS + 1));
  }

  /**
   * Priya's freeze rays: each flies straight on until it meets someone (not
   * whoever fired it, and not anyone in the air or in a car) or fizzles out.
   * A guard facing it stops it; otherwise they're frozen solid.
   */
  function updateBolts(game) {
    const ring = game.mode === 'ring';
    game.bolts = game.bolts.filter((b) => {
      b.x += b.dx * RAY_SPEED;
      b.y += b.dy * RAY_SPEED;
      b.dist += RAY_SPEED;
      const i = game.fighters.findIndex((o, j) => j !== b.owner && standing(o) && !untouchable(o)
        && Math.hypot(o.x - b.x, ring ? o.y - b.y : 0) <= RAY_HIT_RADIUS);
      if (i < 0) {
        const out = ring ? b.x < RING_MIN - 60 || b.x > RING_MAX + 60 || b.y < RING_MIN - 60 || b.y > RING_MAX + 60
          : b.x < RING_LEFT - 60 || b.x > RING_RIGHT + 60;
        if (b.dist < RAY_RANGE && !out) return true;
        game.events.push({ type: 'rayFizzle', x: b.x, y: b.y });
        return false;
      }
      const o = game.fighters[i];
      const guarding = o.state === 'block' || o.state === 'blockstun';
      // Facing it: one on one they always face the other way; in the ring the guard covers the front.
      const faced = ring ? angleDiff(o.angle, Math.atan2(-b.dy, -b.dx)) <= GUARD_ARC : o.facing === -Math.sign(b.dx || 1);
      if (guarding && faced) {
        game.events.push({ type: 'rayBlocked', attacker: b.owner, target: i });
        return false;
      }
      o.frozen = RAY_FREEZE_TICKS;
      if (o.state !== 'hitstun') setState(o, 'idle');
      o.vx = 0;
      o.vy = 0;
      knocked(game, o);
      game.events.push({ type: 'rayFreeze', attacker: b.owner, target: i });
      return false;
    });
  }

  /**
   * Spreadbury: the USA theme counts down, and the hotdogs drop on cue. One
   * that reaches the floor with a fighter close enough is caught (by the
   * nearest), for half their health back; otherwise it splats.
   */
  function updateUsa(game) {
    if (game.usa > 0 && --game.usa === 0) game.theme = null;
    if (!game.hotdogs.length) return;
    game.usaT++;
    const ring = game.mode === 'ring';
    game.hotdogs = game.hotdogs.filter((h) => {
      if (h.t < 0) {
        if (game.usaT >= h.at) {
          h.t = 0;
          game.events.push({ type: 'hotdogDrop', x: h.x, y: h.y, kind: h.kind });
        }
        return true;
      }
      const k = ++h.t / HOTDOG_FALL_TICKS;
      // Caught on the way down: whoever is under it and can reach it (the
      // nearest, if there's more than one).
      let best = null;
      let bestD = HOTDOG_CATCH_RADIUS;
      game.fighters.forEach((f, i) => {
        if (!standing(f)) return;
        if (k < (airborne(f) ? HOTDOG_JUMP_REACH_AT : HOTDOG_REACH_AT)) return;
        const d = Math.hypot(f.x - h.x, ring ? f.y - h.y : 0);
        if (d <= bestD) { best = i; bestD = d; }
      });
      if (best === null) {
        if (k < 1) return true;
        game.events.push({ type: 'hotdogSplat', x: h.x, y: h.y, kind: h.kind });
        return false;
      }
      const f = game.fighters[best];
      const before = f.hp;
      f.hp = Math.min(MAX_HP, f.hp + HOTDOG_HEAL);
      game.events.push({ type: 'hotdogCaught', target: best, heal: f.hp - before, x: h.x, y: h.y, kind: h.kind });
      return false;
    });
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
      if (!standing(f) || untouchable(f)) return; // flipped clean over it (or drove out from under it)
      const dx = f.x - x;
      const dy = ring ? f.y - y : 0;
      const d = Math.hypot(dx, dy);
      if (d > FIST_RADIUS) return;
      hit.push(i);
      f.hp = Math.max(0, f.hp - (game.paused > 0 ? 0 : FIST_DAMAGE));
      // Knocked out from under it (any way at all if it landed right on them).
      const ax = d > 1 ? dx / d : i % 2 ? 1 : -1;
      const ay = d > 1 ? dy / d : 0;
      f.vx += ax * FIST_KNOCKBACK;
      if (ring) f.vy += ay * FIST_KNOCKBACK;
      setState(f, 'hitstun');
      f.stun = FIST_HITSTUN;
      knocked(game, f);
      f.hitHeight = 'head';
    });
    game.events.push({ type: 'fist', x, y, hits: hit, damage: game.paused > 0 ? 0 : FIST_DAMAGE });
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
      ...(game.usa > 0 ? { usa: game.usa, theme: game.theme } : {}),
      ...(game.hotdogs.some((h) => h.t >= 0) ? { hotdogs: game.hotdogs.filter((h) => h.t >= 0).map((h) => ({ x: Math.round(h.x), y: Math.round(h.y), t: h.t, kind: h.kind })) } : {}),
      ...(game.bolts.length ? { bolts: game.bolts.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), dx: b.dx, dy: b.dy, owner: b.owner })) } : {}),
      fighters: game.fighters.map((f) => ({
        name: f.name,
        ...(f.luna ? { luna: true } : {}),
        ...(f.typing ? { typing: f.typing } : {}),
        ...(f.giant > 0 ? { giant: f.giant } : {}),
        ...(f.invisible > 0 ? { invisible: f.invisible } : {}),
        ...(f.frozen > 0 ? { frozen: f.frozen } : {}),
        ...(f.fast > 0 ? { fast: f.fast } : {}),
        ...(f.turbo > 0 ? { turbo: f.turbo } : {}),
        ...(f.slip > 0 ? { slip: f.slip } : {}),
        ...(f.tiny > 0 ? { tiny: f.tiny } : {}),
        ...(f.spiky > 0 ? { spiky: f.spiky } : {}),
        ...(f.vampire > 0 ? { vampire: f.vampire } : {}),
        ...(f.lion > 0 ? { lion: f.lion } : {}),
        ...(f.shree ? { shree: { x: Math.round(f.shree.x), y: Math.round(f.shree.y), drop: f.shree.drop } } : {}),
        ...(f.car ? { car: { dx: Math.round(f.car.dx * 1000) / 1000, dy: Math.round(f.car.dy * 1000) / 1000, rev: f.car.t <= CAR_REV_TICKS } } : {}),
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
    cheat, typeKey, airborne, untouchable, FLIP_CODE, CODES,
    TELEPORT_GAP, GRANDPA_TICKS, GRANDPA_SPEED, VAMPIRE_TICKS, VAMPIRE_DAMAGE, LION_TICKS, LION_DAMAGE, USA_TICKS, HOTDOG_FIRST, HOTDOG_LAST, HOTDOG_FALL_TICKS, HOTDOG_CATCH_RADIUS, HOTDOG_HEAL, HOTDOG_REACH_AT, HOTDOG_JUMP_REACH_AT, PAUSE_TICKS, SPIKY_TICKS, SPIKY_KEEP, RAY_SPEED, RAY_FREEZE_TICKS, SHREE_TICKS, SHREE_DROP_TICKS, SHAAN_TICKS, SHAAN_DAMAGE, CAR_DAMAGE, CAR_SPEED, CAR_REV_TICKS, JUMP_CROUCH, FIST_HITSTUN, SURPRISES, BANANA_TICKS, ZAP_DAMAGE, BANANA_DAMAGE, FREEZE_TICKS, ZOOM_TICKS, SNACK_HEAL, JEMINI_TICKS, JEMINI_DAMAGE, KYLE_TICKS, FLIP_CROUCH, FLIP_MAX_TRAVEL, FIST_KYLE_ODDS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoxerGame = api;
})(typeof self !== 'undefined' ? self : this);
