// Keeps the game smooth on older machines. Every frame the game reports how
// long it took; when frames run slow the canvas is drawn at a lower
// resolution (it's scaled up to the same size on screen), and it steps back
// up if the machine turns out to have room to spare. Phones and laptops with
// sharp screens (a device pixel ratio of 2) are the ones that feel it most:
// four times the pixels to fill.
(function (root) {
  'use strict';

  const STEPS = [1, 0.8, 0.65, 0.5]; // share of the screen's full resolution
  const WINDOW = 45; // frames averaged before a decision
  let level = 0;
  let sum = 0;
  let count = 0;
  let calm = 0; // windows in a row with plenty to spare
  let last = 0;

  /** Call once per animation frame with the frame's timestamp (ms). */
  function frame(now) {
    const dt = now - last;
    last = now;
    // A tab that was in the background, or a pause: not a measurement.
    if (dt <= 0 || dt > 200) return;
    sum += dt;
    if (++count < WINDOW) return;
    const avg = sum / count;
    sum = 0;
    count = 0;
    if (avg > 24 && level < STEPS.length - 1) {
      level++;
      calm = 0;
    } else if (avg < 14 && level > 0) {
      // Fast enough at 60 fps (monitors at 144 Hz or more will show ~7ms).
      if (++calm >= 8) { level--; calm = 0; }
    } else {
      calm = 0;
    }
  }

  /** The pixel ratio to draw at, given the screen's. */
  function ratio(deviceRatio) {
    return Math.max(0.5, Math.min(2, deviceRatio || 1) * STEPS[level]);
  }

  const api = { frame, ratio, level: () => level };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoxerPerf = api;
})(typeof self !== 'undefined' ? self : this);
