'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Game = require('./public/game.js');
const Adventure = require('./public/adventure.js');
const { createScores } = require('./scores.js');
const { createSaves, playerKey } = require('./saves.js');
const { createAuth } = require('./auth');
const Bot = require('./bot');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
// Snapshots go out every tick (60 Hz): about 2 KB each in an adventure, less
// in a fight, so jumps and punches show with the least delay and older
// machines still have little to parse.
const ADVENTURE_BROADCAST_EVERY = 1;
const FIGHT_BROADCAST_EVERY = 1; // fights: every tick (60 Hz), so jumps and punches show with the least delay
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// ---- Rooms -----------------------------------------------------------------
//
// Quick matches pair two strangers and start at once. Private rooms hold two
// to four: friends join with the code or link, and whoever made the room
// starts the fight. Three or four fight in the ring seen from above (see
// public/game.js). Bots (bot.js) can fill corners: one straight from the
// lobby for a fight against the computer, or added by the host of a room.
// A bot takes a seat like anyone else, but has no connection.
//
// An adventure room (kind 'adventure') is the platformer in
// public/adventure.js instead: one to four people play it together, and
// there are no bots.

const MAX_PLAYERS = Game.MAX_FIGHTERS;
// Where a fight happens: the plain ring, or one of the adventure's settings
// (with its platforms and scenery). Only the look changes, not the fighting.
const VENUES = ['ring', 'meadow', 'forest', 'snow', 'volcano'];
const cleanVenue = (v) => (VENUES.includes(v) ? v : 'ring');
const rooms = new Map();
let scores = null; // the adventure leaderboard (scores.js), set up by createServer
let saves = null; // saved adventures (saves.js), set up by createServer
let quickQueue = null; // a room waiting for a random opponent

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws && !ws.isBot && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

const humans = (room) => room.players.filter((p) => !p.isBot);
/** Whoever runs the room: the first person in it (never a bot). */
const hostOf = (room) => humans(room)[0] || null;

/** A computer fighter at this level, named so it doesn't clash with anyone. */
function makeBot(room, level) {
  const bot = Bot.createBot(level);
  const base = Bot.LEVELS[bot.level].name;
  let name = base;
  for (let n = 2; room.players.some((p) => p.name === name); n++) name = `${base} ${n}`;
  return { isBot: true, name, level: bot.level, bot, room, seat: null };
}

function createRoom(isPublic, kind = 'fight') {
  const room = {
    code: makeCode(),
    isPublic,
    kind,
    venue: 'ring',
    // Everyone in the room, in the order they came. The first is the host.
    players: [],
    // Who's fighting in the current match; their index is their fighter.
    fighters: [],
    game: null,
    loop: null,
    rematch: new Set(),
  };
  rooms.set(room.code, room);
  return room;
}

function addPlayer(room, ws) {
  room.players.push(ws);
  ws.room = room;
  ws.seat = null;
}

const adventure = (room) => room.kind === 'adventure';
/** Which simulation the room runs. */
const simOf = (room) => (adventure(room) ? Adventure : Game);
const isOver = (room) => (adventure(room) ? room.game.over : room.game.phase === 'matchEnd');
const fighting = (room) => Boolean(room.game) && !isOver(room);
/** The fewest it takes to start (or play again). */
const minPlayers = (room) => (adventure(room) ? 1 : 2);

/** Tells everyone in a private room who's there, before the fight. */
function sendRoom(room) {
  const names = room.players.map((p) => p.name);
  const bots = room.players.map((p) => (p.isBot ? p.level : null));
  const host = room.players.indexOf(hostOf(room));
  room.players.forEach((p, i) => send(p, {
    t: 'room', code: room.code, kind: room.kind, level: room.level, venue: room.venue, players: names, bots, hostIndex: host, you: i, host: i === host, max: MAX_PLAYERS,
  }));
}

function startAdventure(room) {
  room.fighters = humans(room).slice(0, MAX_PLAYERS);
  const names = room.fighters.map((p) => p.name);
  // Carrying on from a save the first time; "play again" after that starts that level afresh.
  const resume = room.resume;
  room.resume = null;
  room.paused = false;
  room.game = Adventure.createGame(names, { level: room.level, resume, seed: Math.floor(Math.random() * 2 ** 31) });
  room.rematch = new Set();
  room.fighters.forEach((p, i) => {
    p.seat = i;
    send(p, { t: 'start', you: i, names, code: room.code, mode: 'adventure' });
  });
  stopLoop(room);
  let n = 0;
  room.loop = setInterval(() => {
    if (room.paused) return; // on your own, with the menu open
    Adventure.step(room.game);
    if (++n % ADVENTURE_BROADCAST_EVERY !== 0 && !room.game.over) return;
    const msg = JSON.stringify({ t: 'state', s: Adventure.snapshot(room.game), e: room.game.events });
    room.game.events = [];
    for (const p of room.fighters) if (p && p.readyState === p.OPEN) p.send(msg);
    if (room.game.over) {
      stopLoop(room);
      for (const p of room.fighters) send(p, { t: 'adventureOver', won: room.game.won });
      recordScore(room);
    }
  }, 1000 / Adventure.TICK_RATE);
}

