const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let phone;
  try {
    ({ phone } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  if (!phone) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Phone number is required.' }) };
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Please enter a valid 10-digit US phone number.' }) };
  }
  const e164 = `+1${digits.length === 11 ? digits.slice(1) : digits}`;

  // Store subscriber — each phone is its own key so duplicates are idempotent
  try {
    const store = getStore({ name: 'subscribers', consistency: 'strong' });
    await store.set(e164, JSON.stringify({ subscribedAt: new Date().toISOString() }));
  } catch (err) {
    console.error('Blob store error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save subscription. Please try again.' }) };
  }

  // Send confirmation text via Twilio
  const sid   = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  const from  = process.env.TWILIO_FROM;

  if (!sid || !token || !from) {
    console.error('Missing Twilio environment variables');
    return { statusCode: 500, body: JSON.stringify({ error: 'Notification service not configured.' }) };
  }

  try {
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: from,
          To:   e164,
          Body: "Welcome! You're subscribed to Jesus at Home weekly updates from Harrison Faith Church. Reply STOP anytime to unsubscribe.",
        }),
      }
    );

    if (!twilioRes.ok) {
      const errText = await twilioRes.text();
      console.error('Twilio error:', errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not send confirmation text. Check your number and try again.' }) };
    }
  } catch (err) {
    console.error('Twilio fetch error:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Notification service unavailable. Try again shortly.' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true }),
  };
};
