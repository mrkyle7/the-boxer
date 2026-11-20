// Adventure mode in the browser: its own screen, canvas, keys and buttons.
// The server runs the simulation (public/adventure.js) and sends snapshots;
// this draws them, side on and scrolling, with the boxers from client.js
// (window.BoxerArt) and the creatures, the level and the boss drawn here.
(function () {
  'use strict';

  const A = window.BoxerAdventure;
  const G = window.BoxerGame;
  const W = A.VIEW_W;
  const H = A.VIEW_H;
  const BOXER_SCALE = 0.47; // a ring-sized boxer, shrunk to fit the platforms
  const $ = (id) => document.getElementById(id);
  const canvas = $('adv-canvas');
  const ctx = canvas.getContext('2d');
  const art = () => window.BoxerArt;
  const play = (name, ...args) => {
    const s = art() && art().sound;
    if (s && typeof s[name] === 'function') s[name](...args);
  };
  const isActive = () => $('adventure').classList.contains('active');

  // ---- State ----------------------------------------------------------------

  let me = 0;
  let names = [];
  let snap = null;
  let snapAt = 0;
  let cam = 0;
  const pdisp = [];
  const edisp = new Map();
  const prdisp = new Map();
  const effects = [];
  const texts = [];
  let banner = null;
  let shake = 0;
  let lastPhase = null;

  function start(msg) {
    me = msg.you;
    names = msg.names;
    snap = null;
    cam = 0;
    pdisp.length = 0;
    edisp.clear();
    prdisp.clear();
    effects.length = 0;
    texts.length = 0;
    banner = null;
    lastPhase = null;
    for (const k of Object.keys(held)) held[k] = false;
    $('adv-result').hidden = true;
    $('adv-notice').hidden = true;
    $('adv-again').disabled = false;
    $('adv-note').textContent = '';
    art().show('adventure');
    history.replaceState(null, '', location.pathname);
  }

  function onState(s, events) {
    snap = s;
    snapAt = performance.now();
    s.players.forEach((p, i) => {
      if (!pdisp[i]) pdisp[i] = { x: p.x, y: p.y };
    });
    if (lastPhase === null) cam = s.camX;
    for (const e of events) onEvent(e);
    if (s.phase !== lastPhase) {
      if (s.phase === 'ready') announce('Ready?', 'Punch your way to the boss', '#ffffff', 90);
      lastPhase = s.phase;
    }
  }

  // ---- Effects -------------------------------------------------------------

  function announce(text, sub, color, life) {
    banner = { text, sub, color, life, max: life };
  }
  function sparks(x, y, color, count, speed) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      effects.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 20 + Math.random() * 12, color, size: 4 });
    }
  }
  function dust(x, y, count) {
    for (let k = 0; k < count; k++) {
      effects.push({ x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 2.5, life: 26, color: 'rgba(190,160,120,0.8)', size: 7, float: true });
    }
  }
  function floatText(x, y, text, color, size = 26) {
    texts.push({ x, y, text, color, size, life: 50 });
  }
  const nameOf = (i) => (snap && snap.players[i] ? snap.players[i].name : names[i] || 'Boxer');

  function onEvent(e) {
    switch (e.type) {
      case 'go':
        announce('Go!', null, '#ffd23f', 50);
        play('bell');
        break;
      case 'hurt':
        sparks(e.x, e.y, '#ff5a5a', 12, 5);
        floatText(e.x, e.y - 30, `-${e.damage}`, '#ff6f73', 24);
        if (e.i === me) shake = Math.max(shake, 8);
        play('hit', 0.6);
        break;
      case 'block':
        sparks(e.x, e.y, '#dfe9ff', 8, 3);
        play('block');
        break;
      case 'hit':
        sparks(e.x, e.y, e.big ? '#ffd23f' : '#fff3b0', e.big ? 16 : 9, e.big ? 6 : 4);
        floatText(e.x, e.y - 20, String(e.damage), '#ffffff', e.big ? 28 : 22);
        play('hit', e.big ? 0.8 : 0.45);
        break;
      case 'stomp':
        sparks(e.x, e.y, '#ffffff', 10, 4);
        floatText(e.x, e.y - 10, 'Boing!', '#9fe7ff', 24);
        play('hit', 0.5);
        break;
      case 'clink':
        sparks(e.x, e.y, '#c9c9c9', 8, 4);
        floatText(e.x, e.y - 20, 'Ouch, spiky!', '#e0e0e0', 20);
        play('clang');
        break;
      case 'down':
        sparks(e.x, e.y - 20, '#ffffff', 14, 4);
        floatText(e.x, e.y - 50, `+${e.score}`, '#ffd23f', 26);
        if (e.kind !== 'rhino') play('poof');
        break;
      case 'ko':
        if (e.fell) floatText(e.x, Math.min(e.y, H) - 40, 'Whoops!', '#ffffff', 26);
        else sparks(e.x, e.y - 50, '#ff5a5a', 18, 6);
        play('slam');
        if (e.i === me) shake = 14;
        break;
      case 'out':
        if (snap && snap.players.length > 1) announce(`${nameOf(e.i)} is out`, 'No lives left', '#ff8a8a', 80);
        break;
      case 'respawn':
        play('poof');
        break;
      case 'pickup':
        if (e.kind === 'coin') { play('tinkle'); sparks(e.x, e.y, '#ffd23f', 5, 2); }
        if (e.kind === 'heart') { play('grow'); floatText(e.x, e.y - 10, `+${A.HEART_HEAL}`, '#7dff9a', 26); }
        if (e.kind === 'life') { play('fanfare'); floatText(e.x, e.y - 10, '1UP', '#ffd23f', 32); }
        break;
      case 'boss':
        announce(e.name, 'Champion of the jungle', '#ff5a3a', 150);
        play('horn');
        break;
      case 'quake':
        shake = Math.max(shake, e.big || e.crash ? 18 : 12);
        dust(e.x, A.GROUND_Y, e.big ? 22 : 14);
        play('slam');
        break;
      case 'roar':
        play('roar');
        break;
      case 'paw':
        dust(e.x + 40, A.GROUND_Y, 3);
        break;
      case 'charge':
        play('screech');
        break;
      case 'angry':
        announce('He’s angry!', 'Faster, and now he throws rocks', '#ff5a3a', 90);
        play('roar');
        break;
      case 'throw':
        play('whoosh');
        break;
      case 'spit':
        play('pew');
        break;
      case 'smash':
        sparks(e.x, e.y, e.kind === 'boulder' ? '#9a948c' : '#bdf3ff', 10, 4);
        play('block');
        break;
      case 'roll':
        play('slide');
        break;
      case 'victory':
        announce('You win!', `${A.BOSS_NAME} is down for the count`, '#ffd23f', 150);
        play('fanfare');
        break;
      case 'gameOver':
        announce('Game over', 'Out of lives', '#ff6f73', 150);
        play('bell');
        break;
    }
  }

  // ---- Results ---------------------------------------------------------------

  function showResult(won) {
    if (!snap) return;
    $('adv-result-title').textContent = won ? 'You beat Big Horn!' : 'Game over';
    $('adv-score').textContent = `Score ${snap.score}`;
    const ps = snap.players;
    const head = $('adv-stat-head');
    head.textContent = '';
    head.append(document.createElement('th'));
    ps.forEach((p, i) => {
      const th = document.createElement('th');
      th.textContent = p.name + (i === me ? ' (you)' : '');
      th.style.color = art().PALETTE[i].name;
      head.append(th);
    });
    const rows = [
      ['Creatures knocked out', (p) => p.stats.kos],
      ['Coins', (p) => p.stats.coins],
      ['Damage dealt', (p) => p.stats.damage],
      ['Fell down a hole', (p) => p.stats.falls],
    ];
    const body = $('adv-stat-body');
    body.textContent = '';
    for (const [label, fn] of rows) {
      const tr = document.createElement('tr');
      for (const cell of [label, ...ps.map(fn)]) {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.append(td);
      }
      body.append(tr);
    }
    $('adv-result').hidden = false;
  }

  function showNotice(text) {
    $('adv-result').hidden = true;
    $('adv-notice-text').textContent = text;
    $('adv-notice').hidden = false;
  }

  function toLobby() {
    art().send({ t: 'leave' });
    snap = null;
    $('adv-result').hidden = true;
    $('adv-notice').hidden = true;
    art().show('lobby');
  }
  $('adv-leave').addEventListener('click', toLobby);
  $('adv-notice-ok').addEventListener('click', toLobby);
  $('adv-again').addEventListener('click', () => {
    art().send({ t: 'rematch' });
    $('adv-again').disabled = true;
    if (names.length > 1) $('adv-note').textContent = 'Waiting for the others…';
  });

  // ---- Messages (routed here by client.js) ----------------------------------

  function handle(msg) {
    if (msg.t === 'start' && msg.mode === 'adventure') { start(msg); return true; }
    if (!isActive()) return false;
    switch (msg.t) {
      case 'state': onState(msg.s, msg.e || []); return true;
      case 'adventureOver': setTimeout(() => showResult(msg.won), 400); return true;
      case 'playerLeft':
        if (snap && $('adv-result').hidden) announce(`${msg.name} left`, 'The rest play on', '#ffffff', 90);
        else $('adv-note').textContent = `${msg.name} left.`;
        return true;
      case 'opponentLeft':
        showNotice('Everyone else has left.');
        return true;
      case 'rematchRequested':
        $('adv-note').textContent = msg.waitingFor && msg.waitingFor.length
          ? `${msg.name} wants to go again. Waiting for ${art().listNames(msg.waitingFor)}.`
          : `${msg.name} wants to go again.`;
        return true;
      case 'rematchWaiting':
        if (msg.waitingFor && msg.waitingFor.length) $('adv-note').textContent = `Waiting for ${art().listNames(msg.waitingFor)}…`;
        return true;
    }
    return false;
  }

  // ---- Input ---------------------------------------------------------------

  const held = { left: false, right: false, jump: false, block: false, down: false };
  const KEY_HOLD = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', KeyC: 'block',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  };
  const KEY_ACT = { KeyA: 'punch', KeyX: 'punch', KeyB: 'kick', KeyZ: 'kick' };

  function setHold(key, value) {
    if (held[key] === value) return;
    held[key] = value;
    art().send({ t: 'input', ...held });
  }

  window.addEventListener('keydown', (e) => {
    if (!isActive() || e.target.tagName === 'INPUT') return;
    play('unlock');
    if (e.code === 'KeyM') { art().sound.toggle(); return; }
    const hold = KEY_HOLD[e.code];
    if (hold) {
      e.preventDefault();
      if (hold === 'jump' && !e.repeat) art().send({ t: 'action', a: 'jump' });
      setHold(hold, true);
    }
    if (KEY_ACT[e.code]) {
      e.preventDefault();
      if (!e.repeat) art().send({ t: 'action', a: KEY_ACT[e.code] });
    }
  });
  window.addEventListener('keyup', (e) => {
    if (KEY_HOLD[e.code] && isActive()) setHold(KEY_HOLD[e.code], false);
  });
  window.addEventListener('blur', () => {
    if (isActive()) Object.keys(held).forEach((k) => setHold(k, false));
  });

  document.querySelectorAll('#adventure .touch button').forEach((btn) => {
    const hold = btn.dataset.advHold;
    const act = btn.dataset.advAct;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      play('unlock');
      btn.classList.add('on');
      if (act) art().send({ t: 'action', a: act });
      if (hold) setHold(hold, true);
    });
    const release = () => {
      btn.classList.remove('on');
      if (hold) setHold(hold, false);
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  });

  // ---- Drawing helpers --------------------------------------------------------

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function mix(a, b, k) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  // A cheap, steady pseudo-random number for a position, for scenery.
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  function ellipse(x, y, rx, ry, color, rot = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, Math.abs(rx)), Math.max(0.1, Math.abs(ry)), rot, 0, Math.PI * 2);
    ctx.fill();
  }
  function heartShape(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s, y - s * 0.4, x, y + s * 0.35);
    ctx.fill();
  }
  function glove(x, y, s, color) {
    ellipse(x, y, 11 * s, 10 * s, color);
    ellipse(x - 8 * s, y + 2 * s, 5 * s, 6 * s, color);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 9 * s, y + 8 * s, 16 * s, 5 * s);
    ellipse(x + 3 * s, y - 4 * s, 4 * s, 3 * s, 'rgba(255,255,255,0.35)');
  }
  function eye(x, y, r, lookX, lookY = 0) {
    ellipse(x, y, r, r, '#ffffff');
    ellipse(x + lookX * r * 0.4, y + lookY * r * 0.3, r * 0.5, r * 0.55, '#1a1a1a');
    ellipse(x + lookX * r * 0.4 + r * 0.15, y - r * 0.2, r * 0.15, r * 0.15, '#ffffff');
  }

  // ---- The level --------------------------------------------------------------

  const CLOUDS = Array.from({ length: 40 }, (_, k) => ({ x: k * 330 + hash(k) * 200, y: 50 + hash(k + 9) * 140, s: 0.6 + hash(k + 3) * 0.8 }));

  function drawSky(clock) {
    // Sunset as you get near the boss.
    const dusk = clamp01((cam - (A.ARENA_X - 2400)) / 2400);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix('#4aa8ff', '#3a2a6e', dusk));
    g.addColorStop(0.65, mix('#bfe6ff', '#ff9a5a', dusk));
    g.addColorStop(1, mix('#e8f7ff', '#ffd27a', dusk));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // The sun.
    const sy = 90 + dusk * 200;
    ellipse(800 - cam * 0.01, sy, 70, 70, `rgba(255,240,180,${0.25})`);
    ellipse(800 - cam * 0.01, sy, 44, 44, mix('#fff6c8', '#ff7a3a', dusk));
    // Clouds.
    for (const c of CLOUDS) {
      const x = ((c.x - cam * 0.15 + clock * 6) % (40 * 330)) - 100;
      if (x < -200 || x > W + 200) continue;
      ctx.globalAlpha = 0.85;
      ellipse(x, c.y, 50 * c.s, 20 * c.s, '#ffffff');
      ellipse(x + 30 * c.s, c.y - 12 * c.s, 34 * c.s, 22 * c.s, '#ffffff');
      ellipse(x - 28 * c.s, c.y - 6 * c.s, 28 * c.s, 16 * c.s, '#ffffff');
      ctx.globalAlpha = 1;
    }
    // Far mountains and near hills.
    const ridge = (par, base, amp, color, f1, f2) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 20) {
        const wx = x + cam * par;
        ctx.lineTo(x, base - Math.abs(Math.sin(wx * f1)) * amp - Math.sin(wx * f2) * amp * 0.3);
      }
      ctx.lineTo(W, H);
      ctx.fill();
    };
    ridge(0.2, 380, 140, mix('#8fb3d9', '#6a4f8a', dusk), 0.0031, 0.011);
    ridge(0.45, 430, 70, mix('#6fc46a', '#4f7a3c', dusk), 0.006, 0.017);
  }

  function drawGround(clock) {
    const L = A.LEVEL;
    for (const s of L.solids) {
      if (s.x + s.w < cam - 20 || s.x > cam + W + 20) continue;
      const x0 = Math.max(s.x, cam - 20);
      const x1 = Math.min(s.x + s.w, cam + W + 20);
      ctx.fillStyle = '#7a4a24';
      ctx.fillRect(x0, s.y, x1 - x0, H - s.y + 10);
      ctx.fillStyle = '#6a3d1c';
      for (let x = Math.floor(x0 / 40) * 40; x < x1; x += 40) {
        for (let r = 0; r < 4; r++) {
          const hx = x + hash(x + r * 7) * 40;
          const hy = s.y + 30 + r * 22 + hash(x * 3 + r) * 12;
          if (hx > x0 && hx < x1 && hy < H) ellipse(hx, hy, 5, 3, '#5e3417');
        }
      }
      // Grass on top.
      ctx.fillStyle = '#3f9b3a';
      ctx.fillRect(x0, s.y - 2, x1 - x0, 14);
      ctx.fillStyle = '#58c24f';
      ctx.fillRect(x0, s.y - 4, x1 - x0, 7);
      for (let x = Math.floor(x0 / 18) * 18; x < x1; x += 18) {
        const hgt = 4 + hash(x) * 6;
        ctx.fillStyle = '#58c24f';
        ctx.beginPath();
        ctx.moveTo(x, s.y - 2);
        ctx.lineTo(x + 4, s.y - 2 - hgt);
        ctx.lineTo(x + 8, s.y - 2);
        ctx.fill();
        if (hash(x + 0.5) > 0.93 && x > s.x + 10 && x < s.x + s.w - 10) {
          // A flower.
          ctx.strokeStyle = '#2f7a2b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 4, s.y - 2);
          ctx.lineTo(x + 4, s.y - 16);
          ctx.stroke();
          const petal = ['#ff7ab8', '#ffd23f', '#ffffff', '#b98cff'][Math.floor(hash(x + 2) * 4)];
          for (let k = 0; k < 5; k++) ellipse(x + 4 + Math.cos(k * 1.256 + clock) * 4, s.y - 18 + Math.sin(k * 1.256 + clock) * 4, 3, 3, petal);
          ellipse(x + 4, s.y - 18, 2.4, 2.4, '#e09a1a');
        }
      }
      // Dark edges where the ground drops away.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      if (s.x >= x0) ctx.fillRect(s.x, s.y, 6, H - s.y);
      if (s.x + s.w <= x1) ctx.fillRect(s.x + s.w - 6, s.y, 6, H - s.y);
    }
    for (const p of L.platforms) {
      if (p.x + p.w < cam - 20 || p.x > cam + W + 20) continue;
      ctx.fillStyle = '#a8662f';
      ctx.fillRect(p.x, p.y, p.w, 16);
      ctx.fillStyle = '#7d4820';
      for (let x = p.x + 30; x < p.x + p.w; x += 30) ctx.fillRect(x, p.y + 2, 2, 14);
      ctx.fillRect(p.x, p.y + 14, p.w, 3);
      ctx.fillStyle = '#58c24f';
      ctx.fillRect(p.x - 2, p.y - 3, p.w + 4, 6);
      // Posts holding it up from below.
      ctx.fillStyle = 'rgba(90,50,20,0.55)';
      ctx.fillRect(p.x + 8, p.y + 17, 6, 22);
      ctx.fillRect(p.x + p.w - 14, p.y + 17, 6, 22);
    }
    drawSigns();
  }

  function drawSigns() {
    // A signpost at the start, and the ring for the boss.
    const sign = (x, y, text) => {
      if (x < cam - 200 || x > cam + W + 200) return;
      ctx.fillStyle = '#7d4820';
      ctx.fillRect(x - 4, y - 70, 8, 70);
      ctx.fillStyle = '#c98a4a';
      ctx.fillRect(x - 70, y - 100, 150, 38);
      ctx.beginPath();
      ctx.moveTo(x + 80, y - 100);
      ctx.lineTo(x + 98, y - 81);
      ctx.lineTo(x + 80, y - 62);
      ctx.fill();
      ctx.fillStyle = '#4a2a10';
      ctx.font = '18px Bangers, Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, x + 10, y - 74);
    };
    sign(330, A.GROUND_Y, 'To Big Horn’s ring');
    sign(A.ARENA_X - 220, A.GROUND_Y, 'Boss ahead!');
  }

  function drawArenaBack(clock) {
    const ax = A.ARENA_X;
    if (cam + W < ax - 40) return;
    const fy = A.GROUND_Y;
    // Spotlights.
    if (snap && snap.boss) {
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.04 * Math.sin(clock * 2);
      for (const [x, s] of [[ax + 250, 1], [ax + 750, -1]]) {
        ctx.fillStyle = '#fff6c8';
        ctx.beginPath();
        ctx.moveTo(x + s * 60 * Math.sin(clock * 0.7), 0);
        ctx.lineTo(x - 140 + s * 120 * Math.sin(clock * 0.7), fy);
        ctx.lineTo(x + 140 + s * 120 * Math.sin(clock * 0.7), fy);
        ctx.fill();
      }
      ctx.restore();
    }
    // Banner.
    ctx.fillStyle = '#8a1f1f';
    ctx.fillRect(ax + 330, 60, 340, 54);
    ctx.fillStyle = '#ffd23f';
    ctx.font = '32px Bangers, Anton, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BIG HORN’S RING', ax + 500, 98);
    // Corner posts and ropes at the back.
    for (const x of [ax + 14, ax + W - 14]) {
      ctx.fillStyle = '#cfd6e0';
      ctx.fillRect(x - 7, fy - 170, 14, 170);
      ctx.fillStyle = '#e03a3e';
      ctx.fillRect(x - 9, fy - 176, 18, 14);
    }
    ['#e03a3e', '#ffffff', '#2f76e8'].forEach((c, k) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ax + 14, fy - 150 + k * 40);
      ctx.quadraticCurveTo(ax + W / 2, fy - 140 + k * 40, ax + W - 14, fy - 150 + k * 40);
      ctx.stroke();
    });
  }

  // ---- Pickups ---------------------------------------------------------------

  function drawPickup(pk, clock) {
    const bob = Math.sin(clock * 3 + pk.x * 0.05) * 4;
    if (pk.type === 'coin') {
      const w = Math.abs(Math.cos(clock * 4 + pk.x * 0.02)) * 12 + 1.5;
      ellipse(pk.x, pk.y + bob, w, 13, '#e0a400');
      ellipse(pk.x, pk.y + bob, Math.max(0.5, w - 3), 10, '#ffd23f');
      if (w > 6) {
        ctx.fillStyle = '#e0a400';
        ctx.fillRect(pk.x - 1.5, pk.y + bob - 6, 3, 12);
      }
    } else if (pk.type === 'heart') {
      ellipse(pk.x, pk.y + bob, 22, 22, 'rgba(255,90,120,0.18)');
      heartShape(pk.x, pk.y + bob + 4, 16, '#ff3b5c');
      ellipse(pk.x - 6, pk.y + bob - 4, 3, 2, 'rgba(255,255,255,0.7)');
    } else if (pk.type === 'life') {
      ellipse(pk.x, pk.y + bob, 28 + Math.sin(clock * 6) * 3, 28 + Math.sin(clock * 6) * 3, 'rgba(255,210,63,0.25)');
      glove(pk.x, pk.y + bob, 1.2, '#e03a3e');
      ctx.font = '16px Bangers, Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('1UP', pk.x, pk.y + bob - 20);
    }
  }

  // ---- Creatures ----------------------------------------------------------------

  const flashing = (e) => e.hurt > 0 && e.hurt % 4 < 2;

  function drawCreature(e, x, y, clock) {
    ctx.save();
    ctx.translate(x, y);
    if (e.dead && e.type !== 'rhino') {
      ctx.globalAlpha = clamp01(1 - e.t / 50);
      ctx.translate(0, -15);
      ctx.rotate(e.t * 0.25 * (e.facing || 1));
      ctx.translate(0, 15);
    }
    const f = e.facing || -1;
    switch (e.type) {
      case 'slime': drawSlime(e, f, clock); break;
      case 'bee': drawBee(e, f, clock); break;
      case 'hedgehog': drawHedgehog(e, f, clock, x); break;
      case 'frog': drawFrog(e, f, clock); break;
      case 'rhino': drawRhino(e, f, clock); break;
    }
    ctx.restore();
    // A health bar once it's been hit.
    if (!e.dead && e.type !== 'rhino' && e.hp < e.maxHp) {
      const c = A.CREATURES[e.type];
      const bw = c.hw * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - bw / 2, y - c.h - 14, bw, 5);
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(x - bw / 2, y - c.h - 14, bw * (e.hp / e.maxHp), 5);
    }
  }

  const airborne = (e) => A.surfaceBelow(e.x, e.y) > e.y + 1;

  function drawSlime(e, f, clock) {
    const air = airborne(e) && !e.dead;
    const wob = Math.sin(clock * 7 + e.id) * 0.06;
    const sx = air ? 0.86 : 1 + wob;
    const sy = air ? 1.18 : 1 - wob;
    const body = flashing(e) ? '#ffffff' : '#5ad35a';
    ellipse(0, 2, 22, 5, 'rgba(0,0,0,0.25)');
    ctx.save();
    ctx.scale(sx, sy);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.bezierCurveTo(-26, -24, -12, -36, 0, -36);
    ctx.bezierCurveTo(12, -36, 26, -24, 24, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2f8f34';
    ctx.lineWidth = 2;
    ctx.stroke();
    ellipse(-8, -26, 7, 4, 'rgba(255,255,255,0.45)', -0.5);
    eye(f * 4 - 7, -20, 5.5, f);
    eye(f * 4 + 7, -20, 5.5, f);
    ctx.strokeStyle = '#1f5f22';
    ctx.beginPath();
    ctx.arc(f * 4, -11, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBee(e, f, clock) {
    const jitter = e.state === 'aim' ? Math.sin(clock * 80) * 2 : 0;
    ctx.translate(jitter, -14);
    const tilt = e.state === 'dive' ? 0.5 * f : 0;
    ctx.rotate(tilt);
    const flap = Math.sin(clock * 50) * 0.5;
    ctx.globalAlpha *= 0.75;
    ellipse(-4, -14, 9, 15, '#d6f3ff', -0.6 + flap);
    ellipse(4, -14, 9, 15, '#d6f3ff', 0.6 - flap);
    ctx.globalAlpha /= 0.75;
    const yellow = flashing(e) ? '#ffffff' : '#ffcc1a';
    ellipse(0, 0, 20, 13, yellow);
    ctx.fillStyle = '#222';
    for (const sx of [-8, 0]) ctx.fillRect(sx - f * 4 - 2, -12, 5, 24);
    // Stinger at the back.
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.moveTo(-f * 19, -3);
    ctx.lineTo(-f * 29, 0);
    ctx.lineTo(-f * 19, 3);
    ctx.fill();
    eye(f * 11, -3, 4.5, f);
    // Antennae.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(f * 12, -10);
    ctx.quadraticCurveTo(f * 16, -22, f * 22, -20);
    ctx.stroke();
    ellipse(f * 22, -20, 2, 2, '#222');
    if (e.state === 'aim') {
      ctx.font = '20px Bangers, Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff5a3a';
      ctx.fillText('!', 0, -30);
    }
  }

  function drawHedgehog(e, f, clock, x) {
    ellipse(0, 2, 24, 5, 'rgba(0,0,0,0.25)');
    const curled = e.state === 'curl' || e.state === 'roll' || (e.state === 'uncurl' && e.t < 20);
    const brown = flashing(e) ? '#ffffff' : '#8a5a34';
    if (curled) {
      const roll = e.state === 'roll' ? x / 20 : (e.state === 'curl' ? e.t * 0.05 * f : 0);
      ctx.save();
      ctx.translate(0, -21);
      ctx.rotate(roll * f);
      ctx.fillStyle = '#4a2f1a';
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.2) * 18, Math.sin(a - 0.2) * 18);
        ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30);
        ctx.lineTo(Math.cos(a + 0.2) * 18, Math.sin(a + 0.2) * 18);
        ctx.fill();
      }
      ellipse(0, 0, 21, 21, brown);
      ellipse(-6, -7, 6, 4, 'rgba(255,255,255,0.25)');
      ctx.restore();
      return;
    }
    const step = e.state === 'walk' ? Math.sin(clock * 10 + e.id) * 3 : 0;
    ellipse(-10 + step, -3, 5, 4, '#3a2412');
    ellipse(10 - step, -3, 5, 4, '#3a2412');
    // Spikes along its back.
    ctx.fillStyle = '#4a2f1a';
    for (let k = 0; k < 7; k++) {
      const a = Math.PI + (k / 6) * Math.PI * 0.9 - (f > 0 ? 0.1 : -0.1);
      const bx = Math.cos(a) * 22 - f * 4;
      const by = -14 + Math.sin(a) * 15;
      ctx.beginPath();
      ctx.moveTo(bx - 5, by + 4);
      ctx.lineTo(bx - f * 10 + Math.cos(a) * 8, by + Math.sin(a) * 12);
      ctx.lineTo(bx + 5, by + 4);
      ctx.fill();
    }
    ellipse(-f * 3, -15, 24, 15, brown);
    // Face.
    ellipse(f * 16, -12, 11, 9, flashing(e) ? '#ffffff' : '#e8c59a');
    ellipse(f * 27, -12, 3.5, 3, '#2a1a10');
    eye(f * 15, -16, 3.5, f);
    ellipse(f * 10, -8, 3, 2, 'rgba(255,120,140,0.6)');
  }

  function drawFrog(e, f, clock) {
    const air = airborne(e) && !e.dead;
    ellipse(0, 2, 24, 5, 'rgba(0,0,0,0.25)');
    const green = flashing(e) ? '#ffffff' : '#3fb24a';
    const dark = '#2a7d33';
    if (air) {
      // Legs out behind it.
      ctx.strokeStyle = dark;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-f * 10, -10);
      ctx.lineTo(-f * 30, 0);
      ctx.moveTo(-f * 4, -10);
      ctx.lineTo(-f * 22, 6);
      ctx.stroke();
    } else {
      ellipse(-f * 14, -6, 12, 7, dark);
      ellipse(f * 12, -2, 7, 4, dark);
    }
    const sy = air ? 0.9 : 1 + Math.sin(clock * 4 + e.id) * 0.03;
    ctx.save();
    ctx.scale(1, sy);
    ellipse(0, -16, 25, 17, green);
    ellipse(f * 4, -10, 16, 9, '#c8f0b0');
    // Eyes on top.
    ellipse(f * 4 - 8, -32, 8, 8, green);
    ellipse(f * 4 + 10, -32, 8, 8, green);
    eye(f * 4 - 8, -33, 5.5, f);
    eye(f * 4 + 10, -33, 5.5, f);
    if (e.state === 'spit' && e.t < 24) {
      ellipse(f * 18, -18, 8, 6 * clamp01(e.t / 10), '#c9405a');
    } else {
      ctx.strokeStyle = '#1f5f22';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(f * 4, -20);
      ctx.quadraticCurveTo(f * 14, -14, f * 23, -20);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRhino(e, f, clock) {
    const angryRed = e.angry ? 0.3 + 0.1 * Math.sin(clock * 8) : 0;
    const skinBase = e.angry ? mix('#8d939c', '#d0453a', angryRed) : '#8d939c';
    const skin = flashing(e) ? '#ffffff' : skinBase;
    const dark = '#5f646c';
    const st = e.state;
    ellipse(0, 4, 80, 12, 'rgba(0,0,0,0.3)');
    if (st === 'dead') {
      // Flat on his back, seeing stars.
      ctx.save();
      ctx.rotate(-f * Math.PI / 2 * clamp01(e.t / 20));
      drawRhinoBody(e, f, clock, skin, dark, 'idle');
      ctx.restore();
      for (let k = 0; k < 3; k++) {
        const a = clock * 3 + (k * Math.PI * 2) / 3;
        drawStar(-f * 110 + Math.cos(a) * 30, -40 + Math.sin(a) * 10, 8, '#ffd23f');
      }
      return;
    }
    ctx.save();
    if (st === 'dizzy') ctx.rotate(Math.sin(clock * 5) * 0.08);
    drawRhinoBody(e, f, clock, skin, dark, st);
    ctx.restore();
    if (st === 'dizzy') {
      for (let k = 0; k < 4; k++) {
        const a = clock * 4 + (k * Math.PI) / 2;
        drawStar(f * 30 + Math.cos(a) * 45, -175 + Math.sin(a) * 12, 9, '#ffd23f');
      }
    }
    if (e.angry && Math.sin(clock * 6) > 0.3) {
      ellipse(f * 105 + Math.sin(clock * 9) * 4, -110, 8, 6, 'rgba(255,255,255,0.6)');
    }
  }

  function drawStar(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
  }

  function drawRhinoBody(e, f, clock, skin, dark, st) {
    const lean = st === 'charge' ? 0.35 : st === 'windup' ? 0.18 : 0;
    const air = st === 'stomp' && airborne(e);
    const run = st === 'charge' || st === 'idle' ? Math.sin(clock * (st === 'charge' ? 22 : 8)) : 0;
    // Legs.
    const legL = air ? -18 : run * 14;
    const legR = air ? -18 : -run * 14;
    ctx.fillStyle = dark;
    ctx.fillRect(-36 + legL * 0.5 * f, -48 + (air ? 14 : 0), 28, 48 + (air ? -14 : 0));
    ctx.fillStyle = skin;
    ctx.fillRect(8 + legR * 0.5 * f, -48 + (air ? 14 : 0), 28, 48 + (air ? -14 : 0));
    ellipse(-22 + legL * 0.5 * f, -2 + (air ? -10 : 0), 18, 7, '#4a4e55');
    ellipse(22 + legR * 0.5 * f, -2 + (air ? -10 : 0), 18, 7, '#4a4e55');
    ctx.save();
    ctx.translate(0, -50);
    ctx.rotate(lean * f);
    // Trunks and belt.
    ctx.fillStyle = '#c9262c';
    ctx.fillRect(-46, -16, 92, 34);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-48, -22, 96, 10);
    ellipse(f * 6, -17, 12, 9, '#ffe680');
    // Big round body.
    ellipse(0, -52, 54, 46, skin);
    ellipse(f * 10, -44, 34, 30, mix('#b9bec5', '#ffffff', 0.1));
    // Back arm and glove.
    const throwing = st === 'throw' && e.t % 30 < 22;
    const punch = st === 'windup' ? (Math.floor(e.t / 8) % 2) : 0;
    const backG = throwing ? { x: -f * 10, y: -128 } : st === 'charge' ? { x: f * 50, y: -46 } : { x: -f * 32 + f * punch * 18, y: -62 + punch * 50 };
    ctx.strokeStyle = dark;
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-f * 26, -72);
    ctx.lineTo(backG.x, backG.y);
    ctx.stroke();
    glove(backG.x, backG.y, 1.8 * f, '#9e1e24');
    // Head.
    const hx = f * 46;
    const hy = -100;
    ellipse(hx - f * 26, hy - 26, 9, 13, skin, -0.3 * f);
    ellipse(hx, hy, 40, 30, skin);
    ellipse(hx + f * 30, hy + 8, 26, 20, skin);
    // Horns.
    ctx.fillStyle = '#efe6d2';
    ctx.beginPath();
    ctx.moveTo(hx + f * 36, hy - 4);
    ctx.quadraticCurveTo(hx + f * 66, hy - 30, hx + f * 58, hy - 56);
    ctx.lineTo(hx + f * 52, hy - 8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx + f * 14, hy - 22);
    ctx.lineTo(hx + f * 26, hy - 44);
    ctx.lineTo(hx + f * 28, hy - 20);
    ctx.fill();
    ellipse(hx + f * 46, hy + 12, 3.5, 2.5, '#3a3d42');
    // Eye: cross when dizzy, angry brow when angry.
    if (st === 'dizzy') {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx + f * 4 - 5, hy - 12);
      ctx.lineTo(hx + f * 4 + 5, hy - 2);
      ctx.moveTo(hx + f * 4 + 5, hy - 12);
      ctx.lineTo(hx + f * 4 - 5, hy - 2);
      ctx.stroke();
    } else {
      eye(hx + f * 4, hy - 8, 7, f);
      ctx.strokeStyle = '#2a2c30';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(hx - f * 6, hy - (e.angry || st === 'charge' || st === 'windup' ? 22 : 18));
      ctx.lineTo(hx + f * 14, hy - 14);
      ctx.stroke();
    }
    // Front arm and glove.
    const frontG = throwing ? { x: f * 20, y: -132 } : st === 'charge' ? { x: f * 70, y: -60 } : { x: f * 46 - f * punch * 10, y: -40 - punch * 6 + (1 - punch) * 0 };
    ctx.strokeStyle = skin;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(f * 20, -70);
    ctx.lineTo(frontG.x, frontG.y);
    ctx.stroke();
    glove(frontG.x, frontG.y, 2 * f, '#e03a3e');
    if (throwing) drawBoulder(f * 5, -160, 26, e.t * 0.1);
    ctx.restore();
  }

  // ---- Projectiles -------------------------------------------------------------

  function drawBoulder(x, y, r, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.fillStyle = '#8a847b';
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rr = r * (0.82 + hash(k) * 0.25);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.fill();
    ellipse(-r * 0.3, -r * 0.3, r * 0.3, r * 0.2, '#a49e94');
    ellipse(r * 0.25, r * 0.2, r * 0.15, r * 0.12, '#6e6961');
    ctx.restore();
  }

  function drawProjectile(pr, x, y, clock) {
    if (pr.type === 'bubble') {
      const r = 12 + Math.sin(clock * 10 + pr.id) * 1.5;
      ctx.globalAlpha = 0.75;
      ellipse(x, y, r, r, '#9fe7ff');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ellipse(x - 4, y - 4, 3, 2, '#ffffff');
    } else if (pr.type === 'boulder') {
      drawBoulder(x, y, 24, pr.t * 0.15);
    } else if (pr.type === 'wave') {
      // A ripple of dust rolling along the ground.
      for (let k = 0; k < 3; k++) {
        const h = 30 - k * 8 + Math.sin(clock * 20 + k) * 3;
        ellipse(x - k * 8 * Math.sign(pr.x - x || 1), y - h / 2, 16 - k * 3, h / 2, `rgba(170,130,90,${0.75 - k * 0.2})`);
      }
      ctx.fillStyle = '#d9b98a';
      ctx.beginPath();
      ctx.moveTo(x - 18, y);
      ctx.lineTo(x, y - 34);
      ctx.lineTo(x + 18, y);
      ctx.fill();
    }
  }

  // ---- Boxers ------------------------------------------------------------------

  /** Stretches this mode's frame data over game.js's, which the poses use. */
  function poseTicks(move, t) {
    const a = A.MOVES[move];
    const b = G.MOVES[move];
    if (t < a.startup) return (t / a.startup) * b.startup;
    if (t < a.startup + a.active) return b.startup + ((t - a.startup) / a.active) * b.active;
    return b.startup + b.active + clamp01((t - a.startup - a.active) / a.recovery) * b.recovery;
  }

  function drawPlayer(i, p, x, y, clock, ticksSince) {
    if (p.out || (p.state === 'ko' && p.fell)) return;
    const t = p.t + ticksSince;
    let state = p.state;
    if (!p.onGround && (state === 'walk' || state === 'idle')) state = 'idle';
    const f = {
      // On the ground, punches and kicks go in low, at creature height.
      state, move: p.move, facing: p.facing, aim: p.onGround ? 'body' : 'head', x, hitHeight: 'head', noShadow: true,
    };
    const drawT = state === 'attack' ? poseTicks(p.move, t) : t;
    // Shadow on whatever is underneath.
    const floor = A.surfaceBelow(p.x, p.y - 2);
    if (floor < H + 50) {
      const k = clamp01(1 - (floor - y) / 300);
      ellipse(x, floor + 2, 26 * k + 4, 6 * k + 1, `rgba(0,0,0,${0.3 * k})`);
    }
    ctx.save();
    if (p.invuln > 0 && p.state !== 'ko' && Math.floor(clock * 16) % 2) ctx.globalAlpha = 0.45;
    // A little tilt in the air.
    if (!p.onGround && state === 'idle') {
      ctx.translate(x, y - 50);
      ctx.rotate(p.facing * Math.max(-0.2, Math.min(0.2, p.vy * 0.02)));
      ctx.translate(-x, -(y - 50));
    }
    art().drawBoxer(ctx, i, f, drawT, clock, x, y, BOXER_SCALE);
    ctx.restore();
    // Name tag.
    const pal = art().PALETTE[i];
    const top = y - A.PLAYER_H - 16;
    ctx.font = '15px Barlow, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(p.name, x, top);
    ctx.fillStyle = pal.name;
    ctx.fillText(p.name, x, top);
    if (i === me && snap.players.length > 1) {
      ctx.fillStyle = pal.name;
      ctx.beginPath();
      ctx.moveTo(x - 6, top - 22);
      ctx.lineTo(x + 6, top - 22);
      ctx.lineTo(x, top - 14);
      ctx.fill();
    }
  }

  // ---- HUD ---------------------------------------------------------------------

  function drawHud(s, clock) {
    const pal = art().PALETTE;
    s.players.forEach((p, i) => {
      const x = 12 + i * 176;
      const y = 12;
      ctx.fillStyle = 'rgba(10,14,22,0.62)';
      ctx.fillRect(x, y, 166, 46);
      ctx.fillStyle = pal[i].glove;
      ctx.fillRect(x, y, 4, 46);
      ctx.font = '15px Barlow, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = pal[i].name;
      ctx.fillText(p.name + (i === me && s.players.length > 1 ? ' (you)' : ''), x + 12, y + 18);
      if (p.out) {
        ctx.fillStyle = '#ff8a8a';
        ctx.fillText(p.left ? 'Left' : 'Out', x + 12, y + 38);
        return;
      }
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + 12, y + 27, 144, 10);
      const k = p.hp / A.MAX_HP;
      const d = pdisp[i];
      if (d) {
        if (d.hpTrail === undefined || d.hpTrail < p.hp) d.hpTrail = p.hp;
        d.hpTrail = Math.max(p.hp, d.hpTrail - 0.6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 12, y + 27, 144 * (d.hpTrail / A.MAX_HP), 10);
      }
      ctx.fillStyle = k > 0.5 ? '#4fd36a' : k > 0.25 ? '#ffd23f' : '#ff5a5a';
      ctx.fillRect(x + 12, y + 27, 144 * k, 10);
      if (p.state === 'ko') {
        ctx.fillStyle = '#ffffff';
        ctx.font = '13px Barlow, system-ui, sans-serif';
        ctx.fillText(s.lives > 0 ? 'Back in a moment…' : 'Down', x + 14, y + 37);
      }
    });

    // Score and the team's lives.
    ctx.textAlign = 'right';
    ctx.font = '26px Bangers, Anton, Impact, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    const score = `Score ${String(s.score).padStart(6, '0')}`;
    ctx.strokeText(score, W - 16, 36);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(score, W - 16, 36);
    const lives = s.lives;
    const shown = Math.min(lives, 6);
    for (let k = 0; k < shown; k++) glove(W - 26 - k * 26, 56, 0.9, '#e03a3e');
    if (lives > 6) {
      ctx.font = '18px Bangers, Anton, Impact, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`x${lives}`, W - 26 - 6 * 26 + 10, 62);
    }
    if (lives === 0) {
      ctx.font = '16px Barlow, system-ui, sans-serif';
      ctx.fillStyle = '#ff8a8a';
      ctx.fillText('Last life!', W - 16, 62);
    }

    // How far to the boss.
    if (!s.boss) {
      const k = clamp01(s.camX / A.ARENA_X);
      const bx = W / 2 - 150;
      ctx.fillStyle = 'rgba(10,14,22,0.5)';
      ctx.fillRect(bx, 18, 300, 8);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(bx, 18, 300 * k, 8);
      glove(bx + 300 * k, 22, 0.7, '#e03a3e');
      ctx.font = '13px Barlow, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('\u{1F98F}', bx + 312, 27);
    } else {
      // The boss's health.
      const b = s.boss;
      const bw = 520;
      const bx = (W - bw) / 2;
      const by = H - 40;
      ctx.fillStyle = 'rgba(10,14,22,0.7)';
      ctx.fillRect(bx - 6, by - 26, bw + 12, 44);
      ctx.font = '20px Bangers, Anton, Impact, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ff8a6a';
      ctx.fillText(b.name.toUpperCase(), bx, by - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(bx, by, bw, 12);
      ctx.fillStyle = b.hp < b.maxHp / 2 ? '#ff3b3b' : '#ff8a3a';
      ctx.fillRect(bx, by, bw * (b.hp / b.maxHp), 12);
    }

    if (banner) {
      const k = banner.life / banner.max;
      const pop = Math.min(1, (banner.max - banner.life) / 8);
      ctx.save();
      ctx.globalAlpha = Math.min(1, banner.life / 15);
      ctx.translate(W / 2, H * 0.36);
      ctx.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
      ctx.font = '84px Bangers, Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(banner.text.toUpperCase(), 0, 0);
      ctx.fillStyle = banner.color;
      ctx.fillText(banner.text.toUpperCase(), 0, 0);
      if (banner.sub) {
        ctx.font = '26px Barlow, system-ui, sans-serif';
        ctx.lineWidth = 5;
        ctx.strokeText(banner.sub, 0, 44);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(banner.sub, 0, 44);
      }
      ctx.restore();
      banner.life--;
      if (banner.life <= 0 || k <= 0) banner = null;
    }
  }

  // ---- Loop --------------------------------------------------------------------

  let lastFrame = performance.now();

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    return dpr;
  }

  function smooth(map, id, x, y, k) {
    let d = map.get(id);
    if (!d || Math.abs(d.x - x) > 200 || Math.abs(d.y - y) > 200) { d = { x, y }; map.set(id, d); }
    d.x += (x - d.x) * k;
    d.y += (y - d.y) * k;
    d.seen = true;
    return d;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!isActive()) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const clock = now / 1000;
    const dpr = resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!snap) {
      ctx.fillStyle = '#4aa8ff';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const s = snap;
    const k = Math.min(1, dt * 20);
    cam += (s.camX - cam) * Math.min(1, dt * 12);
    const ticksSince = Math.min(3, ((now - snapAt) / 1000) * A.TICK_RATE);

    ctx.save();
    if (shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= 0.88;
    }
    drawSky(clock);
    ctx.save();
    ctx.translate(-Math.round(cam), 0);
    drawArenaBack(clock);
    drawGround(clock);

    for (const id of s.pickups) drawPickup(A.LEVEL.pickups[id], clock);
    for (const pk of s.extra) drawPickup(pk, clock);

    for (const d of edisp.values()) d.seen = false;
    for (const e of s.enemies) {
      const d = smooth(edisp, e.id, e.x, e.y, k);
      drawCreature(e, d.x, d.y, clock);
    }
    for (const [id, d] of edisp) if (!d.seen) edisp.delete(id);

    // Players: anyone attacking goes on top.
    const order = s.players.map((p, i) => i).sort((a, b) => (s.players[a].state === 'attack') - (s.players[b].state === 'attack'));
    for (const i of order) {
      const p = s.players[i];
      const d = pdisp[i] || (pdisp[i] = { x: p.x, y: p.y });
      if (Math.abs(p.x - d.x) > 200 || Math.abs(p.y - d.y) > 200) { d.x = p.x; d.y = p.y; }
      d.x += (p.x - d.x) * k;
      d.y += (p.y - d.y) * k;
      drawPlayer(i, p, d.x, d.y, clock, ticksSince);
    }

    for (const d of prdisp.values()) d.seen = false;
    for (const pr of s.projectiles) {
      const d = smooth(prdisp, pr.id, pr.x, pr.y, k);
      drawProjectile(pr, d.x, d.y, clock);
    }
    for (const [id, d] of prdisp) if (!d.seen) prdisp.delete(id);

    for (let n = effects.length - 1; n >= 0; n--) {
      const p = effects[n];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.float ? -0.02 : 0.25;
      p.life--;
      ctx.globalAlpha = clamp01(p.life / 20);
      ctx.fillStyle = p.color;
      if (p.float) ellipse(p.x, p.y, p.size, p.size * 0.8, p.color);
      else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      if (p.life <= 0) effects.splice(n, 1);
    }
    ctx.globalAlpha = 1;
    for (let n = texts.length - 1; n >= 0; n--) {
      const tx = texts[n];
      tx.y -= 0.8;
      tx.life--;
      ctx.globalAlpha = clamp01(tx.life / 15);
      ctx.font = `${tx.size}px Bangers, Anton, Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(tx.text, tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
      if (tx.life <= 0) texts.splice(n, 1);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.restore();
    drawHud(s, clock);
  }
  requestAnimationFrame(frame);

  window.BoxerAdventureView = { handle, showNotice, active: isActive };
})();
