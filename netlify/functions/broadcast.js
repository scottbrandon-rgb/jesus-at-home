const { getStore } = require('@netlify/blobs');
const webpush = require('web-push');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let password, message, title;
  try {
    ({ password, message, title } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid password.' }) };
  }

  if (!message || message.trim().length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Message cannot be empty.' }) };
  }

  if (message.trim().length > 1600) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Message is too long.' }) };
  }

  const store = getStore({
    name: 'pushsubs',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
  });

  let keys;
  try {
    const { blobs } = await store.list();
    keys = blobs.map((b) => b.key);
  } catch (err) {
    console.error('Blob list error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not retrieve subscriber list.' }) };
  }

  if (keys.length === 0) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sent: 0, errors: 0, total: 0 }),
    };
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

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sent, errors, total: keys.length }),
  };
};
