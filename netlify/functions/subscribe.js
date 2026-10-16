const crypto = require('crypto');
const webpush = require('web-push');
const { blobStore, connectBlobs, json } = require('../lib/auth');
const { logEvent, pushService } = require('../lib/pushlog');

const keyFor = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');

exports.handler = async (event) => {
  connectBlobs(event);
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // resync: the page re-saving a phone that already turned notifications on
  let subscription, resync;
  try {
    ({ subscription, resync } = JSON.parse(event.body || '{}'));
  } catch {
    return json(400, { error: 'Invalid request body.' });
  }

  if (!subscription || !subscription.endpoint) {
    return json(400, { error: 'Invalid subscription.' });
  }

  const key = keyFor(subscription.endpoint);
  const id = key.slice(0, 8);
  const service = pushService(subscription.endpoint);
  const now = new Date().toISOString();

  // Save the push subscription (same key every time, so saving again is harmless)
  let existing = null;
  try {
    const store = blobStore('pushsubs');
    try { existing = JSON.parse((await store.get(key)) || 'null'); } catch {}
    await store.set(key, JSON.stringify({
      subscription,
      subscribedAt: (existing && existing.subscribedAt) || now,
      lastSeen: now,
    }));
  } catch (err) {
    console.error('Blob store error:', err);
    await logEvent('subscribe-failed', { id, service, error: err.message });
    return json(500, { error: 'Could not save subscription. Please try again.' });
  }

  // Send a welcome push so the user sees it works (non-fatal if it fails)
  let welcome = 'skipped';
  if (!resync) {
    try {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      await webpush.sendNotification(subscription, JSON.stringify({
        title: 'Jesus at Home',
        body: "You're all set! We'll let you know each Thursday when a new devotional is ready.",
        url: '/',
      }));
      welcome = 'sent';
    } catch (err) {
      console.error('Welcome push error:', err);
      welcome = `failed${err.statusCode ? ` (${err.statusCode})` : ''}: ${String(err.body || err.message).slice(0, 200)}`;
    }
  }

  // A return visit that changed nothing isn't worth logging
  if (!(resync && existing)) {
    await logEvent(resync ? 'subscription-restored' : 'subscribed', { id, service, welcome });
  }

  return json(200, { success: true, id, welcome });
};
