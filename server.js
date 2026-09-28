'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Game = require('./public/game.js');

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
    players: [null, null],
    game: null,
    loop: null,
    rematch: [false, false],
  };
  rooms.set(room.code, room);
  return room;
}

function seatPlayer(room, ws) {
  const seat = room.players[0] ? 1 : 0;
  room.players[seat] = ws;
  ws.room = room;
  ws.seat = seat;
  return seat;
}

function startMatch(room) {
  const names = room.players.map((p) => p.name);
  room.game = Game.createGame(names);
  room.rematch = [false, false];
  room.players.forEach((p, i) => send(p, { t: 'start', you: i, names, code: room.code }));
  stopLoop(room);
  let n = 0;
  room.loop = setInterval(() => {
    Game.step(room.game);
    if (++n % BROADCAST_EVERY !== 0) return;
    const msg = JSON.stringify({ t: 'state', s: Game.snapshot(room.game), e: room.game.events });
    room.game.events = [];
    for (const p of room.players) if (p && p.readyState === p.OPEN) p.send(msg);
    if (room.game.phase === 'matchEnd') stopLoop(room);
  }, 1000 / Game.TICK_RATE);
}

function stopLoop(room) {
  if (room.loop) clearInterval(room.loop);
  room.loop = null;
}

function leaveRoom(ws) {
  const room = ws.room;
  if (!room) return;
  room.players[ws.seat] = null;
  ws.room = null;
  if (quickQueue === room) quickQueue = null;
  stopLoop(room);
  const other = room.players.find(Boolean);
  if (other) {
    send(other, { t: 'opponentLeft' });
    other.room = null;
  }
  rooms.delete(room.code);
}

// ---- Messages --------------------------------------------------------------

function cleanName(raw) {
  const name = String(raw || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);
  return name || 'Boxer';
}

const handlers = {
  hello(ws, msg) {
    ws.name = cleanName(msg.name);
  },
  create(ws) {
    leaveRoom(ws);
    const room = createRoom(false);
    seatPlayer(room, ws);
    send(ws, { t: 'waiting', code: room.code, private: true });
  },
  join(ws, msg) {
    const code = String(msg.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room || room.isPublic) return send(ws, { t: 'error', msg: `No room called ${code || '(blank)'}.` });
    if (room.players[0] && room.players[1]) return send(ws, { t: 'error', msg: 'That room is full.' });
    if (room === ws.room) return;
    leaveRoom(ws);
    seatPlayer(room, ws);
    startMatch(room);
  },
  quick(ws) {
    if (quickQueue && quickQueue === ws.room) return;
    leaveRoom(ws);
    if (quickQueue && quickQueue.players[0]) {
      const room = quickQueue;
      quickQueue = null;
      seatPlayer(room, ws);
      startMatch(room);
    } else {
      const room = createRoom(true);
      seatPlayer(room, ws);
      quickQueue = room;
      send(ws, { t: 'waiting', code: room.code, private: false });
    }
  },
  input(ws, msg) {
    if (!ws.room || !ws.room.game) return;
    Game.setHeld(ws.room.game, ws.seat, msg);
  },
  action(ws, msg) {
    if (!ws.room || !ws.room.game) return;
    Game.pressAction(ws.room.game, ws.seat, msg.a);
  },
  rematch(ws) {
    const room = ws.room;
    if (!room || !room.game || room.game.phase !== 'matchEnd') return;
    room.rematch[ws.seat] = true;
    const other = room.players[1 - ws.seat];
    send(other, { t: 'rematchRequested' });
    if (room.rematch[0] && room.rematch[1]) startMatch(room);
  },
  leave(ws) {
    leaveRoom(ws);
  },
  ping(ws, msg) {
    send(ws, { t: 'pong', id: msg.id });
  },
};

function createServer() {
  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server, maxPayload: 1024 });

  wss.on('connection', (ws) => {
    ws.name = 'Boxer';
    ws.room = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      const handler = Object.prototype.hasOwnProperty.call(handlers, msg.t) && handlers[msg.t];
      if (handler) handler(ws, msg);
    });
    ws.on('close', () => leaveRoom(ws));
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
