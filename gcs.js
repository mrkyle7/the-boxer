'use strict';

// A little Google Cloud Storage client, for JSON objects in one bucket. It
// signs in as the server's own service account through Cloud Run's metadata
// server (no keys, no dependencies), and writes with a generation check
// (ifGenerationMatch) so a save never overwrites one it hasn't seen.
//
//   const gcs = createGcs('my-bucket');
//   await gcs.get('a.json')               // { data, generation } or null
//   await gcs.put('a.json', data, gen)    // true, or false if someone saved first
//   await gcs.del('a.json')

const TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

function createGcs(bucket, fetchImpl = globalThis.fetch) {
  const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`;
  const upload = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`;
  let token = null;

  async function auth() {
    if (token && token.until > Date.now() + 60 * 1000) return token.value;
    const res = await fetchImpl(TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });
    if (!res.ok) throw new Error(`metadata server: ${res.status}`);
    const t = await res.json();
    token = { value: t.access_token, until: Date.now() + t.expires_in * 1000 };
    return token.value;
  }

  return {
    async get(name) {
      const res = await fetchImpl(`${base}/${encodeURIComponent(name)}?alt=media`, { headers: { Authorization: `Bearer ${await auth()}` } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`reading ${name}: ${res.status}`);
      return { data: await res.json(), generation: Number(res.headers.get('x-goog-generation')) || 0 };
    },
    /** Writes it if it's still at `generation` (0: only if there's none yet). */
    async put(name, data, generation) {
      const gen = generation === undefined ? '' : `&ifGenerationMatch=${generation}`;
      const res = await fetchImpl(`${upload}?uploadType=media&name=${encodeURIComponent(name)}${gen}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await auth()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.status === 412) return false;
      if (!res.ok) throw new Error(`saving ${name}: ${res.status}`);
      return true;
    },
    async del(name) {
      const res = await fetchImpl(`${base}/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${await auth()}` } });
      if (!res.ok && res.status !== 404) throw new Error(`deleting ${name}: ${res.status}`);
    },
  };
}

module.exports = { createGcs };
