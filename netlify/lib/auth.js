// Shared admin password check with a lockout after repeated failures.
// Failed attempts are counted per IP in Netlify Blobs: 5 misses → 15-minute lockout.

const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const MAX_FAILS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();

function blobStore(name) {
  return getStore({
    name,
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
  });
}

function clientIp(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip'] || h['client-ip'] ||
    (h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// Returns null when the password is good, or a response to send back.
async function requireAdmin(event, password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return json(500, { error: 'Admin password is not configured.' });

  const key = sha256(clientIp(event)).toString('hex');
  let store, record = null;
  try {
    store = blobStore('adminauth');
    record = JSON.parse((await store.get(key)) || 'null');
  } catch (err) {
    console.error('Auth store error:', err); // fail open on the lockout, never on the password
  }

  const now = Date.now();
  if (record && now - record.since > LOCKOUT_MS) record = null;
  if (record && record.fails >= MAX_FAILS) {
    return json(429, { error: 'Too many wrong passwords. Try again in 15 minutes.' });
  }

  const ok = typeof password === 'string' && crypto.timingSafeEqual(sha256(password), sha256(expected));
  if (ok) {
    if (record && store) await store.delete(key).catch(() => {});
    return null;
  }

  if (store) {
    const next = record ? { fails: record.fails + 1, since: record.since } : { fails: 1, since: now };
    await store.set(key, JSON.stringify(next)).catch(() => {});
  }
  return json(401, { error: 'Invalid password.' });
}

module.exports = { requireAdmin, blobStore, json };