/** An adventure's over: its score goes on the leaderboard, and the team hears where it came. */
function recordScore(room) {
  const g = room.game;
  if (!scores || !g) return;
  const entry = {
    team: g.players.map((p) => p.name),
    score: g.score,
    level: g.level + 1,
    from: (g.from || 0) + 1,
    won: !!g.won,
    secrets: g.secrets,
  };
  const fighters = room.fighters.slice();
  scores.add(entry).then(({ rank, top }) => {
    for (const p of fighters) send(p, { t: 'leaderboard', rank, top });
  }, (err) => console.error('Leaderboard:', err.message));
}

function startMatch(room) {
  if (adventure(room)) return startAdventure(room);
  room.fighters = room.players.slice(0, MAX_PLAYERS);
  const names = room.fighters.map((p) => p.name);
  room.game = Game.createGame(names, { fists: true, venue: room.venue });
  room.rematch = new Set();
  room.fighters.forEach((p, i) => {
    p.seat = i;
    if (p.isBot) p.bot = Bot.createBot(p.level); // fresh for each match
    send(p, { t: 'start', you: i, names, code: room.code, mode: room.game.mode, venue: room.venue });
  });
  stopLoop(room);
  let n = 0;
  room.loop = setInterval(() => {
    room.fighters.forEach((p, i) => { if (p && p.isBot) Bot.botTick(room.game, i, p.bot); });
    Game.step(room.game);
    if (++n % FIGHT_BROADCAST_EVERY !== 0) return;
    const msg = JSON.stringify({ t: 'state', s: Game.snapshot(room.game), e: room.game.events });
    room.game.events = [];
    for (const p of room.fighters) if (p && !p.isBot && p.readyState === p.OPEN) p.send(msg);
    if (room.game.phase === 'matchEnd') stopLoop(room);
  }, 1000 / Game.TICK_RATE);
}

function stopLoop(room) {
  if (room.loop) clearInterval(room.loop);
  room.loop = null;
}

function closeRoom(room) {
  stopLoop(room);
  if (quickQueue === room) quickQueue = null;
  rooms.delete(room.code);
}

function leaveRoom(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  room.players = room.players.filter((p) => p !== ws);
  const seat = room.fighters.indexOf(ws);
  if (seat !== -1) room.fighters[seat] = null;
  room.rematch.delete(ws);
  const others = room.players;

  // Nobody left but bots: the room goes.
  if (humans(room).length === 0) return closeRoom(room);

  if (fighting(room) && seat !== -1) {
    // One on one, the fight can't go on. In the ring the others fight on
    // while at least two are left.
    const left = room.fighters.filter(Boolean);
    if (adventure(room) && left.length >= 1) {
      // The rest carry on without them.
      Adventure.removePlayer(room.game, seat);
      left.forEach((p) => send(p, { t: 'playerLeft', name: ws.name }));
      return;
    }
    if (room.game.mode === 'ring' && left.length >= 2) {
      Game.removeFighter(room.game, seat);
      left.forEach((p) => send(p, { t: 'playerLeft', name: ws.name }));
      return;
    }
    others.forEach((p) => { send(p, { t: 'opponentLeft', name: ws.name }); p.room = null; });
    return closeRoom(room);
  }

  if (room.game) {
    // After a match: a rematch needs two (an adventure, one).
    if (others.length < minPlayers(room)) {
      others.forEach((p) => { send(p, { t: 'opponentLeft', name: ws.name }); p.room = null; });
      return closeRoom(room);
    }
    others.forEach((p) => send(p, { t: 'playerLeft', name: ws.name }));
    maybeRematch(room);
    return;
  }

  // Before the fight: the room waits on, with the next player as host.
  if (!room.isPublic) sendRoom(room);
}

function maybeRematch(room) {
  const present = room.players;
  if (present.length >= minPlayers(room) && present.every((p) => p.isBot || room.rematch.has(p))) startMatch(room);
}

// ---- Messages --------------------------------------------------------------

function cleanName(raw) {
  const name = String(raw || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);
  return name || 'Boxer';
}

