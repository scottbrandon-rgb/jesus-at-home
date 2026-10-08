// Publishes a devotional: commits the uploaded note to GitHub as content.md,
// plus a dated copy in archive/. When a notification is requested it also
// writes notify.json, which the deploy workflow sends once the site is live.

const crypto = require('crypto');
const { requireAdmin, json } = require('../lib/auth');

const REPO = process.env.GITHUB_REPO || 'scottbrandon-rgb/jesus-at-home';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const MAX_BYTES = 200 * 1024;
const MAX_MESSAGE = 240;
const MAX_TITLE = 60;

function todayCentral() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'jesus-at-home-publish',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`GitHub ${method} ${path} → ${res.status}: ${data.message || 'error'}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// One commit containing every file, so the site deploys once.
async function commitFiles(files, message) {
  const ref = await gh('GET', `/git/ref/heads/${BRANCH}`);
  const parent = await gh('GET', `/git/commits/${ref.object.sha}`);
  const tree = await gh('POST', '/git/trees', {
    base_tree: parent.tree.sha,
    tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
  });
  const commit = await gh('POST', '/git/commits', { message, tree: tree.sha, parents: [ref.object.sha] });
  await gh('PATCH', `/git/refs/heads/${BRANCH}`, { sha: commit.sha });
  return commit;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return json(400, { error: 'Invalid request body.' });
  }

  const denied = await requireAdmin(event, body.password);
  if (denied) return denied;

  if (!process.env.GITHUB_TOKEN) {
    return json(500, { error: 'Publishing is not set up yet (GITHUB_TOKEN is missing).' });
  }

  const markdown = typeof body.markdown === 'string' ? body.markdown.replace(/\r\n/g, '\n') : '';
  if (!markdown.trim()) return json(400, { error: 'The devotional is empty.' });
  if (Buffer.byteLength(markdown) > MAX_BYTES) return json(400, { error: 'The file is too large (200 KB max).' });

  const week = /^\d{4}-\d{2}-\d{2}$/.test(body.week || '') ? body.week : todayCentral();

  const notify = body.notify || {};
  const message = String(notify.message || '').trim();
  const title = String(notify.title || '').trim() || 'Jesus at Home';
  if (notify.send) {
    if (!message) return json(400, { error: 'The notification message is empty.' });
    if (message.length > MAX_MESSAGE) return json(400, { error: `Notification is too long (${MAX_MESSAGE} characters max).` });
    if (title.length > MAX_TITLE) return json(400, { error: `Notification title is too long (${MAX_TITLE} characters max).` });
  }

  const content = markdown.endsWith('\n') ? markdown : markdown + '\n';
  const files = [
    { path: 'content.md', content },
    { path: `archive/${week}.md`, content },
  ];
  if (notify.send) {
    files.push({
      path: 'notify.json',
      content: JSON.stringify({
        id: crypto.randomUUID(),
        publishedAt: new Date().toISOString(),
        week,
        title,
        message,
      }, null, 2) + '\n',
    });
  }

  try {
    const commit = await commitFiles(
      files,
      `Publish devotional for week of ${week}${notify.send ? '' : ' (no notification)'}`
    );
    return json(200, { success: true, week, commit: commit.sha, url: commit.html_url, notify: !!notify.send });
  } catch (err) {
    console.error('Publish error:', err);
    const hint = err.status === 401 || err.status === 403 || err.status === 404
      ? ' Check that GITHUB_TOKEN is valid and can write to the repository.'
      : '';
    return json(502, { error: 'Could not save to GitHub.' + hint });
  }
};
