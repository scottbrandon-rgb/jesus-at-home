const { getStore } = require('@netlify/blobs');

function store() {
  return getStore({
    name: 'pushsubs',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
  });
}

exports.handler = async (event) => {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  if (body.password !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const s = store();

  // DELETE a specific number
  if (event.httpMethod === 'DELETE' && body.phone) {
    await s.delete(body.phone);
    return { statusCode: 200, body: JSON.stringify({ deleted: body.phone }) };
  }

  // LIST all subscribers
  const { blobs } = await s.list();
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribers: blobs.map(b => b.key), count: blobs.length }),
  };
};
