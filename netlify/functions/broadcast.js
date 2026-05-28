const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let password, message;
  try {
    ({ password, message } = JSON.parse(event.body || '{}'));
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

  // Retrieve all subscribers
  let phones;
  try {
    const store = getStore({ name: 'subscribers', consistency: 'strong' });
    const { blobs } = await store.list();
    phones = blobs.map(b => b.key);
  } catch (err) {
    console.error('Blob list error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not retrieve subscriber list.' }) };
  }

  if (phones.length === 0) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sent: 0, errors: 0, total: 0 }),
    };
  }

  const sid   = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  const from  = process.env.TWILIO_FROM;
  const auth  = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');

  let sent = 0;
  let errors = 0;

  // Send sequentially to avoid rate-limit bursts (Twilio free tier is 1 msg/sec)
  for (const phone of phones) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ From: from, To: phone, Body: message.trim() }),
        }
      );
      res.ok ? sent++ : errors++;
    } catch {
      errors++;
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sent, errors, total: phones.length }),
  };
};
