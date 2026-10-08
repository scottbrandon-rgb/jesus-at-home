const { requireAdmin, blobStore, json } = require('../lib/auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  const denied = await requireAdmin(event, body.password);
  if (denied) return denied;

  const s = blobStore('pushsubs');

  // DELETE one subscription by its key
  if (event.httpMethod === 'DELETE' && body.key) {
    await s.delete(body.key);
    return json(200, { deleted: body.key });
  }

  // LIST all subscribers (also used by the admin sign-in)
  const { blobs } = await s.list();
  return json(200, { subscribers: blobs.map((b) => b.key), count: blobs.length });
};
