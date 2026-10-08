'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Game = require('./public/game.js');
const { createAuth } = require('./auth');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const BROADCAST_EVERY = 2; // 60 Hz sim, 30 Hz snapshots
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
// public/game.js).

const MAX_PLAYERS = Game.MAX_FIGHTERS;
const rooms = new Map();
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
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function createRoom(isPublic) {
  const room = {
    code: makeCode(),
    isPublic,
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

const fighting = (room) => Boolean(room.game) && room.game.phase !== 'matchEnd';

/** Tells everyone in a private room who's there, before the fight. */
function sendRoom(room) {
  const names = room.players.map((p) => p.name);
  room.players.forEach((p, i) => send(p, {
    t: 'room', code: room.code, players: names, you: i, host: i === 0, max: MAX_PLAYERS,
  }));
}

function startMatch(room) {
  room.fighters = room.players.slice(0, MAX_PLAYERS);
  const names = room.fighters.map((p) => p.name);
  room.game = Game.createGame(names, { fists: true });
  room.rematch = new Set();
  room.fighters.forEach((p, i) => {
    p.seat = i;
    send(p, { t: 'start', you: i, names, code: room.code, mode: room.game.mode });
  });
  stopLoop(room);
  let n = 0;
  room.loop = setInterval(() => {
    Game.step(room.game);
    if (++n % BROADCAST_EVERY !== 0) return;
    const msg = JSON.stringify({ t: 'state', s: Game.snapshot(room.game), e: room.game.events });
    room.game.events = [];
    for (const p of room.fighters) if (p && p.readyState === p.OPEN) p.send(msg);
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

  if (others.length === 0) return closeRoom(room);

  if (fighting(room) && seat !== -1) {
    // One on one, the fight can't go on. In the ring the others fight on
    // while at least two are left.
    const left = room.fighters.filter(Boolean);
    if (room.game.mode === 'ring' && left.length >= 2) {
      Game.removeFighter(room.game, seat);
      left.forEach((p) => send(p, { t: 'playerLeft', name: ws.name }));
      return;
    }
    others.forEach((p) => { send(p, { t: 'opponentLeft', name: ws.name }); p.room = null; });
    return closeRoom(room);
  }

  if (room.game) {
    // After a match: a rematch needs two.
    if (others.length < 2) {
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
  if (present.length >= 2 && present.every((p) => room.rematch.has(p))) startMatch(room);
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
    if (ws.room && !ws.room.isPublic && !ws.room.game) sendRoom(ws.room);
  },
  create(ws) {
    leaveRoom(ws);
    const room = createRoom(false);
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
    if (!room || room.isPublic || room.game || room.players[0] !== ws) return;
    if (room.players.length < 2) return send(ws, { t: 'error', msg: 'You need at least one opponent.' });
    startMatch(room);
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
    Game.setHeld(ws.room.game, ws.seat, msg);
  },
  action(ws, msg) {
    if (!ws.room || !ws.room.game || typeof ws.seat !== 'number') return;
    Game.pressAction(ws.room.game, ws.seat, msg.a);
  },
  cheat(ws, msg) {
    if (!ws.room || !ws.room.game || typeof ws.seat !== 'number') return;
    Game.cheat(ws.room.game, ws.seat, msg.code);
  },
  rematch(ws) {
    const room = ws.room;
    if (!room || !room.game || room.game.phase !== 'matchEnd') return;
    room.rematch.add(ws);
    const waitingFor = room.players.filter((p) => !room.rematch.has(p)).map((p) => p.name);
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

function createServer({ auth = createAuth() } = {}) {
  const server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://x').pathname === '/api/me') {
      serveMe(auth, req, res).catch(() => res.writeHead(500).end());
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
      if (handler) ready.then(() => handler(ws, msg));
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
    console.log(`The Boxer is up on http://localhost:${PORT}`);
  });
}

module.exports = { createServer };
