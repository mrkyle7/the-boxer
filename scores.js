'use strict';

// The adventure leaderboard: the best scores anyone has made, for everyone
// to see. Scores come from the server's own game (the client never says
// what it scored), once a game ends.
//
// Where they're kept:
//   - SCORES_BUCKET set: a JSON file (SCORES_OBJECT, default
//     "adventure-leaderboard.json") in that Google Cloud Storage bucket, so
//     every server (Cloud Run may run several, and replaces them on every
//     deploy) shares one board that lasts. The server's own service account
//     needs to be able to read and write objects in the bucket; it signs in
//     with Cloud Run's metadata server (no keys, no dependencies). Writes use
//     the object's generation, so two servers saving at once can't lose a
//     score: the loser reads again and retries.
//   - Otherwise: a JSON file on disk (SCORES_FILE, default in the system's
//     temp folder). Fine on your own machine; on Cloud Run it's lost when the
//     server is replaced.
//
//   const scores = createScores();
//   await scores.top(10)                      // [{ name, team, score, ... }]
//   await scores.add({ team: ['Ann'], ... })  // -> { rank, top } (rank 0 = didn't make it)

const fs = require('fs');
const os = require('os');
const path = require('path');

const KEEP = 100; // how many scores the board holds
const CACHE_MS = 15 * 1000; // how long a read from the bucket is trusted
const TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** Best first; equal scores, whoever got there first. */
function sortScores(list) {
  return list.sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)));
}

/** Tidies an entry: only what the board shows, nothing too long. */
function cleanEntry(e) {
  const team = (Array.isArray(e.team) ? e.team : [e.name]).map((n) => String(n || 'Boxer').slice(0, 16)).slice(0, 4);
  return {
    name: team.join(' & '),
    team,
    score: Math.max(0, Math.floor(Number(e.score) || 0)),
    level: Math.max(1, Math.floor(Number(e.level) || 1)), // the level they got to
    from: Math.max(1, Math.floor(Number(e.from) || 1)), // the level they started on
    won: !!e.won,
    secrets: Math.max(0, Math.floor(Number(e.secrets) || 0)),
    at: e.at || new Date().toISOString(),
  };
}

/** Puts an entry on the board; says where it came (1 = top, 0 = not on it). */
function insert(list, entry) {
  const next = sortScores([...list, entry]).slice(0, KEEP);
  return { list: next, rank: next.indexOf(entry) + 1 };
}

function fileStore(file) {
  let list = [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(data)) list = sortScores(data).slice(0, KEEP);
  } catch { /* no board yet */ }
  let saving = Promise.resolve();
  return {
    async read() { return list; },
    async add(entry) {
      const out = insert(list, entry);
      list = out.list;
      // One write at a time, to a temporary file and then into place.
      saving = saving.then(async () => {
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await fs.promises.writeFile(tmp, JSON.stringify(list));
        await fs.promises.rename(tmp, file);
      }).catch((err) => console.error('Could not save the leaderboard:', err.message));
      await saving;
      return out.rank;
    },
  };
}

function bucketStore(bucket, object, fetchImpl) {
  const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`;
  const upload = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`;
  let token = null;
  let cache = null; // { list, generation, at }

  async function auth() {
    if (token && token.until > Date.now() + 60 * 1000) return token.value;
    const res = await fetchImpl(TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });
    if (!res.ok) throw new Error(`metadata server: ${res.status}`);
    const t = await res.json();
    token = { value: t.access_token, until: Date.now() + t.expires_in * 1000 };
    return token.value;
  }

  async function load() {
    const res = await fetchImpl(`${base}/${encodeURIComponent(object)}?alt=media`, { headers: { Authorization: `Bearer ${await auth()}` } });
    if (res.status === 404) return { list: [], generation: 0 };
    if (!res.ok) throw new Error(`reading the board: ${res.status}`);
    const generation = Number(res.headers.get('x-goog-generation')) || 0;
    const data = await res.json();
    return { list: Array.isArray(data) ? sortScores(data).slice(0, KEEP) : [], generation };
  }

  return {
    async read() {
      if (!cache || Date.now() - cache.at > CACHE_MS) cache = { ...(await load()), at: Date.now() };
      return cache.list;
    },
    async add(entry) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const now = await load();
        const out = insert(now.list, entry);
        const url = `${upload}?uploadType=media&name=${encodeURIComponent(object)}&ifGenerationMatch=${now.generation}`;
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${await auth()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(out.list),
        });
        if (res.ok) {
          const meta = await res.json().catch(() => ({}));
          cache = { list: out.list, generation: Number(meta.generation) || now.generation + 1, at: Date.now() };
          return out.rank;
        }
        if (res.status !== 412) throw new Error(`saving the board: ${res.status}`);
        // Someone else saved first: read theirs and try again.
      }
      throw new Error('saving the board: too busy');
    },
  };
}

function createScores({
  bucket = process.env.SCORES_BUCKET,
  object = process.env.SCORES_OBJECT || 'adventure-leaderboard.json',
  file = process.env.SCORES_FILE || path.join(os.tmpdir(), 'the-boxer-leaderboard.json'),
  fetchImpl = globalThis.fetch,
} = {}) {
  const store = bucket ? bucketStore(bucket, object, fetchImpl) : fileStore(file);
  return {
    where: bucket ? `gs://${bucket}/${object}` : file,
    async top(n = 10) {
      return (await store.read()).slice(0, n);
    },
    /** Saves a game's score. Nothing scored, nothing saved. */
    async add(raw, n = 10) {
      const entry = cleanEntry(raw);
      if (entry.score <= 0) return { rank: 0, top: await this.top(n) };
      const rank = await store.add(entry);
      return { rank, top: await this.top(n) };
    },
  };
}

module.exports = { createScores, sortScores, cleanEntry, KEEP };