const handlers = {
  hello(ws, msg) {
    // A signed-in player's name is their account's.
    if (!ws.account) ws.name = cleanName(msg.name);
    // A guest's browser keeps a random token, for their saved adventure.
    if (typeof msg.guest === 'string') ws.guest = msg.guest.slice(0, 64);
    // Tell them if they've an adventure saved, so the lobby can offer it.
    const key = playerKey(ws.account, ws.guest);
    if (key && saves) saves.get(key).then((save) => send(ws, { t: 'save', save }), () => {});
    if (ws.room && !ws.room.isPublic && !ws.room.game) sendRoom(ws.room);
  },
  create(ws, msg) {
    leaveRoom(ws);
    const room = createRoom(false);
    room.venue = cleanVenue(msg.venue);
    addPlayer(room, ws);
    sendRoom(room);
  },
  join(ws, msg) {
    const code = String(msg.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.isPublic) return send(ws, { t: 'error', msg: `No room called ${code || '(blank)'}.` });
    if (room === ws.room) return;
    if (room.game) return send(ws, { t: 'error', msg: 'That fight has already started.' });
    if (room.players.length >= MAX_PLAYERS) return send(ws, { t: 'error', msg: `That room is full: ${MAX_PLAYERS} is the most.` });
    leaveRoom(ws);
    addPlayer(room, ws);
    sendRoom(room);
  },
  start(ws) {
    const room = ws.room;
    if (!room || room.isPublic || room.game || hostOf(room) !== ws) return;
    if (room.players.length < minPlayers(room)) return send(ws, { t: 'error', msg: 'You need at least one opponent.' });
    startMatch(room);
  },
  /** A fight against the computer, straight from the lobby. */
  bot(ws, msg) {
    leaveRoom(ws);
    const room = createRoom(false);
    room.venue = cleanVenue(msg.venue);
    addPlayer(room, ws);
    room.players.push(makeBot(room, msg.level));
    startMatch(room);
  },
  /** An adventure: on your own (solo) or a room for friends to join. */
  adventure(ws, msg) {
    leaveRoom(ws);
    const room = createRoom(false, 'adventure');
    // Which level to start on (all four can be picked from the lobby).
    room.level = Math.max(0, Math.min(Adventure.LEVELS.length - 1, Math.floor(Number(msg.level)) || 0));
    addPlayer(room, ws);
    if (msg.solo) startMatch(room);
    else sendRoom(room);
  },
  /** The host picks where the fight happens. */
  venue(ws, msg) {
    const room = ws.room;
    if (!room || room.isPublic || room.game || hostOf(room) !== ws || adventure(room)) return;
    room.venue = cleanVenue(msg.venue);
    sendRoom(room);
  },
  /** Pausing an adventure you're playing on your own (the menu's open). */
  pause(ws, msg) {
    const room = ws.room;
    if (!room || !adventure(room) || !fighting(room) || humans(room).length !== 1) return;
    room.paused = !!msg.on;
  },
  /**
   * Save & quit: keeps where you'd got to (the start of the level you're on)
   * for another day, and you leave. Anyone else in the adventure plays on.
   */
  saveQuit(ws) {
    const room = ws.room;
    if (!room || !adventure(room) || !fighting(room)) return;
    const key = playerKey(ws.account, ws.guest);
    const save = Adventure.progress(room.game);
    leaveRoom(ws);
    if (!key) return send(ws, { t: 'saved', ok: false });
    saves.put(key, save).then(
      () => send(ws, { t: 'saved', ok: true, save }),
      (err) => { console.error('Saving:', err.message); send(ws, { t: 'saved', ok: false }); },
    );
  },
  /** Carrying on from your save: on your own, or a room for friends to join. */
  resume(ws, msg) {
    const key = playerKey(ws.account, ws.guest);
    saves.take(key).then((save) => {
      if (!save) return send(ws, { t: 'save', save: null });
      leaveRoom(ws);
      const room = createRoom(false, 'adventure');
      room.level = Math.max(0, Math.min(Adventure.LEVELS.length - 1, Math.floor(Number(save.level)) || 0));
      room.resume = save;
      addPlayer(room, ws);
      if (msg.solo) startMatch(room);
      else sendRoom(room);
    }, (err) => { console.error('Loading a save:', err.message); send(ws, { t: 'error', msg: 'Couldn’t load your save. Try again in a moment.' }); });
  },
  /** The host fills a corner with a bot. */
  addBot(ws, msg) {
    const room = ws.room;
    if (!room || room.isPublic || room.game || hostOf(room) !== ws || adventure(room)) return;
    if (room.players.length >= MAX_PLAYERS) return;
    room.players.push(makeBot(room, msg.level));
    sendRoom(room);
  },
  removeBot(ws, msg) {
    const room = ws.room;
    if (!room || room.isPublic || room.game || hostOf(room) !== ws) return;
    const p = room.players[msg.index];
    if (!p || !p.isBot) return;
    room.players.splice(msg.index, 1);
    sendRoom(room);
  },
  quick(ws) {
    if (quickQueue && quickQueue === ws.room) return;
    leaveRoom(ws);
    if (quickQueue && quickQueue.players[0]) {
      const room = quickQueue;
      quickQueue = null;
      addPlayer(room, ws);
      startMatch(room);
    } else {
      const room = createRoom(true);
      addPlayer(room, ws);
      quickQueue = room;
      send(ws, { t: 'waiting', code: room.code, private: false });
    }
  },
  input(ws, msg) {
    if (!ws.room || !ws.room.game || typeof ws.seat !== 'number') return;
    simOf(ws.room).setHeld(ws.room.game, ws.seat, msg);
  },
  action(ws, msg) {
    if (!ws.room || !ws.room.game || typeof ws.seat !== 'number') return;
    simOf(ws.room).pressAction(ws.room.game, ws.seat, msg.a);
  },
  type(ws, msg) {
    if (!ws.room || !ws.room.game || typeof ws.seat !== 'number') return;
    simOf(ws.room).typeKey(ws.room.game, ws.seat, msg.k);
  },
  rematch(ws) {
    const room = ws.room;
    if (!room || !room.game || !isOver(room)) return;
    room.rematch.add(ws);
    const waitingFor = humans(room).filter((p) => !room.rematch.has(p)).map((p) => p.name);
    room.players.forEach((p) => {
      if (p !== ws) send(p, { t: 'rematchRequested', name: ws.name, waitingFor });
    });
    send(ws, { t: 'rematchWaiting', waitingFor });
    maybeRematch(room);
  },
  leave(ws) {
    leaveRoom(ws);
  },
  ping(ws, msg) {
    send(ws, { t: 'pong', id: msg.id });
  },
};

