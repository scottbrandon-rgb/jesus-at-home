const webpush = require('web-push');
const { requireAdmin, blobStore, json } = require('../lib/auth');

const MAX_MESSAGE = 240; // phones cut notifications off well before this
const MAX_TITLE = 60;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let password, message, title, id;
  try {
    ({ password, message, title, id } = JSON.parse(event.body || '{}'));
  } catch {
    return json(400, { error: 'Invalid request body.' });
  }

  const denied = await requireAdmin(event, password);
  if (denied) return denied;

  if (typeof message !== 'string' || message.trim().length === 0) {
    return json(400, { error: 'Message cannot be empty.' });
  }
  if (message.trim().length > MAX_MESSAGE) {
    return json(400, { error: `Message is too long (${MAX_MESSAGE} characters max).` });
  }
  if (title && String(title).trim().length > MAX_TITLE) {
    return json(400, { error: `Title is too long (${MAX_TITLE} characters max).` });
  }

  // A publish notification carries an id so a re-run deploy can't send it twice
  if (id) {
    try {
      const sent = blobStore('pushmeta');
      if ((await sent.get('last-publish-id')) === String(id)) {
        return json(200, { sent: 0, errors: 0, total: 0, duplicate: true });
      }
      await sent.set('last-publish-id', String(id));
    } catch (err) {
      console.error('Duplicate check error:', err);
    }
  }

  const store = blobStore('pushsubs');

  let keys;
  try {
    const { blobs } = await store.list();
    keys = blobs.map((b) => b.key);
  } catch (err) {
    console.error('Blob list error:', err);
    return json(500, { error: 'Could not retrieve subscriber list.' });
  }

  if (keys.length === 0) {
    return json(200, { sent: 0, errors: 0, total: 0 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const payload = JSON.stringify({
    title: (title && title.trim()) || 'Jesus at Home',
    body: message.trim(),
    url: '/',
  });

  let sent = 0;
  let errors = 0;

  for (const key of keys) {
    let record;
    try {
      record = JSON.parse(await store.get(key));
    } catch {
      errors++;
      continue;
    }
    const sub = record && record.subscription;
    if (!sub || !sub.endpoint) {
      await store.delete(key);
      errors++;
      continue;
    }
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err) {
      // 404/410 mean the subscription is gone — clean it up
      if (err.statusCode === 404 || err.statusCode === 410) {
        await store.delete(key);
      }
      errors++;
    }
  }

  return json(200, { sent, errors, total: keys.length });
};
