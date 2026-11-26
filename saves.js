'use strict';

// Saved adventures: "Save & quit" keeps where a player had got to (the start
// of the level they were on, with the score, lives and golden gloves they had
// then), so they can carry on another day. One save per player. It's kept on
// the server, not in the browser, so nobody can edit their way up the
// leaderboard. Carrying on uses the save up.
//
// A player is a signed-in account ("acct:<id>"), or, for a guest, a random
// token their browser made and keeps ("guest:<token>"). The key is hashed
// into the file name, so neither appears in it.
//
// Where they're kept: with SAVES_BUCKET (or, failing that, SCORES_BUCKET)
// set, as saves/<hash>.json in that Cloud Storage bucket, so they last
// through deploys; otherwise as files in SAVES_DIR (default: the system's
// temp folder).
//
//   const saves = createSaves();
//   await saves.put('acct:42', { level: 3, score: 900, ... })
//   await saves.get('acct:42')    // the save, or null
//   await saves.take('acct:42')   // the save (and it's gone), or null

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGcs } = require('./gcs.js');

const fileName = (key) => `${crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 40)}.json`;

/** A player's key, or null if what was sent isn't one. */
function playerKey(account, guestToken) {
  if (account && account.id) return `acct:${account.id}`;
  if (typeof guestToken === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(guestToken)) return `guest:${guestToken}`;
  return null;
}

function fileBackend(dir) {
  return {
    async get(key) {
      try { return JSON.parse(await fs.promises.readFile(path.join(dir, fileName(key)), 'utf8')); } catch { return null; }
    },
    async put(key, save) {
      await fs.promises.mkdir(dir, { recursive: true });
      const file = path.join(dir, fileName(key));
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(save));
      await fs.promises.rename(tmp, file);
    },
    async del(key) {
      await fs.promises.rm(path.join(dir, fileName(key)), { force: true });
    },
  };
}

function bucketBackend(bucket, fetchImpl) {
  const gcs = createGcs(bucket, fetchImpl);
  const name = (key) => `saves/${fileName(key)}`;
  return {
    async get(key) {
      const got = await gcs.get(name(key));
      return got ? got.data : null;
    },
    async put(key, save) { await gcs.put(name(key), save); },
    async del(key) { await gcs.del(name(key)); },
  };
}

function createSaves({
  bucket = process.env.SAVES_BUCKET || process.env.SCORES_BUCKET,
  dir = process.env.SAVES_DIR || path.join(os.tmpdir(), 'the-boxer-saves'),
  fetchImpl = globalThis.fetch,
} = {}) {
  const store = bucket ? bucketBackend(bucket, fetchImpl) : fileBackend(dir);
  return {
    async get(key) { return key ? store.get(key) : null; },
    async put(key, save) {
      if (!key) return;
      await store.put(key, { ...save, at: new Date().toISOString() });
    },
    /** The save, which is then gone: carrying on uses it up. */
    async take(key) {
      if (!key) return null;
      const save = await store.get(key);
      if (save) await store.del(key);
      return save;
    },
  };
}

module.exports = { createSaves, playerKey };
