// Lets the reader page report a notification problem from a phone, so it shows
// up in the admin diagnostics. Write-only: nothing is ever read back here.

const { json } = require('../lib/auth');
const { logEvent } = require('../lib/pushlog');

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if ((event.body || '').length > 2000) {
    return json(413, { error: 'Report too large.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid request body.' });
  }

  await logEvent('device-problem', {
    stage: clip(body.stage, 40),
    error: clip(body.error, 200),
    device: clip(body.device, 80),
    installed: body.installed === true,
    permission: clip(body.permission, 20),
  });
  return json(200, { ok: true });
};
