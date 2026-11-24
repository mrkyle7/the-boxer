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
    typed.length = 0;
    showKeyboard(false);
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
      if (s.phase === 'ready') announce(`Level ${s.level + 1}`, A.LEVELS[s.level].name, '#ffffff', 90);
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
        announce(e.name, e.title, '#ff5a3a', 150);
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
        announce('You win!', 'All four bosses down for the count', '#ffd23f', 150);
        play('fanfare');
        break;
      case 'cleared':
        announce('Level complete!', `${A.BOSSES[A.LEVELS[e.level].boss].name} is down for the count`, '#ffd23f', 200);
        play('fanfare');
        break;
      case 'level':
        cam = 0;
        pdisp.length = 0;
        edisp.clear();
        prdisp.clear();
        break;
      case 'go':
        break;
      case 'cheat':
        onCheat(e);
        break;
      case 'harrison':
        floatAbove(e.i, 'Harrison\u2026?', '#c8a2ff');
        break;
      case 'fist':
        shake = Math.max(shake, 16);
        dust(e.x, A.GROUND_Y, 16);
        play('slam');
        break;
      case 'honk':
        play('horn');
        break;
      case 'carDone':
        dust(e.x, e.y, 8);
        break;
      case 'fart':
        play('fart');
        break;
      case 'pieThrow':
        play('whoosh');
        break;
      case 'pieSplat':
        sparks(e.x, e.y, '#fff6e8', 12, 4);
        floatText(e.x, e.y - 20, 'Splat!', '#ff8ac8', 24);
        play('splash');
        break;
      case 'lullaby':
        announce('Shhh\u2026', 'Everyone\u2019s asleep', '#cfe0ff', 90);
        break;
      case 'interrupted':
        floatAbove(e.i, 'Stopped!', '#ff8a8a');
        break;
      case 'frozen':
        floatText(e.x, e.y - 50, 'Frozen!', '#bfe6ff', 24);
        play('zap');
        break;
      case 'shrunk':
        floatText(e.x, e.y - 40, 'Shrunk!', '#c8a2ff', 24);
        play('shrink');
        break;
      case 'sticky':
        floatText(e.x, e.y - 40, 'Sticky!', '#e8a020', 24);
        play('chomp');
        break;
      case 'poisoned':
        floatText(e.x, e.y - 10, 'Poisoned!', '#8ae06a', 22);
        break;
      case 'cuddle':
        play('tinkle');
        break;
      case 'snack':
        floatText(e.x, e.y - 10, `+${A.SNACK_HEAL}`, '#7dff9a', 30);
        play('chomp');
        break;
      case 'splat':
        sparks(e.x, e.y, e.kind === 'hotdog' ? '#b8382a' : '#e8b04a', 10, 3);
        break;
      case 'moustache':
        floatText(e.x, e.y - 20, 'Knockout!', '#ffd23f', 32);
        shake = Math.max(shake, 10);
        break;
      case 'nap':
        floatAbove(e.i, 'Zzz\u2026', '#cfe0ff');
        break;
      case 'reveal':
        sparks(e.x, e.y, '#fff6c8', 16, 3);
        play('tinkle');
        break;
      case 'secret':
        announce('Secret found!', null, '#ffd23f', 80);
        play('fanfare');
        break;
      case 'rockHit':
        sparks(e.x, e.y, e.kind === 'ice' ? '#dff2ff' : '#b8b0a4', 8, 3);
        play('clang');
        break;
      case 'rockBreak':
        sparks(e.x, e.y, e.kind === 'ice' ? '#dff2ff' : '#b8b0a4', 26, 6);
        dust(e.x, e.y + 28, 10);
        shake = Math.max(shake, 8);
        play('slam');
        break;
      case 'enterRoom':
      case 'leaveRoom':
        cam = snap ? snap.camX : cam;
        pdisp.length = 0;
        edisp.clear();
        prdisp.clear();
        play('poof');
        break;
      case 'golden':
        announce('Golden glove!', `${e.count} of ${A.LEVELS.length}`, '#ffd23f', 120);
        play('fanfare');
        break;
      case 'goldenAll':
        setTimeout(() => announce('All four golden gloves!', 'Golden gloves for everyone: your hits do more', '#ffd23f', 180), 2100);
        break;
      case 'idle': {
        const lines = ['Hello? Anyone there?', 'Shall we go then?', '\u266A Dum de dum\u2026', 'Is it lunchtime yet?'];
        floatText(e.x, e.y - A.PLAYER_H - 30, lines[Math.floor(Math.random() * lines.length)], '#ffffff', 22);
        break;
      }
      case 'promote':
        floatAbove(e.i, 'Queen!', '#ffd23f');
        play('fanfare');
        break;
      case 'gameOver':
        announce('Game over', 'Out of lives', '#ff6f73', 150);
        play('bell');
        break;
    }
  }

  /** A cheat code gone in: its word over their head, and a sound. */
  const CODE_SOUND = {
    flip: 'whoosh', vault: 'whoosh', luna: 'blink', dance: 'disco', cartwheel: 'whoosh', turbo: 'zap', charge: 'slide',
    rugby: 'slide', water: 'splash', jemini: 'grow', kyle: 'poof', shree: 'whoosh', shaan: 'pew', priya: 'pew',
    bear: 'whoosh', parimal: 'horn', daniel: 'spikes', edward: 'tapeStop', spreadbury: 'fanfare', mamtora: 'raga',
    jay: 'organ', leo: 'roar', ludo: 'clang', tony: 'organ', daddy: 'zap', mummy: 'tinkle', simon: 'blink',
    blake: 'roar', lizzie: 'slide', briony: 'tinkle', paul: 'lullaby', super: 'fanfare', boat: 'splash', swim: 'splash',
  };
  const PIECE_NAMES = { pawn: 'Pawn', knight: 'Knight', bishop: 'Bishop', rook: 'Rook', queen: 'Queen', king: 'King' };
  function onCheat(e) {
    let word = e.code.length > 12 ? 'Super!' : `${e.code}!`;
    if (e.what === 'turbo') word = 'Grandpa: turbo!';
    if (e.what === 'charge') word = 'Grandpa: charge!';
    if (e.piece) word = `Tony: ${PIECE_NAMES[e.piece]}!`;
    floatAbove(e.i, word, '#ffd23f');
    const d = pdisp[e.i];
    if (e.what === 'luna' && e.from) { sparks(e.from.x, e.from.y - 50, '#c8a2ff', 14, 4); }
    if (d && ['kyle', 'luna', 'jemini'].includes(e.what)) sparks(d.x, d.y - 50, '#ffffff', 14, 4);
    if (e.what === 'water') announce('Flood!', 'Type BOAT or SWIM', '#7ac8ff', 100);
    if (e.what === 'edward') announce('Time stopped', null, '#fff3c8', 60);
    play(CODE_SOUND[e.what] || 'blink');
  }
  function floatAbove(i, text, color) {
    const d = pdisp[i];
    if (d) floatText(d.x, d.y - A.PLAYER_H - 40, text, color, 26);
  }

  // ---- Results ---------------------------------------------------------------

  function showResult(won) {
    if (!snap) return;
    $('adv-result-title').textContent = won ? 'Champions!' : 'Game over';
    $('adv-score').textContent = won
      ? `All four bosses down \u00B7 Score ${snap.score}`
      : `Reached level ${snap.level + 1}: ${A.LEVELS[snap.level].name} \u00B7 Score ${snap.score}`;
    // Secrets only get a mention once you've found some.
    if (snap.secrets || snap.golden) {
      $('adv-score').textContent += ` \u00B7 Secrets ${snap.secrets}${snap.golden ? ` \u00B7 Golden gloves ${snap.golden}/${A.LEVELS.length}` : ''}`;
    }
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
      ['Cheat codes', (p) => p.stats.codes],
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
    showKeyboard(false);
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

  // Cheat codes: every letter goes to the server, which checks the word. A
  // letter that carries on a code (the W in swim, the A in kalya) doesn't
  // also jump or punch, and the one that finishes it doesn't either.
  const typed = [];
  const CODES = Object.keys(A.CODES);
  const CODE_MAX = Math.max(...CODES.map((c) => c.length));
  function checkCheat(e) {
    if (e.repeat || !/^[a-z]$/i.test(e.key)) return false;
    const k = e.key.toLowerCase();
    art().send({ t: 'type', k });
    typed.push(k);
    if (typed.length > CODE_MAX) typed.shift();
    const word = typed.join('');
    if (CODES.some((c) => word.endsWith(c))) { typed.length = 0; return 'done'; }
    const partway = CODES.some((c) => {
      for (let n = Math.min(c.length - 1, word.length); n >= 2; n--) if (word.endsWith(c.slice(0, n))) return true;
      return false;
    });
    return partway ? 'typing' : false;
  }

  window.addEventListener('keydown', (e) => {
    if (!isActive() || e.target.tagName === 'INPUT') return;
    play('unlock');
    const letter = /^Key[A-Z]$/.test(e.code);
    const cheating = checkCheat(e);
    if (letter && cheating) { e.preventDefault(); return; }
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

  // The letter pad for cheat codes on a phone (the ⌨ button).
  const kb = $('adv-kb');
  ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].forEach((row, r) => {
    const div = document.createElement('div');
    div.className = 'kb-row';
    for (const k of row) {
      const b = document.createElement('button');
      b.textContent = k.toUpperCase();
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        play('unlock');
        art().send({ t: 'type', k });
        b.classList.add('hit');
        setTimeout(() => b.classList.remove('hit'), 120);
      });
      div.append(b);
    }
    if (r === 2) {
      const close = document.createElement('button');
      close.className = 'kb-close';
      close.textContent = '\u2715';
      close.setAttribute('aria-label', 'Hide keyboard');
      close.addEventListener('pointerdown', (e) => { e.preventDefault(); showKeyboard(false); });
      div.append(close);
    }
    kb.append(div);
  });
  function showKeyboard(on) {
    kb.hidden = !on;
    $('adv-kb-toggle').classList.toggle('on', on);
  }
  $('adv-kb-toggle').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    play('unlock');
    showKeyboard(kb.hidden);
  });

  // The level to start on, in the lobby.
  const levelButtons = document.querySelectorAll('[data-adv-level]');
  const pickLevel = (n) => levelButtons.forEach((b) => {
    const on = Number(b.dataset.advLevel) === n;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  });
  try { pickLevel(Number(localStorage.getItem('boxer-adv-level')) || 0); } catch { /* ignore */ }
  levelButtons.forEach((b) => b.addEventListener('click', () => {
    pickLevel(Number(b.dataset.advLevel));
    try { localStorage.setItem('boxer-adv-level', b.dataset.advLevel); } catch { /* ignore */ }
  }));

  document.querySelectorAll('#adventure .touch button:not(#adv-kb-toggle)').forEach((btn) => {
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

  const lvl = () => A.LEVELS[snap ? snap.level : 0];
  const surf = (x, y) => A.surfaceBelow(lvl(), x, y);

  // Each level's colours.
  const THEMES = {
    meadow: {
      sky: ['#4aa8ff', '#bfe6ff', '#e8f7ff'], dusk: ['#3a2a6e', '#ff9a5a', '#ffd27a'], far: '#8fb3d9', farDusk: '#6a4f8a',
      near: '#6fc46a', nearDusk: '#4f7a3c', dirt: '#7a4a24', stone: '#5e3417', top: '#3f9b3a', topLight: '#58c24f',
      plank: '#a8662f', plankDark: '#7d4820', flowers: true, sun: true,
    },
    forest: {
      sky: ['#070b24', '#1d1f4a', '#3a2f5e'], far: '#1a2142', near: '#122a1c', dirt: '#3b2a1e', stone: '#2a1d14',
      top: '#2f5e3a', topLight: '#3f7a4a', plank: '#5e4630', plankDark: '#3d2c1c', moon: true, trees: true, fireflies: true,
    },
    snow: {
      sky: ['#8fbfe8', '#d2e8fa', '#f4fbff'], far: '#b8cde3', near: '#e3edf7', dirt: '#9cc2e2', stone: '#7fa7cb',
      top: '#e9f2fb', topLight: '#ffffff', plank: '#b98b5a', plankDark: '#8a6238', snowfall: true, sun: true, caps: true,
    },
    volcano: {
      sky: ['#1e0a0a', '#5e1f12', '#b9481c'], far: '#2c1210', near: '#3a1d18', dirt: '#463632', stone: '#2f2321',
      top: '#5c4a45', topLight: '#74605a', plank: '#5a4440', plankDark: '#3a2a27', lava: true, embers: true,
    },
  };
  const theme = () => THEMES[lvl().theme];

  const CLOUDS = Array.from({ length: 40 }, (_, k) => ({ x: k * 330 + hash(k) * 200, y: 50 + hash(k + 9) * 140, s: 0.6 + hash(k + 3) * 0.8 }));

  function drawSky(clock) {
    const room = roomNow();
    if (room) { drawRoomBack(room, clock); return; }
    const T = theme();
    const L = lvl();
    // The meadow turns to sunset as you near the boss.
    const dusk = T.dusk ? clamp01((cam - (L.arenaX - 2400)) / 2400) : 0;
    const col = (k) => (T.dusk ? mix(T.sky[k], T.dusk[k], dusk) : T.sky[k]);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, col(0));
    g.addColorStop(0.65, col(1));
    g.addColorStop(1, col(2));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (T.sun) {
      const sy = 90 + dusk * 200;
      ellipse(800 - cam * 0.01, sy, 70, 70, 'rgba(255,240,180,0.25)');
      ellipse(800 - cam * 0.01, sy, 44, 44, mix('#fff6c8', '#ff7a3a', dusk));
    }
    if (T.moon) {
      for (let k = 0; k < 60; k++) {
        const sx = (hash(k) * 1400 - cam * 0.02) % W;
        ellipse((sx + W) % W, hash(k + 50) * 300, 1.2, 1.2, `rgba(255,255,255,${0.4 + 0.4 * Math.sin(clock * 2 + k)})`);
      }
      ellipse(780, 100, 60, 60, 'rgba(230,230,255,0.12)');
      ellipse(780, 100, 38, 38, '#f2efd8');
      ellipse(768, 92, 8, 8, '#dcd8bc');
      ellipse(792, 112, 5, 5, '#dcd8bc');
    }
    if (T.lava) {
      // A volcano far off, glowing.
      const vx = 650 - cam * 0.05;
      ctx.fillStyle = '#240c0a';
      ctx.beginPath();
      ctx.moveTo(vx - 300, 420);
      ctx.lineTo(vx - 60, 150);
      ctx.lineTo(vx + 60, 150);
      ctx.lineTo(vx + 300, 420);
      ctx.fill();
      ellipse(vx, 150, 60, 14 + Math.sin(clock * 3) * 3, `rgba(255,120,40,${0.6 + 0.2 * Math.sin(clock * 4)})`);
      for (let k = 0; k < 5; k++) {
        const up = (clock * 30 + k * 40) % 200;
        ellipse(vx + Math.sin(k * 3 + clock) * 20, 140 - up, 18 + up * 0.15, 12 + up * 0.1, `rgba(70,50,50,${0.5 - up / 400})`);
      }
    }
    if (!T.moon && !T.lava) {
      for (const c of CLOUDS) {
        const x = ((c.x - cam * 0.15 + clock * 6) % (40 * 330)) - 100;
        if (x < -200 || x > W + 200) continue;
        ctx.globalAlpha = 0.85;
        ellipse(x, c.y, 50 * c.s, 20 * c.s, '#ffffff');
        ellipse(x + 30 * c.s, c.y - 12 * c.s, 34 * c.s, 22 * c.s, '#ffffff');
        ellipse(x - 28 * c.s, c.y - 6 * c.s, 28 * c.s, 16 * c.s, '#ffffff');
        ctx.globalAlpha = 1;
      }
    }
    // Far mountains and near hills (or trees).
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
    ridge(0.2, 380, 140, T.farDusk ? mix(T.far, T.farDusk, dusk) : T.far, 0.0031, 0.011);
    if (T.caps) {
      // Snow on the peaks: down from the ridge line, part way to the snow line.
      const ridgeY = (x) => {
        const wx = x + cam * 0.2;
        return 380 - Math.abs(Math.sin(wx * 0.0031)) * 140 - Math.sin(wx * 0.011) * 42;
      };
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      for (let x = 0; x <= W + 20; x += 10) ctx.lineTo(x, Math.min(ridgeY(x), 300));
      for (let x = W + 20; x >= 0; x -= 10) {
        const top = ridgeY(x);
        ctx.lineTo(x, top < 300 ? top + (300 - top) * 0.45 + Math.sin(x * 0.2) * 3 : 300);
      }
      ctx.fill();
    }
    if (T.trees) {
      for (const [par, base, color, size] of [[0.3, 430, T.far, 1.2], [0.55, 470, T.near, 1.6]]) {
        ctx.fillStyle = color;
        const step = 70 * size;
        const off = (cam * par) % step;
        for (let x = -off - step; x < W + step; x += step) {
          const k = Math.floor((x + cam * par) / step);
          const hgt = (120 + hash(k) * 80) * size;
          ctx.beginPath();
          ctx.moveTo(x, base);
          ctx.lineTo(x + step * 0.5, base - hgt);
          ctx.lineTo(x + step, base);
          ctx.fill();
        }
        ctx.fillRect(0, base - 2, W, H);
      }
    } else {
      ridge(0.45, 430, 70, T.nearDusk ? mix(T.near, T.nearDusk, dusk) : T.near, 0.006, 0.017);
    }
    if (T.lava) {
      // Lava down in the holes.
      const ly = 515;
      const lg = ctx.createLinearGradient(0, ly - 30, 0, H);
      lg.addColorStop(0, 'rgba(255,120,30,0)');
      lg.addColorStop(0.3, '#ff7a1a');
      lg.addColorStop(1, '#c2280c');
      ctx.fillStyle = lg;
      ctx.fillRect(0, ly - 30, W, H - ly + 30);
      ctx.fillStyle = '#ffcf4a';
      for (let x = 0; x < W; x += 24) {
        const wy = ly + Math.sin(clock * 3 + (x + cam) * 0.05) * 4;
        ctx.fillRect(x, wy, 14, 3);
      }
    }
  }

  // Snow, fireflies or embers drifting across the screen.
  function drawWeather(clock) {
    const T = theme();
    if (T.snowfall) {
      for (let k = 0; k < 70; k++) {
        const x = ((hash(k) * W + clock * (20 + hash(k + 3) * 30) * Math.sin(k) - cam * 0.6) % W + W) % W;
        const y = (hash(k + 7) * H + clock * (30 + hash(k + 1) * 40)) % H;
        ellipse(x, y, 2 + hash(k + 2) * 2, 2 + hash(k + 2) * 2, 'rgba(255,255,255,0.85)');
      }
    }
    if (T.fireflies) {
      for (let k = 0; k < 18; k++) {
        const x = ((hash(k) * 1600 - cam * 0.8 + Math.sin(clock * 0.7 + k) * 40) % W + W) % W;
        const y = 200 + hash(k + 4) * 250 + Math.cos(clock + k) * 20;
        const a = 0.5 + 0.5 * Math.sin(clock * 3 + k * 2);
        ellipse(x, y, 7, 7, `rgba(220,255,120,${0.15 * a})`);
        ellipse(x, y, 2, 2, `rgba(240,255,170,${a})`);
      }
    }
    if (T.embers) {
      for (let k = 0; k < 30; k++) {
        const x = ((hash(k) * W + Math.sin(clock + k) * 30 - cam * 0.7) % W + W) % W;
        const y = H - ((hash(k + 9) * H + clock * (25 + hash(k) * 30)) % H);
        ellipse(x, y, 2, 2, `rgba(255,${120 + hash(k) * 100},40,${0.5 + 0.5 * hash(k + 3)})`);
      }
    }
  }

  function drawGround(clock) {
    const L = lvl();
    const T = theme();
    for (const s of L.solids) {
      if (s.x + s.w < cam - 20 || s.x > cam + W + 20) continue;
      const x0 = Math.max(s.x, cam - 20);
      const x1 = Math.min(s.x + s.w, cam + W + 20);
      ctx.fillStyle = T.dirt;
      ctx.fillRect(x0, s.y, x1 - x0, H - s.y + 10);
      for (let x = Math.floor(x0 / 40) * 40; x < x1; x += 40) {
        for (let r = 0; r < 4; r++) {
          const hx = x + hash(x + r * 7) * 40;
          const hy = s.y + 30 + r * 22 + hash(x * 3 + r) * 12;
          if (hx > x0 && hx < x1 && hy < H) ellipse(hx, hy, 5, 3, T.stone);
        }
      }
      // Grass (or snow, or bare rock) on top.
      ctx.fillStyle = T.top;
      ctx.fillRect(x0, s.y - 2, x1 - x0, 14);
      ctx.fillStyle = T.topLight;
      ctx.fillRect(x0, s.y - 4, x1 - x0, 7);
      for (let x = Math.floor(x0 / 18) * 18; x < x1; x += 18) {
        if (T.lava) {
          // Glowing cracks.
          if (hash(x) > 0.8) { ctx.fillStyle = `rgba(255,110,30,${0.5 + 0.3 * Math.sin(clock * 2 + x)})`; ctx.fillRect(x, s.y + 6, 10, 2); }
          continue;
        }
        if (T.caps) {
          ellipse(x + 9, s.y - 3, 10, 4 + hash(x) * 2, T.topLight);
          continue;
        }
        const hgt = 4 + hash(x) * 6;
        ctx.fillStyle = T.topLight;
        ctx.beginPath();
        ctx.moveTo(x, s.y - 2);
        ctx.lineTo(x + 4, s.y - 2 - hgt);
        ctx.lineTo(x + 8, s.y - 2);
        ctx.fill();
        if (T.flowers && hash(x + 0.5) > 0.93 && x > s.x + 10 && x < s.x + s.w - 10) {
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
        if (T.trees && hash(x + 0.7) > 0.95 && x > s.x + 10 && x < s.x + s.w - 10) {
          // Little glowing toadstools.
          ctx.fillStyle = '#e8e0c8';
          ctx.fillRect(x + 3, s.y - 10, 3, 8);
          ellipse(x + 4.5, s.y - 10, 7, 4, `rgba(140,230,255,${0.7 + 0.3 * Math.sin(clock * 2 + x)})`);
        }
      }
      // Dark edges where the ground drops away (icicles on the Peaks).
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      if (s.x >= x0) ctx.fillRect(s.x, s.y, 6, H - s.y);
      if (s.x + s.w <= x1) ctx.fillRect(s.x + s.w - 6, s.y, 6, H - s.y);
    }
    L.platforms.forEach((p, k) => {
      if (p.x + p.w < cam - 20 || p.x > cam + W + 20) return;
      if (p.hidden && !(snap && snap.revealed.includes(k))) return;
      if (p.hidden) {
        // A hidden step, found: a little cloud, sparkling.
        for (let x = p.x + 12; x < p.x + p.w; x += 22) ellipse(x, p.y + 6 + Math.sin(x) * 2, 18, 11, 'rgba(255,255,255,0.92)');
        const t = performance.now() / 1000;
        for (let n = 0; n < 3; n++) drawStar(p.x + ((t * 30 + n * 37) % p.w), p.y - 4 + Math.sin(t * 3 + n) * 4, 3, '#fff6c8');
        return;
      }
      ctx.fillStyle = T.plank;
      ctx.fillRect(p.x, p.y, p.w, 16);
      ctx.fillStyle = T.plankDark;
      for (let x = p.x + 30; x < p.x + p.w; x += 30) ctx.fillRect(x, p.y + 2, 2, 14);
      ctx.fillRect(p.x, p.y + 14, p.w, 3);
      ctx.fillStyle = T.topLight;
      ctx.fillRect(p.x - 2, p.y - 3, p.w + 4, 6);
      if (T.caps) {
        ctx.fillStyle = '#d6ecff';
        for (let x = p.x + 6; x < p.x + p.w - 4; x += 14) {
          ctx.beginPath();
          ctx.moveTo(x, p.y + 17);
          ctx.lineTo(x + 4, p.y + 28 + hash(x) * 8);
          ctx.lineTo(x + 8, p.y + 17);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = 'rgba(40,20,10,0.5)';
        ctx.fillRect(p.x + 8, p.y + 17, 6, 22);
        ctx.fillRect(p.x + p.w - 14, p.y + 17, 6, 22);
      }
    });
    drawSigns();
  }

  function drawSigns() {
    const L = lvl();
    const B = A.BOSSES[L.boss];
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
    sign(330, A.GROUND_Y, `To ${B.name}’s ring`);
    sign(L.arenaX - 220, A.GROUND_Y, 'Boss ahead!');
  }

  function drawArenaBack(clock) {
    const L = lvl();
    const ax = L.arenaX;
    if (cam + W < ax - 40) return;
    const fy = A.GROUND_Y;
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
    ctx.fillStyle = '#8a1f1f';
    ctx.fillRect(ax + 310, 60, 380, 54);
    ctx.fillStyle = '#ffd23f';
    ctx.font = '32px Bangers, Anton, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${A.BOSSES[L.boss].name.toUpperCase()}’S RING`, ax + 500, 98);
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

  // ---- Secrets -------------------------------------------------------------

  const ROOM_LOOK = {
    bunny: { wall: '#4a3020', wall2: '#5e3d28', floor: '#7a4a24', top: '#3f9b3a', glow: 'rgba(255,200,120,0.18)', say: 'Shh! This is my secret burrow.' },
    ghost: { wall: '#140a28', wall2: '#22123e', floor: '#2a1d3e', top: '#7a4aff', glow: 'rgba(180,120,255,0.15)', say: 'Wooo… welcome to the ghost disco!' },
    penguin: { wall: '#5a86b0', wall2: '#7aa4cc', floor: '#9cc2e2', top: '#e9f2fb', glow: 'rgba(255,255,255,0.15)', say: 'Ahh, the hot tub. Don’t tell the yeti.' },
    dragon: { wall: '#2a1210', wall2: '#3a1a14', floor: '#463632', top: '#c9971a', glow: 'rgba(255,170,60,0.18)', say: 'Zzz…' },
  };
  const roomNow = () => (snap && snap.inRoom !== null && snap.inRoom !== undefined ? lvl().rooms[snap.inRoom] : null);

  /** Inside a secret room: its own walls instead of the sky. */
  function drawRoomBack(room, clock) {
    const R = ROOM_LOOK[room.npc];
    ctx.fillStyle = R.wall;
    ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 40; k++) {
      const x = hash(k) * W;
      const y = hash(k + 20) * 420;
      ellipse(x, y, 30 + hash(k + 3) * 50, 18 + hash(k + 5) * 30, R.wall2);
    }
    if (room.npc === 'bunny') {
      // Roots hanging down, and lanterns.
      ctx.strokeStyle = '#2f1e12';
      ctx.lineWidth = 4;
      for (let x = 40; x < W; x += 90) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + 20, 40 + hash(x) * 40, x + 6, 70 + hash(x + 1) * 60);
        ctx.stroke();
      }
      for (const x of [200, 500, 800]) {
        ctx.strokeStyle = '#2f1e12';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 90);
        ctx.stroke();
        ellipse(x, 100, 40, 40, R.glow);
        ellipse(x, 100, 10, 13, '#ffcf6a');
      }
    } else if (room.npc === 'ghost') {
      // A disco ball, and coloured lights sweeping about.
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(500, 0);
      ctx.lineTo(500, 60);
      ctx.stroke();
      ellipse(500, 90, 30, 30, '#cfd6e0');
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + clock;
        ellipse(500 + Math.cos(a) * 18, 90 + Math.sin(a) * 18, 4, 4, k % 2 ? '#ffffff' : '#9aa4b0');
      }
      ['255,80,160', '80,200,255', '255,220,80', '140,255,120'].forEach((c, k) => {
        const a = clock * (0.8 + k * 0.2) + k * 1.6;
        ctx.fillStyle = `rgba(${c},0.12)`;
        ctx.beginPath();
        ctx.moveTo(500, 90);
        ctx.lineTo(500 + Math.cos(a) * 700 - 80, 560);
        ctx.lineTo(500 + Math.cos(a) * 700 + 80, 560);
        ctx.fill();
      });
    } else if (room.npc === 'penguin') {
      for (let x = 20; x < W; x += 50) {
        ctx.fillStyle = '#d6ecff';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 10, 30 + hash(x) * 40);
        ctx.lineTo(x + 20, 0);
        ctx.fill();
      }
    } else if (room.npc === 'dragon') {
      for (let k = 0; k < 12; k++) {
        const x = hash(k + 40) * W;
        const y = 100 + hash(k + 41) * 280;
        ellipse(x, y, 4, 4, `rgba(255,200,80,${0.4 + 0.4 * Math.sin(clock * 2 + k)})`);
      }
    }
  }

  /** The room's resident, and what it has to say when you come close. */
  function drawRoomNpc(room, clock) {
    const R = ROOM_LOOK[room.npc];
    const x = room.x0 + 760;
    const y = A.GROUND_Y;
    ctx.save();
    ctx.translate(x, y);
    if (room.npc === 'bunny') {
      const hop = Math.abs(Math.sin(clock * 3)) * 8;
      ctx.translate(0, -hop);
      ellipse(0, -22, 20, 22, '#f2ece4');
      ellipse(-8, -58, 6, 20, '#f2ece4', -0.2);
      ellipse(8, -58, 6, 20, '#f2ece4', 0.2);
      ellipse(-8, -58, 3, 14, '#ffb8c8', -0.2);
      ellipse(8, -58, 3, 14, '#ffb8c8', 0.2);
      ellipse(0, -38, 15, 13, '#f2ece4');
      eye(-6, -40, 3.5, -1);
      eye(6, -40, 3.5, -1);
      ellipse(0, -33, 3, 2, '#ff8aa8');
      glove(-18, -22, 0.8, '#e03a3e');
      glove(16, -24, -0.8, '#e03a3e');
    } else if (room.npc === 'ghost') {
      for (let k = 0; k < 3; k++) {
        const gx = (k - 1) * 70 + Math.sin(clock * 2 + k) * 14;
        const gy = -50 - Math.abs(Math.sin(clock * 4 + k * 2)) * 20;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#f4f0ff';
        ctx.beginPath();
        ctx.arc(gx, gy, 20, Math.PI, 0);
        for (let j = 0; j <= 4; j++) ctx.lineTo(gx + 20 - j * 10, gy + 24 + (j % 2 ? -6 : 0));
        ctx.fill();
        ctx.globalAlpha = 1;
        ellipse(gx - 7, gy - 2, 3, 4, '#222');
        ellipse(gx + 7, gy - 2, 3, 4, '#222');
        ellipse(gx, gy + 8, 4, 3 + Math.sin(clock * 6 + k), '#222');
      }
    } else if (room.npc === 'penguin') {
      // A steaming hot tub, and a penguin taking it easy.
      ellipse(0, -10, 80, 22, '#8a5a2a');
      ellipse(0, -16, 70, 14, '#5ac8e8');
      for (let k = 0; k < 4; k++) {
        const u = (clock * 0.5 + k / 4) % 1;
        ellipse(-40 + k * 26, -30 - u * 60, 10 + u * 10, 6 + u * 6, `rgba(255,255,255,${0.5 * (1 - u)})`);
      }
      ellipse(10, -30, 16, 18, '#1f2430');
      ellipse(14, -28, 10, 12, '#ffffff');
      eye(18, -38, 3, 1);
      ctx.fillStyle = '#ff9a2a';
      ctx.beginPath();
      ctx.moveTo(24, -36);
      ctx.lineTo(32, -34);
      ctx.lineTo(24, -32);
      ctx.fill();
      ctx.fillStyle = '#ff5a8a';
      ctx.fillRect(-30, -40, 4, 18);
      ellipse(-28, -42, 6, 4, '#ffd23f');
    } else if (room.npc === 'dragon') {
      // A baby dragon asleep on a pile of gold.
      for (let k = 0; k < 30; k++) ellipse(-70 + hash(k) * 140, -4 - hash(k + 9) * 26 * (1 - Math.abs(hash(k) - 0.5)), 7, 4, k % 3 ? '#ffd23f' : '#e0a400');
      const breathe = Math.sin(clock * 2) * 2;
      ellipse(0, -36 - breathe, 30, 18 + breathe, '#3fae4a');
      ellipse(28, -44, 14, 11, '#3fae4a');
      ctx.strokeStyle = '#2b7a34';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, -46);
      ctx.lineTo(30, -46);
      ctx.stroke();
      ctx.fillStyle = '#2b7a34';
      ctx.beginPath();
      ctx.moveTo(-10, -50);
      ctx.lineTo(-24, -70 - breathe);
      ctx.lineTo(6, -52);
      ctx.fill();
    }
    ctx.restore();
    // A speech bubble when someone's close.
    const close = snap.players.some((p) => !p.out && Math.abs(p.x - x) < 220);
    if (close) {
      const text = R.say;
      ctx.font = '16px Barlow, system-ui, sans-serif';
      const w = ctx.measureText(text).width + 24;
      const bx = x - w / 2;
      const by = y - 150;
      ctx.fillStyle = '#ffffff';
      roundRect(bx, by, w, 34, 10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 8, by + 34);
      ctx.lineTo(x, by + 46);
      ctx.lineTo(x + 8, by + 34);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, by + 23);
    }
  }

  /** Cracked rocks, and the doors (open or hidden behind a rock). */
  function drawDoorsAndRocks(clock) {
    const L = lvl();
    for (const d of L.doors) {
      if (d.x < cam - 100 || d.x > cam + W + 100) continue;
      const open = d.rock === null || d.rock === undefined || snap.broken.includes(d.rock);
      drawDoor(d, open, clock);
    }
    for (const r of L.rocks) {
      if (r.x < cam - 100 || r.x > cam + W + 100 || snap.broken.includes(r.id)) continue;
      drawRock(r, (snap.rockHits && snap.rockHits[r.id]) || 0);
    }
  }

  function drawDoor(d, open, clock) {
    const { x, y } = d;
    if (d.kind === 'tree') {
      // A big old tree with a dark hollow at the bottom (eyes blink in it).
      ctx.fillStyle = '#3a2a1e';
      ctx.fillRect(x - 34, y - 220, 68, 220);
      ellipse(x, y - 250, 80, 60, '#1c3324');
      ellipse(x - 50, y - 210, 50, 36, '#1c3324');
      ellipse(x + 50, y - 214, 50, 36, '#1c3324');
      ellipse(x, y - 34, 20, 34, '#120a06');
      if (Math.sin(clock * 0.9) > -0.85) {
        ellipse(x - 6, y - 44, 3, 3, '#ffd23f');
        ellipse(x + 6, y - 44, 3, 3, '#ffd23f');
      }
    } else if (d.kind === 'exit') {
      ctx.fillStyle = '#6a4424';
      roundRect(x - 26, y - 76, 52, 76, 18);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ellipse(x + 14, y - 38, 4, 4, '#ffd23f');
      ctx.font = '14px Bangers, Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WAY OUT', x, y - 84);
    } else if (open) {
      // A hole in the ground: a burrow, an ice cave or a lava tube.
      const c = d.kind === 'cave' ? '#2a4a6a' : d.kind === 'tube' ? '#2a0e08' : '#1a0e06';
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(x, y, 32, 46, 0, Math.PI, 0);
      ctx.fill();
      if (d.kind === 'tube') ellipse(x, y - 4, 22, 8, `rgba(255,120,30,${0.4 + 0.2 * Math.sin(clock * 3)})`);
    }
    // When it's open and someone's standing at it: press down.
    if (open && snap.players.some((p) => !p.out && Math.abs(p.x - x) < 40 && Math.abs(p.y - y) < 4)) {
      const bob = Math.sin(clock * 6) * 4;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 150 + bob);
      ctx.lineTo(x + 10, y - 150 + bob);
      ctx.lineTo(x, y - 136 + bob);
      ctx.fill();
    }
  }

  function drawRock(r, hits) {
    const ice = r.kind === 'ice';
    const { x, y } = r;
    ctx.fillStyle = ice ? '#bfe0f6' : '#8a847b';
    ctx.beginPath();
    ctx.moveTo(x - 34, y);
    ctx.lineTo(x - 30, y - 40);
    ctx.lineTo(x - 12, y - 58);
    ctx.lineTo(x + 14, y - 56);
    ctx.lineTo(x + 32, y - 36);
    ctx.lineTo(x + 34, y);
    ctx.fill();
    ellipse(x - 12, y - 42, 8, 5, ice ? 'rgba(255,255,255,0.7)' : '#a49e94');
    // Cracks: one to start with, more with every hit.
    ctx.strokeStyle = ice ? '#7aa8cc' : '#4e4a44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 56);
    ctx.lineTo(x + 2, y - 40);
    ctx.lineTo(x - 6, y - 28);
    if (hits >= 1) { ctx.moveTo(x + 2, y - 40); ctx.lineTo(x + 18, y - 30); ctx.lineTo(x + 22, y - 14); }
    if (hits >= 2) { ctx.moveTo(x - 6, y - 28); ctx.lineTo(x - 20, y - 16); ctx.moveTo(x - 6, y - 28); ctx.lineTo(x, y - 6); }
    ctx.stroke();
  }

  function drawGoldenGlove(x, y, clock) {
    const bob = Math.sin(clock * 3) * 5;
    ellipse(x, y + bob, 30 + Math.sin(clock * 5) * 3, 30 + Math.sin(clock * 5) * 3, 'rgba(255,210,63,0.3)');
    glove(x, y + bob, 1.4, '#ffd23f');
    for (let k = 0; k < 3; k++) {
      const a = clock * 2 + (k * Math.PI * 2) / 3;
      drawStar(x + Math.cos(a) * 26, y + bob + Math.sin(a) * 26, 4, '#fff6c8');
    }
  }

  // ---- Pickups ---------------------------------------------------------------

  function drawPickup(pk, clock) {
    if (pk.type === 'golden') { drawGoldenGlove(pk.x, pk.y, clock); return; }
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
    const boss = A.CREATURES[e.type].kind === 'boss';
    const sz = A.sizeOf(e);
    ctx.save();
    ctx.translate(x, y);
    if (e.dead && !boss) {
      ctx.globalAlpha = clamp01(1 - e.t / 50);
      ctx.translate(0, -15);
      ctx.rotate(e.t * 0.25 * (e.facing || 1));
      ctx.translate(0, 15);
    }
    if (e.shrunk > 0) ctx.scale(0.55, 0.55);
    if (e.frozen > 0 || e.asleep) ctx.translate(0, 0);
    const f = e.facing || -1;
    const flash = flashing(e);
    switch (e.type) {
      case 'slime': drawSlime(e, f, clock, '#5ad35a', '#2f8f34'); break;
      case 'goo': drawSlime(e, f, clock, '#a65ad8', '#6a2f94'); break;
      case 'iceblob': drawSlime(e, f, clock, '#a8dcff', '#5aa0d0', true); break;
      case 'lavablob': drawSlime(e, f, clock, '#ff7a2a', '#b33a10', false, true); break;
      case 'bee': drawBee(e, f, clock); break;
      case 'bat': drawWinged(e, f, clock, 'bat', flash); break;
      case 'snowbird': drawWinged(e, f, clock, 'snowbird', flash); break;
      case 'imp': drawWinged(e, f, clock, 'imp', flash); break;
      case 'hedgehog': drawHedgehog(e, f, clock, x); break;
      case 'snail': drawSnail(e, f, clock, x, flash); break;
      case 'penguin': drawPenguin(e, f, clock, flash); break;
      case 'crab': drawCrab(e, f, clock, flash); break;
      case 'frog': drawFrog(e, f, clock); break;
      case 'mushroom': drawMushroom(e, f, clock, flash); break;
      case 'snowman': drawSnowman(e, f, clock, flash); break;
      case 'lizard': drawLizard(e, f, clock, flash); break;
      case 'rhino': drawRhino(e, f, clock); break;
      case 'owl': drawOwl(e, f, clock, flash); break;
      case 'yeti': drawBrute(e, f, clock, flash, 'yeti'); break;
      case 'gorilla': drawBrute(e, f, clock, flash, 'gorilla'); break;
    }
    ctx.restore();
    if (!e.dead) drawStatus(e, x, y, sz, clock);
    // A health bar once it's been hit.
    if (!e.dead && !boss && e.hp < e.maxHp) {
      const bw = sz.hw * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - bw / 2, y - sz.h - 14, bw, 5);
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(x - bw / 2, y - sz.h - 14, bw * (e.hp / e.maxHp), 5);
    }
  }

  /** What the cheat codes have done to it: ice, sleep, honey, fire... */
  function drawStatus(e, x, y, sz, clock) {
    const top = y - sz.h;
    if (e.frozen > 0) {
      ctx.fillStyle = 'rgba(170,225,255,0.45)';
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      roundRect(x - sz.hw - 8, top - 10, sz.hw * 2 + 16, sz.h + 12, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(x - sz.hw - 2, top - 4, 5, sz.h * 0.5);
    }
    if (e.asleep) {
      ctx.font = '18px Bangers, Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#cfe0ff';
      for (let k = 0; k < 3; k++) {
        const u = (clock * 0.8 + k / 3) % 1;
        ctx.globalAlpha = 1 - u;
        ctx.fillText('z', x + 10 + u * 20, top - 6 - u * 30);
      }
      ctx.globalAlpha = 1;
    }
    if (e.sticky > 0) {
      ctx.fillStyle = 'rgba(230,160,20,0.8)';
      ctx.beginPath();
      ctx.ellipse(x, top + 4, sz.hw * 0.9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let k = -1; k <= 1; k++) {
        const d = ((clock * 0.6 + k * 0.3) % 1) * 18;
        ellipse(x + k * sz.hw * 0.5, top + 8 + d, 3, 4, 'rgba(230,160,20,0.8)');
      }
    }
    if (e.burning > 0) {
      for (let k = 0; k < 3; k++) {
        const fx = x + (k - 1) * sz.hw * 0.6;
        const fh = 14 + Math.sin(clock * 20 + k * 2) * 5;
        ellipse(fx, top - fh / 2 + 4, 6, fh / 2, 'rgba(255,120,20,0.85)');
        ellipse(fx, top - fh / 4 + 4, 3, fh / 4, 'rgba(255,230,90,0.95)');
      }
    }
    if (e.poison) {
      for (let k = 0; k < 3; k++) {
        const u = (clock * 0.7 + k / 3) % 1;
        ellipse(x + Math.sin(k * 4 + clock * 2) * sz.hw * 0.6, top - u * 26, 3 + u * 2, 3 + u * 2, `rgba(120,220,80,${0.8 * (1 - u)})`);
      }
    }
    if (e.confused > 0) {
      // A face full of pie.
      const fx = x + (e.facing || -1) * sz.hw * 0.4;
      const fy = y - sz.h * 0.65;
      const c = e.pie === 'raspberry' ? '#d8325a' : '#5a4ad8';
      ellipse(fx, fy, sz.hw * 0.55, sz.h * 0.22, '#fff6e8');
      ellipse(fx + 2, fy + 2, sz.hw * 0.35, sz.h * 0.13, c);
      for (let k = 0; k < 3; k++) {
        const a = clock * 4 + (k * Math.PI * 2) / 3;
        drawStar(x + Math.cos(a) * sz.hw, top - 8 + Math.sin(a) * 5, 5, '#ffd23f');
      }
    }
    if (e.cuddled > 0) {
      for (let k = 0; k < 3; k++) {
        const u = (clock + k / 3) % 1;
        heartShape(x + (k - 1) * 14, top - 6 - u * 24, 6, `rgba(255,90,150,${1 - u})`);
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const airborne = (e) => surf(e.x, e.y) > e.y + 1;

  function drawSlime(e, f, clock, color, outline, ice, lava) {
    const air = airborne(e) && !e.dead;
    const wob = Math.sin(clock * 7 + e.id) * 0.06;
    const sx = air ? 0.86 : 1 + wob;
    const sy = air ? 1.18 : 1 - wob;
    const body = flashing(e) ? '#ffffff' : color;
    ellipse(0, 2, 22, 5, 'rgba(0,0,0,0.25)');
    if (lava) ellipse(0, -16, 32, 26, `rgba(255,140,40,${0.15 + 0.1 * Math.sin(clock * 5)})`);
    ctx.save();
    ctx.scale(sx, sy);
    ctx.fillStyle = body;
    ctx.beginPath();
    if (ice) {
      // A wobbly ice cube.
      ctx.moveTo(-22, 0);
      ctx.lineTo(-22, -30);
      ctx.quadraticCurveTo(-22, -36, -16, -36);
      ctx.lineTo(16, -36);
      ctx.quadraticCurveTo(22, -36, 22, -30);
      ctx.lineTo(22, 0);
    } else {
      ctx.moveTo(-24, 0);
      ctx.bezierCurveTo(-26, -24, -12, -36, 0, -36);
      ctx.bezierCurveTo(12, -36, 26, -24, 24, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ellipse(-8, -26, 7, 4, 'rgba(255,255,255,0.45)', -0.5);
    if (lava) {
      ellipse(10, -8, 4, 3, '#ffd23f');
      ellipse(-12, -12, 3, 2, '#ffd23f');
    }
    eye(f * 4 - 7, -20, 5.5, f);
    eye(f * 4 + 7, -20, 5.5, f);
    ctx.strokeStyle = outline;
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

  /** Bats, snowbirds and imps: flyers like the bee, different wings. */
  function drawWinged(e, f, clock, kind, flash) {
    const jitter = e.state === 'aim' ? Math.sin(clock * 80) * 2 : 0;
    ctx.translate(jitter, -14);
    if (e.state === 'dive') ctx.rotate(0.5 * f);
    const flap = Math.sin(clock * (kind === 'bat' ? 30 : 22));
    const body = flash ? '#ffffff' : kind === 'bat' ? '#4a3560' : kind === 'snowbird' ? '#eaf4ff' : '#d8352a';
    const wing = kind === 'bat' ? '#352448' : kind === 'snowbird' ? '#9cc8ee' : '#8a1a14';
    ctx.fillStyle = wing;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 6, -4);
      if (kind === 'bat' || kind === 'imp') {
        ctx.lineTo(s * 30, -14 - flap * 14);
        ctx.lineTo(s * 24, -2 - flap * 6);
        ctx.lineTo(s * 18, 2 - flap * 4);
        ctx.lineTo(s * 12, 0);
      } else {
        ctx.quadraticCurveTo(s * 26, -18 - flap * 14, s * 30, -4 - flap * 10);
        ctx.quadraticCurveTo(s * 18, 2, s * 6, 4);
      }
      ctx.fill();
    }
    ellipse(0, 0, 15, 13, body);
    if (kind === 'bat') {
      ctx.fillStyle = body;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 4, -10);
        ctx.lineTo(s * 9, -22);
        ctx.lineTo(s * 12, -8);
        ctx.fill();
      }
      ellipse(f * 5 - 3, -2, 3, 3, '#ff4a4a');
      ellipse(f * 5 + 4, -2, 3, 3, '#ff4a4a');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(f * 4 - 3, 5, 2, 4);
      ctx.fillRect(f * 4 + 2, 5, 2, 4);
    } else if (kind === 'snowbird') {
      ellipse(f * 4, 4, 9, 7, '#ffffff');
      ctx.fillStyle = '#ff9a2a';
      ctx.beginPath();
      ctx.moveTo(f * 13, -3);
      ctx.lineTo(f * 22, 0);
      ctx.lineTo(f * 13, 3);
      ctx.fill();
      eye(f * 7, -5, 3.5, f);
      ctx.fillStyle = '#3a6ea8';
      ctx.fillRect(-10, -14, 20, 4);
    } else {
      // An imp: horns, a pointy tail and a mischievous grin.
      ctx.fillStyle = '#ffd23f';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 5, -10);
        ctx.lineTo(s * 9, -22);
        ctx.lineTo(s * 11, -9);
        ctx.fill();
      }
      ctx.strokeStyle = body;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-f * 12, 6);
      ctx.quadraticCurveTo(-f * 26, 14 + Math.sin(clock * 6) * 4, -f * 30, 4);
      ctx.stroke();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-f * 30, 0);
      ctx.lineTo(-f * 36, 4);
      ctx.lineTo(-f * 28, 8);
      ctx.fill();
      eye(f * 5 - 3, -3, 3.5, f);
      eye(f * 5 + 5, -3, 3.5, f);
      ctx.strokeStyle = '#3a0a08';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f * 4, 3, 5, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ellipse(0, 0, 20, 18, `rgba(255,140,40,${0.12 + 0.08 * Math.sin(clock * 8)})`);
    }
    if (e.state === 'aim') {
      ctx.font = '20px Bangers, Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff5a3a';
      ctx.fillText('!', 0, -26);
    }
  }

  function curledUp(e) {
    return e.state === 'curl' || e.state === 'roll' || (e.state === 'uncurl' && e.t < 20);
  }

  function drawSnail(e, f, clock, x, flash) {
    ellipse(0, 2, 26, 5, 'rgba(0,0,0,0.25)');
    const shell = (cx, cy, r, spin) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spin);
      ellipse(0, 0, r, r, flash ? '#ffffff' : '#c9772c');
      ctx.strokeStyle = '#7a3e12';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 4; a += 0.2) {
        const rr = r * (1 - a / (Math.PI * 4.4));
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.stroke();
      ctx.restore();
    };
    if (curledUp(e)) {
      shell(0, -20, 20, e.state === 'roll' ? (x / 20) * f : 0);
      return;
    }
    const creep = Math.sin(clock * 6 + e.id) * 2;
    ctx.fillStyle = flash ? '#ffffff' : '#c8d26a';
    ctx.beginPath();
    ctx.moveTo(-f * 26, 0);
    ctx.quadraticCurveTo(0, -6 + creep, f * 26, -4);
    ctx.quadraticCurveTo(f * 32, -20, f * 22, -24);
    ctx.lineTo(f * 18, -6);
    ctx.lineTo(-f * 26, 0);
    ctx.fill();
    // Eye stalks.
    ctx.strokeStyle = '#a8b250';
    ctx.lineWidth = 3;
    for (const k of [0, 8]) {
      ctx.beginPath();
      ctx.moveTo(f * (22 + k * 0.3), -22);
      ctx.lineTo(f * (24 + k), -36 + Math.sin(clock * 4 + k) * 2);
      ctx.stroke();
      eye(f * (24 + k), -37 + Math.sin(clock * 4 + k) * 2, 3.5, f);
    }
    shell(-f * 4, -20, 17, 0);
  }

  function drawPenguin(e, f, clock, flash) {
    const black = flash ? '#ffffff' : '#1f2430';
    if (curledUp(e)) {
      // On its belly, sliding.
      ellipse(0, 2, 30, 5, 'rgba(0,0,0,0.25)');
      ellipse(0, -12, 30, 13, black);
      ellipse(0, -9, 24, 9, '#ffffff');
      ellipse(f * 26, -16, 9, 9, black);
      eye(f * 28, -18, 3, f);
      ctx.fillStyle = '#ff9a2a';
      ctx.beginPath();
      ctx.moveTo(f * 34, -16);
      ctx.lineTo(f * 42, -14);
      ctx.lineTo(f * 34, -12);
      ctx.fill();
      if (e.state === 'roll') for (let k = 0; k < 3; k++) ellipse(-f * (34 + k * 10), -2, 4 - k, 3 - k * 0.6, 'rgba(255,255,255,0.7)');
      return;
    }
    const waddle = e.state === 'walk' ? Math.sin(clock * 10 + e.id) * 0.12 : 0;
    ellipse(0, 2, 22, 5, 'rgba(0,0,0,0.25)');
    ctx.save();
    ctx.rotate(waddle);
    ellipse(-8, -2, 7, 4, '#ff9a2a');
    ellipse(8, -2, 7, 4, '#ff9a2a');
    ellipse(0, -22, 20, 22, black);
    ellipse(f * 3, -19, 14, 17, '#ffffff');
    ellipse(-f * 16, -22, 5, 14, black, -f * 0.3);
    eye(f * 6, -34, 4, f);
    ctx.fillStyle = '#ff9a2a';
    ctx.beginPath();
    ctx.moveTo(f * 12, -31);
    ctx.lineTo(f * 22, -28);
    ctx.lineTo(f * 12, -26);
    ctx.fill();
    ctx.restore();
  }

  function drawCrab(e, f, clock, flash) {
    const red = flash ? '#ffffff' : '#e0472c';
    const up = curledUp(e);
    ellipse(0, 2, 28, 5, 'rgba(0,0,0,0.25)');
    const scuttle = e.state === 'walk' || e.state === 'roll' ? Math.sin(clock * (e.state === 'roll' ? 30 : 14)) * 3 : 0;
    ctx.strokeStyle = '#a82a18';
    ctx.lineWidth = 3;
    for (let k = -2; k <= 2; k++) {
      if (!k) continue;
      ctx.beginPath();
      ctx.moveTo(k * 6, -8);
      ctx.lineTo(k * 12 + (k % 2 ? scuttle : -scuttle), 0);
      ctx.stroke();
    }
    ellipse(0, -14, 26, 13, red);
    // Claws: up and snapping when it's guarding.
    for (const s of [-1, 1]) {
      const cx = s * 30;
      const cy = up ? -40 : -22;
      ctx.strokeStyle = red;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(s * 18, -16);
      ctx.lineTo(cx, cy + 8);
      ctx.stroke();
      const snap = up ? Math.abs(Math.sin(clock * 12)) * 0.5 : 0.2;
      ctx.fillStyle = red;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, -Math.PI / 2 - snap, Math.PI * 1.5 - 0.6 + snap);
      ctx.lineTo(cx, cy);
      ctx.fill();
    }
    ctx.strokeStyle = red;
    ctx.lineWidth = 2;
    for (const k of [-6, 6]) {
      ctx.beginPath();
      ctx.moveTo(k, -24);
      ctx.lineTo(k, -32);
      ctx.stroke();
      eye(k, -34, 3.5, f);
    }
  }

  function drawMushroom(e, f, clock, flash) {
    const puff = e.state === 'spit' && e.t < 24 ? Math.sin((e.t / 24) * Math.PI) : 0;
    ellipse(0, 2, 20, 5, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = flash ? '#ffffff' : '#f0e2c4';
    ctx.fillRect(-10, -24, 20, 24);
    eye(f * 2 - 5, -14, 3.5, f);
    eye(f * 2 + 5, -14, 3.5, f);
    ctx.save();
    ctx.translate(0, -24);
    ctx.scale(1 + puff * 0.15, 1 - puff * 0.1);
    ctx.fillStyle = flash ? '#ffffff' : '#7a3ac8';
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 18, 0, Math.PI, 0);
    ctx.fill();
    for (const [sx, sy, r] of [[-12, -8, 4], [4, -13, 5], [15, -5, 3], [-3, -4, 3]]) ellipse(sx, sy, r, r, '#f6eaff');
    ctx.restore();
  }

  function drawSnowman(e, f, clock, flash) {
    const white = flash ? '#ffffff' : '#f4f8fc';
    ellipse(0, 2, 24, 5, 'rgba(0,0,0,0.2)');
    ellipse(0, -14, 22, 16, white);
    ellipse(0, -38, 16, 13, white);
    ellipse(0, -56, 12, 11, white);
    ctx.fillStyle = '#1f2430';
    ctx.fillRect(-11, -70, 22, 4);
    ctx.fillRect(-7, -86, 14, 16);
    ellipse(f * 3 - 4, -58, 2, 2, '#1f2430');
    ellipse(f * 3 + 4, -58, 2, 2, '#1f2430');
    ctx.fillStyle = '#ff8a1f';
    ctx.beginPath();
    ctx.moveTo(f * 8, -56);
    ctx.lineTo(f * 20, -54);
    ctx.lineTo(f * 8, -52);
    ctx.fill();
    for (const y of [-42, -34]) ellipse(f * 2, y, 2, 2, '#1f2430');
    // Stick arms: the front one winds up to throw.
    const wind = e.state === 'spit' && e.t < 18 ? -0.9 : 0.3;
    ctx.strokeStyle = '#6a4424';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-f * 14, -40);
    ctx.lineTo(-f * 32, -50);
    ctx.moveTo(f * 14, -40);
    ctx.lineTo(f * 14 + Math.cos(wind) * f * 20, -40 + Math.sin(wind) * 20);
    ctx.stroke();
    if (e.state === 'spit' && e.t < 18) ellipse(f * 14 + Math.cos(wind) * f * 22, -40 + Math.sin(wind) * 22, 6, 6, '#ffffff');
  }

  function drawLizard(e, f, clock, flash) {
    const body = flash ? '#ffffff' : '#e8701c';
    const air = airborne(e) && !e.dead;
    ellipse(0, 2, 26, 5, 'rgba(0,0,0,0.25)');
    ctx.strokeStyle = body;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-f * 16, -10);
    ctx.quadraticCurveTo(-f * 36, -6 + Math.sin(clock * 5) * 4, -f * 44, -16);
    ctx.stroke();
    const step = e.state === 'idle' && !air ? 0 : Math.sin(clock * 12) * 4;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-f * 10, -8);
    ctx.lineTo(-f * 14 + step, 0);
    ctx.moveTo(f * 10, -8);
    ctx.lineTo(f * 14 - step, 0);
    ctx.stroke();
    ellipse(0, -14, 22, 10, body);
    ctx.fillStyle = '#ffcf4a';
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(k * 7 - 3, -22);
      ctx.lineTo(k * 7, -30);
      ctx.lineTo(k * 7 + 3, -22);
      ctx.fill();
    }
    ellipse(f * 22, -18, 12, 9, body);
    eye(f * 22, -22, 4, f);
    if (e.state === 'spit' && e.t < 24) {
      ellipse(f * 32, -16, 6, 4 * clamp01(e.t / 8), '#7a1a0a');
      ellipse(f * 38, -16, 5 + Math.sin(clock * 30) * 2, 4, 'rgba(255,170,40,0.8)');
    }
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
    if (throwing) drawBoulder(f * 5, -160, 26, e.t * 0.1, 'boulder');
    ctx.restore();
  }

  // ---- The other bosses ------------------------------------------------------------

  function drawOwl(e, f, clock, flash) {
    const st = e.state;
    const brown = flash ? '#ffffff' : e.angry ? mix('#7a5232', '#c23a2a', 0.3 + 0.1 * Math.sin(clock * 8)) : '#7a5232';
    const grounded = st === 'dizzy' || st === 'dead';
    if (grounded) ellipse(0, 4, 70, 10, 'rgba(0,0,0,0.3)');
    else {
      // Its shadow on the ground far below.
      ellipse(0, A.GROUND_Y - e.y + 4, 50, 8, `rgba(0,0,0,${0.25 * clamp01(1 - (A.GROUND_Y - e.y) / 400)})`);
    }
    ctx.save();
    if (st === 'dead') ctx.rotate(-f * Math.PI / 2 * clamp01(e.t / 20));
    if (st === 'dizzy') ctx.rotate(Math.sin(clock * 5) * 0.1);
    const diving = st === 'swoop' && e.t >= 50;
    const flap = grounded ? 0.2 : diving ? -1 : Math.sin(clock * 10);
    // Wings, with boxing gloves on the tips.
    for (const s of [-1, 1]) {
      ctx.fillStyle = mix('#7a5232', '#3a2416', 0.4);
      ctx.beginPath();
      ctx.moveTo(s * 30, -80);
      const tipX = s * (diving ? 40 : 95);
      const tipY = diving ? -150 : -90 - flap * 50;
      ctx.quadraticCurveTo(s * 70, -120 - flap * 20, tipX, tipY);
      ctx.quadraticCurveTo(s * 60, -50, s * 30, -40);
      ctx.fill();
      glove(tipX, tipY, 1.5 * s, s === f ? '#e03a3e' : '#9e1e24');
    }
    // Body and face.
    ellipse(0, -60, 50, 58, brown);
    ellipse(0, -48, 34, 40, '#e8d2a8');
    for (let k = 0; k < 4; k++) for (let j = -1; j <= 1; j++) {
      ctx.strokeStyle = '#b89870';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(j * 14, -62 + k * 14, 5, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    ellipse(0, -100, 46, 32, brown);
    // Ear tufts.
    ctx.fillStyle = brown;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 20, -124);
      ctx.lineTo(s * 44, -150);
      ctx.lineTo(s * 40, -116);
      ctx.fill();
    }
    ellipse(f * 6 - 17, -102, 17, 17, '#f6ead0');
    ellipse(f * 6 + 17, -102, 17, 17, '#f6ead0');
    if (st === 'dizzy') {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      for (const cx of [f * 6 - 17, f * 6 + 17]) {
        ctx.beginPath();
        ctx.moveTo(cx - 6, -108);
        ctx.lineTo(cx + 6, -96);
        ctx.moveTo(cx + 6, -108);
        ctx.lineTo(cx - 6, -96);
        ctx.stroke();
      }
    } else {
      ellipse(f * 6 - 17 + f * 4, -102, 10, 10, '#ffb81a');
      ellipse(f * 6 + 17 + f * 4, -102, 10, 10, '#ffb81a');
      ellipse(f * 6 - 17 + f * 5, -102, 5, 6, '#111');
      ellipse(f * 6 + 17 + f * 5, -102, 5, 6, '#111');
      ctx.strokeStyle = '#3a2416';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(f * 6 - 34, -124 + (e.angry ? 0 : 4));
      ctx.lineTo(f * 6 - 4, -116);
      ctx.moveTo(f * 6 + 34, -124 + (e.angry ? 0 : 4));
      ctx.lineTo(f * 6 + 4, -116);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8a01a';
    ctx.beginPath();
    ctx.moveTo(f * 6 - 6, -92);
    ctx.lineTo(f * 6 + 6, -92);
    ctx.lineTo(f * 6 + f * 4, -78);
    ctx.fill();
    // A cape: he's a count.
    ctx.fillStyle = '#5a1020';
    ctx.fillRect(-36, -76, 72, 8);
    // Talons.
    ctx.strokeStyle = '#e8a01a';
    ctx.lineWidth = 4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 16, -6);
      ctx.lineTo(s * 16, 0);
      ctx.moveTo(s * 10, 0);
      ctx.lineTo(s * 22, 0);
      ctx.stroke();
    }
    ctx.restore();
    if (st === 'dizzy' || st === 'dead') {
      for (let k = 0; k < 4; k++) {
        const a = clock * 4 + (k * Math.PI) / 2;
        drawStar((st === 'dead' ? -f * 100 : 0) + Math.cos(a) * 45, (st === 'dead' ? -40 : -150) + Math.sin(a) * 12, 9, '#ffd23f');
      }
    }
  }

  /** Frostbite the yeti and the Silverback: big, upright, gloved up. */
  function drawBrute(e, f, clock, flash, kind) {
    const yeti = kind === 'yeti';
    const angry = e.angry ? 0.3 + 0.1 * Math.sin(clock * 8) : 0;
    const furBase = yeti ? '#eef4fb' : '#3a3a40';
    const fur = flash ? '#ffffff' : e.angry ? mix(furBase, '#d0453a', angry) : furBase;
    const dark = yeti ? '#b8c8da' : '#24242a';
    const face = yeti ? '#7aa8d8' : '#6a5a52';
    const gloveC = yeti ? '#2f76e8' : '#f0b429';
    const gloveB = yeti ? '#1a4396' : '#a87a10';
    const st = e.state;
    ellipse(0, 4, 82, 12, 'rgba(0,0,0,0.3)');
    ctx.save();
    if (st === 'dead') ctx.rotate(-f * Math.PI / 2 * clamp01(e.t / 20));
    if (st === 'dizzy') ctx.rotate(Math.sin(clock * 5) * 0.08);
    const air = (st === 'stomp' || st === 'leap') && airborne(e);
    const run = st === 'charge' || st === 'idle' ? Math.sin(clock * (st === 'charge' ? 22 : 8)) : 0;
    const legY = air ? -10 : 0;
    ctx.fillStyle = dark;
    ctx.fillRect(-40 + run * 7 * f, -52 + legY, 30, 52);
    ctx.fillStyle = fur;
    ctx.fillRect(10 - run * 7 * f, -52 + legY, 30, 52);
    ellipse(-25 + run * 7 * f, -2 + legY, 20, 8, dark);
    ellipse(25 - run * 7 * f, -2 + legY, 20, 8, yeti ? '#c8d6e6' : '#18181c');
    ctx.save();
    ctx.translate(0, -54);
    ctx.rotate((st === 'charge' ? 0.35 : st === 'windup' ? 0.18 : 0) * f);
    // Trunks.
    ctx.fillStyle = yeti ? '#2463cc' : '#1a1a1a';
    ctx.fillRect(-48, -16, 96, 34);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-50, -22, 100, 10);
    // Furry body (bumpy edge).
    ctx.fillStyle = fur;
    ctx.strokeStyle = yeti ? '#8aa4c0' : '#18181c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const r = 56 + (k % 2 ? 5 : 0);
      ctx.lineTo(Math.cos(a) * r, -56 + Math.sin(a) * r * 0.9);
    }
    ctx.fill();
    ctx.stroke();
    if (!yeti) ellipse(-f * 10, -66, 40, 30, '#9a9aa4'); // the silver back
    ellipse(f * 12, -48, 30, 28, yeti ? '#dfe9f4' : '#4a4a52');
    // Arms and gloves.
    const beat = st === 'beat' ? Math.floor(e.t / 6) % 2 : -1;
    const holding = st === 'roll' && e.t < 30;
    const throwing = st === 'throw' && e.t % 30 < 22;
    const armsUp = holding || throwing || (st === 'leap' && air);
    const backG = armsUp ? { x: -f * 20, y: -150 } : beat === 0 ? { x: f * 14, y: -66 } : st === 'charge' ? { x: f * 50, y: -50 } : { x: -f * 38, y: -60 };
    const frontG = armsUp ? { x: f * 24, y: -152 } : beat === 1 ? { x: f * 20, y: -60 } : st === 'charge' ? { x: f * 74, y: -64 } : { x: f * 50, y: -42 };
    ctx.lineCap = 'round';
    ctx.strokeStyle = dark;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(-f * 28, -76);
    ctx.lineTo(backG.x, backG.y);
    ctx.stroke();
    glove(backG.x, backG.y, 1.9 * f, gloveB);
    // Head.
    const hx = f * 30;
    const hy = -112;
    ctx.fillStyle = fur;
    ctx.beginPath();
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const r = 36 + (k % 2 ? 4 : 0);
      ctx.lineTo(hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.85);
    }
    ctx.fill();
    ctx.strokeStyle = yeti ? '#8aa4c0' : '#18181c';
    ctx.lineWidth = 3;
    ctx.stroke();
    ellipse(hx + f * 12, hy + 6, 24, 20, face);
    if (yeti) {
      ctx.fillStyle = '#9aa8b8';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * 22, hy - 22);
        ctx.quadraticCurveTo(hx + s * 44, hy - 40, hx + s * 34, hy - 56);
        ctx.lineTo(hx + s * 30, hy - 26);
        ctx.fill();
      }
    } else {
      ellipse(hx + f * 22, hy + 12, 14, 10, '#7a6a62');
      ellipse(hx + f * 18, hy + 10, 2.5, 2, '#222');
      ellipse(hx + f * 26, hy + 10, 2.5, 2, '#222');
    }
    if (st === 'dizzy') {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx + f * 8 - 5, hy - 6);
      ctx.lineTo(hx + f * 8 + 5, hy + 4);
      ctx.moveTo(hx + f * 8 + 5, hy - 6);
      ctx.lineTo(hx + f * 8 - 5, hy + 4);
      ctx.stroke();
    } else {
      eye(hx + f * 8, hy - 2, 6, f);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(hx - f * 2, hy - (e.angry || st === 'charge' ? 14 : 10));
      ctx.lineTo(hx + f * 16, hy - 8);
      ctx.stroke();
    }
    // Mouth: a roar when beating his chest.
    if (st === 'beat' || st === 'roar') ellipse(hx + f * 16, hy + 16, 9, 7, '#5a1a1a');
    ctx.strokeStyle = fur;
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(f * 22, -74);
    ctx.lineTo(frontG.x, frontG.y);
    ctx.stroke();
    glove(frontG.x, frontG.y, 2 * f, gloveC);
    if (holding) {
      ellipse(f * 2, -182, 34, 34, '#ffffff');
      ellipse(f * 2 - 10, -192, 10, 7, '#e0ecf8');
    }
    if (throwing) drawBoulder(f * 2, -172, 24, e.t * 0.1, 'lavarock');
    ctx.restore();
    ctx.restore();
    if (st === 'dizzy' || st === 'dead') {
      for (let k = 0; k < 4; k++) {
        const a = clock * 4 + (k * Math.PI) / 2;
        drawStar((st === 'dead' ? -f * 110 : f * 30) + Math.cos(a) * 45, (st === 'dead' ? -40 : -185) + Math.sin(a) * 12, 9, '#ffd23f');
      }
    }
    if (e.angry && Math.sin(clock * 6) > 0.3 && st !== 'dead') ellipse(f * 70 + Math.sin(clock * 9) * 4, -170, 8, 6, 'rgba(255,255,255,0.6)');
  }

  // ---- Projectiles -------------------------------------------------------------

  function drawBoulder(x, y, r, spin, kind) {
    const lava = kind === 'lavarock';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    if (lava) ellipse(0, 0, r * 1.4, r * 1.4, 'rgba(255,120,30,0.25)');
    ctx.fillStyle = lava ? '#3a2a26' : '#8a847b';
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rr = r * (0.82 + hash(k) * 0.25);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.fill();
    if (lava) {
      ctx.strokeStyle = '#ff8a2a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.1);
      ctx.lineTo(0, r * 0.1);
      ctx.lineTo(r * 0.4, -r * 0.5);
      ctx.moveTo(0, r * 0.1);
      ctx.lineTo(r * 0.2, r * 0.6);
      ctx.stroke();
    } else {
      ellipse(-r * 0.3, -r * 0.3, r * 0.3, r * 0.2, '#a49e94');
      ellipse(r * 0.25, r * 0.2, r * 0.15, r * 0.12, '#6e6961');
    }
    ctx.restore();
  }

  function drawProjectile(pr, x, y, clock) {
    const shake = pr.warn > 0 ? Math.sin(clock * 60) * 2 : 0;
    switch (pr.type) {
      case 'bubble':
      case 'spore': {
        const r = 12 + Math.sin(clock * 10 + pr.id) * 1.5;
        ctx.globalAlpha = 0.75;
        if (pr.type === 'spore') {
          for (let k = 0; k < 4; k++) ellipse(x + Math.cos(k * 1.6 + clock * 3) * 6, y + Math.sin(k * 1.6 + clock * 3) * 6, 8, 8, '#b98cff');
        } else ellipse(x, y, r, r, '#9fe7ff');
        ctx.globalAlpha = 1;
        if (pr.type === 'bubble') {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          ellipse(x - 4, y - 4, 3, 2, '#ffffff');
        }
        break;
      }
      case 'snowball':
        ellipse(x, y, 12.5, 12.5, '#9cb8d6');
        ellipse(x, y, 11, 11, '#ffffff');
        ellipse(x - 3, y - 3, 4, 3, '#dfeaf6');
        break;
      case 'fireball':
        ellipse(x - pr.dir * 12, y, 14, 8, 'rgba(255,90,20,0.5)');
        ellipse(x, y, 11, 10, '#ff7a1a');
        ellipse(x + pr.dir * 2, y, 6, 6, '#ffe07a');
        break;
      case 'boulder':
      case 'lavarock':
        drawBoulder(x, y, 24, pr.t * 0.15, pr.type);
        break;
      case 'rock':
        drawBoulder(x + shake, y, 16, pr.t * 0.1, 'rock');
        break;
      case 'icicle':
        ctx.fillStyle = '#bfe6ff';
        ctx.beginPath();
        ctx.moveTo(x - 10 + shake, y - 20);
        ctx.lineTo(x + 10 + shake, y - 20);
        ctx.lineTo(x + shake, y + 22);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(x - 5 + shake, y - 18, 3, 20);
        break;
      case 'feather': {
        ctx.save();
        ctx.translate(x + shake + (pr.warn > 0 ? 0 : Math.sin(pr.t * 0.12) * 14), y);
        ctx.rotate(Math.sin(pr.t * 0.12) * 0.6);
        ellipse(0, 0, 6, 20, '#8a6a46');
        ellipse(0, 0, 3, 18, '#b89870');
        ctx.strokeStyle = '#4a3420';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(0, 24);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'wave':
        for (let k = 0; k < 3; k++) {
          const h = 30 - k * 8 + Math.sin(clock * 20 + k) * 3;
          ellipse(x - k * 8 * (pr.dir || 1) * -1, y - h / 2, 16 - k * 3, h / 2, `rgba(170,130,90,${0.75 - k * 0.2})`);
        }
        ctx.fillStyle = '#d9b98a';
        ctx.beginPath();
        ctx.moveTo(x - 18, y);
        ctx.lineTo(x, y - 34);
        ctx.lineTo(x + 18, y);
        ctx.fill();
        break;
      case 'snowroll':
        ctx.save();
        ctx.translate(x, y - 34);
        ctx.rotate(x / 34);
        ellipse(0, 0, 36, 36, '#8aa4c0');
        ellipse(0, 0, 34, 34, '#f4f8fc');
        ellipse(-12, -8, 8, 6, '#d6e4f2');
        ellipse(10, 12, 6, 5, '#d6e4f2');
        ellipse(14, -14, 4, 3, '#d6e4f2');
        ctx.restore();
        break;
      case 'cloud':
        for (let k = 0; k < 6; k++) {
          const a = k * 1.05 + clock * 1.5;
          ellipse(x + Math.cos(a) * 18, y + Math.sin(a) * 10, 20, 15, 'rgba(120,200,70,0.5)');
        }
        break;
      case 'honey':
        ellipse(x, y, 13, 11, '#e8a020');
        ellipse(x - 4, y - 4, 4, 3, '#ffe08a');
        ellipse(x - pr.dir * 12, y + 4, 4, 5, 'rgba(232,160,32,0.7)');
        break;
      case 'shrinkray':
      case 'freezeray': {
        const c = pr.type === 'shrinkray' ? '180,90,255' : '120,220,255';
        ctx.strokeStyle = `rgba(${c},0.6)`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(x - pr.dir * 50, y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ellipse(x, y, 9, 9, `rgba(${c},0.9)`);
        if (pr.type === 'freezeray') drawStar(x, y, 7, '#ffffff');
        break;
      }
      case 'pie':
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(pr.t * 0.3);
        ellipse(0, 0, 14, 6, '#d49a52');
        ellipse(0, -2, 12, 4, '#fff6e8');
        ellipse(0, -3, 6, 2, '#d8325a');
        ctx.restore();
        break;
    }
  }

  /** Shree's giant fist: a shadow on the ground, then the slam. */
  function drawFist(f, clock) {
    const floor = Math.min(surf(f.x, 0), A.GROUND_Y + 40);
    const k = clamp01(f.t / A.FIST_WARN);
    if (f.t < A.FIST_WARN) {
      ellipse(f.x, floor, 30 + 40 * k, 8 + 8 * k, `rgba(0,0,0,${0.15 + 0.35 * k})`);
    }
    // Drops in over the last few ticks, stays a moment, lifts off.
    const fall = f.t < A.FIST_WARN - 12 ? -1 : f.t < A.FIST_WARN ? (f.t - (A.FIST_WARN - 12)) / 12 : 1 - Math.max(0, f.t - A.FIST_WARN - 12) / 13;
    if (fall < 0) return;
    const y = -120 + (floor - 40 + 120) * fall;
    ctx.save();
    ctx.translate(f.x, y);
    ctx.fillStyle = '#e0ac86';
    ctx.fillRect(-26, -260, 52, 220);
    glove(0, 0, 5.5, '#e03a3e');
    ctx.restore();
  }

  function drawSnack(sn, clock) {
    const floor = surf(sn.x, sn.y);
    if (!sn.splat) {
      const k = clamp01(1 - (floor - sn.y) / 500);
      ellipse(sn.x, floor + 2, 10 + 18 * k, 4 + 3 * k, `rgba(0,0,0,${0.15 + 0.25 * k})`);
    }
    ctx.save();
    ctx.translate(sn.x, sn.y);
    if (sn.splat) ctx.scale(1.4, 0.4);
    else ctx.rotate(Math.sin(clock * 3 + sn.id) * 0.3);
    if (sn.kind === 'hotdog') {
      ellipse(0, 3, 24, 9, '#e0a050');
      ellipse(0, -1, 26, 5, '#b8382a');
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -18; x <= 18; x += 6) ctx.lineTo(x, -3 + (x / 6 % 2 ? 2 : -2));
      ctx.stroke();
    } else {
      ctx.fillStyle = '#e8b04a';
      ctx.beginPath();
      ctx.moveTo(-26, 4);
      ctx.lineTo(26, -6);
      ctx.lineTo(26, 6);
      ctx.closePath();
      ctx.fill();
      ellipse(24, 0, 5, 7, '#c88a2a');
    }
    ctx.restore();
  }

  /** Water: the flood rises, laps about, and drains away. */
  function drawFlood(s, clock) {
    if (!s.flood) return;
    const rise = Math.min(clamp01((A.FLOOD_TICKS - s.flood) / 60), clamp01(s.flood / 60));
    const top = H - (H - A.WATER_Y) * rise;
    ctx.fillStyle = 'rgba(40,120,220,0.42)';
    ctx.beginPath();
    ctx.moveTo(cam - 10, H);
    for (let x = cam - 10; x <= cam + W + 10; x += 20) ctx.lineTo(x, top + Math.sin(clock * 3 + x * 0.03) * 5);
    ctx.lineTo(cam + W + 10, H);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,240,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = cam - 10; x <= cam + W + 10; x += 20) ctx.lineTo(x, top + Math.sin(clock * 3 + x * 0.03) * 5);
    ctx.stroke();
  }

  /** Spreadbury and Mamtora: stars and stripes, or the tricolour and petals. */
  function drawThemeOverlay(s, clock) {
    if (!s.theme) return;
    ctx.save();
    if (s.theme === 'usa') {
      ctx.globalAlpha = 0.13;
      for (let k = 0; k < 7; k++) {
        ctx.fillStyle = k % 2 ? '#ffffff' : '#c8102e';
        ctx.fillRect(0, k * 16, W, 16);
      }
      ctx.fillStyle = '#0a3161';
      ctx.fillRect(0, 0, 200, 112);
      ctx.globalAlpha = 1;
      for (let k = 0; k < 3; k++) {
        const u = (clock * 0.5 + k / 3) % 1;
        const fx = 150 + hash(k + Math.floor(clock * 0.5 + k / 3)) * 700;
        for (let j = 0; j < 10; j++) {
          const a = (j / 10) * Math.PI * 2;
          ellipse(fx + Math.cos(a) * u * 60, 120 + Math.sin(a) * u * 60, 3, 3, `rgba(${k === 1 ? '255,255,255' : k ? '80,140,255' : '255,70,70'},${1 - u})`);
        }
      }
    } else {
      ctx.globalAlpha = 0.12;
      ['#ff9933', '#ffffff', '#138808'].forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(0, k * 30, W, 30); });
      ctx.globalAlpha = 1;
      for (let k = 0; k < 24; k++) {
        const x = (hash(k) * W + Math.sin(clock + k) * 30) % W;
        const y = (hash(k + 5) * H + clock * 40) % H;
        ellipse(x, y, 5, 3, k % 2 ? '#ff9933' : '#ffcc33', clock + k);
      }
    }
    ctx.restore();
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
    const pal = art().PALETTE[i];
    let state = p.state;
    if (!p.onGround && (state === 'walk' || state === 'idle')) state = 'idle';
    if (p.car > 0) { drawCar(i, p, x, y, clock); drawTag(i, p, x, y - 30); return; }
    const f = {
      // On the ground, punches and kicks go in low, at creature height.
      state, move: p.move, facing: p.facing, aim: p.onGround ? 'body' : 'head', x, hitHeight: 'head', noShadow: true,
      // How the cheat codes make you look (drawn by client.js).
      gold: p.gold, vampire: p.vampire, lion: p.lion, sword: p.sword, piece: p.piece, chess: p.chess, dragon: p.dragon,
      shoes: p.shoes, love: p.love, hug: p.hug, moustache: p.moustache, nap: p.nap, invincible: p.invincible,
      invisible: p.invisible, turbo: p.turbo, rugby: p.dash > 0 && p.dashKind === 'rugby', charge: p.dash > 0 && p.dashKind === 'charge',
    };
    const drawT = state === 'attack' ? poseTicks(p.move, t) : t;
    // Shadow on whatever is underneath.
    const floor = surf(p.x, p.y - 2);
    if (floor < H + 50) {
      const k = clamp01(1 - (floor - y) / 300);
      ellipse(x, floor + 2, 26 * k + 4, 6 * k + 1, `rgba(0,0,0,${0.3 * k})`);
    }
    if (p.piano > 0) drawPiano(x + p.facing * 46, y, p.facing, clock);
    if (p.boat) drawBoat(x, y, pal, clock);
    ctx.save();
    if (p.invuln > 0 && p.state !== 'ko' && Math.floor(clock * 16) % 2) ctx.globalAlpha = 0.45;
    // A little tilt in the air.
    if (!p.onGround && state === 'idle') {
      ctx.translate(x, y - 50);
      ctx.rotate(p.facing * Math.max(-0.2, Math.min(0.2, p.vy * 0.02)));
      ctx.translate(-x, -(y - 50));
    }
    const size = p.giant > 0 ? 1.5 : 1;
    art().drawBoxer(ctx, i, f, drawT, clock, x, y, BOXER_SCALE, { size, theme: snap.theme });
    ctx.restore();
    if (p.spiky > 0) drawSpikes(x, y, size, clock);
    if (p.clown > 0) drawClown(p, x, y, clock);
    drawTag(i, p, x, y - (size - 1) * 100);
  }

  function drawTag(i, p, x, y) {
    const pal = art().PALETTE[i];
    const top = y - A.PLAYER_H - 16;
    ctx.font = '15px Barlow, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(p.name, x, top);
    ctx.fillStyle = pal.name;
    ctx.fillText(p.name, x, top);
    let above = top - 14;
    if (i === me && snap.players.length > 1) {
      ctx.fillStyle = pal.name;
      ctx.beginPath();
      ctx.moveTo(x - 6, top - 22);
      ctx.lineTo(x + 6, top - 22);
      ctx.lineTo(x, top - 14);
      ctx.fill();
      above = top - 28;
    }
    // The cheat code going in, for everyone to see.
    if (p.typing) {
      ctx.font = '22px Bangers, Anton, Impact, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(p.typing.toUpperCase(), x, above);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(p.typing.toUpperCase(), x, above);
    }
  }

  function drawSpikes(x, y, size, clock) {
    ctx.fillStyle = '#c9ced8';
    const cy = y - 55 * size;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + Math.sin(clock * 2) * 0.05;
      const r0 = 46 * size;
      const r1 = 60 * size;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a - 0.12) * r0, cy + Math.sin(a - 0.12) * r0 * 1.2);
      ctx.lineTo(x + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 1.2);
      ctx.lineTo(x + Math.cos(a + 0.12) * r0, cy + Math.sin(a + 0.12) * r0 * 1.2);
      ctx.fill();
    }
  }

  /** Briony: a rainbow wig and a red nose, and the balls in the air. */
  function drawClown(p, x, y, clock) {
    const hx = x + p.facing * 4;
    const hy = y - 100;
    ['#ff4a4a', '#ffd23f', '#4ad04a', '#4a8aff', '#c04aff'].forEach((c, k) => ellipse(hx + (k - 2) * 7, hy - 4 + Math.abs(k - 2) * 3, 8, 8, c));
    ellipse(hx + p.facing * 12, hy + 12, 4, 4, '#ff2020');
    if (p.clown < A.JUGGLE_TICKS) {
      for (let k = 0; k < 3; k++) {
        const a = clock * 6 + (k * Math.PI * 2) / 3;
        ellipse(x + Math.cos(a) * 22, y - 140 + Math.sin(a) * 18, 6, 6, ['#ff4a4a', '#ffd23f', '#4a8aff'][k]);
      }
    }
  }

  function drawPiano(x, y, f, clock) {
    ctx.fillStyle = '#2a1a12';
    ctx.fillRect(x - 32, y - 70, 64, 70);
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(x - 36, y - 76, 72, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 30, y - 44, 60, 10);
    ctx.fillStyle = '#111';
    for (let k = 0; k < 7; k++) ctx.fillRect(x - 27 + k * 8.5, y - 44, 4, 6);
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    for (let k = 0; k < 3; k++) {
      const u = (clock * 0.6 + k / 3) % 1;
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = ['#ffd23f', '#ff8ac8', '#8ad8ff'][k];
      ctx.fillText(k % 2 ? '♫' : '♪', x + Math.sin(u * 6 + k) * 20, y - 90 - u * 60);
    }
    ctx.globalAlpha = 1;
  }

  function drawBoat(x, y, pal, clock) {
    const bob = Math.sin(clock * 3) * 3;
    ctx.fillStyle = '#8a5a2a';
    ctx.beginPath();
    ctx.moveTo(x - 60, y - 22 + bob);
    ctx.lineTo(x + 60, y - 22 + bob);
    ctx.lineTo(x + 40, y + 6 + bob);
    ctx.lineTo(x - 40, y + 6 + bob);
    ctx.fill();
    ctx.fillStyle = pal.glove;
    ctx.fillRect(x - 60, y - 26 + bob, 120, 5);
  }

  /** Parimal's car, with the boxer at the wheel. */
  function drawCar(i, p, x, y, clock) {
    const pal = art().PALETTE[i];
    const f = p.facing;
    ellipse(x, y + 2, 60, 8, 'rgba(0,0,0,0.3)');
    ctx.save();
    ctx.translate(x, y + Math.sin(clock * 30) * 1);
    ctx.fillStyle = pal.glove;
    roundRect(-58, -40, 116, 30, 8);
    ctx.fill();
    ctx.fillStyle = pal.gloveDark;
    roundRect(-30, -64, 56, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#bfe6ff';
    ctx.fillRect(f > 0 ? 2 : -24, -60, 20, 18);
    ellipse(-6 * f, -72, 13, 13, pal.skin);
    ellipse(-6 * f, -80, 13, 6, pal.hair);
    ellipse(f * 54, -28, 6, 5, '#fff6a0');
    for (const wx of [-36, 36]) {
      ellipse(wx, -8, 13, 13, '#1a1a1a');
      ellipse(wx, -8, 6, 6, '#cfd6e0');
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      const a = clock * 20 * f;
      ctx.beginPath();
      ctx.moveTo(wx + Math.cos(a) * 6, -8 + Math.sin(a) * 6);
      ctx.lineTo(wx - Math.cos(a) * 6, -8 - Math.sin(a) * 6);
      ctx.stroke();
    }
    ctx.restore();
    // Speed lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(x - f * (70 + k * 6), y - 20 - k * 12);
      ctx.lineTo(x - f * (110 + k * 10), y - 20 - k * 12);
      ctx.stroke();
    }
  }

  const BOSS_ICON = { rhino: '\u{1F98F}', owl: '\u{1F989}', yeti: '\u2744\uFE0F', gorilla: '\u{1F98D}' };

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
      ctx.fillText(`x${lives}`, W - 26 - 5 * 26 - 18, 62);
    }
    if (lives === 0) {
      ctx.font = '16px Barlow, system-ui, sans-serif';
      ctx.fillStyle = '#ff8a8a';
      ctx.fillText('Last life!', W - 16, 62);
    }

    // How far to the boss (or, in a secret room, where you are).
    if (roomNow()) {
      ctx.font = '22px Bangers, Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('SECRET ROOM', s.players.length > 2 ? 160 : W / 2, s.players.length > 2 ? 86 : 32);
    } else if (!s.boss) {
      const k = clamp01(s.camX / lvl().arenaX);
      // Top middle, or under the player cards when there are three or four.
      const bx = s.players.length > 2 ? 12 : W / 2 - 150;
      const by = s.players.length > 2 ? 72 : 18;
      ctx.fillStyle = 'rgba(10,14,22,0.5)';
      ctx.fillRect(bx, by, 300, 8);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(bx, by, 300 * k, 8);
      glove(bx + 300 * k, by + 4, 0.7, '#e03a3e');
      ctx.font = '13px Barlow, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(BOSS_ICON[lvl().boss], bx + 314, by + 9);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(`Level ${s.level + 1}: ${lvl().name}`, bx, by + 26);
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
    const dpr = window.BoxerPerf ? window.BoxerPerf.ratio(window.devicePixelRatio) : Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
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
    if (window.BoxerPerf) window.BoxerPerf.frame(now);
    const dpr = resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!snap) {
      ctx.fillStyle = '#4aa8ff';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const s = snap;
    const k = 1 - Math.exp(-dt * 30);
    cam += (s.camX - cam) * (1 - Math.exp(-dt * 12));
    const ticksSince = Math.min(2, ((now - snapAt) / 1000) * A.TICK_RATE);

    ctx.save();
    if (shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= 0.88;
    }
    drawSky(clock);
    drawThemeOverlay(s, clock);
    ctx.save();
    ctx.translate(-Math.round(cam), 0);
    drawArenaBack(clock);
    drawGround(clock);
    drawDoorsAndRocks(clock);
    if (roomNow()) drawRoomNpc(roomNow(), clock);
    for (const sn of s.snacks) drawSnack(sn, clock);

    for (const id of s.pickups) drawPickup(lvl().pickups[id], clock);
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
    for (const f of s.fists) drawFist(f, clock);
    drawFlood(s, clock);

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
    if (!roomNow()) drawWeather(clock);
    if (s.stopped > 0) {
      // Edward: the clock has stopped.
      ctx.fillStyle = 'rgba(120,100,70,0.22)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = '22px Bangers, Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff3c8';
      ctx.fillText(`\u23F8 TIME STOPPED ${Math.ceil(s.stopped / A.TICK_RATE)}`, W / 2, 78);
    }
    ctx.restore();
    drawHud(s, clock);
  }
  requestAnimationFrame(frame);

  window.BoxerAdventureView = { handle, showNotice, active: isActive };
})();