// Players signed in to their Cheetah Moon account fight under its name;
// everyone else picks a name in the lobby.
async function serveMe(auth, req, res) {
  const player = await auth.player(req);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(player
    ? { signedIn: true, name: cleanName(player.name) }
    : { signedIn: false, loginUrl: auth.loginUrl() }));
}

/** The leaderboard, for anyone to see. */
async function serveLeaderboard(res) {
  const top = await scores.top(20);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ scores: top }));
}

function createServer({ auth = createAuth(), scores: board = createScores(), saves: store = createSaves() } = {}) {
  scores = board;
  saves = store;
  const server = http.createServer((req, res) => {
    const route = new URL(req.url, 'http://x').pathname;
    if (route === '/api/me') {
      serveMe(auth, req, res).catch(() => res.writeHead(500).end());
      return;
    }
    if (route === '/api/leaderboard') {
      serveLeaderboard(res).catch(() => res.writeHead(500).end());
      return;
    }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ server, maxPayload: 1024 });

  wss.on('connection', (ws, req) => {
    ws.name = 'Boxer';
    ws.account = null;
    ws.room = null;
    ws.isAlive = true;
    // The upgrade request carries the login cookie. Messages wait until it's
    // checked, so a fight never starts under the wrong name.
    const ready = auth.player(req).then((player) => {
      if (!player) return;
      ws.account = player;
      ws.name = cleanName(player.name);
    }, () => {});
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      const handler = Object.prototype.hasOwnProperty.call(handlers, msg.t) && handlers[msg.t];
      if (handler) ready.then(() => {
        handler(ws, msg);
        // A guest starting to play: tell the owner (auth.js keeps it to
        // one report per name every few minutes).
        if (!ws.account && !ws.guestReported && ['quick', 'create', 'join', 'bot', 'adventure'].includes(msg.t)) {
          ws.guestReported = true;
          auth.guestSeen(ws.name);
        }
      });
    });
    ws.on('close', () => ready.then(() => leaveRoom(ws)));
  });

  // Drop connections that stop answering heartbeats.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 15000);
  wss.on('close', () => clearInterval(heartbeat));
  server.on('close', () => {
    clearInterval(heartbeat);
    for (const room of rooms.values()) stopLoop(room);
    rooms.clear();
    quickQueue = null;
  });

  return server;
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`The Boxer is up on http://localhost:${PORT} (leaderboard: ${scores.where})`);
  });
}

// rooms: for the tests, to reach into a game.
module.exports = { createServer, rooms };
