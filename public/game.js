// Shared boxing simulation. Runs authoritatively on the server; the client
// loads it too so it can read the move table when animating poses.
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

  // Frame data. Range is measured centre-to-centre between fighters.
  const MOVES = {
    jab: {
      startup: 5, active: 3, recovery: 9, range: 165,
      damage: 4, stamina: 7, hitstun: 13, blockstun: 9, knockback: 7,
      blockDamage: 0, blockStamina: 5,
    },
    hook: {
      startup: 13, active: 4, recovery: 20, range: 140,
      damage: 11, stamina: 18, hitstun: 24, blockstun: 15, knockback: 18,
      blockDamage: 2, blockStamina: 14,
    },
    upper: {
      startup: 17, active: 3, recovery: 26, range: 115,
      damage: 16, stamina: 26, hitstun: 34, blockstun: 20, knockback: 26,
      blockDamage: 8, blockStamina: 22,
    },
  };

  const SLIP = { duration: 18, invulnFrom: 2, invulnTo: 13, cooldown: 36, stamina: 10 };
  const ACTIONS = ['jab', 'hook', 'upper', 'slip'];

  function createFighter(index, name) {
    return {
      name: name || (index === 0 ? 'Red' : 'Blue'),
      x: index === 0 ? 350 : 650,
      vx: 0,
      facing: index === 0 ? 1 : -1,
      hp: MAX_HP,
      stamina: MAX_STAMINA,
      state: 'idle',
      move: null,
      t: 0,
      hitLanded: false,
      slipCooldown: 0,
      roundsWon: 0,
      stats: { thrown: 0, landed: 0, blocked: 0, damage: 0 },
    };
  }

  function createInput() {
    return { left: false, right: false, block: false, buffered: null, bufferAge: 0 };
  }

  function createGame(names) {
    const game = {
      phase: 'countdown',
      phaseT: 0,
      round: 1,
      timer: ROUND_TICKS,
      fighters: [createFighter(0, names && names[0]), createFighter(1, names && names[1])],
      inputs: [createInput(), createInput()],
      events: [],
      roundWinner: null,
      winner: null,
      tick: 0,
    };
    return game;
  }

  function resetFightersForRound(game) {
    game.fighters.forEach((f, i) => {
      const fresh = createFighter(i, f.name);
      fresh.roundsWon = f.roundsWon;
      fresh.stats = f.stats;
      game.fighters[i] = fresh;
    });
    game.inputs = [createInput(), createInput()];
  }

  function setHeld(game, index, held) {
    const input = game.inputs[index];
    input.left = !!held.left;
    input.right = !!held.right;
    input.block = !!held.block;
  }

  function pressAction(game, index, action) {
    if (!ACTIONS.includes(action)) return;
    const input = game.inputs[index];
    input.buffered = action;
    input.bufferAge = 0;
  }

  function isInvulnerable(f) {
    return f.state === 'slip' && f.t >= SLIP.invulnFrom && f.t <= SLIP.invulnTo;
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
    if (action === 'slip') {
      if (f.slipCooldown > 0 || f.stamina < SLIP.stamina) return;
      f.stamina -= SLIP.stamina;
      f.slipCooldown = SLIP.cooldown;
      setState(f, 'slip');
    } else {
      const m = MOVES[action];
      if (f.stamina < m.stamina) return;
      f.stamina -= m.stamina;
      f.stats.thrown++;
      setState(f, 'attack', action);
    }
    input.buffered = null;
  }

  function updateFighterState(game, index) {
    const f = game.fighters[index];
    const input = game.inputs[index];
    const fighting = game.phase === 'fight';

    if (input.buffered) {
      input.bufferAge++;
      if (input.bufferAge > INPUT_BUFFER_TICKS) input.buffered = null;
    }
    if (f.slipCooldown > 0) f.slipCooldown--;
    f.t++;

    // Timed states resolve back to neutral.
    if (f.state === 'attack') {
      const m = MOVES[f.move];
      if (f.t >= m.startup + m.active + m.recovery) setState(f, 'idle');
    } else if (f.state === 'slip' && f.t >= SLIP.duration) {
      setState(f, 'idle');
    } else if (f.state === 'hitstun' && f.t >= f.stun) {
      setState(f, 'idle');
    } else if (f.state === 'blockstun' && f.t >= f.stun) {
      setState(f, input.block ? 'block' : 'idle');
    } else if (f.state === 'guardbreak' && f.t >= GUARD_BREAK_TICKS) {
      setState(f, 'idle');
    }

    if (!fighting || f.state === 'ko') return;

    if (isActionable(f)) {
      tryStartAction(game, f, input);
    }

    if (isActionable(f)) {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const wantBlock = input.block;
      const next = wantBlock ? 'block' : dir !== 0 ? 'walk' : 'idle';
      if (next !== f.state) {
        f.state = next;
        f.t = 0;
      }
      const speed = wantBlock ? BLOCK_WALK_SPEED : WALK_SPEED;
      f.x += dir * speed;
    }

    const regen = f.state === 'block' ? STAMINA_REGEN_BLOCKING
      : f.state === 'attack' ? 0 : STAMINA_REGEN;
    f.stamina = Math.min(MAX_STAMINA, f.stamina + regen);
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
    if (gap < MIN_SEPARATION) {
      const push = (MIN_SEPARATION - gap) / 2;
      left.x -= push;
      right.x += push;
    }
    for (const f of game.fighters) f.x = Math.max(RING_LEFT, Math.min(RING_RIGHT, f.x));
    if (right.x - left.x < MIN_SEPARATION) {
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
      if (Math.abs(def.x - att.x) > m.range) return;
      if (def.state === 'ko') return;
      if (isInvulnerable(def)) {
        att.hitLanded = true;
        game.events.push({ type: 'slipped', target: 1 - i, move: att.move });
        return;
      }
      att.hitLanded = true;
      pending.push({ attacker: i, defender: 1 - i, move: att.move, defPhase: movePhase(def), defState: def.state });
    });

    // Resolve simultaneously so trades are symmetric.
    for (const hit of pending) {
      const att = game.fighters[hit.attacker];
      const def = game.fighters[hit.defender];
      const m = MOVES[hit.move];
      const pushDir = def.x >= att.x ? 1 : -1;
      const blocking = hit.defState === 'block' || hit.defState === 'blockstun';

      if (blocking) {
        def.hp = Math.max(0, def.hp - m.blockDamage);
        def.stamina -= m.blockStamina;
        att.stats.blocked++;
        att.stats.damage += m.blockDamage;
        def.vx += pushDir * m.knockback * 0.5;
        if (def.stamina <= 0) {
          def.stamina = 0;
          setState(def, 'guardbreak');
          game.events.push({ type: 'guardbreak', target: hit.defender, move: hit.move });
        } else {
          setState(def, 'blockstun');
          def.stun = m.blockstun;
          game.events.push({ type: 'block', target: hit.defender, move: hit.move });
        }
      } else {
        const counter = hit.defPhase === 'startup' || hit.defPhase === 'recovery'
          || hit.defState === 'guardbreak';
        const damage = Math.round(m.damage * (counter ? COUNTER_MULTIPLIER : 1));
        def.hp = Math.max(0, def.hp - damage);
        att.stats.landed++;
        att.stats.damage += damage;
        def.vx += pushDir * m.knockback;
        setState(def, 'hitstun');
        def.stun = m.hitstun;
        game.events.push({ type: 'hit', target: hit.defender, move: hit.move, damage, counter });
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

  function checkRoundOver(game) {
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
    }

    if (game.phase === 'roundEnd' && game.phaseT >= ROUND_END_TICKS) {
      const [a, b] = game.fighters;
      if (a.roundsWon >= ROUNDS_TO_WIN || b.roundsWon >= ROUNDS_TO_WIN || game.round >= MAX_ROUNDS) {
        game.phase = 'matchEnd';
        game.phaseT = 0;
        game.winner = a.roundsWon === b.roundsWon ? null : a.roundsWon > b.roundsWon ? 0 : 1;
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

    updateFighterState(game, 0);
    updateFighterState(game, 1);
    applyPhysics(game);

    if (game.phase === 'fight') {
      resolveHits(game);
      game.timer--;
      checkRoundOver(game);
    }
    return game;
  }

  // Compact view sent over the wire each broadcast.
  function snapshot(game) {
    return {
      phase: game.phase,
      phaseT: game.phaseT,
      round: game.round,
      timer: game.timer,
      roundWinner: game.roundWinner,
      winner: game.winner,
      tick: game.tick,
      fighters: game.fighters.map((f) => ({
        name: f.name,
        x: Math.round(f.x * 10) / 10,
        facing: f.facing,
        hp: f.hp,
        stamina: Math.round(f.stamina),
        state: f.state,
        move: f.move,
        t: f.t,
        slipCooldown: f.slipCooldown,
        roundsWon: f.roundsWon,
        stats: f.stats,
      })),
    };
  }

  const api = {
    TICK_RATE, RING_LEFT, RING_RIGHT, MIN_SEPARATION, MAX_HP, MAX_STAMINA,
    ROUND_TICKS, COUNTDOWN_TICKS, ROUND_END_TICKS, ROUNDS_TO_WIN, MAX_ROUNDS,
    MOVES, SLIP, ACTIONS, GUARD_BREAK_TICKS,
    createGame, step, setHeld, pressAction, snapshot, movePhase,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoxerGame = api;
})(typeof self !== 'undefined' ? self : this);
