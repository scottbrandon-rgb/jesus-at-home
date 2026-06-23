const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');
const webpush = require('web-push');

const keyFor = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let subscription;
  try {
    ({ subscription } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  if (!subscription || !subscription.endpoint) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid subscription.' }) };
  }

  // Save the push subscription
  try {
    const store = getStore({
      name: 'pushsubs',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
    });
    await store.set(
      keyFor(subscription.endpoint),
      JSON.stringify({ subscription, subscribedAt: new Date().toISOString() })
    );
  } catch (err) {
    console.error('Blob store error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not save subscription. Please try again.' }) };
  }

  // Send a welcome push so the user sees it works (non-fatal if it fails)
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
  } catch (err) {
    console.error('Welcome push error:', err);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true }),
  };
};
