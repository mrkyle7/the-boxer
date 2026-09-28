(function () {
  'use strict';

  const G = window.BoxerGame;
  const W = 1000;
  const H = 560;
  const FLOOR = 486;

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  const PALETTE = [
    { glove: '#e03a3e', gloveDark: '#9e1e24', trunks: '#c9262c', trim: '#ffffff', skin: '#e0ac86', skinDark: '#b98262', hair: '#2a1a12', name: '#ff6f73' },
    { glove: '#2f76e8', gloveDark: '#1a4396', trunks: '#2463cc', trim: '#f4c542', skin: '#8d5a3b', skinDark: '#6a4028', hair: '#151010', name: '#79a8ff' },
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
  let snap = null;
  let snapAt = 0;
  let display = null;
  let lastPhase = null;
  let roomCode = '';

  function onMessage(msg) {
    switch (msg.t) {
      case 'waiting': {
        roomCode = msg.code;
        $('waiting-title').textContent = msg.private ? 'Your ring is ready' : 'Looking for an opponent';
        $('share').hidden = !msg.private;
        $('room-code').textContent = msg.code;
        $('share-link').value = `${location.origin}${location.pathname}?room=${msg.code}`;
        show('waiting');
        break;
      }
      case 'start':
        me = msg.you;
        names = msg.names;
        roomCode = msg.code;
        snap = null;
        display = null;
        lastPhase = null;
        effects.length = 0;
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
        $('rematch-note').textContent = `${names[1 - me]} wants a rematch.`;
        break;
      case 'opponentLeft':
        showNotice(`${names[1 - me] || 'Your opponent'} left the ring.`);
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

  function onState(s, events) {
    snap = s;
    snapAt = performance.now();
    if (!display) {
      display = s.fighters.map((f) => ({ x: f.x, hpTrail: f.hp }));
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
    const [a, b] = snap.fighters;
    $('stat-a').textContent = a.name + (me === 0 ? ' (you)' : '');
    $('stat-b').textContent = b.name + (me === 1 ? ' (you)' : '');
    const acc = (f) => (f.stats.thrown ? `${Math.round((f.stats.landed / f.stats.thrown) * 100)}%` : '–');
    const rows = [
      ['Rounds won', a.roundsWon, b.roundsWon],
      ['Punches thrown', a.stats.thrown, b.stats.thrown],
      ['Clean hits', a.stats.landed, b.stats.landed],
      ['Accuracy', acc(a), acc(b)],
      ['Blocked', a.stats.blocked, b.stats.blocked],
      ['Damage dealt', a.stats.damage, b.stats.damage],
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
    texts.push({ x, y, text, color, size: size || 22, life: 50 });
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

    const p = targetPos(e.target, e.height);
    const attackerFacing = snap.fighters[1 - e.target].facing;
    const hx = p.x - attackerFacing * 18;
    if (e.type === 'hit') {
      const heavy = e.move === 'kick';
      sparks(hx, p.y, e.counter ? '#f4c542' : '#ffffff', heavy ? 18 : 9, heavy ? 6 : 4);
      shake = Math.max(shake, (heavy ? 8 : 3) + (e.height === 'head' ? 2 : 0) + (e.counter ? 4 : 0));
      floatText(p.x, p.y - 40, `-${e.damage}`, '#ffffff', heavy ? 28 : 20);
      const label = e.counter ? 'Counter!' : e.wrongGuard ? 'Wrong guard!' : e.height === 'head' ? 'Head!' : 'Tummy!';
      floatText(p.x, p.y - 72, label, e.counter || e.wrongGuard ? '#f4c542' : '#ffffff', 22);
      sound.hit(heavy ? 1 : 0.55);
    } else if (e.type === 'block') {
      sparks(hx, p.y + 14, '#9cc4ff', 6, 3);
      floatText(p.x, p.y - 40, 'Blocked', '#9cc4ff', 18);
      sound.block();
    } else if (e.type === 'guardbreak') {
      sparks(hx, p.y + 10, '#f4c542', 22, 7);
      shake = Math.max(shake, 9);
      floatText(p.x, p.y - 60, 'Guard break!', '#f4c542', 28);
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
      bell() {
        const a = ctxOk(); if (!a) return;
        [1, 2.76, 5.4].forEach((m, i) => tone(a, 820 * m, 1.4 - i * 0.3, 0.12 / (i + 1)));
      },
    };
  })();

  // ---- Input -----------------------------------------------------------------

  const held = { left: false, right: false, block: false, aim: 'head' };
  const KEY_HOLD = { ArrowLeft: 'left', ArrowRight: 'right', KeyC: 'block' };
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
  window.addEventListener('blur', () => ['left', 'right', 'block'].forEach((k) => setHold(k, false)));

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
    $('rematch-note').textContent = `Waiting for ${names[1 - me]}…`;
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
    ctx.translate(W / 2, 250);
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

  // ---- Loop ------------------------------------------------------------------

  let crowdHype = 0;
  let lastFrame = performance.now();

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    return dpr;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const clock = now / 1000;
    const dpr = resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!snap || !display) {
      drawScene(clock);
      requestAnimationFrame(frame);
      return;
    }

    const ticksSince = Math.min(3, ((now - snapAt) / 1000) * G.TICK_RATE);
    snap.fighters.forEach((f, i) => {
      const d = display[i];
      if (Math.abs(f.x - d.x) > 200) d.x = f.x;
      d.x += (f.x - d.x) * Math.min(1, dt * 22);
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
    drawScene(clock);

    // Draw the fighter who is being hit first so the puncher's glove overlaps.
    const order = snap.fighters[0].state === 'attack' ? [1, 0] : [0, 1];
    for (const i of order) {
      const f = snap.fighters[i];
      drawFighter(i, f, display[i].x, f.t + ticksSince, clock, display[1 - i].x);
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
    drawFrontRopes();

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

    drawHud(snap);
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
