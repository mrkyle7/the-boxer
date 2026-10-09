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
        bolts.length = 0;
        rays.length = 0;
        hearts.length = 0;
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
    if (text === '-0') return; // during Edward's secret pause hits do nothing, quietly
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
    // Edward's pause is a secret: only Edward hears it start and stop.
    if (e.type === 'edward') {
      if (e.attacker === me) {
        secretPauseUntil = performance.now() + 3000;
        sound.tapeStop();
      }
      return;
    }
    if (e.type === 'unpause') {
      if (e.attacker === me) {
        secretPauseUntil = 0;
        sound.tapeStart();
      }
      return;
    }
    if (e.type === 'daniel') {
      const p = targetPos(e.target, 'body');
      sparks(p.x, p.y, '#b6e24a', 28, 7);
      floatText(p.x, p.y - (mode === 'ring' ? 60 : 150), 'Spiky!', '#b6e24a', 34);
      sound.spikes();
      return;
    }
    if (e.type === 'spiked') {
      if (display && display[e.attacker]) display[e.attacker].spikedAt = performance.now();
      const p = targetPos(e.target, 'head');
      sparks(p.x, p.y, '#ff4a4f', 18, 6);
      sparks(p.x, p.y, '#b6e24a', 10, 5);
      shake = Math.max(shake, 7);
      floatText(p.x, p.y - (mode === 'ring' ? 30 : 50), `Ouch! -${e.damage}`, '#b6e24a', 28);
      sound.hit(0.7);
      return;
    }
    if (e.type === 'priya') {
      const p = targetPos(e.attacker, 'head');
      floatText(p.x, p.y - (mode === 'ring' ? 60 : 110), 'Freeze ray!', '#7ff3ff', 32);
      sound.pew();
      return;
    }
    if (e.type === 'rayFreeze') {
      const p = targetPos(e.target, 'body');
      sparks(p.x, p.y, '#e6fdff', 30, 7);
      sparks(p.x, p.y, '#7ff3ff', 16, 5);
      shake = Math.max(shake, 8);
      floatText(p.x, p.y - (mode === 'ring' ? 70 : 150), 'Frozen!', '#7ff3ff', 34);
      sound.tinkle();
      return;
    }
    if (e.type === 'rayBlocked') {
      const p = targetPos(e.target, 'head');
      sparks(p.x, p.y + 20, '#e6fdff', 22, 6);
      floatText(p.x, p.y - (mode === 'ring' ? 50 : 70), 'Blocked!', '#9cc4ff', 28);
      sound.block();
      return;
    }
    if (e.type === 'rayFizzle') {
      const p = mode === 'ring' ? toScreen(e.x, e.y) : { x: e.x, y: FLOOR - 160 };
      sparks(p.x, p.y, '#e6fdff', 10, 3);
      return;
    }
    if (e.type === 'shree') {
      const p = targetPos(e.attacker, 'head');
      floatText(p.x, p.y - (mode === 'ring' ? 60 : 110), "Shree's fist!", '#ff6b4a', 32);
      sound.whoosh();
      return;
    }
    if (e.type === 'shreeSlam') {
      const p = fistSpot(e.x, e.y);
      slams.push({ x: e.x, y: e.y, life: SLAM_LIFE });
      shake = Math.max(shake, 18);
      crowdHype = 1;
      sparks(p.x, p.y, '#ff6b4a', 30, 8);
      sound.slam();
      floatText(p.x, p.y - (mode === 'ring' ? 70 : 300), e.hits.length ? 'Bullseye!' : 'Missed!', '#ff6b4a', 30);
      return;
    }
    if (e.type === 'shreeCancel') {
      const p = targetPos(e.attacker, 'head');
      floatText(p.x, p.y - (mode === 'ring' ? 50 : 80), 'Lost the fist!', '#cfd6e4', 24);
      return;
    }
    if (e.type === 'shaan') {
      const from = targetPos(e.attacker, 'body');
      const to = targetPos(e.target, 'body');
      rays.push({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, life: 24 });
      sparks(to.x, to.y, '#ff6ad5', 24, 6);
      floatText(to.x, to.y - (mode === 'ring' ? 60 : 140), e.unbig ? 'Back to normal!' : 'Shrunk!', '#ff6ad5', 32);
      sound.shrink();
      return;
    }
    if (e.type === 'parimal') {
      const p = targetPos(e.attacker, 'head');
      floatText(p.x, p.y - (mode === 'ring' ? 60 : 110), 'Beep beep!', '#ffffff', 34);
      sound.horn();
      return;
    }
    if (e.type === 'carHit') {
      const p = targetPos(e.target, 'body');
      sparks(p.x, p.y, '#ffffff', 26, 9);
      sparks(p.x, p.y, '#ff4a4f', 18, 7);
      shake = Math.max(shake, 20);
      crowdHype = 1;
      floatText(p.x, p.y - (mode === 'ring' ? 80 : 160), 'Crash!', '#ff4a4f', 36);
      sound.slam();
      return;
    }
    if (e.type === 'carStop') {
      const p = targetPos(e.attacker, 'body');
      puff(p.x, p.y, false);
      sound.screech();
      return;
    }
    if (e.type === 'harrison') {
      onSurprise(e);
      return;
    }
    if (e.type === 'hurt') {
      const p = targetPos(e.target, 'head');
      floatText(p.x, p.y - (mode === 'ring' ? 24 : 40), `-${e.damage}`, '#ffffff', 30);
      return;
    }
    if (e.type === 'jemini') {
      const p = targetPos(e.target, 'body');
      sparks(p.x, p.y, '#6ff2b6', 30, 7);
      sparks(p.x, p.y, '#ffffff', 14, 5);
      shake = Math.max(shake, 8);
      floatText(p.x, p.y - (mode === 'ring' ? 60 : 150), 'Jemini!', '#6ff2b6', 34);
      sound.grow();
      return;
    }
    if (e.type === 'kyle') {
      const p = targetPos(e.target, 'body');
      puff(p.x, p.y, true);
      floatText(p.x, p.y - (mode === 'ring' ? 60 : 150), e.target === me ? 'Invisible!' : 'Poof!', '#b5ecff', 32);
      sound.poof();
      return;
    }
    if (e.type === 'vault') {
      const p = targetPos(e.attacker, 'head');
      floatText(p.x, p.y - (mode === 'ring' ? 50 : 70), 'Luna vault!', PALETTE[e.attacker].name, 30);
      sound.whoosh();
      return;
    }
    if (e.type === 'flip') {
      const p = targetPos(e.attacker, 'head');
      floatText(p.x, p.y - (mode === 'ring' ? 50 : 70), 'Zeffen flip!', PALETTE[e.attacker].name, 30);
      sound.whoosh();
      return;
    }
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
    if (e.type === 'hit' && e.move === 'vault') {
      sparks(hx, p.y, '#c8a2ff', 30, 8);
      sparks(hx, p.y, '#ffffff', 12, 5);
      shake = Math.max(shake, 16);
      floatText(p.x, p.y - 40 * up, `-${e.damage}`, '#ffffff', 32);
      floatText(p.x, p.y - 76 * up, 'In the back!', '#c8a2ff', 28);
      sound.slam();
      return;
    }
    if (e.type === 'hit' && e.move === 'flip') {
      sparks(hx, p.y, '#f4c542', 36, 9);
      sparks(hx, p.y, '#ffffff', 16, 6);
      shake = Math.max(shake, 20);
      flash = Math.max(flash, 0.5);
      // The second hit's numbers go beside the first's.
      const sx = e.second ? p.x + 70 * up : p.x;
      floatText(sx, p.y - 40 * up, `-${e.damage}`, '#ffffff', 34);
      floatText(sx, p.y - 76 * up, e.second ? 'x2!' : 'Zeffen!', '#f4c542', 30);
      sound.slam();
      return;
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
      // Jemini: a rising arpeggio as they grow.
      grow() {
        const a = ctxOk(); if (!a) return;
        [0, 0.08, 0.16, 0.24].forEach((at, k) => setTimeout(() => tone(a, 330 * 2 ** (k * 4 / 12), 0.22, 0.12, 'square'), at * 1000));
      },
      // Edward (only Edward hears it): a tape grinding to a halt, and starting up again.
      tapeStop() {
        const a = ctxOk(); if (!a) return;
        tone(a, 520, 0.6, 0.18, 'sawtooth', 40);
      },
      tapeStart() {
        const a = ctxOk(); if (!a) return;
        tone(a, 60, 0.35, 0.15, 'sawtooth', 520);
      },
      // Daniel: a metallic 'shing'.
      spikes() {
        const a = ctxOk(); if (!a) return;
        tone(a, 1400, 0.4, 0.1, 'sawtooth', 2600);
        tone(a, 2100, 0.3, 0.06, 'square', 3200);
      },
      // Priya: an icy 'pew'.
      pew() {
        const a = ctxOk(); if (!a) return;
        tone(a, 2200, 0.3, 0.12, 'triangle', 600);
        noise(a, 0.15, 6000, 0.15);
      },
      // Shaan: a falling 'boing'. Parimal: a horn, and a skid at the end.
      shrink() {
        const a = ctxOk(); if (!a) return;
        tone(a, 900, 0.45, 0.14, 'square', 140);
      },
      horn() {
        const a = ctxOk(); if (!a) return;
        [0, 0.22].forEach((at) => setTimeout(() => {
          tone(a, 392, 0.16, 0.12, 'square');
          tone(a, 494, 0.16, 0.08, 'square');
        }, at * 1000));
      },
      screech() {
        const a = ctxOk(); if (!a) return;
        noise(a, 0.35, 3000, 0.25);
      },
      // Harrison's surprises.
      zap() {
        const a = ctxOk(); if (!a) return;
        noise(a, 0.4, 4000, 0.7);
        tone(a, 1600, 0.35, 0.2, 'sawtooth', 80);
      },
      slide() {
        const a = ctxOk(); if (!a) return;
        tone(a, 1000, 0.55, 0.15, 'sine', 160);
      },
      tinkle() {
        const a = ctxOk(); if (!a) return;
        [0, 0.07, 0.14].forEach((at, k) => setTimeout(() => tone(a, 1800 + k * 500, 0.3, 0.07, 'triangle'), at * 1000));
      },
      // Kyle: a soft puff of smoke.
      poof() {
        const a = ctxOk(); if (!a) return;
        noise(a, 0.3, 1400, 0.35);
        tone(a, 520, 0.25, 0.08, 'sine', 180);
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

  // The cheat codes. The server checks the letters (a hit wipes them, and
  // everyone sees them going in). Typing one can press E (aim tummy) on the
  // way, so the aim goes back to what it was before the first letter; and the
  // letter that finishes it (the A in luna) doesn't also punch.
  const typed = [];
  const CODES = Object.keys(G.CODES);
  const CODE_MAX = Math.max(...CODES.map((c) => c.length));
  /**
   * Sends the letter. 'done' if it finished a code, 'typing' if it's part of
   * one going in (so the M in jemini doesn't mute the sound), else false.
   */
  function checkCheat(e) {
    if (e.repeat || !/^[a-z]$/i.test(e.key)) return false;
    send({ t: 'type', k: e.key.toLowerCase() });
    typed.push({ key: e.key.toLowerCase(), aim: held.aim });
    if (typed.length > CODE_MAX) typed.shift();
    const word = typed.map((k) => k.key).join('');
    const code = CODES.find((c) => word.endsWith(c));
    if (code) {
      setHold('aim', typed[typed.length - code.length].aim);
      typed.length = 0;
      return 'done';
    }
    const partway = CODES.some((c) => {
      for (let n = Math.min(c.length - 1, word.length); n >= 2; n--) if (word.endsWith(c.slice(0, n))) return true;
      return false;
    });
    return partway ? 'typing' : false;
  }

  window.addEventListener('keydown', (e) => {
    if (!fighting() || e.target.tagName === 'INPUT') return;
    sound.unlock();
    const cheating = checkCheat(e);
    if (cheating === 'done') { e.preventDefault(); return; }
    // Partway through a code (the A in harrison), letters don't attack.
    if (cheating === 'typing' && KEY_ACT[e.code]) { e.preventDefault(); return; }
    if (e.code === 'KeyM') { if (!cheating) sound.toggle(); return; }
    if (KEY_HOLD[e.code]) { setHold(KEY_HOLD[e.code], true); e.preventDefault(); }
    if (KEY_AIM[e.code]) { setHold('aim', KEY_AIM[e.code]); e.preventDefault(); }
    if (KEY_ACT[e.code]) {
      e.preventDefault();
      if (!e.repeat) send({ t: 'action', a: KEY_ACT[e.code] });
    }
    // Space: jump (one on one: over a car, say).
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && mode !== 'ring') send({ t: 'action', a: 'jump' });
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
        if (f.move === 'jump') {
          jumpPose(P, t);
        } else if (f.move === 'flip' || f.move === 'vault') {
          flipPose(P, t, phase, p, kickReach, f.move);
        } else if (f.move === 'punch') {
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
    if (f.slip) {
      // Feet out from under them, flat on their back, then back up.
      const down = G.BANANA_TICKS - f.slip;
      P.fall = easeOut(clamp01(down / 10)) * clamp01(f.slip / 14);
      P.front = { x: 30, y: -180 };
      P.back = { x: -10, y: -170 };
      P.lean = -18;
      P.kick = { x: 60, y: -90 * P.fall };
    }
    return P;
  }

  /**
   * The Zeffen flip, side on: crouch, spring up into a tuck and turn right
   * over, then come down with an axe kick.
   */
  function flipPose(P, t, phase, p, kickReach, move) {
    const m = G.MOVES[move];
    if (phase === 'startup' && t < G.FLIP_CROUCH) {
      const c = t / G.FLIP_CROUCH;
      P.crouch = 4 + 34 * c;
      P.front = { x: 30, y: -160 };
      P.back = { x: 20, y: -150 };
      return;
    }
    if (phase === 'startup') {
      const q = (t - G.FLIP_CROUCH) / (m.startup - G.FLIP_CROUCH);
      P.spin = q * Math.PI * 2;
      // The vault goes right over their head.
      P.lift = Math.sin(q * Math.PI) * (move === 'vault' ? 250 : 170);
      P.crouch = 40;
      P.front = { x: 40, y: -110 };
      P.back = { x: 30, y: -104 };
      P.kick = { x: 44, y: -70 }; // knees tucked up
      return;
    }
    // Landing: the heel comes down on them.
    P.kick = { x: kickReach * 0.85, y: lerp(-40, -150, p) };
    P.lean = -14 * p;
    P.crouch = 18 * p;
    P.front = { x: 34, y: -200 };
    P.back = { x: 14, y: -190 };
  }

  /** A jump: crouch, up with the knees tucked, down again. */
  function jumpPose(P, t) {
    const m = G.MOVES.jump;
    if (t < G.JUMP_CROUCH) {
      P.crouch = 4 + 26 * (t / G.JUMP_CROUCH);
      return;
    }
    const q = clamp01((t - G.JUMP_CROUCH) / (m.startup - G.JUMP_CROUCH));
    P.spin = 0;
    P.lift = Math.sin(q * Math.PI) * 150;
    P.crouch = 24;
    P.front = { x: 40, y: -200 };
    P.back = { x: 26, y: -192 };
    P.kick = { x: 40, y: -60 }; // knees up
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

  function drawFighter(i, f, x, t, clock, opponentX, echo) {
    const c = PALETTE[i];
    const dist = Math.abs(opponentX - x);
    const reach = Math.max(60, Math.min(140, dist - 36));
    const kickReach = Math.max(70, Math.min(170, dist - 40));
    const P = pose(f, t, reach, kickReach, clock);
    const hurt = f.state === 'hitstun' && t < 5;
    // Going over in the vault turns them round halfway: keep the somersault
    // turning the same way it started.
    const d = display[i];
    if (f.move === 'vault' && f.state === 'attack') {
      if (d.vaultFacing === undefined) d.vaultFacing = f.facing;
      if (P.spin !== undefined && f.facing !== d.vaultFacing) P.spin = -P.spin;
    } else {
      d.vaultFacing = undefined;
    }

    ctx.save();
    ctx.translate(x, FLOOR);
    const size = d.size || 1;
    if (size > 1.01 && !echo) giantAura(0, -130 * size, 170 * size, clock, true);
    ctx.scale(size, size);
    if (f.invisible > 0) {
      // My own Kyle: a faint shimmer, so I know where I am.
      ctx.globalAlpha *= 0.28 + 0.12 * Math.sin(clock * 11);
      ctx.translate(Math.sin(clock * 37) * 2, 0);
    }

    // Shadow stays on the floor.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(P.fall ? -f.facing * 70 * P.fall : 0, 4, 58 + P.fall * 60, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(f.facing, 1);
    if (P.stepX) ctx.translate(P.stepX, 0);
    if (P.fall) ctx.rotate(-P.fall * Math.PI * 0.5);
    if (P.spin !== undefined) {
      // Up into the air and over, turning about the middle of the body.
      ctx.translate(0, -P.lift - 110);
      ctx.rotate(P.spin);
      ctx.translate(0, 110);
    }
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
    const size = d.size || 1;
    if (size > 1.01) giantAura(0, 0, 56 * size, clock, false);
    ctx.scale(size, size);
    if (f.invisible > 0) {
      // My own Kyle: a faint shimmer in a dashed ice-blue ring.
      ctx.strokeStyle = 'rgba(181,236,255,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = clock * 30;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha *= 0.3 + 0.12 * Math.sin(clock * 11);
    }

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

    if (f.state === 'ko' || f.slip) {
      // Flat out on the canvas, seeing stars (or just slipped over).
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

    if (G.airborne(f)) {
      // The Zeffen flip from above: up towards us (bigger), turning over
      // (squashed front to back), with a gold swirl round it.
      const q = (t - G.FLIP_CROUCH) / (G.MOVES[f.move].startup - G.FLIP_CROUCH);
      const up = 1 + Math.sin(q * Math.PI) * 0.7;
      ctx.strokeStyle = 'rgba(244,197,66,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 40 * up, q * 12, q * 12 + Math.PI * 1.2);
      ctx.stroke();
      ctx.rotate(d.angle);
      ctx.scale(up * (0.35 + 0.65 * Math.abs(Math.cos(q * Math.PI))), up);
      ctx.rotate(-d.angle);
    }

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
      if ((f.move === 'flip' || f.move === 'vault') && phase === 'startup') {
        // Tucked up.
        front = { x: 10, y: 10 };
        back = { x: 10, y: -10 };
      } else if (f.move === 'punch') {
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

  let secretPauseUntil = 0; // when my own secret pause (Edward) runs out

  /** What's running on a fighter, for the HUD. */
  function powerLabels(i, f) {
    const out = [];
    const secs = (ticks) => Math.ceil(ticks / G.TICK_RATE);
    if (f.giant) out.push({ text: `JEMINI GIANT  ${secs(f.giant)}s`, short: `GIANT ${secs(f.giant)}s`, color: '#6ff2b6' });
    if (f.fast) out.push({ text: `ZOOM  ${secs(f.fast)}s`, short: `ZOOM ${secs(f.fast)}s`, color: '#ffb13b' });
    const secret = i === me ? secretPauseUntil - performance.now() : 0;
    if (secret > 0) out.push({ text: `SECRET PAUSE  ${Math.ceil(secret / 1000)}s`, short: `SHH ${Math.ceil(secret / 1000)}s`, color: '#c9c9d6' });
    if (f.spiky) out.push({ text: `SPIKY  ${secs(f.spiky)}s`, short: `SPIKY ${secs(f.spiky)}s`, color: '#b6e24a' });
    if (f.tiny) out.push({ text: `SHRUNK  ${secs(f.tiny)}s`, short: `TINY ${secs(f.tiny)}s`, color: '#ff6ad5' });
    if (f.shree && i === me) out.push({ text: 'STEER THE FIST · PUNCH TO DROP', short: 'FIST: PUNCH!', color: '#ff6b4a' });
    if (f.frozen) out.push({ text: `FROZEN  ${secs(f.frozen)}s`, short: `FROZEN ${secs(f.frozen)}s`, color: '#b5ecff' });
    if (f.invisible && i === me) out.push({ text: `INVISIBLE  ${secs(f.invisible)}s`, short: `INVISIBLE ${secs(f.invisible)}s`, color: '#b5ecff' });
    return out;
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
      // A power-up running shows instead, with how long it has left.
      const powers = out || f.state === 'ko' ? [] : powerLabels(i, f);
      if (powers.length) {
        status = powers.map((pw) => pw.short).join(' · ');
        ctx.fillStyle = powers[0].color;
      }
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
      // Power-ups running, and for how long (someone else's Kyle is a secret).
      const powers = powerLabels(i, f);
      if (powers.length) {
        ctx.font = '700 15px Barlow, sans-serif';
        powers.forEach((pw, k) => {
          ctx.fillStyle = pw.color;
          ctx.fillText(pw.text, left ? x0 : x0 + barW, top + (i === me ? 106 : 86) + k * 20);
        });
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

  // ---- The cheat code, going in --------------------------------------------------

  // Comic-book letters for the cheat codes going in, each code its own colours.
  const TYPE_FONT = 'Bangers, Anton, Impact, sans-serif';
  const CODE_STYLES = {
    zeffen: { fill: ['#fff7a1', '#ffd23f', '#ff7b1c'], spark: '#fff36b' }, // sunny
    luna: { fill: ['#fde8ff', '#d39bff', '#8a3ffc'], spark: '#e3b8ff' }, // moonlight
    jemini: { fill: ['#eafff5', '#6ff2b6', '#14a86c'], spark: '#a6ffd6' }, // twin-star green
    harrison: { fill: [], spark: '#ffffff', rainbow: true }, // who knows?
    shree: { fill: ['#ffe0d6', '#ff6b4a', '#b3200e'], spark: '#ffb199' }, // fiery fist red
    shaan: { fill: ['#ffe3fb', '#ff6ad5', '#a0158a'], spark: '#ffb3ee' }, // shrink-ray pink
    parimal: { fill: ['#ffffff', '#cfd8e3', '#5d6b7e'], spark: '#ffffff' }, // shiny chrome
    priya: { fill: ['#f4ffff', '#7ff3ff', '#1a9bbf'], spark: '#e6fdff' }, // frosty
    daniel: { fill: ['#f2f7e6', '#b6e24a', '#4f7d12'], spark: '#d9ff7a' }, // cactus green
    edward: { fill: ['#ffffff', '#c9c9d6', '#6b6b80'], spark: '#ffffff' }, // VHS grey
    kyle: { fill: ['#ffffff', '#b5ecff', '#3aa0d8'], spark: '#d6f4ff', flicker: true }, // ghostly
  };
  const styleFor = (word) => CODE_STYLES[Object.keys(G.CODES).find((c) => c.startsWith(word.toLowerCase()))] || CODE_STYLES.zeffen;
  if (document.fonts && document.fonts.load) document.fonts.load(`40px ${TYPE_FONT}`).catch(() => {});

  /**
   * Over anyone typing a cheat code: the letters so far, for everyone to see.
   * Each one pops in with a wobble and a burst of stars, then bobs about; if
   * a hit wipes them they go up in a puff.
   */
  function drawTyping() {
    const now = performance.now();
    const ring = mode === 'ring';
    const size = ring ? 36 : 48;
    snap.fighters.forEach((f, i) => {
      const d = display[i];
      // Someone else's Kyle doesn't give themselves away by typing, either.
      let word = f.left || hiddenFrom(i, f) ? '' : (f.typing || '').toUpperCase();
      // Edward's pause is a secret: only Edward sees his letters go in.
      if (i !== me && word && 'EDWARD'.startsWith(word)) word = '';
      const style = styleFor(word);
      const p = targetPos(i, 'head');
      const y = p.y - (ring ? 52 : 118);
      if (word !== (d.typeWord || '')) {
        const old = d.typeWord || '';
        if (word.startsWith(old)) {
          d.typeAt = (d.typeAt || []).slice(0, old.length);
          for (let k = old.length; k < word.length; k++) d.typeAt[k] = now;
          sparks(p.x + ((word.length - 1) / 2) * size * 0.62, y - size * 0.4, style.spark, 6, 3);
        } else {
          // Wiped (or finished): a puff where the letters were.
          if (old) sparks(p.x, y - size * 0.3, '#cfd6e4', 14, 4);
          d.typeAt = word.split('').map(() => now);
        }
        d.typeWord = word;
      }
      if (!word) return;

      ctx.save();
      ctx.font = `${size}px ${TYPE_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      const step = size * 0.62;
      const x0 = p.x - ((word.length - 1) * step) / 2;
      for (let k = 0; k < word.length; k++) {
        const age = (now - d.typeAt[k]) / 1000;
        // Springs in big, then settles with a wobble.
        const pop = 1 + 0.9 * Math.exp(-age * 9) * Math.cos(age * 28);
        const bob = Math.sin(now / 170 + k * 0.9) * (ring ? 2 : 4);
        const tilt = Math.sin(now / 260 + k * 1.7) * 0.14 + (k % 2 ? 0.08 : -0.08);
        ctx.save();
        ctx.translate(x0 + k * step, y + bob);
        ctx.rotate(tilt);
        ctx.scale(pop, pop);
        if (style.flicker) ctx.globalAlpha = 0.65 + 0.35 * Math.abs(Math.sin(now / 90 + k * 2));
        // Drop shadow, fat outline, then a sunny fill with a shine.
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillText(word[k], 3, 4);
        ctx.strokeStyle = '#1b1030';
        ctx.lineWidth = size * 0.26;
        ctx.strokeText(word[k], 0, 0);
        ctx.strokeStyle = PALETTE[i].glove;
        ctx.lineWidth = size * 0.1;
        ctx.strokeText(word[k], 0, 0);
        const g = ctx.createLinearGradient(0, -size * 0.75, 0, 0);
        if (style.rainbow) {
          // A different colour for every letter, slowly cycling.
          const hue = (k * 45 + now / 8) % 360;
          g.addColorStop(0, `hsl(${hue},100%,88%)`);
          g.addColorStop(0.5, `hsl(${hue},95%,62%)`);
          g.addColorStop(1, `hsl(${(hue + 30) % 360},90%,45%)`);
        } else {
          g.addColorStop(0, style.fill[0]);
          g.addColorStop(0.5, style.fill[1]);
          g.addColorStop(1, style.fill[2]);
        }
        ctx.fillStyle = g;
        ctx.fillText(word[k], 0, 0);
        ctx.restore();
      }
      ctx.restore();
    });
  }

  // ---- Power-ups: Jemini (a giant) and Kyle (invisible) ---------------------------

  const GIANT_SCALE = 1.35;
  /** Someone else's Kyle: not drawn on my screen at all. */
  const hiddenFrom = (i, f) => f.invisible > 0 && i !== me;

  /** A cloud of smoke: going invisible, or coming back. */
  function puff(x, y, big) {
    for (let k = 0; k < (big ? 34 : 20); k++) {
      const a = Math.random() * Math.PI * 2;
      const v = (big ? 5 : 3.5) * (0.3 + Math.random());
      effects.push({ x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.2,
        life: 22 + Math.random() * 14, color: Math.random() < 0.5 ? '#d9e2f0' : '#9aa7bd' });
    }
  }

  /** The giant's glow: a pulsing green aura, with glitter drifting off it. */
  function giantAura(cx, cy, r, clock, side) {
    const pulse = 0.75 + 0.25 * Math.sin(clock * 6);
    const g = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    g.addColorStop(0, `rgba(166,255,214,${0.36 * pulse})`);
    g.addColorStop(0.6, `rgba(95,240,176,${0.14 * pulse})`);
    g.addColorStop(1, 'rgba(95,240,176,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    if (side) ctx.ellipse(cx, cy, r * 0.75, r, 0, 0, Math.PI * 2);
    else ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Glitter off a giant, in screen space (so it floats off as they move). */
  function giantGlitter(x, y, spread) {
    if (Math.random() > 0.35) return;
    effects.push({ x: x + (Math.random() - 0.5) * spread, y: y - Math.random() * spread * 0.5,
      vx: (Math.random() - 0.5) * 0.6, vy: -3.2 - Math.random() * 1.5, life: 22,
      color: Math.random() < 0.5 ? '#a6ffd6' : '#ffffff' });
  }

  // ---- Harrison's surprises ------------------------------------------------------

  const bolts = []; // lightning, for a few frames
  const hearts = []; // floating up off a snack
  const SURPRISE_LABEL = {
    zap: ['Zap!', '#fff36b'], banana: ['Whoops!', '#ffe14d'], freeze: ['Brrr!', '#b5ecff'],
    zoom: ['Zoom!', '#ffb13b'], snack: ['Yum! +30', '#ff7eb6'],
  };

  function onSurprise(e) {
    const who = targetPos(e.attacker, 'head');
    const up = mode === 'ring' ? 0.6 : 1;
    const [text, color] = SURPRISE_LABEL[e.surprise];
    floatText(who.x, who.y - 110 * up, 'Surprise!', '#ffffff', 22);
    if (e.surprise === 'zap') {
      const p = targetPos(e.target, 'body');
      bolts.push({ x: p.x, y: p.y, life: 14 });
      flash = Math.max(flash, 0.8);
      shake = Math.max(shake, 14);
      sparks(p.x, p.y, '#fff36b', 30, 8);
      floatText(p.x, p.y - 80 * up, text, color, 36);
      sound.zap();
    } else if (e.surprise === 'banana') {
      const p = targetPos(e.target, 'body');
      floatText(p.x, p.y - 80 * up, text, color, 32);
      sound.slide();
    } else if (e.surprise === 'freeze') {
      for (const i of e.targets) {
        const p = targetPos(i, 'body');
        sparks(p.x, p.y, '#e6f8ff', 16, 5);
        floatText(p.x, p.y - 80 * up, text, color, 30);
      }
      sound.tinkle();
    } else if (e.surprise === 'zoom') {
      floatText(who.x, who.y - 70 * up, text, color, 34);
      sound.whoosh();
    } else {
      for (let k = 0; k < 9; k++) {
        hearts.push({ x: who.x + (Math.random() - 0.5) * 60, y: who.y + 20, vy: -1 - Math.random() * 1.5,
          s: 0.6 + Math.random() * 0.6, life: 50 + Math.random() * 20 });
      }
      floatText(who.x, who.y - 70 * up, text, color, 32);
      sound.grow();
    }
  }

  /** Where a fighter's feet are, on screen. */
  function feetOf(i) {
    const d = display[i];
    return mode === 'ring' ? toScreen(d.x, d.y) : { x: d.x, y: FLOOR };
  }

  const rays = []; // Shaan's shrink ray, for a moment

  /**
   * Priya's freeze rays in flight: a glowing ice ball at chest height, a
   * frosty streak behind it, and snowflakes coming off.
   */
  function drawBolts(clock) {
    for (const b of snap.bolts || []) {
      const owner = snap.fighters[b.owner];
      if (owner && hiddenFrom(b.owner, owner)) continue;
      const ring = mode === 'ring';
      const p = ring ? toScreen(b.x, b.y) : { x: b.x, y: FLOOR - 160 };
      const back = ring ? { x: -b.dx, y: -b.dy } : { x: -Math.sign(b.dx || 1), y: 0 };
      const len = ring ? 70 : 130;
      const tail = { x: p.x + back.x * len, y: p.y + back.y * len };
      const g = ctx.createLinearGradient(tail.x, tail.y, p.x, p.y);
      g.addColorStop(0, 'rgba(127,243,255,0)');
      g.addColorStop(1, 'rgba(200,250,255,0.9)');
      ctx.save();
      ctx.strokeStyle = g;
      ctx.lineCap = 'round';
      ctx.lineWidth = ring ? 10 : 16;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      const r = (ring ? 10 : 16) * (1 + 0.12 * Math.sin(clock * 30));
      const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r * 2.4);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(0.35, 'rgba(160,245,255,0.9)');
      glow.addColorStop(1, 'rgba(127,243,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      // A spinning snowflake in the middle.
      ctx.translate(p.x, p.y);
      ctx.rotate(clock * 8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.stroke();
      }
      ctx.restore();
      if (Math.random() < 0.6) {
        effects.push({ x: p.x + back.x * 20 + (Math.random() - 0.5) * 14, y: p.y + (Math.random() - 0.5) * 14,
          vx: back.x * 1.5, vy: -0.5, life: 16, color: Math.random() < 0.5 ? '#ffffff' : '#bff8ff' });
      }
    }
  }

  /**
   * Daniel's spikes: a ring of green-tipped steel spikes all round them,
   * turning slowly and pulsing, that flashes red-hot just after it bites.
   */
  function drawSpikes(i, f, clock) {
    const ring = mode === 'ring';
    const size = display[i].size || 1;
    const d = display[i];
    let cx; let cy; let rx; let ry;
    if (ring) {
      const p = toScreen(d.x, d.y);
      cx = p.x; cy = p.y; rx = ry = 34 * fighterScale() * size;
    } else {
      cx = d.x; cy = FLOOR - 118 * size; rx = 72 * size; ry = 128 * size;
    }
    const n = ring ? 14 : 18;
    const pulse = 1 + 0.08 * Math.sin(clock * 9);
    const hot = clamp01((d.spikedAt ? 1 - (performance.now() - d.spikedAt) / 400 : 0));
    const fading = f.spiky < 40 ? 0.35 + 0.65 * Math.abs(Math.sin(clock * 12)) : 1; // flickers as it wears off
    ctx.save();
    ctx.globalAlpha *= fading;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + clock * 0.8;
      const ox = Math.cos(a);
      const oy = Math.sin(a);
      const bx = cx + ox * rx;
      const by = cy + oy * ry;
      const len = (ring ? 13 : 22) * pulse * size;
      const w = (ring ? 5 : 8) * size;
      // Perpendicular, for the base of the spike.
      const px = -oy;
      const py = ox;
      const g = ctx.createLinearGradient(bx, by, bx + ox * len, by + oy * len);
      g.addColorStop(0, '#8a96a8');
      g.addColorStop(0.6, '#e6ecf2');
      g.addColorStop(1, hot > 0 ? '#ff4a4f' : '#b6e24a');
      ctx.fillStyle = g;
      ctx.strokeStyle = 'rgba(20,24,30,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + px * w, by + py * w);
      ctx.lineTo(bx + ox * len, by + oy * len);
      ctx.lineTo(bx - px * w, by - py * w);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Shaan's shrink ray: a wobbly pink beam from one to the other. */
  function drawRays() {
    for (let k = rays.length - 1; k >= 0; k--) {
      const r = rays[k];
      const dx = r.x1 - r.x0;
      const dy = r.y1 - r.y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      ctx.save();
      ctx.globalAlpha = Math.min(1, r.life / 10);
      for (const [w, color] of [[14, 'rgba(255,106,213,0.35)'], [5, '#ff6ad5'], [2, '#ffffff']]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (let n = 0; n <= 20; n++) {
          const q = n / 20;
          const wob = Math.sin(q * 18 + r.life) * 8 * Math.sin(q * Math.PI);
          const x = r.x0 + dx * q + nx * wob;
          const y = r.y0 + dy * q + ny * wob;
          if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      // Rings shrinking in on the target.
      ctx.strokeStyle = '#ffb3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x1, r.y1, 10 + r.life * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (--r.life <= 0) rays.splice(k, 1);
    }
  }

  /** Parimal's car, with whoever's driving it sat in it. */
  function drawCar(i, f, clock) {
    const c = PALETTE[i];
    const p = feetOf(i);
    const ring = mode === 'ring';
    // Exhaust behind it.
    if (Math.random() < 0.7) {
      const back = ring ? { x: -f.car.dx, y: -f.car.dy } : { x: -Math.sign(f.car.dx || 1), y: 0 };
      const ex = p.x + back.x * (ring ? 40 : 120);
      const ey = (ring ? p.y + back.y * 40 : p.y - 30);
      effects.push({ x: ex, y: ey, vx: back.x * 2 + (Math.random() - 0.5), vy: -1.5 - Math.random(), life: 18, color: Math.random() < 0.5 ? '#9aa7bd' : '#d9e2f0' });
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    // Revving: shaking on the spot, puffing smoke.
    if (f.car.rev) {
      ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3);
      if (Math.random() < 0.5) puff(p.x - (ring ? f.car.dx * 30 : Math.sign(f.car.dx || 1) * 110), ring ? p.y - f.car.dy * 30 : p.y - 25, false);
    }
    if (ring) {
      ctx.rotate(Math.atan2(f.car.dy, f.car.dx));
      ctx.scale(fighterScale(), fighterScale());
      // Wheels, body, windscreen, and the driver's head.
      ctx.fillStyle = '#111';
      for (const [wx, wy] of [[-24, -22], [20, -22], [-24, 22], [20, 22]]) ctx.fillRect(wx - 7, wy - 5, 14, 10);
      ctx.fillStyle = c.glove;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-38, -22, 76, 44, 12) : ctx.rect(-38, -22, 76, 44);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-30, -18, 60, 6);
      ctx.fillStyle = '#9fd4ff';
      ctx.fillRect(10, -16, 12, 32);
      ctx.fillStyle = c.hair;
      ctx.beginPath();
      ctx.arc(-6, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(34, -18, 5, 8);
      ctx.fillRect(34, 10, 5, 8);
    } else {
      const dir = f.car.dx >= 0 ? 1 : -1;
      ctx.scale(dir, 1);
      const bounce = Math.sin(clock * 40) * 2;
      ctx.translate(0, bounce);
      // Speed lines behind.
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      for (const ly of [-40, -70, -100]) {
        ctx.beginPath();
        ctx.moveTo(-150 - Math.random() * 40, ly);
        ctx.lineTo(-115, ly);
        ctx.stroke();
      }
      // Body.
      ctx.fillStyle = c.glove;
      ctx.beginPath();
      ctx.moveTo(-110, -20);
      ctx.lineTo(-110, -70);
      ctx.lineTo(-60, -75);
      ctx.lineTo(-35, -120);
      ctx.lineTo(40, -120);
      ctx.lineTo(70, -78);
      ctx.lineTo(110, -70);
      ctx.lineTo(115, -20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.gloveDark;
      ctx.fillRect(-110, -32, 225, 12);
      // Window, with the driver in it.
      ctx.fillStyle = '#9fd4ff';
      ctx.beginPath();
      ctx.moveTo(-25, -78);
      ctx.lineTo(-10, -112);
      ctx.lineTo(34, -112);
      ctx.lineTo(56, -78);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.skin;
      ctx.beginPath();
      ctx.arc(12, -96, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.hair;
      ctx.beginPath();
      ctx.arc(10, -104, 14, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(18, -98, 4, 4);
      // Headlight, and wheels spinning.
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(104, -62, 10, 12);
      for (const wx of [-65, 70]) {
        ctx.save();
        ctx.translate(wx, -18);
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(clock * 30);
        ctx.fillStyle = '#9aa7bd';
        ctx.fillRect(-12, -3, 24, 6);
        ctx.fillRect(-3, -12, 6, 24);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** Under the fighters: banana skins, and zoom trails. */
  function drawSurprisesUnder(clock) {
    snap.fighters.forEach((f, i) => {
      if (hiddenFrom(i, f)) return;
      const d = display[i];
      // Zoom: a streak behind them from where they've just been.
      d.trail = d.trail || [];
      const here = feetOf(i);
      if (f.fast) d.trail.push({ x: here.x, y: here.y });
      if (!f.fast || d.trail.length > 9) d.trail.shift();
      if (f.fast && d.trail.length > 1) {
        const tail = d.trail[0];
        const rows = mode === 'ring' ? [0] : [-70, -130, -190];
        ctx.lineCap = 'round';
        for (const r of rows) {
          const g = ctx.createLinearGradient(tail.x, tail.y + r, here.x, here.y + r);
          g.addColorStop(0, 'rgba(255,177,59,0)');
          g.addColorStop(1, 'rgba(255,214,120,0.7)');
          ctx.strokeStyle = g;
          ctx.lineWidth = mode === 'ring' ? 18 : 10;
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y + r);
          ctx.lineTo(here.x, here.y + r);
          ctx.stroke();
        }
      }
      // Banana skin, where they went over.
      if (f.slip) {
        d.banana = d.banana || { x: here.x + (mode === 'ring' ? 38 : 40 * (f.facing || 1)), y: here.y + (mode === 'ring' ? 22 : 0) };
        drawBanana(d.banana.x, d.banana.y);
      } else {
        d.banana = null;
      }
    });
  }

  function drawBanana(x, y) {
    const k = mode === 'ring' ? 0.6 : 1;
    ctx.save();
    ctx.translate(x, y - 6 * k);
    ctx.scale(k, k);
    ctx.fillStyle = '#ffd93b';
    ctx.strokeStyle = '#8a6a00';
    ctx.lineWidth = 2;
    // Three floppy peel flaps round a stalk.
    for (const a of [-0.9, 0, 0.9]) {
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -14, 7, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#6b4a12';
    ctx.fillRect(-3, -6, 6, 8);
    ctx.restore();
  }

  /** Over the fighters: ice blocks, lightning, hearts. */
  function drawSurprisesOver(clock) {
    snap.fighters.forEach((f, i) => {
      if (!f.frozen || hiddenFrom(i, f)) return;
      const p = feetOf(i);
      const size = display[i].size || 1;
      const melt = clamp01(f.frozen / 40); // goes see-through as it melts
      let x0; let y0; let w; let h;
      if (mode === 'ring') {
        const r = 34 * fighterScale() * size;
        x0 = p.x - r; y0 = p.y - r; w = r * 2; h = r * 2;
      } else {
        w = 140 * size; h = 270 * size; x0 = p.x - w / 2; y0 = p.y - h + 6;
      }
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.5 * melt;
      const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
      g.addColorStop(0, 'rgba(230,248,255,0.75)');
      g.addColorStop(1, 'rgba(120,200,240,0.45)');
      ctx.fillStyle = g;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x0, y0, w, h, 10) : ctx.rect(x0, y0, w, h);
      ctx.fill();
      ctx.stroke();
      // Shine and a crack or two.
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x0 + w * 0.18, y0 + h * 0.12);
      ctx.lineTo(x0 + w * 0.18, y0 + h * 0.45);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0 + w * 0.7, y0 + h * 0.2);
      ctx.lineTo(x0 + w * 0.6, y0 + h * 0.32);
      ctx.lineTo(x0 + w * 0.74, y0 + h * 0.4);
      ctx.stroke();
      ctx.restore();
      // Drips as it melts.
      if (f.frozen < 60 && Math.random() < 0.3) {
        effects.push({ x: x0 + Math.random() * w, y: y0 + h - 4, vx: 0, vy: 0.5, life: 16, color: '#b5ecff' });
      }
    });

    for (let k = bolts.length - 1; k >= 0; k--) {
      const b = bolts[k];
      // A fresh jagged bolt every frame, so it flickers.
      const pts = [{ x: b.x + (Math.random() - 0.5) * 80, y: 0 }];
      const steps = 8;
      for (let n = 1; n < steps; n++) {
        pts.push({ x: b.x + (Math.random() - 0.5) * 50 * (1 - n / steps), y: (b.y * n) / steps });
      }
      pts.push({ x: b.x, y: b.y });
      for (const [width, color] of [[16, 'rgba(255,243,107,0.35)'], [7, 'rgba(255,243,107,0.9)'], [3, '#ffffff']]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        pts.forEach((pt, n) => (n ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
        ctx.stroke();
      }
      if (--b.life <= 0) bolts.splice(k, 1);
    }

    for (let k = hearts.length - 1; k >= 0; k--) {
      const h = hearts[k];
      h.y += h.vy;
      h.x += Math.sin((h.life + k) / 6) * 0.6;
      ctx.save();
      ctx.globalAlpha = Math.min(1, h.life / 20);
      ctx.translate(h.x, h.y);
      ctx.scale(h.s, h.s);
      ctx.fillStyle = '#ff5fa2';
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-14, -4, -8, -16, 0, -8);
      ctx.bezierCurveTo(8, -16, 14, -4, 0, 6);
      ctx.fill();
      ctx.restore();
      if (--h.life <= 0) hearts.splice(k, 1);
    }
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
    // Shree's fist: its shadow, and a dotted line back to whoever's steering it.
    snap.fighters.forEach((f, i) => {
      if (!f.shree || hiddenFrom(i, f)) return;
      const p = fistSpot(f.shree.x, f.shree.y);
      const me2 = feetOf(i);
      ctx.save();
      ctx.strokeStyle = PALETTE[i].glove;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = -performance.now() / 30;
      ctx.beginPath();
      ctx.moveTo(me2.x, me2.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
      drawFistShadow(f.shree.x, f.shree.y, f.shree.drop >= 0 ? 1 : 0.4);
    });
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
    snap.fighters.forEach((f, i) => {
      if (!f.shree || hiddenFrom(i, f)) return;
      // Hovering high while it's steered, bobbing; then down it comes.
      const bob = Math.sin(performance.now() / 160) * 0.03;
      const hover = mode === 'ring' ? 0.22 : 0.42;
      const k = f.shree.drop >= 0 ? hover + (1 - hover) * clamp01(f.shree.drop / G.SHREE_DROP_TICKS) : hover + bob;
      drawGiantFist(f.shree.x, f.shree.y, k, f.shree.drop >= 0 ? 0.85 : mode === 'ring' ? 0.38 : 0.55);
    });
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

    // Paused: no guessing ahead, everyone holds still.
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
      // Growing into a giant (and back) takes a moment.
      const want = f.giant ? GIANT_SCALE : f.tiny ? 0.62 : 1;
      d.size = (d.size || 1) + (want - (d.size || 1)) * Math.min(1, dt * 7);
      // Coming back from Kyle: a puff where they reappear.
      if (d.wasInvisible && !f.invisible && !f.left) {
        const p = targetPos(i, 'body');
        puff(p.x, p.y, false);
        sound.poof();
      }
      d.wasInvisible = !!f.invisible;
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
      drawSurprisesUnder(clock);
      // Those down first, then attackers last so their gloves are on top.
      const order = snap.fighters.map((f, i) => i)
        .filter((i) => !snap.fighters[i].left)
        .sort((a, b) => rank(snap.fighters[a]) - rank(snap.fighters[b]));
      for (const i of order) {
        const f = snap.fighters[i];
        if (hiddenFrom(i, f)) continue;
        if (f.car) { drawCar(i, f, clock); continue; }
        drawRingFighter(i, f, display[i], f.t + ticksSince, clock);
        if (f.spiky) drawSpikes(i, f, clock);
        if (f.giant) { const gp = toScreen(display[i].x, display[i].y); giantGlitter(gp.x, gp.y, 50 * fighterScale()); }
      }
    } else {
      drawScene(clock);
      drawFistUnder();
      drawSurprisesUnder(clock);

      // Draw the fighter who is being hit first so the puncher's glove overlaps.
      const order = snap.fighters[0].state === 'attack' ? [1, 0] : [0, 1];
      for (const i of order) {
        const f = snap.fighters[i];
        if (hiddenFrom(i, f)) continue;
        if (f.car) { drawCar(i, f, clock); continue; }
        if (f.giant) {
          // Jemini: a see-through twin a step behind, a beat behind.
          ctx.save();
          ctx.globalAlpha = 0.22;
          const lag = 26 + Math.sin(clock * 4) * 8;
          drawFighter(i, f, display[i].x - f.facing * lag, f.t + ticksSince - 4, clock - 0.12, display[1 - i].x, true);
          ctx.restore();
          giantGlitter(display[i].x, FLOOR - 140 * (display[i].size || 1), 120);
        }
        drawFighter(i, f, display[i].x, f.t + ticksSince, clock, display[1 - i].x);
        if (f.spiky) drawSpikes(i, f, clock);
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
    drawSurprisesOver(clock);
    drawRays();
    drawBolts(clock);
    drawTyping();

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
