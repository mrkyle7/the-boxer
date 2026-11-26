'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createScores, KEEP } = require('../scores.js');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'boxer-scores-')), 'board.json');

test('scores go on the board best first, and it says where you came', async () => {
  const s = createScores({ file: tmpFile() });
  assert.strictEqual((await s.add({ team: ['Ann'], score: 500, level: 2 })).rank, 1);
  assert.strictEqual((await s.add({ team: ['Bob', 'Cy'], score: 900, level: 3, won: false })).rank, 1);
  const r = await s.add({ team: ['Dee'], score: 700, level: 2 });
  assert.strictEqual(r.rank, 2);
  assert.deepStrictEqual(r.top.map((e) => e.score), [900, 700, 500]);
  assert.strictEqual(r.top[0].name, 'Bob & Cy');
});

test('nothing scored, nothing saved', async () => {
  const s = createScores({ file: tmpFile() });
  const r = await s.add({ team: ['Ann'], score: 0 });
  assert.strictEqual(r.rank, 0);
  assert.deepStrictEqual(await s.top(), []);
});

test('the board keeps the best few, and lasts (a new server reads it back)', async () => {
  const file = tmpFile();
  const s = createScores({ file });
  for (let k = 1; k <= KEEP + 5; k++) await s.add({ team: [`P${k}`], score: k * 10 });
  const all = await s.top(KEEP + 10);
  assert.strictEqual(all.length, KEEP);
  assert.strictEqual(all[0].score, (KEEP + 5) * 10);
  assert.strictEqual((await s.add({ team: ['Low'], score: 1 })).rank, 0, 'too low to make it');
  const again = createScores({ file });
  assert.deepStrictEqual((await again.top(3)).map((e) => e.score), all.slice(0, 3).map((e) => e.score));
});

test('names are tidied; nothing else gets stored', async () => {
  const s = createScores({ file: tmpFile() });
  await s.add({ team: ['A very very long name indeed'], score: 10, password: 'x' });
  const [e] = await s.top();
  assert.strictEqual(e.name.length, 16);
  assert.strictEqual(e.password, undefined);
});

/** A pretend Cloud Storage: one object, with generations. */
function fakeBucket({ busyOnce = false } = {}) {
  let body = null;
  let generation = 0;
  let busy = busyOnce;
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(url);
    const json = (data, status = 200, headers = {}) => ({ ok: status < 300, status, json: async () => data, headers: { get: (k) => headers[k] } });
    if (url.includes('metadata.google.internal')) return json({ access_token: 't', expires_in: 3600 });
    if (url.includes('alt=media')) {
      if (body === null) return json(null, 404);
      return json(JSON.parse(body), 200, { 'x-goog-generation': String(generation) });
    }
    if (url.includes('uploadType=media')) {
      const want = Number(new URL(url).searchParams.get('ifGenerationMatch'));
      if (busy) {
        // Someone else saved just before us.
        busy = false;
        body = JSON.stringify([{ name: 'Other', team: ['Other'], score: 50, level: 1, from: 1, won: false, secrets: 0, at: '2026-01-01T00:00:00Z' }]);
        generation++;
      }
      if (want !== generation) return json({}, 412);
      body = opts.body;
      generation++;
      return json({ generation: String(generation) });
    }
    return json({}, 400);
  };
  return { fetchImpl, calls };
}

test('kept in a Cloud Storage bucket when one is set', async () => {
  const b = fakeBucket();
  const s = createScores({ bucket: 'boxer', fetchImpl: b.fetchImpl });
  assert.strictEqual((await s.add({ team: ['Ann'], score: 300 })).rank, 1);
  assert.strictEqual((await s.add({ team: ['Bob'], score: 200 })).rank, 2);
  const other = createScores({ bucket: 'boxer', fetchImpl: b.fetchImpl });
  assert.deepStrictEqual((await other.top()).map((e) => e.name), ['Ann', 'Bob']);
});

test("two servers saving at once: neither score is lost", async () => {
  const b = fakeBucket({ busyOnce: true });
  const s = createScores({ bucket: 'boxer', fetchImpl: b.fetchImpl });
  const r = await s.add({ team: ['Ann'], score: 300 });
  assert.strictEqual(r.rank, 1);
  assert.deepStrictEqual(r.top.map((e) => e.name), ['Ann', 'Other']);
});
