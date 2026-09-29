'use strict';

const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { createServer } = require('../server.js');

// Stands in for auth.js: the cookie "userjwt=<name>" is that player signed in.
const fakeAuth = {
  player: async (req) => {
    const m = /userjwt=([^;]+)/.exec(req.headers.cookie || '');
    return m ? { id: `id-${m[1]}`, name: decodeURIComponent(m[1]) } : null;
  },
  loginUrl: () => 'https://cheetahmoongames.com/login',
};

function client(port, cookie) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, cookie ? { headers: { cookie } } : undefined);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d);
    const i = waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  return {
    ws,
    open: () => new Promise((r) => ws.once('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    next(pred, ms = 3000) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => reject(new Error('timed out waiting for message')), ms).unref();
      });
    },
  };
}

async function withServer(fn) {
  const server = createServer({ auth: fakeAuth });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const clients = [];
  try {
    await fn(port, async (cookie) => { const c = client(port, cookie); clients.push(c); await c.open(); return c; });
  } finally {
    clients.forEach((c) => c.ws.terminate());
    await new Promise((r) => server.close(r));
  }
}

test('serves the page and blocks path traversal', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /The Boxer/);
    const js = await fetch(`http://127.0.0.1:${port}/game.js`);
    assert.strictEqual(js.status, 200);
    const bad = await fetch(`http://127.0.0.1:${port}/..%2fserver.js`);
    assert.notStrictEqual(bad.status, 200);
  });
});

test('two players meet in a private room and trade punches', async () => {
  await withServer(async (port, connect) => {
    const a = await connect();
    const b = await connect();
    a.send({ t: 'hello', name: 'Ali<script>' });
    b.send({ t: 'hello', name: 'Frazier' });
    a.send({ t: 'create' });
    const waiting = await a.next((m) => m.t === 'waiting');
    assert.match(waiting.code, /^[A-Z0-9]{4}$/);

    b.send({ t: 'join', code: waiting.code.toLowerCase() });
    const [sa, sb] = await Promise.all([a.next((m) => m.t === 'start'), b.next((m) => m.t === 'start')]);
    assert.strictEqual(sa.you, 0);
    assert.strictEqual(sb.you, 1);
    assert.deepStrictEqual(sa.names, ['Aliscript', 'Frazier']);

    await a.next((m) => m.t === 'state' && m.s.phase === 'fight');
    // Walk into range, then punch the tummy.
    a.send({ t: 'input', right: true });
    b.send({ t: 'input', left: true });
    await new Promise((r) => setTimeout(r, 1200));
    a.send({ t: 'input', right: false });
    b.send({ t: 'input', left: false });
    a.send({ t: 'input', aim: 'body' });
    a.send({ t: 'action', a: 'punch' });
    const hit = await b.next((m) => m.t === 'state' && m.e.some((e) => e.type === 'hit' && e.target === 1));
    assert.ok(hit.s.fighters[1].hp < 100);
    assert.ok(hit.e.some((e) => e.type === 'hit' && e.height === 'body'));
  });
});

test('quick match pairs two strangers', async () => {
  await withServer(async (port, connect) => {
    const a = await connect();
    const b = await connect();
    a.send({ t: 'quick' });
    await a.next((m) => m.t === 'waiting' && m.private === false);
    b.send({ t: 'quick' });
    await Promise.all([a.next((m) => m.t === 'start'), b.next((m) => m.t === 'start')]);
  });
});

test('joining a missing room reports an error, full rooms are refused', async () => {
  await withServer(async (port, connect) => {
    const a = await connect();
    a.send({ t: 'join', code: 'ZZZZ' });
    const err = await a.next((m) => m.t === 'error');
    assert.match(err.msg, /No room/);

    const b = await connect();
    const c = await connect();
    a.send({ t: 'create' });
    const { code } = await a.next((m) => m.t === 'waiting');
    b.send({ t: 'join', code });
    await b.next((m) => m.t === 'start');
    c.send({ t: 'join', code });
    const full = await c.next((m) => m.t === 'error');
    assert.match(full.msg, /full/);
  });
});

test('the other fighter is told when their opponent leaves', async () => {
  await withServer(async (port, connect) => {
    const a = await connect();
    const b = await connect();
    a.send({ t: 'create' });
    const { code } = await a.next((m) => m.t === 'waiting');
    b.send({ t: 'join', code });
    await a.next((m) => m.t === 'start');
    b.ws.close();
    await a.next((m) => m.t === 'opponentLeft');
  });
});

test('junk messages do not crash the server', async () => {
  await withServer(async (port, connect) => {
    const a = await connect();
    a.ws.send('not json');
    a.ws.send('null');
    a.send({ t: 'constructor' });
    a.send({ t: 'action', a: 'punch' });
    a.send({ t: 'ping', id: 7 });
    const pong = await a.next((m) => m.t === 'pong');
    assert.strictEqual(pong.id, 7);
  });
});

test('signed-in players fight under their account name, guests under the one they type', async () => {
  await withServer(async (port, connect) => {
    const kyle = await connect('userjwt=Kyle%20H');
    const guest = await connect();
    kyle.send({ t: 'hello', name: 'Imposter' });
    guest.send({ t: 'hello', name: 'Guesty' });
    kyle.send({ t: 'create' });
    const { code } = await kyle.next((m) => m.t === 'waiting');
    guest.send({ t: 'join', code });
    const start = await kyle.next((m) => m.t === 'start');
    assert.deepStrictEqual(start.names, ['Kyle H', 'Guesty']);
  });
});

test('/api/me says who is signed in', async () => {
  await withServer(async (port) => {
    const me = await (await fetch(`http://127.0.0.1:${port}/api/me`, { headers: { cookie: 'userjwt=Ann' } })).json();
    assert.deepStrictEqual(me, { signedIn: true, name: 'Ann' });
    const guest = await (await fetch(`http://127.0.0.1:${port}/api/me`)).json();
    assert.deepStrictEqual(guest, { signedIn: false, loginUrl: 'https://cheetahmoongames.com/login' });
  });
});

test('installable: icons, manifest and service worker are served and linked', async () => {
  await withServer(async (port) => {
    const base = `http://127.0.0.1:${port}`;
    const html = await (await fetch(`${base}/`)).text();
    for (const ref of ['/icon.svg', '/icons/apple-touch-icon.png', '/manifest.webmanifest']) {
      assert.ok(html.includes(`href="${ref}"`), `page links ${ref}`);
    }
    assert.match(html, /href="https:\/\/cheetahmoongames\.com\/"/, 'links back to Cheetah Moon Games');
    assert.match(html, /serviceWorker\.register\('\/sw\.js'\)/);
    const res = await fetch(`${base}/manifest.webmanifest`);
    assert.strictEqual(res.headers.get('content-type'), 'application/manifest+json');
    const manifest = await res.json();
    assert.strictEqual(manifest.display, 'standalone');
    const sizes = manifest.icons.map((i) => i.sizes);
    assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
    for (const icon of [...manifest.icons, { src: '/icons/apple-touch-icon.png' }]) {
      const r = await fetch(base + icon.src);
      assert.strictEqual(r.status, 200, icon.src);
      if (icon.src.endsWith('.png')) assert.strictEqual(r.headers.get('content-type'), 'image/png');
    }
    const sw = await fetch(`${base}/sw.js`);
    assert.match(sw.headers.get('content-type'), /javascript/);
    assert.match(await sw.text(), /mode !== 'navigate'/);
    assert.strictEqual((await fetch(`${base}/offline.html`)).status, 200);
  });
});
