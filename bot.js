'use strict';

// Computer fighters. A bot plays through the same controls as a person
// (Game.setHeld, Game.pressAction, Game.typeKey), deciding what to do every
// few ticks. The levels differ in how quickly they react, how often they
// read and block what's coming, how keen they are to attack, and how often
// they type a cheat code (a letter at a time, so you can see it going in and
// hit them to stop it).

const Game = require('./public/game.js');

const LEVELS = {
  easy: {
    name: 'Rookie Bot',
    think: 24, jitter: 16, // ticks between decisions
    attack: 0.35, // when in range, how often it swings
    block: 0.15, // when something's coming, how often it guards...
    read: 0.35, // ...and how often at the right height
    punish: 0.2, // jumping on an opponent left open
    dodge: 0, // getting out from under the fist, over the car and honey
    codeEvery: [40, 70], // seconds between cheat codes
    typeGap: 14, // ticks between letters
  },
  medium: {
    name: 'Contender Bot',
    think: 13, jitter: 8,
    attack: 0.6, block: 0.45, read: 0.65, punish: 0.55, dodge: 0.5,
    codeEvery: [18, 30], typeGap: 8,
  },
  hard: {
    name: 'Champ Bot',
    think: 5, jitter: 4,
    attack: 0.85, block: 0.85, read: 0.95, punish: 0.95, dodge: 0.95,
    codeEvery: [8, 14], typeGap: 5,
  },
};

// The codes a bot will use: ones that just happen once typed (no steering a
// fist, and no flood to swim through).
const CODE_POOL = [
  'zeffen', 'kalya', 'luna', 'louise', 'tamzin', 'grandpa', 'fart', 'jemini', 'kyle', 'harrison',
  'shaan', 'parimal', 'priya', 'daniel', 'edward', 'jay', 'leo', 'ludo', 'tony', 'daddy', 'mummy',
  'bear', 'lizzie', 'blake', 'simon', 'spreadbury', 'mamtora',
].filter((c) => c in Game.CODES);

const LOW_STAMINA = 20;

function createBot(level, random = Math.random) {
  const l = LEVELS[level] ? level : 'medium';
  return {
    level: l,
    random,
    nextThink: 0,
    nextCode: null, // set at the first look at the fight
    queue: '', // letters still to type
    nextKey: 0,
  };
}

const standing = (f) => f && f.hp > 0 && !f.left && f.state !== 'ko';
const between = (bot, [lo, hi]) => Math.round((lo + bot.random() * (hi - lo)) * Game.TICK_RATE);

/** The one this bot is fighting: the other one, or the nearest in the ring. */
function opponent(game, f, i) {
  const others = game.fighters.filter((o, j) => j !== i && standing(o));
  if (!others.length) return null;
  if (game.mode !== 'ring') return others[0];
  const target = f.target !== null && game.fighters[f.target];
  if (standing(target)) return target;
  return others.reduce((a, b) => (Math.hypot(a.x - f.x, a.y - f.y) <= Math.hypot(b.x - f.x, b.y - f.y) ? a : b));
}

