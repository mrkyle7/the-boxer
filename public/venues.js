// Fight settings: the plain ring, or one of the adventure's four landscapes
// (meadow, forest, snowy peaks, volcano) with its platforms and scenery. This
// only paints the backdrop behind the fighters; the fighting is the same.
//
//   drawSide(ctx, W, H, venue, clock, floorY, platforms)  one on one, side on;
//     the platforms are the ones the fight stands on (Game.PLATFORMS)
//   drawRing(ctx, W, H, venue, clock, view, toScreen)  three or four, from above
(function (root) {
  'use strict';

  const NAMES = ['ring', 'meadow', 'forest', 'snow', 'volcano'];

  const THEMES = {
    meadow: {
      sky: ['#4aa8ff', '#bfe6ff', '#e8f7ff'], far: '#8fb3d9', hills: '#6fc46a', hills2: '#58a954', ground: '#6fc46a',
      top: '#3f9b3a', topLight: '#58c24f', dirt: '#7a4a24', stone: '#5e3417', plank: '#a8662f', plankDark: '#7d4820',
      floor: '#4c9a43', floorLight: '#5fb556', rope: ['#d93b40', '#ffffff', '#f4c542'], post: '#7a4a24',
    },
    forest: {
      sky: ['#070b24', '#1d1f4a', '#3a2f5e'], far: '#1a2142', hills: '#122a1c', hills2: '#0d2016', ground: '#1c3a26',
      top: '#2f5e3a', topLight: '#3f7a4a', dirt: '#3b2a1e', stone: '#2a1d14', plank: '#5e4630', plankDark: '#3d2c1c',
      floor: '#1f4a2e', floorLight: '#2c6340', rope: ['#9b7fd6', '#d8d8f0', '#6a5acd'], post: '#3d2c1c',
    },
    snow: {
      sky: ['#8fbfe8', '#d2e8fa', '#f4fbff'], far: '#b8cde3', hills: '#e3edf7', hills2: '#cfe0f0', ground: '#e9f2fb',
      top: '#e9f2fb', topLight: '#ffffff', dirt: '#9cc2e2', stone: '#7fa7cb', plank: '#b98b5a', plankDark: '#8a6238',
      floor: '#d6e6f4', floorLight: '#f2f8fd', rope: ['#d93b40', '#ffffff', '#2f6fd8'], post: '#8a6238',
    },
    volcano: {
      sky: ['#1e0a0a', '#5e1f12', '#b9481c'], far: '#2c1210', hills: '#3a1d18', hills2: '#2a1210', ground: '#463632',
      top: '#5c4a45', topLight: '#74605a', dirt: '#463632', stone: '#2f2321', plank: '#5a4440', plankDark: '#3a2a27',
      floor: '#3a2d2a', floorLight: '#52403b', rope: ['#ff7a2a', '#ffd27a', '#d93b40'], post: '#2f2321',
    },
  };

  // The same "random" scatter every frame.
  function rng(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function sky(ctx, W, H, T, venue, clock) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, T.sky[0]);
    g.addColorStop(0.65, T.sky[1]);
    g.addColorStop(1, T.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const r = rng(7);
    if (venue === 'forest') {
      for (let k = 0; k < 50; k++) {
        ellipse(ctx, r() * W, r() * H * 0.5, 1.2, 1.2, `rgba(255,255,255,${0.4 + 0.4 * Math.sin(clock * 2 + k)})`);
      }
      ellipse(ctx, W * 0.78, 90, 56, 56, 'rgba(230,230,255,0.14)');
      ellipse(ctx, W * 0.78, 90, 36, 36, '#eceeff');
    } else if (venue === 'meadow' || venue === 'snow') {
      ellipse(ctx, W * 0.82, 80, 70, 70, 'rgba(255,240,180,0.25)');
      ellipse(ctx, W * 0.82, 80, 42, 42, '#fff6c8');
      for (let k = 0; k < 5; k++) {
        const cx = ((r() * W * 1.4 + clock * (4 + k * 1.5)) % (W + 240)) - 120;
        const cy = 40 + r() * 130;
        ellipse(ctx, cx, cy, 60, 18, 'rgba(255,255,255,0.8)');
        ellipse(ctx, cx + 30, cy - 10, 36, 16, 'rgba(255,255,255,0.8)');
      }
    } else if (venue === 'volcano') {
      ellipse(ctx, W * 0.5, 190, 150, 120, 'rgba(255,120,40,0.18)');
    }
  }

  /** A ridge of hills or mountains across the back. */
  function ridge(ctx, W, baseY, color, seed, height, peaky, caps) {
    const r = rng(seed);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, baseY);
    const step = peaky ? 130 : 160;
    const peaks = [];
    for (let x = -10; x <= W + step; x += step) {
      const y = baseY - height * (0.4 + r() * 0.6);
      peaks.push([x, y]);
      if (peaky) ctx.lineTo(x, y);
      else ctx.quadraticCurveTo(x - step / 2, y - 30, x, y);
    }
    ctx.lineTo(W + step, baseY);
    ctx.closePath();
    ctx.fill();
    if (caps) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const [x, y] of peaks) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 22, y + 30);
        ctx.lineTo(x - 8, y + 24);
        ctx.lineTo(x, y + 34);
        ctx.lineTo(x + 10, y + 24);
        ctx.lineTo(x + 24, y + 30);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function tree(ctx, x, y, h, T, venue) {
    ctx.fillStyle = T.plankDark;
    ctx.fillRect(x - 5, y - h * 0.35, 10, h * 0.35);
    ctx.fillStyle = venue === 'forest' ? '#0f2a1a' : venue === 'snow' ? '#2c5a47' : '#2f8a3a';
    for (let k = 0; k < 3; k++) {
      const w = h * (0.4 - k * 0.09);
      const ty = y - h * 0.25 - k * h * 0.26;
      ctx.beginPath();
      ctx.moveTo(x - w, ty);
      ctx.lineTo(x, ty - h * 0.38);
      ctx.lineTo(x + w, ty);
      ctx.closePath();
      ctx.fill();
      if (venue === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(x - w * 0.55, ty - h * 0.16);
        ctx.lineTo(x, ty - h * 0.38);
        ctx.lineTo(x + w * 0.55, ty - h * 0.16);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2c5a47';
      }
    }
  }

  /** A floating wooden ledge with the level's ground on top. */
  function ledge(ctx, x, y, w, T) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + 6, y + 14, w, 16);
    ctx.fillStyle = T.plank;
    ctx.fillRect(x, y, w, 16);
    ctx.fillStyle = T.plankDark;
    for (let px = x + 18; px < x + w - 4; px += 36) ctx.fillRect(px, y + 2, 2, 12);
    ctx.fillRect(x, y + 14, w, 3);
    ctx.fillStyle = T.top;
    ctx.fillRect(x - 3, y - 6, w + 6, 8);
    ctx.fillStyle = T.topLight;
    ctx.fillRect(x - 3, y - 6, w + 6, 3);
  }

  function lavaGlow(ctx, W, y0, y1, clock) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#ff8a2a');
    g.addColorStop(1, '#b8260f');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, W, y1 - y0);
    ctx.fillStyle = 'rgba(255,230,140,0.55)';
    for (let k = 0; k < 9; k++) {
      const bx = (k * 130 + Math.sin(clock * 1.4 + k) * 20 + 40) % W;
      ctx.fillRect(bx, y0 + 4 + (k % 3) * 7, 50, 3);
    }
  }

  function drawSide(ctx, W, H, venue, clock, floorY, platforms) {
    const T = THEMES[venue] || THEMES.meadow;
    sky(ctx, W, H, T, venue, clock);
    const base = floorY - 40;
    // Far scenery.
    const peaky = venue === 'snow' || venue === 'volcano';
    ridge(ctx, W, base - 30, T.far, 3, 220, peaky, venue === 'snow');
    ridge(ctx, W, base, T.hills, 5, 120, false, false);
    if (venue === 'volcano') {
      // A cone, glowing at the top.
      ctx.fillStyle = '#2a1210';
      ctx.beginPath();
      ctx.moveTo(W * 0.3, base);
      ctx.lineTo(W * 0.42, 150);
      ctx.lineTo(W * 0.5, 150);
      ctx.lineTo(W * 0.62, base);
      ctx.closePath();
      ctx.fill();
      ellipse(ctx, W * 0.46, 150, 38, 9, '#ff8a2a');
      for (let k = 0; k < 14; k++) {
        const t = (clock * 0.35 + k / 14) % 1;
        ellipse(ctx, W * 0.46 + Math.sin(k * 3 + clock) * 30, 150 - t * 130, 3, 3, `rgba(255,170,60,${1 - t})`);
      }
    }
    // Trees.
    if (venue !== 'volcano') {
      const r = rng(21);
      const n = venue === 'forest' ? 9 : 5;
      for (let k = 0; k < n; k++) tree(ctx, 40 + (k + r() * 0.6) * (W / n), base + 8, 80 + r() * 60, T, venue);
    }
    ridge(ctx, W, floorY - 8, T.hills2, 9, 50, false, false);
    // Platforms behind the fighters.
    for (const p of platforms || []) ledge(ctx, p.x0, floorY - p.h, p.x1 - p.x0, T);
    // Flowers, mushrooms, snow lumps or embers on the ledges.
    const r = rng(33);
    if (venue === 'meadow') {
      for (let k = 0; k < 18; k++) {
        const fx = 30 + r() * (W - 60);
        ctx.fillStyle = ['#ff6b8a', '#ffd23f', '#ffffff'][k % 3];
        ctx.fillRect(fx, floorY - 12 - r() * 6, 4, 4);
      }
    } else if (venue === 'forest') {
      for (let k = 0; k < 16; k++) {
        const fx = (r() * W + clock * 8 * (k % 2 ? 1 : -1) + W) % W;
        const fy = 150 + r() * 330 + Math.sin(clock * 1.5 + k) * 10;
        ellipse(ctx, fx, fy, 2.5, 2.5, `rgba(255,240,140,${0.5 + 0.4 * Math.sin(clock * 3 + k)})`);
      }
    } else if (venue === 'snow') {
      for (let k = 0; k < 60; k++) {
        const sx = (r() * W + Math.sin(clock + k) * 20 + W) % W;
        const sy = (r() * H + clock * (40 + (k % 5) * 14)) % H;
        ellipse(ctx, sx, sy, 2, 2, 'rgba(255,255,255,0.85)');
      }
    }
    // The floor, with its ground on top.
    const g = ctx.createLinearGradient(0, floorY - 14, 0, H);
    if (venue === 'volcano') {
      lavaGlow(ctx, W, floorY - 22, floorY + 6, clock);
      g.addColorStop(0, T.top);
      g.addColorStop(0.15, T.dirt);
      g.addColorStop(1, T.stone);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.rect(60, floorY - 14, W - 120, H - floorY + 14);
      ctx.fill();
      ctx.fillStyle = T.topLight;
      ctx.fillRect(60, floorY - 14, W - 120, 4);
    } else {
      g.addColorStop(0, T.top);
      g.addColorStop(0.12, T.dirt);
      g.addColorStop(1, T.stone);
      ctx.fillStyle = g;
      ctx.fillRect(0, floorY - 14, W, H - floorY + 14);
      ctx.fillStyle = T.topLight;
      ctx.fillRect(0, floorY - 14, W, 4);
      ctx.fillStyle = T.top;
      ctx.fillRect(0, floorY - 10, W, 8);
    }
    if (venue === 'snow') {
      ctx.fillStyle = 'rgba(160,200,235,0.45)';
      for (let k = 0; k < 6; k++) ellipse(ctx, 100 + k * 160, floorY + 4, 46, 3, 'rgba(255,255,255,0.7)');
    }
    // Soft darkening at the edges so the fighters stand out.
    const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.65);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  /** Top-down: the ground, scattered platforms, then a fence round the edge. */
  function drawRing(ctx, W, H, venue, clock, view, toScreen) {
    const T = THEMES[venue] || THEMES.meadow;
    ctx.fillStyle = T.sky[0] === '#070b24' || venue === 'volcano' ? T.hills2 : T.far;
    ctx.fillRect(0, 0, W, H);
    // Scenery all round the outside.
    const r = rng(41);
    for (let k = 0; k < 70; k++) {
      const x = r() * W;
      const y = r() * H;
      const p = toScreen(500, 500);
      const inside = Math.abs(x - p.x) < view.size * 0.55 && Math.abs(y - p.y) < view.size * 0.55;
      if (inside) continue;
      if (venue === 'meadow') ellipse(ctx, x, y, 9, 9, k % 2 ? '#4fae4a' : '#6fc46a');
      else if (venue === 'forest') ellipse(ctx, x, y, 14, 14, k % 2 ? '#0f2a1a' : '#173a24');
      else if (venue === 'snow') ellipse(ctx, x, y, 12, 8, k % 2 ? '#ffffff' : '#dbe9f5');
      else ellipse(ctx, x, y, 12, 9, k % 2 ? '#2a1210' : '#5e1f12');
    }
    if (venue === 'volcano') {
      // Lava flows past the outside edges.
      const a = toScreen(0, 0);
      const b = toScreen(1000, 1000);
      ctx.fillStyle = '#d6481a';
      ctx.fillRect(a.x - 22, a.y - 22, b.x - a.x + 44, b.y - a.y + 44);
      ctx.fillStyle = `rgba(255,220,120,${0.35 + 0.15 * Math.sin(clock * 3)})`;
      for (let k = 0; k < 16; k++) ctx.fillRect(a.x - 22 + ((k * 97 + clock * 20) % (b.x - a.x + 44)), a.y - 22 + (k % 2 ? 0 : b.y - a.y + 36), 30, 4);
    }
    // The floor inside the fence.
    const m0 = toScreen(60, 60);
    const m1 = toScreen(940, 940);
    const fl = ctx.createRadialGradient(view.cx, view.cy, 20, view.cx, view.cy, view.size * 0.7);
    fl.addColorStop(0, T.floorLight);
    fl.addColorStop(1, T.floor);
    ctx.fillStyle = fl;
    ctx.fillRect(m0.x, m0.y, m1.x - m0.x, m1.y - m0.y);
    // Platforms: raised pads and stepping stones, away from the middle.
    const pads = [[150, 150, 130, 70], [720, 790, 130, 70], [720, 150, 130, 70], [150, 790, 130, 70], [440, 440, 120, 120]];
    for (const [px, py, pw, ph] of pads) {
      const p0 = toScreen(px, py);
      const p1 = toScreen(px + pw, py + ph);
      const w = p1.x - p0.x;
      const h = p1.y - p0.y;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(p0.x + 4, p0.y + 6, w, h);
      ctx.fillStyle = T.plank;
      ctx.fillRect(p0.x, p0.y, w, h);
      ctx.fillStyle = T.top;
      ctx.fillRect(p0.x + 3, p0.y + 3, w - 6, h - 6);
      ctx.fillStyle = T.topLight;
      ctx.fillRect(p0.x + 3, p0.y + 3, w - 6, 4);
      ctx.strokeStyle = T.plankDark;
      ctx.lineWidth = 1;
      ctx.strokeRect(p0.x + 0.5, p0.y + 0.5, w - 1, h - 1);
    }
    // Fence: posts joined by a rail in the level's colours.
    T.rope.forEach((color, k) => {
      const inset = 60 + k * 5;
      const r0 = toScreen(inset, inset);
      const r1 = toScreen(1000 - inset, 1000 - inset);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(r0.x, r0.y, r1.x - r0.x, r1.y - r0.y);
    });
    [[60, 60], [940, 940], [940, 60], [60, 940]].forEach(([x, y]) => {
      const p = toScreen(x, y);
      ctx.fillStyle = T.post;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = T.topLight;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    if (venue === 'snow') {
      for (let k = 0; k < 50; k++) {
        const sx = (r() * W + Math.sin(clock + k) * 20 + W) % W;
        const sy = (r() * H + clock * (40 + (k % 5) * 14)) % H;
        ellipse(ctx, sx, sy, 2, 2, 'rgba(255,255,255,0.8)');
      }
    }
    if (venue === 'forest') {
      for (let k = 0; k < 14; k++) {
        const fx = (r() * W + clock * 8 * (k % 2 ? 1 : -1) + W) % W;
        const fy = (r() * H + Math.sin(clock * 1.5 + k) * 10 + H) % H;
        ellipse(ctx, fx, fy, 2.5, 2.5, `rgba(255,240,140,${0.5 + 0.4 * Math.sin(clock * 3 + k)})`);
      }
    }
    const sp = ctx.createRadialGradient(view.cx, view.cy, 60, view.cx, view.cy, 420);
    sp.addColorStop(0, 'rgba(255,255,255,0.05)');
    sp.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = sp;
    ctx.fillRect(0, 0, W, H);
  }

  const api = { NAMES, drawSide, drawRing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoxerVenues = api;
})(typeof self !== 'undefined' ? self : this);
