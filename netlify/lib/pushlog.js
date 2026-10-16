// Activity log for notifications: who subscribed, what was sent, what failed.
// Each event is its own blob, keyed by time, so writes never collide.
// The diagnostics function reads it back and prunes events older than 30 days.

const crypto = require('crypto');
const { blobStore } = require('./auth');

const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

// Which push service a subscription uses. The endpoint itself is never logged:
// anyone holding it can send to that phone.
function pushService(endpoint) {
  try {
    const host = new URL(endpoint).hostname;
    if (host.endsWith('push.apple.com')) return 'Apple';
    if (host.endsWith('googleapis.com')) return 'Google';
    if (host.endsWith('mozilla.com')) return 'Mozilla';
    if (host.endsWith('notify.windows.com')) return 'Microsoft';
    return host;
  } catch {
    return 'unknown';
  }
}

// Never throws: logging must not break subscribing or sending
async function logEvent(type, detail = {}) {
  const event = { at: new Date().toISOString(), type, ...detail };
  console.log('[pushlog]', JSON.stringify(event));
  try {
    const key = `${event.at}-${crypto.randomBytes(3).toString('hex')}`;
    await blobStore('pushlog').set(key, JSON.stringify(event));
  } catch (err) {
    console.error('Push log write error:', err.message);
  }
}

// Newest first
async function recentEvents(limit = 40) {
  const store = blobStore('pushlog');
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).sort();
  const cutoff = new Date(Date.now() - KEEP_MS).toISOString();
  await Promise.all(keys.filter((k) => k < cutoff).map((k) => store.delete(k).catch(() => {})));

  const recent = keys.filter((k) => k >= cutoff).slice(-limit).reverse();
  const events = await Promise.all(recent.map(async (k) => {
    try { return JSON.parse(await store.get(k)); } catch { return null; }
  }));
  return events.filter(Boolean);
}

module.exports = { logEvent, recentEvents, pushService };