/** One tick of a bot at seat `i`. */
function botTick(game, i, bot) {
  const f = game.fighters[i];
  const L = LEVELS[bot.level];
  if (game.phase !== 'fight' || !standing(f)) {
    bot.queue = '';
    bot.nextCode = null;
    Game.setHeld(game, i, { aim: f ? f.aim : 'head' });
    return;
  }
  if (bot.nextCode === null) bot.nextCode = game.tick + between(bot, L.codeEvery);

  // Typing: a letter every so often. A hit wipes the letters, and the bot
  // gives up on that word.
  if (bot.queue && f.state === 'hitstun') bot.queue = '';
  if (bot.queue && game.tick >= bot.nextKey) {
    Game.typeKey(game, i, bot.queue[0]);
    bot.queue = bot.queue.slice(1);
    bot.nextKey = game.tick + L.typeGap;
  }

  // The flood: grab the boat, or keep swimming.
  const water = game.water;
  if (water && water.boat !== i && !bot.queue) {
    if (water.boat === null) bot.queue = 'boat';
    else if (f.afloat < 5 * Game.TICK_RATE) bot.queue = 'swim';
  }

  if (game.tick < bot.nextThink) return;
  bot.nextThink = game.tick + L.think + Math.floor(bot.random() * L.jitter);

  const o = opponent(game, f, i);
  if (!o) {
    Game.setHeld(game, i, { aim: f.aim });
    return;
  }
  const ring = game.mode === 'ring';
  const dx = o.x - f.x;
  const dy = ring ? o.y - f.y : 0;
  const d = Math.hypot(dx, dy);
  const roll = () => bot.random();
  const aims = Game.AIMS;
  const anyAim = () => aims[Math.floor(roll() * aims.length)];
  const toward = (sx, sy) => ({
    left: sx < -1, right: sx > 1, up: ring && sy < -1, down: ring && sy > 1,
  });
  const hold = (h) => Game.setHeld(game, i, { aim: f.aim, ...h });

  // Get out of harm's way: the fist's shadow, a car, honey or a freeze ray.
  if (roll() < L.dodge) {
    const warn = game.fist && game.fist.warn;
    if (warn && Math.hypot(warn.x - f.x, ring ? warn.y - f.y : 0) < Game.FIST_RADIUS + 40) {
      hold(toward(f.x - warn.x || 1, ring ? f.y - warn.y : 0));
      return;
    }
    const incoming = [...(game.honey || []), ...(game.bolts || [])]
      .some((p) => p.owner !== i && Math.hypot(p.x - f.x, ring ? p.y - f.y : 0) < 200);
    const car = game.fighters.find((c, j) => j !== i && c.car && Math.hypot(c.x - f.x, ring ? c.y - f.y : 0) < 300);
    if (incoming || car) {
      if (!ring) {
        Game.pressAction(game, i, 'jump');
      } else {
        // Step off to the side of whatever's coming.
        const from = car || o;
        hold(toward(-(from.y - f.y) || 1, from.x - f.x));
      }
      return;
    }
  }

  // Something coming at me: guard it (at the right height, if I read it).
  const theirs = o.state === 'attack' && Game.MOVES[o.move];
  const phase = Game.movePhase(o);
  if (theirs && (phase === 'startup' || phase === 'active') && d < (theirs.range || 0) + 60 && roll() < L.block) {
    hold({ block: true, aim: roll() < L.read ? o.aim : anyAim() });
    return;
  }

  // A cheat code, now and then, when they're not right on top of me.
  if (!bot.queue && game.tick >= bot.nextCode && CODE_POOL.length) {
    bot.nextCode = game.tick + between(bot, L.codeEvery);
    bot.queue = CODE_POOL[Math.floor(roll() * CODE_POOL.length)];
    bot.nextKey = game.tick;
  }

  // Out of puff: back off and guard.
  if (f.stamina < LOW_STAMINA) {
    hold({ ...toward(-dx, -dy), block: roll() < L.block });
    return;
  }

  const punchReach = (f.dragon > 0 ? Game.MOVES.fire.range : Game.MOVES.punch.range) - 10;
  const kickReach = Game.MOVES.kick.range - 10;
  const open = o.state === 'hitstun' || o.state === 'guardbreak' || phase === 'recovery';
  if (d <= kickReach && roll() < (open ? Math.max(L.attack, L.punish) : L.attack)) {
    // Aim where their guard isn't.
    const guarding = o.state === 'block' || o.state === 'blockstun';
    const aim = guarding && roll() < L.read ? aims.find((a) => a !== o.aim) : anyAim();
    const kick = d > punchReach || (roll() < 0.35 && !(f.lion > 0) && !(f.sword > 0));
    hold({ aim });
    Game.pressAction(game, i, kick ? 'kick' : 'punch');
    return;
  }

  // Close the gap (and an easy bot wanders a bit).
  if (d > punchReach * 0.8) {
    const wobble = bot.level === 'easy' && roll() < 0.3;
    hold(wobble ? toward(roll() - 0.5, ring ? roll() - 0.5 : 0) : toward(dx, dy));
  } else {
    hold({});
  }
}

module.exports = { LEVELS, CODE_POOL, createBot, botTick };
