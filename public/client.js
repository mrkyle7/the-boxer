(function () {
  'use strict';

  const G = window.BoxerGame;
  // The canvas is 1000 x 560, except for the ring on a phone: held upright it
  // gets a tall layout so the ring can fill the width, and held sideways a
  // short one so the ring can fill the height (see chooseLayout).
  const WIDE = { w: 1000, h: 560 };
  const TALL = { w: 600, h: 800 };
  const SHORT = { w: 860, h: 600 };
  let W = WIDE.w;
  let H = WIDE.h;
  const FLOOR = 486;

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  const PALETTE = [
    { glove: '#e03a3e', gloveDark: '#9e1e24', trunks: '#c9262c', trim: '#ffffff', skin: '#e0ac86', skinDark: '#b98262', hair: '#2a1a12', name: '#ff6f73' },
    { glove: '#2f76e8', gloveDark: '#1a4396', trunks: '#2463cc', trim: '#f4c542', skin: '#8d5a3b', skinDark: '#6a4028', hair: '#151010', name: '#79a8ff' },
    { glove: '#2fae5b', gloveDark: '#1b6e38', trunks: '#23914b', trim: '#ffffff', skin: '#c68a5e', skinDark: '#9c6a44', hair: '#3a2414', name: '#6fdc93' },
    { glove: '#f0b429', gloveDark: '#a87a10', trunks: '#d99a17', trim: '#1a1a1a', skin: '#f1c7a0', skinDark: '#c99a74', hair: '#6b3b16', name: '#ffd36a' },
  ];

  // ---- Storage (optional convenience only) ------------------------------------

  function load(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } }

  // ---- Screens ---------------------------------------------------------------

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }

  // ---- Network ---------------------------------------------------------------

  let ws = null;
  let queue = [];
  let rtt = null;
  let pingId = 0;
  const pings = new Map();
  const params = new URLSearchParams(location.search);
  let pendingJoin = (params.get('room') || '').toUpperCase().slice(0, 4);

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.addEventListener('open', () => {
      send({ t: 'hello', name: playerName() });
      queue.forEach(send);
      queue = [];
      if (pendingJoin) {
        $('code').value = pendingJoin;
        send({ t: 'join', code: pendingJoin });
        pendingJoin = '';
      }
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      onMessage(msg);
    });
    ws.addEventListener('close', () => {
      const inFight = $('fight').classList.contains('active');
      const waiting = $('waiting').classList.contains('active');
      if (inFight || waiting) {
        show('fight');
        showNotice('Lost connection to the server.');
      } else {
        $('lobby-error').textContent = 'Lost connection to the server. Retrying…';
      }
      setTimeout(connect, 2000);
    });
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else queue.push(msg);
  }

  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const id = ++pingId;
    pings.set(id, performance.now());
    send({ t: 'ping', id });
  }, 2000);

  // ---- Match state -----------------------------------------------------------

  let me = 0;
  let names = ['', ''];
  // 'side' for two fighters, 'ring' (seen from above) for three or four.
  let mode = 'side';
  let snap = null;
  let snapAt = 0;
  let display = null;
  let lastPhase = null;
  let roomCode = '';

  function onMessage(msg) {
    switch (msg.t) {
      case 'waiting': {
        roomCode = msg.code;
        $('waiting-title').textContent = 'Looking for an opponent';
        $('share').hidden = true;
        $('room-players').hidden = true;
        $('room-note').textContent = '';
        $('start').hidden = true;
        show('waiting');
        break;
      }
      case 'room':
        showRoom(msg);
        break;
      case 'start':
        me = msg.you;
        names = msg.names;
        mode = msg.mode === 'ring' ? 'ring' : 'side';
        document.body.classList.toggle('ring', mode === 'ring');
        roomCode = msg.code;
        snap = null;
        display = null;
        lastPhase = null;
        effects.length = 0;
        slams.length = 0;
        texts.length = 0;
        held.aim = 'head';
        syncTouch();
        $('result').hidden = true;
        $('notice').hidden = true;
        $('rematch').disabled = false;
        $('rematch-note').textContent = '';
        show('fight');
        history.replaceState(null, '', location.pathname);
        break;
      case 'state':
        onState(msg.s, msg.e || []);
        break;
      case 'rematchRequested':
        $('rematch-note').textContent = msg.waitingFor && msg.waitingFor.length > 1
          ? `${msg.name} wants a rematch. Waiting for ${listNames(msg.waitingFor)}.`
          : `${msg.name} wants a rematch.`;
        break;
      case 'rematchWaiting':
        $('rematch-note').textContent = `Waiting for ${listNames(msg.waitingFor)}…`;
        break;
      case 'playerLeft':
        if (snap && snap.phase !== 'matchEnd') announce(`${msg.name} left`, 90, '#ffffff', 'The rest fight on');
        else $('rematch-note').textContent = `${msg.name} left the ring.`;
        break;
      case 'opponentLeft':
        showNotice(names.length > 2
          ? 'Everyone else has left the ring.'
          : `${msg.name || names[1 - me] || 'Your opponent'} left the ring.`);
        break;
      case 'error':
        show('lobby');
        $('lobby-error').textContent = msg.msg;
        break;
      case 'pong': {
        const sent = pings.get(msg.id);
        if (sent) { rtt = Math.round(performance.now() - sent); pings.delete(msg.id); }
        break;
      }
    }
  }

  function listNames(list) {
    if (list.length <= 1) return list.join('');
    return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  }

  /** A private room before the fight: who's in, and the host's Start button. */
  function showRoom(msg) {
    roomCode = msg.code;
    const host = msg.players[0];
    $('waiting-title').textContent = msg.host ? 'Your ring is ready' : `${host}'s ring`;
    $('share').hidden = false;
    $('room-code').textContent = msg.code;
    $('share-link').value = `${location.origin}${location.pathname}?room=${msg.code}`;
    const list = $('room-players');
    list.textContent = '';
    for (let i = 0; i < msg.max; i++) {
      const li = document.createElement('li');
      if (i < msg.players.length) {
        const dot = document.createElement('span');
        dot.className = 'swatch';
        dot.style.background = PALETTE[i].glove;
        const name = document.createElement('span');
        name.textContent = msg.players[i] + (i === msg.you ? ' (you)' : '');
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = i === 0 ? 'Host' : '';
        li.append(dot, name, tag);
      } else {
        li.className = 'empty';
        li.textContent = 'Open corner';
      }
      list.append(li);
    }
    list.hidden = false;
    const n = msg.players.length;
    const view = n > 2 ? `${n} fighters: free-for-all in the ring.` : n === 2 ? 'Two fighters: one on one.' : '';
    if (msg.host) {
      $('room-note').textContent = n < 2
        ? 'Send the link to one, two or three friends. Start when everyone is in.'
        : `${view} Start when everyone is in.`;
    } else {
      $('room-note').textContent = `${view} Waiting for ${host} to start.`;
    }
    $('start').hidden = !msg.host;
    $('start').disabled = n < 2;
    show('waiting');
  }

  function onState(s, events) {
    snap = s;
    snapAt = performance.now();
    if (!display) {
      display = s.fighters.map((f) => ({ x: f.x, y: f.y || 0, angle: f.angle || 0, hpTrail: f.hp }));
    }
    for (const e of events) onEvent(e);
    if (s.phase !== lastPhase) {
      if (s.phase === 'countdown') announce(`Round ${s.round}`, 80, '#ffffff');
      if (s.phase === 'matchEnd') setTimeout(showResult, 900);
      lastPhase = s.phase;
    }
  }

  function showNotice(text) {
    $('result').hidden = true;
    $('notice-text').textContent = text;
    $('notice').hidden = false;
  }

  function showResult() {
    if (!snap || snap.phase !== 'matchEnd') return;
    const w = snap.winner;
    $('result-title').textContent = w === null ? 'Split decision: draw'
      : w === me ? 'You win' : `${snap.fighters[w].name} wins`;
    const fs = snap.fighters;
    const head = $('stat-head');
    head.textContent = '';
    head.append(document.createElement('th'));
    fs.forEach((f, i) => {
      const th = document.createElement('th');
      th.textContent = f.name + (i === me ? ' (you)' : '');
      th.style.color = PALETTE[i].name;
      head.append(th);
    });
    const acc = (f) => (f.stats.thrown ? `${Math.round((f.stats.landed / f.stats.thrown) * 100)}%` : '–');
    const row = (label, fn) => [label, ...fs.map(fn)];
    const rows = [
      row('Rounds won', (f) => f.roundsWon),
      row('Punches thrown', (f) => f.stats.thrown),
      row('Clean hits', (f) => f.stats.landed),
      row('Accuracy', acc),
      row('Blocked', (f) => f.stats.blocked),
      row('Damage dealt', (f) => f.stats.damage),
    ];
    const body = $('stat-body');
    body.textContent = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      for (const cell of r) {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    $('result').hidden = false;
  }

  // ---- Effects ---------------------------------------------------------------

  const effects = [];
  const texts = [];
  let banner = null;
  let shake = 0;
  let flash = 0;

  function announce(text, life, color, sub) {
    banner = { text, sub: sub || '', life, max: life, color };
  }

  function targetPos(i, height) {
    const f = snap.fighters[i];
    if (mode === 'ring') {
      const d = display ? display[i] : f;
      const p = toScreen(d.x, d.y);
      return { x: p.x, y: p.y - (height === 'body' ? 4 : 12) };
    }
    const x = display ? display[i].x : f.x;
    return { x: x + f.facing * 6, y: FLOOR - (height === 'body' ? 150 : 222) };
  }

  function sparks(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random());
      effects.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 18 + Math.random() * 10, color });
    }
  }

  function floatText(x, y, text, color, size) {
    const scale = mode === 'ring' ? 0.7 : 1;
    texts.push({ x, y, text, color, size: Math.round((size || 22) * scale), life: 50 });
  }

  function onEvent(e) {
    if (e.type === 'fight') {
      announce('Fight!', 55, '#f4c542');
      sound.bell();
      return;
    }
    if (e.type === 'roundEnd') {
      const ko = snap.fighters.some((f) => f.hp <= 0);
      const who = e.winner === null ? 'Even round' : `${snap.fighters[e.winner].name} takes round ${e.round}`;
      announce(ko ? 'K.O.' : 'Time', 170, ko ? '#ff4a4f' : '#ffffff', who);
      sound.bell();
      return;
    }
    if (e.type === 'matchEnd') return;

    if (e.type === 'left') return;
    if (e.type === 'fistWarn') {
      sound.whoosh();
      return;
    }
    if (e.type === 'fist') {
      const p = fistSpot(e.x, e.y);
      slams.push({ x: e.x, y: e.y, life: SLAM_LIFE });
      shake = Math.max(shake, 18);
      crowdHype = 1;
      sparks(p.x, p.y, '#f4c542', 30, 8);
      sound.slam();
      const up = mode === 'ring' ? 0.6 : 1;
      for (const i of e.hits) {
        const t = targetPos(i, 'head');
        floatText(t.x, t.y - 40 * up, `-${e.damage}`, '#ffffff', 32);
      }
      floatText(p.x, p.y - (mode === 'ring' ? 70 : 300), e.hits.length ? 'Giant fist!' : 'Missed!', '#f4c542', 30);
      return;
    }
    // The ring from above is smaller: labels float closer, and smaller.
    const up = mode === 'ring' ? 0.6 : 1;
    const p = targetPos(e.target, e.height);
    const attacker = e.attacker !== undefined ? e.attacker : 1 - e.target;
    let hx = p.x;
    if (mode === 'ring') {
      // Sparks on the side the blow came from.
      const a = targetPos(attacker, e.height);
      const d = Math.hypot(a.x - p.x, a.y - p.y) || 1;
      hx = p.x + ((a.x - p.x) / d) * 10;
    } else {
      hx = p.x - snap.fighters[attacker].facing * 18;
    }
    if (e.type === 'hit') {
      const heavy = e.move === 'kick';
      sparks(hx, p.y, e.counter ? '#f4c542' : '#ffffff', heavy ? 18 : 9, heavy ? 6 : 4);
      shake = Math.max(shake, (heavy ? 8 : 3) + (e.height === 'head' ? 2 : 0) + (e.counter ? 4 : 0));
      floatText(p.x, p.y - 40 * up, `-${e.damage}`, '#ffffff', heavy ? 28 : 20);
      const label = e.counter ? 'Counter!' : e.wrongGuard ? 'Wrong guard!' : e.height === 'head' ? 'Head!' : 'Tummy!';
      floatText(p.x, p.y - 72 * up, label, e.counter || e.wrongGuard ? '#f4c542' : '#ffffff', 22);
      sound.hit(heavy ? 1 : 0.55);
    } else if (e.type === 'block') {
      sparks(hx, p.y + 14, '#9cc4ff', 6, 3);
      floatText(p.x, p.y - 40 * up, 'Blocked', '#9cc4ff', 18);
      sound.block();
    } else if (e.type === 'guardbreak') {
      sparks(hx, p.y + 10, '#f4c542', 22, 7);
      shake = Math.max(shake, 9);
      floatText(p.x, p.y - 60 * up, 'Guard break!', '#f4c542', 28);
      sound.hit(0.9);
    } else if (e.type === 'ko') {
      shake = 16;
      flash = 1;
      sparks(p.x, p.y, '#ffffff', 34, 9);
    }
  }

  // ---- Sound -----------------------------------------------------------------

  const sound = (() => {
    let ac = null;
    let muted = load('boxer-muted') === '1';
    function ctxOk() {
      if (muted) return null;
      if (!ac) {
        try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function noise(a, dur, freq, gain) {
      const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
      const src = a.createBufferSource();
      src.buffer = buf;
      const f = a.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = a.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(a.destination);
      src.start();
    }
    function tone(a, freq, dur, gain, type, endFreq) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, a.currentTime + dur);
      g.gain.setValueAtTime(gain, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g).connect(a.destination);
      o.start();
      o.stop(a.currentTime + dur);
    }
    return {
      unlock() { ctxOk(); },
      toggle() { muted = !muted; save('boxer-muted', muted ? '1' : '0'); return muted; },
      get muted() { return muted; },
      hit(power) {
        const a = ctxOk(); if (!a) return;
        noise(a, 0.12 + power * 0.08, 900 + power * 900, 0.5 + power * 0.4);
        tone(a, 140, 0.18, 0.5 * power, 'sine', 50);
      },
      block() {
        const a = ctxOk(); if (!a) return;
        noise(a, 0.07, 2400, 0.3);
      },
      // The giant fist: a rising whistle as its shadow appears, then the thud.
      whoosh() {
        const a = ctxOk(); if (!a) return;
        tone(a, 300, 1, 0.08, 'triangle', 1100);
      },
      slam() {
        const a = ctxOk(); if (!a) return;
        noise(a, 0.35, 500, 0.9);
        tone(a, 90, 0.5, 0.8, 'sine', 30);
      },
      bell() {
        const a = ctxOk(); if (!a) return;
        [1, 2.76, 5.4].forEach((m, i) => tone(a, 820 * m, 1.4 - i * 0.3, 0.12 / (i + 1)));
      },
    };
  })();

  // ---- Input -----------------------------------------------------------------

  const held = { left: false, right: false, up: false, down: false, block: false, aim: 'head' };
  // Up and down only do anything in the ring, but are harmless one on one.
  const KEY_HOLD = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyC: 'block' };
  const KEY_ACT = { KeyA: 'punch', KeyB: 'kick' };
  // Aim sticks until changed, so D/E can be tapped before or held during a move.
  const KEY_AIM = { KeyD: 'head', KeyE: 'body' };

  function fighting() { return $('fight').classList.contains('active') && snap; }

  function setHold(key, value) {
    if (held[key] === value) return;
    held[key] = value;
    send({ t: 'input', ...held });
    syncTouch();
  }

  function syncTouch() {
    document.querySelectorAll('#touch [data-aim]').forEach((b) => b.classList.toggle('on', b.dataset.aim === held.aim));
  }

  window.addEventListener('keydown', (e) => {
    if (!fighting() || e.target.tagName === 'INPUT') return;
    sound.unlock();
    if (e.code === 'KeyM') { sound.toggle(); return; }
    if (KEY_HOLD[e.code]) { setHold(KEY_HOLD[e.code], true); e.preventDefault(); }
    if (KEY_AIM[e.code]) { setHold('aim', KEY_AIM[e.code]); e.preventDefault(); }
    if (KEY_ACT[e.code]) {
      e.preventDefault();
      if (!e.repeat) send({ t: 'action', a: KEY_ACT[e.code] });
    }
  });
  window.addEventListener('keyup', (e) => {
    if (KEY_HOLD[e.code]) setHold(KEY_HOLD[e.code], false);
  });
  window.addEventListener('blur', () => ['left', 'right', 'up', 'down', 'block'].forEach((k) => setHold(k, false)));

  document.querySelectorAll('#touch button').forEach((btn) => {
    const hold = btn.dataset.hold;
    const act = btn.dataset.act;
    const aim = btn.dataset.aim;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sound.unlock();
      if (aim) { setHold('aim', aim); return; }
      btn.classList.add('on');
      if (hold) setHold(hold, true);
      if (act) send({ t: 'action', a: act });
    });
    const release = () => {
      if (aim) return;
      btn.classList.remove('on');
      if (hold) setHold(hold, false);
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  });

  // ---- Lobby wiring ----------------------------------------------------------

  function playerName() {
    const v = $('name').value.trim();
    return v || 'Boxer';
  }

  $('name').value = load('boxer-name') || '';

  // Signed in to Cheetah Moon: fight under that name. Otherwise offer to.
  fetch('/api/me').then((r) => r.json()).then((me) => {
    const account = $('account');
    account.textContent = '';
    if (me.signedIn) {
      $('name').value = me.name;
      $('name-field').hidden = true;
      const b = document.createElement('strong');
      b.textContent = me.name;
      account.append('Fighting as ', b);
    } else {
      const a = document.createElement('a');
      a.href = `${me.loginUrl}?next=${encodeURIComponent(location.href)}`;
      a.textContent = 'Sign in';
      account.append(a, ' to fight under your Cheetah Moon name.');
    }
  }).catch(() => {});
  $('name').addEventListener('change', () => {
    save('boxer-name', $('name').value.trim());
    send({ t: 'hello', name: playerName() });
  });
  if (pendingJoin) $('code').value = pendingJoin;

  function beforeMatchmaking() {
    sound.unlock();
    $('lobby-error').textContent = '';
    save('boxer-name', $('name').value.trim());
    send({ t: 'hello', name: playerName() });
  }

  $('quick').addEventListener('click', () => { beforeMatchmaking(); send({ t: 'quick' }); });
  $('create').addEventListener('click', () => { beforeMatchmaking(); send({ t: 'create' }); });
  $('start').addEventListener('click', () => { sound.unlock(); send({ t: 'start' }); });
  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    beforeMatchmaking();
    const code = $('code').value.trim().toUpperCase();
    if (code.length !== 4) { $('lobby-error').textContent = 'Room codes are 4 characters.'; return; }
    send({ t: 'join', code });
  });
  $('cancel').addEventListener('click', () => { send({ t: 'leave' }); show('lobby'); });
  $('copy').addEventListener('click', async () => {
    const link = $('share-link').value;
    try {
      await navigator.clipboard.writeText(link);
      $('copy').textContent = 'Copied';
    } catch {
      $('share-link').select();
      $('copy').textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { $('copy').textContent = 'Copy link'; }, 1600);
  });
  $('rematch').addEventListener('click', () => {
    send({ t: 'rematch' });
    $('rematch').disabled = true;
    $('rematch-note').textContent = names.length > 2 ? 'Waiting for the others…' : `Waiting for ${names[1 - me]}…`;
  });
  const toLobby = () => {
    send({ t: 'leave' });
    snap = null;
    $('result').hidden = true;
    $('notice').hidden = true;
    show('lobby');
  };
  $('leave').addEventListener('click', toLobby);
  $('notice-ok').addEventListener('click', toLobby);

  // ---- Poses -----------------------------------------------------------------
  // Local frame: origin between the feet, +x toward the opponent, -y up.

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  function attackProgress(f, t) {
    const m = G.MOVES[f.move];
    if (t < m.startup) return { phase: 'startup', p: t / m.startup };
    if (t < m.startup + m.active) return { phase: 'active', p: 1 };
    return { phase: 'recovery', p: 1 - clamp01((t - m.startup - m.active) / m.recovery) };
  }

  function pose(f, t, reach, kickReach, clock) {
    const bob = Math.sin(clock * 5 + f.x * 0.01) * 3;
    const P = {
      crouch: 4 + bob, lean: 0, headX: 4, headY: 0, stepX: 0,
      front: { x: 42, y: -212 }, back: { x: 24, y: -200 },
      kick: null, stride: 0, fall: 0, wobble: 0,
    };
    const low = f.aim === 'body';
    switch (f.state) {
      case 'walk':
        P.stride = Math.sin(clock * 14) * 9;
        break;
      case 'block':
      case 'blockstun': {
        const shove = f.state === 'blockstun' ? 1 : 0;
        if (low) {
          P.front = { x: 36 - shove * 6, y: -158 };
          P.back = { x: 30 - shove * 6, y: -144 };
          P.crouch = 16 + shove * 2;
          P.lean = 4 - shove * 8;
        } else {
          P.front = { x: 34 - shove * 6, y: -226 };
          P.back = { x: 30 - shove * 4, y: -208 };
          P.crouch = 12 + shove * 2;
          P.lean = -4 - shove * 6;
          P.headX = -shove * 4;
        }
        break;
      }
      case 'attack': {
        const { phase, p } = attackProgress(f, t);
        const e = phase === 'startup' ? easeOut(p) : p;
        if (f.move === 'punch') {
          P.front = { x: lerp(42, reach, e), y: lerp(-212, low ? -150 : -214, e) };
          P.lean = e * (low ? 12 : 8);
          if (low) P.crouch += e * 14;
        } else {
          // Kick: chamber the knee, snap the front foot out, bring it back.
          const footY = low ? -128 : -204;
          const chamber = { x: 34, y: low ? -96 : -140 };
          let foot;
          if (phase === 'startup' && p < 0.6) {
            const c = p / 0.6;
            foot = { x: lerp(26, chamber.x, c), y: lerp(0, chamber.y, c) };
          } else if (phase === 'startup') {
            const c = (p - 0.6) / 0.4;
            foot = { x: lerp(chamber.x, kickReach, c), y: lerp(chamber.y, footY, c) };
          } else {
            foot = { x: lerp(26, kickReach, p), y: lerp(0, footY, p) };
          }
          P.kick = foot;
          const k = clamp01(-foot.y / 140);
          P.lean = -k * (low ? 12 : 22);
          P.stepX = k * 22;
          P.crouch = 2 - k * 4;
          P.front = { x: 34, y: -206 };
          P.back = { x: 14, y: -196 };
        }
        break;
      }
      case 'hitstun': {
        const k = 1 - clamp01(t / 18);
        if (f.hitHeight === 'body') {
          P.lean = 16 * k;
          P.crouch = 4 + 22 * k;
          P.headX = 10 * k;
          P.headY = 10 * k;
          P.front = { x: 30, y: -150 };
          P.back = { x: 18, y: -140 };
        } else {
          P.lean = -22 * k;
          P.headX = 4 - 16 * k;
          P.headY = 6 * k;
          P.front = { x: 30, y: -196 };
          P.back = { x: 14, y: -186 };
        }
        break;
      }
      case 'guardbreak':
        P.front = { x: 34, y: -128 };
        P.back = { x: 20, y: -120 };
        P.lean = -10;
        P.wobble = Math.sin(t * 0.35) * 0.08;
        P.headY = 4;
        break;
      case 'ko':
        P.fall = easeOut(clamp01(t / 26));
        P.front = { x: 30, y: -150 };
        P.back = { x: -10, y: -150 };
        P.lean = -12;
        break;
    }
    return P;
  }

  function limb(sx, sy, gx, gy, len, bendDown) {
    // Two-bone IK: returns the elbow/knee joint.
    const dx = gx - sx;
    const dy = gy - sy;
    const d = Math.min(Math.hypot(dx, dy), len * 2 - 0.5);
    const a = Math.atan2(dy, dx);
    const off = Math.acos(clamp01(d / (len * 2)));
    const ang = a + (bendDown ? off : -off);
    return { x: sx + Math.cos(ang) * len, y: sy + Math.sin(ang) * len };
  }

  function drawFighter(i, f, x, t, clock, opponentX) {
    const c = PALETTE[i];
    const dist = Math.abs(opponentX - x);
    const reach = Math.max(60, Math.min(140, dist - 36));
    const kickReach = Math.max(70, Math.min(170, dist - 40));
    const P = pose(f, t, reach, kickReach, clock);
    const hurt = f.state === 'hitstun' && t < 5;

    ctx.save();
    ctx.translate(x, FLOOR);

    // Shadow stays on the floor.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(P.fall ? -f.facing * 70 * P.fall : 0, 4, 58 + P.fall * 60, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(f.facing, 1);
    if (P.stepX) ctx.translate(P.stepX, 0);
    if (P.fall) ctx.rotate(-P.fall * Math.PI * 0.5);
    if (P.wobble) ctx.rotate(P.wobble);

    const hipY = -104 + P.crouch;
    const shoulderY = -196 + P.crouch;
    const hipX = P.lean * 0.3;
    const shX = P.lean;
    const frontSh = { x: shX + 12, y: shoulderY + 4 };
    const backSh = { x: shX - 10, y: shoulderY };
    const ty = P.crouch;

    const gF = { x: P.front.x + P.lean * 0.4, y: P.front.y + ty };
    const gB = { x: P.back.x + P.lean * 0.4, y: P.back.y + ty };

    const skin = hurt ? mix(c.skin, '#ffffff', 0.45) : c.skin;
    const skinDark = hurt ? mix(c.skinDark, '#ffffff', 0.35) : c.skinDark;

    // Back arm (behind torso)
    drawArm(backSh, gB, skinDark, c.gloveDark, P.backArc);

    // Legs
    const feetBack = { x: -24 - P.stride, y: 0 };
    const feetFront = P.kick || { x: 26 + P.stride, y: 0 };
    drawLeg({ x: hipX - 10, y: hipY }, feetBack, skinDark);
    // A kicking leg is drawn over the torso below so it stays visible up close.
    if (!P.kick) drawLeg({ x: hipX + 10, y: hipY }, feetFront, skin);

    // Trunks
    ctx.fillStyle = c.trunks;
    ctx.beginPath();
    ctx.moveTo(hipX - 30, hipY - 26);
    ctx.lineTo(hipX + 30, hipY - 26);
    ctx.lineTo(hipX + 34, hipY + 26);
    ctx.lineTo(hipX + 4, hipY + 30);
    ctx.lineTo(hipX, hipY + 12);
    ctx.lineTo(hipX - 4, hipY + 30);
    ctx.lineTo(hipX - 34, hipY + 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c.trim;
    ctx.fillRect(hipX - 30, hipY - 28, 60, 8);

    // Torso
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(hipX - 26, hipY - 22);
    ctx.quadraticCurveTo(shX - 36, shoulderY + 30, shX - 26, shoulderY - 4);
    ctx.quadraticCurveTo(shX, shoulderY - 14, shX + 28, shoulderY);
    ctx.quadraticCurveTo(shX + 34, shoulderY + 34, hipX + 26, hipY - 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shX + 2, shoulderY + 22);
    ctx.quadraticCurveTo(shX + 14, shoulderY + 30, shX + 22, shoulderY + 22);
    ctx.stroke();

    // Head
    const hx = shX + P.headX;
    const hy = shoulderY - 30 + P.headY;
    ctx.fillStyle = skin;
    ctx.fillRect(hx - 7, hy + 10, 14, 16);
    ctx.beginPath();
    ctx.ellipse(hx, hy, 19, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.hair;
    ctx.beginPath();
    ctx.ellipse(hx - 3, hy - 9, 19, 14, -0.15, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    if (f.state === 'ko' || hurt) {
      ctx.fillRect(hx + 7, hy - 3, 7, 2);
    } else {
      ctx.beginPath();
      ctx.arc(hx + 10, hy - 2, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.ellipse(hx + 18, hy + 3, 3, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx + 6, hy + 10, 10, 3);

    if (P.kick) {
      drawLeg({ x: hipX + 10, y: hipY }, feetFront, skin, true);
      ctx.fillStyle = c.trunks;
      ctx.fillRect(hipX - 4, hipY - 20, 30, 34);
    }

    // Front arm
    drawArm(frontSh, gF, skin, c.glove);

    ctx.restore();
  }

  function mix(a, b, k) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (v, sh) => (v >> sh) & 255;
    const out = [16, 8, 0].map((sh) => Math.round(lerp(ch(pa, sh), ch(pb, sh), k)));
    return `rgb(${out.join(',')})`;
  }

  function drawLeg(hip, foot, color, kicking) {
    // A kicking leg is allowed to straighten all the way out.
    const len = kicking ? Math.max(52, Math.hypot(foot.x - hip.x, foot.y - hip.y) / 2 + 1) : 52;
    const knee = limb(hip.x, hip.y, foot.x, foot.y - 6, len, kicking);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(knee.x, knee.y);
    ctx.lineTo(foot.x, foot.y - 8);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.roundRect(foot.x - 12, foot.y - 16, 30, 16, 5);
    ctx.fill();
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(foot.x - 12, foot.y - 16, 30, 4);
  }

  function drawArm(sh, glove, skin, gloveColor, arc) {
    const elbow = limb(sh.x, sh.y, glove.x, glove.y, 60, true);
    if (arc) elbow.y -= arc;
    ctx.strokeStyle = skin;
    ctx.lineCap = 'round';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(glove.x, glove.y);
    ctx.stroke();
    ctx.fillStyle = gloveColor;
    ctx.beginPath();
    ctx.ellipse(glove.x + 4, glove.y, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(glove.x + 8, glove.y - 6, 7, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(glove.x - 14, glove.y - 8, 6, 16);
  }

  // ---- Scene -----------------------------------------------------------------

  const crowd = (() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const heads = [];
    for (let row = 0; row < 5; row++) {
      const y = 150 + row * 34;
      for (let x = -10; x < W + 20; x += 22 + rnd() * 10) {
        heads.push({ x, y: y + rnd() * 8, r: 11 + rnd() * 4 + row, shade: 22 + row * 6 + rnd() * 10, phase: rnd() * 6 });
      }
    }
    return heads;
  })();
  const flashes = [];

  function drawScene(clock) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05070b');
    bg.addColorStop(0.55, '#0f1520');
    bg.addColorStop(1, '#0a0d13');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Arena lights
    for (let i = 0; i < 6; i++) {
      const lx = 90 + i * 164;
      const g = ctx.createRadialGradient(lx, 30, 0, lx, 30, 90);
      g.addColorStop(0, 'rgba(255,236,190,0.35)');
      g.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - 90, 0, 180, 120);
    }

    // Crowd
    for (const h of crowd) {
      const bounce = Math.max(0, Math.sin(clock * 3 + h.phase)) * (crowdHype * 6);
      ctx.fillStyle = `rgb(${h.shade},${h.shade + 3},${h.shade + 10})`;
      ctx.beginPath();
      ctx.arc(h.x, h.y - bounce, h.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(h.x - h.r - 3, h.y + h.r * 0.6 - bounce, h.r * 2 + 6, 40);
    }
    if (Math.random() < 0.08 + crowdHype * 0.3) {
      flashes.push({ x: Math.random() * W, y: 140 + Math.random() * 150, life: 6 });
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const fl = flashes[i];
      ctx.fillStyle = `rgba(255,255,255,${fl.life / 6})`;
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, 3 + fl.life * 0.6, 0, Math.PI * 2);
      ctx.fill();
      if (--fl.life <= 0) flashes.splice(i, 1);
    }

    // Mat
    const matTop = 392;
    ctx.fillStyle = '#1b4f6b';
    ctx.beginPath();
    ctx.moveTo(60, matTop);
    ctx.lineTo(W - 60, matTop);
    ctx.lineTo(W + 40, H - 34);
    ctx.lineTo(-40, H - 34);
    ctx.closePath();
    ctx.fill();
    const mg = ctx.createLinearGradient(0, matTop, 0, H - 34);
    mg.addColorStop(0, 'rgba(0,0,0,0.35)');
    mg.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(W / 2, 460, 170, 40, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Apron
    ctx.fillStyle = '#0e1016';
    ctx.fillRect(0, H - 34, W, 34);
    ctx.fillStyle = '#c9262c';
    ctx.fillRect(0, H - 34, W / 2, 4);
    ctx.fillStyle = '#2463cc';
    ctx.fillRect(W / 2, H - 34, W / 2, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '20px Anton, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THE BOXER', W / 2, H - 9);

    // Back posts and ropes
    const posts = [60, W - 60];
    const ropeY = [262, 300, 338];
    const ropeColors = ['#d93b40', '#eeeeee', '#2f6fd8'];
    ropeY.forEach((y, k) => {
      ctx.strokeStyle = ropeColors[k];
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(posts[0], y);
      ctx.quadraticCurveTo(W / 2, y + 8, posts[1], y);
      ctx.stroke();
    });
    posts.forEach((px, k) => {
      ctx.fillStyle = '#2a2f3a';
      ctx.fillRect(px - 7, 240, 14, matTop - 240 + 4);
      ctx.fillStyle = k === 0 ? '#c9262c' : '#2463cc';
      ctx.fillRect(px - 10, 250, 20, 100);
    });

    // Spotlight on the ring
    const sp = ctx.createRadialGradient(W / 2, 300, 40, W / 2, 360, 520);
    sp.addColorStop(0, 'rgba(255,240,210,0.12)');
    sp.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = sp;
    ctx.fillRect(0, 0, W, H);
  }

  function drawFrontRopes() {
    const ropeY = [H - 118, H - 82, H - 46];
    const ropeColors = ['rgba(217,59,64,0.9)', 'rgba(238,238,238,0.85)', 'rgba(47,111,216,0.9)'];
    ropeY.forEach((y, k) => {
      ctx.strokeStyle = ropeColors[k];
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.quadraticCurveTo(W / 2, y + 10, W + 10, y);
      ctx.stroke();
    });
  }

  // ---- The ring seen from above (three or four fighters) ---------------------
  //
  // The simulation's square ring (RING_MIN..RING_MAX both ways) is drawn in
  // the middle of the canvas, with a card for each fighter either side.

  // Where the ring goes on the canvas. Wide: in the middle, with two fighter
  // cards either side. Tall (a phone held upright): the cards in a 2 x 2 block
  // on top, and the ring as wide as the screen below. Short (a phone held
  // sideways, with buttons either side): the ring as tall as the screen, and
  // narrow cards down each side.
  const VIEWS = {
    wide: { cx: 500, cy: 300, size: 480, from: 30, to: 970 },
    tall: { cx: 300, cy: 500, size: 592, from: 30, to: 970 },
    short: { cx: 430, cy: 300, size: 580, from: 30, to: 970 },
  };
  let VIEW = VIEWS.wide;
  let VK = VIEW.size / (VIEW.to - VIEW.from);
  // Fighters drawn a bit bigger than life, so they read at this size, and
  // bigger still when the ring is.
  const fighterScale = () => 1.25 * (VK / (VIEWS.wide.size / (VIEWS.wide.to - VIEWS.wide.from)));
  function toScreen(x, y) {
    return { x: VIEW.cx + (x - 500) * VK, y: VIEW.cy + (y - 500) * VK };
  }

  let layout = 'wide';
  const touchScreen = window.matchMedia('(pointer: coarse)');
  /** Picks the canvas layout for what's being shown and the screen's shape. */
  function chooseLayout() {
    const portrait = window.innerHeight > window.innerWidth * 1.1;
    let next = 'wide';
    if (mode === 'ring' && portrait) next = 'tall';
    else if (mode === 'ring' && touchScreen.matches) next = 'short';
    if (next === layout) return;
    layout = next;
    const size = { wide: WIDE, tall: TALL, short: SHORT }[next];
    W = size.w;
    H = size.h;
    VIEW = VIEWS[next];
    VK = VIEW.size / (VIEW.to - VIEW.from);
    ringCrowd = makeRingCrowd();
  }

  function makeRingCrowd() {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const heads = [];
    for (let i = 0; i < 260; i++) {
      // Seats all round the ring, a few rows deep.
      const side = Math.floor(rnd() * 4);
      const along = rnd() * 640 - 320;
      const out = 270 + rnd() * 50;
      const pos = [[along, -out], [out, along], [along, out], [-out, along]][side];
      heads.push({ x: VIEW.cx + pos[0] * (VIEW.size / 480), y: VIEW.cy + pos[1] * (VIEW.size / 480), r: 5 + rnd() * 2, shade: 26 + rnd() * 30, phase: rnd() * 6 });
    }
    return heads;
  }
  let ringCrowd = makeRingCrowd();

  function drawRingScene(clock) {
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, W, H);
    for (const h of ringCrowd) {
      const bounce = Math.max(0, Math.sin(clock * 3 + h.phase)) * crowdHype * 2;
      ctx.fillStyle = `rgb(${h.shade},${h.shade + 3},${h.shade + 10})`;
      ctx.beginPath();
      ctx.arc(h.x, h.y - bounce, h.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Apron, then the mat inside the ropes.
    const a = toScreen(VIEW.from, VIEW.from);
    const b = toScreen(VIEW.to, VIEW.to);
    ctx.fillStyle = '#0e1016';
    ctx.fillRect(a.x - 8, a.y - 8, b.x - a.x + 16, b.y - a.y + 16);
    const m0 = toScreen(60, 60);
    const m1 = toScreen(940, 940);
    const mat = ctx.createRadialGradient(VIEW.cx, VIEW.cy, 20, VIEW.cx, VIEW.cy, VIEW.size * 0.7);
    mat.addColorStop(0, '#24658a');
    mat.addColorStop(1, '#173f57');
    ctx.fillStyle = mat;
    ctx.fillRect(m0.x, m0.y, m1.x - m0.x, m1.y - m0.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(VIEW.cx, VIEW.cy, 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.font = '40px Anton, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THE BOXER', VIEW.cx, VIEW.cy + 14);
    // Ropes: three, red, white and blue, from the outside in.
    ['#2f6fd8', '#eeeeee', '#d93b40'].forEach((color, k) => {
      const inset = 60 + k * 5;
      const r0 = toScreen(inset, inset);
      const r1 = toScreen(1000 - inset, 1000 - inset);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(r0.x, r0.y, r1.x - r0.x, r1.y - r0.y);
    });
    // Corner posts: red, blue and the two neutral corners.
    [[60, 60, '#c9262c'], [940, 940, '#2463cc'], [940, 60, '#e8e8e8'], [60, 940, '#e8e8e8']].forEach(([x, y, c]) => {
      const p = toScreen(x, y);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
    });
    const sp = ctx.createRadialGradient(VIEW.cx, VIEW.cy, 60, VIEW.cx, VIEW.cy, 420);
    sp.addColorStop(0, 'rgba(255,240,210,0.08)');
    sp.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = sp;
    ctx.fillRect(0, 0, W, H);
  }

  /**
   * One fighter from above, facing +x before rotating: head and shoulders,
   * two gloves, and a leg for kicks. Blocking puts both gloves up in front,
   * with a guard arc: bright near the head for a high guard, lower and wider
   * for the tummy.
   */
  function drawRingFighter(i, f, d, t, clock) {
    const c = PALETTE[i];
    const p = toScreen(d.x, d.y);
    const hurt = f.state === 'hitstun' && t < 5;
    const skin = hurt ? mix(c.skin, '#ffffff', 0.5) : c.skin;
    const low = f.aim === 'body';

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(fighterScale(), fighterScale());

    if (i === me) {
      // Where you are, at a glance.
      ctx.strokeStyle = c.glove;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -clock * 20;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (f.state === 'ko') {
      // Flat out on the canvas, seeing stars.
      const fall = easeOut(clamp01(t / 26));
      ctx.rotate(d.angle + Math.PI);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(10 * fall, 3, 40, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.trunks;
      ctx.fillRect(-4, -14, 22 * fall + 6, 28);
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(-8, 0, 14, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.hair;
      ctx.beginPath();
      ctx.arc(-26 * fall - 4, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(-(d.angle + Math.PI));
      for (let k = 0; k < 3; k++) {
        const a = clock * 3 + (k * Math.PI * 2) / 3;
        ctx.fillStyle = '#f4c542';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★', Math.cos(a) * 16, -26 + Math.sin(a) * 6);
      }
      ctx.restore();
      drawRingName(i, f, p);
      return;
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(3, 5, 26, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    let wobble = 0;
    if (f.state === 'guardbreak') wobble = Math.sin(t * 0.35) * 0.25;
    let recoil = 0;
    if (f.state === 'hitstun') recoil = -8 * (1 - clamp01(t / 16));
    ctx.rotate(d.angle + wobble);
    ctx.translate(recoil, 0);

    // Gloves and the kicking leg, in this fighter's frame (+x forward).
    const walk = f.state === 'walk' ? Math.sin(clock * 14) * 3 : 0;
    let front = { x: 18, y: 12 + walk };
    let back = { x: 16, y: -13 - walk };
    let kick = null;
    const guarding = f.state === 'block' || f.state === 'blockstun';
    if (guarding) {
      front = low ? { x: 12, y: 9 } : { x: 20, y: 7 };
      back = low ? { x: 12, y: -9 } : { x: 20, y: -7 };
    } else if (f.state === 'attack') {
      const { phase, p: pr } = attackProgress(f, t);
      const e = phase === 'startup' ? easeOut(pr) : pr;
      if (f.move === 'punch') {
        const reach = ((G.MOVES.punch.range * (f.luna ? G.LUNA_REACH : 1) - 40) * VK) / fighterScale();
        front = { x: lerp(18, reach, e), y: lerp(12, low ? 6 : 3, e) };
      } else {
        const reach = ((G.MOVES.kick.range * (f.luna ? G.LUNA_REACH : 1) - 40) * VK) / fighterScale();
        kick = { x: lerp(6, reach, e), y: 6 };
        front = { x: 14, y: 14 };
        back = { x: 12, y: -14 };
      }
    } else if (f.state === 'guardbreak') {
      front = { x: 8, y: 20 };
      back = { x: 6, y: -20 };
    }

    // Guard arc: which height is covered (and that it only covers the front).
    if (guarding) {
      ctx.strokeStyle = low ? 'rgba(156,196,255,0.45)' : 'rgba(156,196,255,0.9)';
      ctx.lineWidth = low ? 6 : 4;
      ctx.beginPath();
      ctx.arc(0, 0, low ? 34 : 30, -G.GUARD_ARC * 0.7, G.GUARD_ARC * 0.7);
      ctx.stroke();
    }

    if (kick) {
      ctx.strokeStyle = c.skinDark;
      ctx.lineCap = 'round';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(0, kick.y);
      ctx.lineTo(kick.x, kick.y);
      ctx.stroke();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(kick.x + 4, kick.y, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = low ? 'rgba(255,255,255,0.35)' : '#f2f2f2';
      ctx.fillRect(kick.x - 2, kick.y - 6, 3, 12);
    }

    // Tummy-height gloves sit under the shoulders; head-height ones over them.
    const glove = (g, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(g.x + 2, g.y - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    };
    const arm = (g, color) => {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(2, Math.sign(g.y) * 16);
      ctx.lineTo(g.x, g.y);
      ctx.stroke();
    };
    const gloveLow = low && (guarding || f.state === 'attack');
    if (gloveLow) {
      arm(back, c.skinDark); glove(back, c.gloveDark);
      arm(front, skin); glove(front, c.glove);
    }

    // Shoulders, trimmed in the fighter's colour, then the head.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.glove;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = c.hair;
    ctx.beginPath();
    ctx.arc(-1, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(5, 0, 5, -Math.PI / 2, Math.PI / 2);
    ctx.fill();

    if (!gloveLow) {
      arm(back, c.skinDark); glove(back, c.gloveDark);
      arm(front, skin); glove(front, c.glove);
    }
    ctx.restore();
    drawRingName(i, f, p);
  }

  function drawRingName(i, f, p) {
    ctx.font = '600 12px Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    const label = (i === me ? 'YOU' : f.name).toUpperCase();
    const below = 40 * fighterScale();
    ctx.strokeText(label, p.x, p.y + below);
    ctx.fillStyle = PALETTE[i].name;
    ctx.fillText(label, p.x, p.y + below);
  }

  /** A card per fighter: two down the left, two down the right. */
  function drawRingHud(s) {
    const tall = layout === 'tall';
    // Short: narrow cards in the strips either side of the ring, with the
    // status on a line of its own.
    const short = layout === 'short';
    // Tall: a compact 2 x 2 block across the top, with the timer between.
    const cardW = tall ? 222 : short ? 128 : 214;
    const cardH = tall ? 92 : short ? 116 : 118;
    s.fighters.forEach((f, i) => {
      const c = PALETTE[i];
      const edge = tall || short ? 4 : 14;
      const x0 = i % 2 === 0 ? edge : W - edge - cardW;
      const row = Math.floor(i / 2);
      const y0 = tall ? 4 + row * (cardH + 6) : short ? 62 + row * (cardH + 10) : 70 + row * (cardH + 28);
      const out = f.left;
      ctx.globalAlpha = out ? 0.45 : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x0, y0, cardW, cardH);
      ctx.fillStyle = c.glove;
      ctx.fillRect(x0, y0, 5, cardH);
      if (i === me) {
        ctx.strokeStyle = c.glove;
        ctx.lineWidth = 2;
        ctx.strokeRect(x0 + 1, y0 + 1, cardW - 2, cardH - 2);
      }
      ctx.textAlign = 'left';
      ctx.font = short ? '17px Anton, Impact, sans-serif' : '20px Anton, Impact, sans-serif';
      ctx.fillStyle = c.name;
      let name = f.name.toUpperCase() + (i === me ? (short ? ' (YOU)' : '  (YOU)') : '');
      if (name.length > 18) name = name.slice(0, 17) + '…';
      while (short && name.length > 2 && ctx.measureText(name).width > cardW - 22) name = name.slice(0, -2) + '…';
      const ny = tall || short ? 24 : 28;
      ctx.fillText(name, x0 + 14, y0 + ny);
      const dy = tall || short ? -8 : 0; // everything below the name moves up a little

      // Health, with the trail of what was just lost.
      const barX = x0 + 14;
      const barW = cardW - (short ? 22 : 28);
      const hpFrac = f.hp / G.MAX_HP;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(barX, y0 + 40 + dy, barW, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(barX, y0 + 40 + dy, barW * (display[i].hpTrail / G.MAX_HP), 16);
      ctx.fillStyle = hpFrac < 0.25 ? '#ff4a4f' : c.glove;
      ctx.fillRect(barX, y0 + 40 + dy, barW * hpFrac, 16);
      // Stamina
      const stFrac = f.stamina / G.MAX_STAMINA;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(barX, y0 + 62 + dy, barW, 6);
      ctx.fillStyle = stFrac < 0.25 && Math.floor(performance.now() / 150) % 2 ? '#ff9a3c' : '#f4c542';
      ctx.fillRect(barX, y0 + 62 + dy, barW * stFrac, 6);

      // Rounds won, and what's going on.
      for (let r = 0; r < G.ROUNDS_TO_WIN; r++) {
        ctx.beginPath();
        ctx.arc(barX + 7 + r * 20, y0 + (tall || short ? 74 : 88), 6, 0, Math.PI * 2);
        ctx.fillStyle = r < f.roundsWon ? '#f4c542' : 'rgba(255,255,255,0.15)';
        ctx.fill();
      }
      ctx.font = '700 13px Barlow, sans-serif';
      ctx.textAlign = short ? 'left' : 'right';
      let status = '';
      if (out) status = 'LEFT';
      else if (f.state === 'ko') status = 'DOWN';
      else if (i === me) status = `Aiming: ${held.aim === 'body' ? 'tummy' : 'head'}`;
      ctx.fillStyle = f.state === 'ko' && !out ? '#ff6f73' : i === me ? '#f4c542' : '#98a3b8';
      if (short) ctx.fillText(status, barX, y0 + 102);
      else ctx.fillText(status, x0 + cardW - 14, y0 + (tall ? 79 : 93));
      ctx.globalAlpha = 1;
    });

    // Timer: above the ring, or in the middle of the cards when tall.
    const secs = Math.ceil(s.timer / G.TICK_RATE);
    // Short: top of the left-hand strip, above the cards.
    const ty = tall ? cardH - 21 : 4;
    const tw = tall ? 136 : short ? cardW : 160;
    const tx = short ? 4 + cardW / 2 : W / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(tx - tw / 2, ty, tw, 50);
    ctx.textAlign = 'center';
    ctx.fillStyle = secs <= 10 && s.phase === 'fight' ? '#ff4a4f' : '#ffffff';
    ctx.font = '32px Anton, Impact, sans-serif';
    ctx.fillText(String(secs), tx, ty + 32);
    ctx.font = '600 11px Barlow, sans-serif';
    ctx.fillStyle = '#98a3b8';
    ctx.fillText(`ROUND ${s.round} OF ${G.MAX_ROUNDS}`, tx, ty + 46);

    if (rtt !== null) {
      ctx.textAlign = 'right';
      ctx.font = '600 12px Barlow, sans-serif';
      ctx.fillStyle = rtt > 150 ? '#ff9a3c' : 'rgba(255,255,255,0.4)';
      ctx.fillText(`${rtt} ms${sound.muted ? ' · muted' : ''}`, W - 12, H - 12);
    }
  }

  // ---- HUD -------------------------------------------------------------------

  function drawHud(s) {
    const barW = 380;
    const top = 22;
    s.fighters.forEach((f, i) => {
      const c = PALETTE[i];
      const left = i === 0;
      const x0 = left ? 30 : W - 30 - barW;
      const hpFrac = f.hp / G.MAX_HP;
      const trailFrac = display[i].hpTrail / G.MAX_HP;

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x0 - 3, top - 3, barW + 6, 28);
      const fill = (frac, color) => {
        const w = barW * frac;
        ctx.fillStyle = color;
        ctx.fillRect(left ? x0 + barW - w : x0, top, w, 22);
      };
      fill(trailFrac, '#ffffff');
      fill(hpFrac, hpFrac < 0.25 ? '#ff4a4f' : c.glove);

      // Stamina
      const stFrac = f.stamina / G.MAX_STAMINA;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect((left ? x0 + barW * 0.3 : x0) - 3, top + 29, barW * 0.7 + 6, 10);
      const sw = barW * 0.7 * stFrac;
      const low = stFrac < 0.25;
      ctx.fillStyle = low && Math.floor(performance.now() / 150) % 2 ? '#ff9a3c' : '#f4c542';
      ctx.fillRect(left ? x0 + barW * 0.3 + barW * 0.7 - sw : x0, top + 31, sw, 6);

      // Name and round pips
      ctx.font = '22px Anton, Impact, sans-serif';
      ctx.textAlign = left ? 'left' : 'right';
      ctx.fillStyle = c.name;
      const label = f.name.toUpperCase() + (i === me ? '  (YOU)' : '');
      ctx.fillText(label, left ? x0 : x0 + barW, top + 64);
      if (i === me) {
        ctx.font = '700 15px Barlow, sans-serif';
        ctx.fillStyle = '#f4c542';
        ctx.fillText(`Aiming at the ${held.aim === 'body' ? 'tummy' : 'head'}`, left ? x0 : x0 + barW, top + 86);
      }
      for (let r = 0; r < G.ROUNDS_TO_WIN; r++) {
        const px = left ? x0 + barW - 10 - r * 22 : x0 + 10 + r * 22;
        ctx.beginPath();
        ctx.arc(px, top + 56, 7, 0, Math.PI * 2);
        ctx.fillStyle = r < f.roundsWon ? '#f4c542' : 'rgba(255,255,255,0.15)';
        ctx.fill();
      }
    });

    // Timer
    const secs = Math.ceil(s.timer / G.TICK_RATE);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(W / 2 - 46, top - 8, 92, 70);
    ctx.fillStyle = secs <= 10 && s.phase === 'fight' ? '#ff4a4f' : '#ffffff';
    ctx.font = '44px Anton, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(secs), W / 2, top + 38);
    ctx.font = '600 13px Barlow, sans-serif';
    ctx.fillStyle = '#98a3b8';
    ctx.fillText(`ROUND ${s.round} OF ${G.MAX_ROUNDS}`, W / 2, top + 56);

    if (rtt !== null) {
      ctx.textAlign = 'right';
      ctx.font = '600 12px Barlow, sans-serif';
      ctx.fillStyle = rtt > 150 ? '#ff9a3c' : 'rgba(255,255,255,0.4)';
      ctx.fillText(`${rtt} ms${sound.muted ? ' · muted' : ''}`, W - 12, H - 44);
    }

    // Marker over the local fighter
    const mx = display[me].x;
    ctx.fillStyle = PALETTE[me].glove;
    ctx.beginPath();
    ctx.moveTo(mx - 9, 214);
    ctx.lineTo(mx + 9, 214);
    ctx.lineTo(mx, 226);
    ctx.closePath();
    ctx.fill();
  }

  function drawBanner() {
    if (!banner) return;
    const age = banner.max - banner.life;
    const scale = age < 8 ? 1.6 - (age / 8) * 0.6 : 1;
    const alpha = Math.min(1, banner.life / 12);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(layout === 'wide' ? W / 2 : VIEW.cx, layout === 'wide' ? 250 : VIEW.cy - 40);
    if (layout !== 'wide') ctx.scale(0.75, 0.75);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = '96px Anton, Impact, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(banner.text.toUpperCase(), 0, 0);
    ctx.fillStyle = banner.color;
    ctx.fillText(banner.text.toUpperCase(), 0, 0);
    if (banner.sub) {
      ctx.font = '700 26px Barlow, sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeText(banner.sub, 0, 44);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(banner.sub, 0, 44);
    }
    ctx.restore();
    if (--banner.life <= 0) banner = null;
  }

  // ---- The giant fist ----------------------------------------------------------

  const slams = [];
  const SLAM_LIFE = 36;

  /** Where the fist comes down, on screen: on the mat, or on the floor. */
  function fistSpot(x, y) {
    return mode === 'ring' ? toScreen(x, y) : { x, y: FLOOR };
  }
  const fistRadius = () => (mode === 'ring' ? G.FIST_RADIUS * VK : G.FIST_RADIUS);

  /** The shadow it casts: darker and tighter as it comes. */
  function drawFistShadow(x, y, k) {
    const p = fistSpot(x, y);
    const r = fistRadius();
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 70);
    ctx.save();
    ctx.translate(p.x, p.y);
    if (mode !== 'ring') ctx.scale(1, 0.25);
    ctx.fillStyle = `rgba(0,0,0,${0.25 + 0.45 * k})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.4 - 0.4 * k), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,74,79,${0.4 + 0.5 * pulse})`;
    ctx.lineWidth = mode === 'ring' ? 3 : 8;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * A giant gold glove, knuckles down. From above it's seen from the back and
   * shrinks as it falls away from us; side on it drops from the top.
   */
  function drawGiantFist(x, y, k, alpha) {
    const p = fistSpot(x, y);
    const r = fistRadius();
    ctx.save();
    ctx.globalAlpha = alpha;
    if (mode === 'ring') {
      const size = r * (2.4 - 1.4 * k);
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(size * 0.08, size * 0.1, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b8901f';
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4c542';
      ctx.beginPath();
      ctx.arc(-size * 0.08, -size * 0.1, size * 0.88, 0, Math.PI * 2);
      ctx.fill();
      // Knuckles along the front, and the cuff at the back.
      ctx.strokeStyle = '#b8901f';
      ctx.lineWidth = Math.max(2, size * 0.06);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * size * 0.32, -size * 0.45, size * 0.18, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-size * 0.55, size * 0.5, size * 1.1, size * 0.22);
    } else {
      const w = 150;
      const h = 170;
      const bottom = -40 + (p.y + 40) * k; // from off the top down to the floor
      ctx.translate(p.x, bottom);
      // Arm up off the top of the screen.
      ctx.fillStyle = '#e0ac86';
      ctx.fillRect(-w * 0.28, -h - 600, w * 0.56, 600);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-w * 0.42, -h - 26, w * 0.84, 34);
      ctx.fillStyle = '#b8901f';
      roundRect(-w / 2, -h, w, h, 52);
      ctx.fillStyle = '#f4c542';
      roundRect(-w / 2 + 8, -h + 4, w - 22, h - 14, 46);
      // Thumb, and the knuckles at the bottom.
      ctx.fillStyle = '#d9ab2f';
      roundRect(w / 2 - 44, -h + 40, 40, 80, 20);
      ctx.strokeStyle = '#b8901f';
      ctx.lineWidth = 5;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * 38, -34, 18, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  /** Under the fighters: the shadow of a fist on its way, and the dent it left. */
  function drawFistUnder() {
    if (snap.fist) drawFistShadow(snap.fist.x, snap.fist.y, Math.min(1, snap.fist.t / G.FIST_WARN_TICKS));
    for (const sl of slams) {
      const p = fistSpot(sl.x, sl.y);
      const age = 1 - sl.life / SLAM_LIFE;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (mode !== 'ring') ctx.scale(1, 0.25);
      ctx.strokeStyle = `rgba(244,197,66,${1 - age})`;
      ctx.lineWidth = mode === 'ring' ? 6 : 14;
      ctx.beginPath();
      ctx.arc(0, 0, fistRadius() * (0.8 + age * 1.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Over the fighters: the fist coming down for the last part of the warning, then lifting away. */
  function drawFistOver() {
    if (snap.fist) {
      const k = snap.fist.t / G.FIST_WARN_TICKS;
      const drop = 0.55; // the shadow alone until here
      // See-through on the way down, so you can still see who's under it.
      if (k > drop) drawGiantFist(snap.fist.x, snap.fist.y, (k - drop) / (1 - drop), Math.min(0.6, (k - drop) * 4));
    }
    for (let i = slams.length - 1; i >= 0; i--) {
      const sl = slams[i];
      const lift = Math.max(0, 1 - sl.life / (SLAM_LIFE * 0.4)); // rests, then lifts and fades
      drawGiantFist(sl.x, sl.y, 1 - lift * 0.5, 1 - lift);
      sl.life--;
      if (sl.life <= 0) slams.splice(i, 1);
    }
  }

  // ---- Loop ------------------------------------------------------------------

  let crowdHype = 0;
  let lastFrame = performance.now();

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    return dpr;
  }

  const rank = (f) => (f.state === 'ko' ? 0 : f.state === 'attack' ? 2 : 1);

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const clock = now / 1000;
    chooseLayout();
    const dpr = resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!snap || !display) {
      if (mode === 'ring') drawRingScene(clock);
      else drawScene(clock);
      requestAnimationFrame(frame);
      return;
    }

    const ticksSince = Math.min(3, ((now - snapAt) / 1000) * G.TICK_RATE);
    snap.fighters.forEach((f, i) => {
      const d = display[i];
      const k = Math.min(1, dt * 22);
      if (Math.abs(f.x - d.x) > 200 || Math.abs((f.y || 0) - d.y) > 200) { d.x = f.x; d.y = f.y || 0; }
      d.x += (f.x - d.x) * k;
      d.y += ((f.y || 0) - d.y) * k;
      // Turn the short way round.
      let turn = (f.angle || 0) - d.angle;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      d.angle += turn * k;
      if (d.hpTrail > f.hp) d.hpTrail = Math.max(f.hp, d.hpTrail - dt * 30);
      else d.hpTrail = f.hp;
    });

    crowdHype = Math.max(0, crowdHype - dt * 0.8);
    if (shake > 6) crowdHype = 1;

    ctx.save();
    if (shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= 0.86;
    }
    const ring = snap.mode === 'ring';
    if (ring) {
      drawRingScene(clock);
      drawFistUnder();
      // Those down first, then attackers last so their gloves are on top.
      const order = snap.fighters.map((f, i) => i)
        .filter((i) => !snap.fighters[i].left)
        .sort((a, b) => rank(snap.fighters[a]) - rank(snap.fighters[b]));
      for (const i of order) drawRingFighter(i, snap.fighters[i], display[i], snap.fighters[i].t + ticksSince, clock);
    } else {
      drawScene(clock);
      drawFistUnder();

      // Draw the fighter who is being hit first so the puncher's glove overlaps.
      const order = snap.fighters[0].state === 'attack' ? [1, 0] : [0, 1];
      for (const i of order) {
        const f = snap.fighters[i];
        drawFighter(i, f, display[i].x, f.t + ticksSince, clock, display[1 - i].x);
      }
    }

    for (let i = effects.length - 1; i >= 0; i--) {
      const p = effects[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life--;
      ctx.globalAlpha = Math.max(0, p.life / 24);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      if (p.life <= 0) effects.splice(i, 1);
    }
    ctx.globalAlpha = 1;
    if (!ring) drawFrontRopes();
    drawFistOver();

    for (let i = texts.length - 1; i >= 0; i--) {
      const tx = texts[i];
      tx.y -= 0.9; tx.life--;
      ctx.globalAlpha = Math.min(1, tx.life / 15);
      ctx.font = `${tx.size}px Anton, Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(tx.text.toUpperCase(), tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text.toUpperCase(), tx.x, tx.y);
      if (tx.life <= 0) texts.splice(i, 1);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (ring) drawRingHud(snap);
    else drawHud(snap);
    drawBanner();

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - dt * 3);
    }

    requestAnimationFrame(frame);
  }

  connect();
  requestAnimationFrame(frame);
})();
