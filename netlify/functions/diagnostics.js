// Admin-only health check for notifications: settings, push keys, subscribers,
// the old text-message list, and recent activity. Never returns a secret.

const crypto = require('crypto');
const { requireAdmin, blobStore, blobsMode, connectBlobs, json } = require('../lib/auth');
const { logEvent, recentEvents, pushService } = require('../lib/pushlog');

const SETTINGS = [
  'ADMIN_PASSWORD', 'NETLIFY_SITE_ID', 'NETLIFY_API_TOKEN',
  'VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'GITHUB_TOKEN',
];

const urlSafe = (k) => k.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// The private key has to produce the public key, or every push is rejected
function checkPushKeys() {
  const pub = urlSafe(process.env.VAPID_PUBLIC_KEY || '');
  const priv = urlSafe(process.env.VAPID_PRIVATE_KEY || '');
  const out = {
    publicKey: pub || null,
    subjectValid: /^(mailto:|https:)/.test((process.env.VAPID_SUBJECT || '').trim()),
    keysMatch: null,
  };
  if (pub && priv) {
    try {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.setPrivateKey(Buffer.from(priv, 'base64url'));
      out.keysMatch = ecdh.getPublicKey().toString('base64url') === pub;
    } catch (err) {
      out.keysMatch = false;
      out.error = `Private key is not valid: ${err.message}`;
    }
  }
  return out;
}

async function listSubscribers() {
  const store = blobStore('pushsubs');
  const { blobs } = await store.list();
  const list = await Promise.all(blobs.slice(0, 200).map(async ({ key }) => {
    let rec = null;
    try { rec = JSON.parse(await store.get(key)); } catch {}
    return {
      id: key.slice(0, 8),
      service: rec && rec.subscription ? pushService(rec.subscription.endpoint) : 'unreadable',
      subscribedAt: (rec && rec.subscribedAt) || null,
      lastSeen: (rec && rec.lastSeen) || null,
    };
  }));
  return { count: blobs.length, list };
}

// Phone numbers saved by the retired text-message version (May to June 2026)
async function textList() {
  const { blobs } = await blobStore('subscribers').list();
  return { count: blobs.length };
}

// A real write and read. Listing can't be trusted for this: the Blobs client
// returns an empty list, not an error, when Netlify rejects the credentials.
async function checkStorage() {
  const store = blobStore('pushmeta');
  const stamp = new Date().toISOString();
  const out = { credentials: blobsMode() };
  try { await store.set('health-check', stamp); out.write = 'ok'; } catch (err) { out.write = err.message; }
  try { await store.get('health-check'); out.read = 'ok'; } catch (err) { out.read = err.message; }
  return out;
}

// Each part reports its own error, so one failure doesn't hide the rest
async function section(fn) {
  try { return await fn(); } catch (err) { return { error: err.message }; }
}

exports.handler = async (event) => {
  connectBlobs(event);
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  const denied = await requireAdmin(event, body.password);
  if (denied) return denied;

  if (body.action === 'delete-text-list') {
    const store = blobStore('subscribers');
    const { blobs } = await store.list();
    // The keys are phone numbers like +15015551234. A bare "+" in the request path
    // can be read as a space, which misses the key and still reports success,
    // so delete the encoded spelling too and count what's left.
    for (const { key } of blobs) {
      await store.delete(key);
      if (encodeURIComponent(key) !== key) await store.delete(encodeURIComponent(key));
    }
    const remaining = (await store.list()).blobs.length;
    await logEvent('text-list-deleted', { count: blobs.length, remaining });
    return json(200, { deleted: blobs.length - remaining, remaining });
  }

  const storage = await checkStorage();
  const [subscribers, oldTextList, lastPublishId, events] = await Promise.all([
    section(listSubscribers),
    section(textList),
    section(async () => (await blobStore('pushmeta').get('last-publish-id')) || null),
    section(() => recentEvents()),
  ]);

  return json(200, {
    checkedAt: new Date().toISOString(),
    site: process.env.URL || null,
    settings: Object.fromEntries(SETTINGS.map((name) => [name, Boolean(process.env[name])])),
    pushKeys: checkPushKeys(),
    storage,
    subscribers,
    oldTextList,
    lastPublishId,
    events,
  });
};
