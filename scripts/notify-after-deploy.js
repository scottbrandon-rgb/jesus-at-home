// Runs in GitHub Actions after a push to main.
// If this push published a devotional with a notification (notify.json changed),
// wait until the live site is serving the new content.md, then send the push.
// Waiting on the live site (rather than a deploy step) means this works however
// Netlify deploys the site.

const { execSync } = require('child_process');
const fs = require('fs');

const WAIT_MS = 10 * 60 * 1000;
const POLL_MS = 15 * 1000;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normalize = (s) => s.replace(/\r\n/g, '\n').trim();

async function main() {
  const before = process.env.BEFORE_SHA || '';
  if (!before || /^0+$/.test(before)) return console.log('No previous commit to compare — skipping.');

  let changed;
  try {
    changed = execSync(`git diff --name-only ${before} HEAD`).toString().split('\n');
  } catch (err) {
    return console.log('Could not compare commits — skipping.', err.message);
  }
  if (!changed.includes('notify.json')) return console.log('No notification requested in this push.');

  const req = JSON.parse(fs.readFileSync('notify.json', 'utf8'));
  if (Date.now() - Date.parse(req.publishedAt) > MAX_AGE_MS) {
    return console.log('Notification is more than 6 hours old — not sending.');
  }

  const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
  if (!site) throw new Error('SITE_URL repository variable is not set.');
  if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD secret is not set.');

  const expected = normalize(fs.readFileSync('content.md', 'utf8'));
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      const res = await fetch(`${site}/content.md?nc=${Date.now()}`, { cache: 'no-store' });
      if (res.ok && normalize(await res.text()) === expected) break;
    } catch {}
    if (Date.now() > deadline) throw new Error('The new devotional did not go live within 10 minutes — notification not sent.');
    console.log('Waiting for the new devotional to go live…');
    await sleep(POLL_MS);
  }

  const res = await fetch(`${site}/.netlify/functions/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD, title: req.title, message: req.message, id: req.id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Broadcast failed (${res.status}): ${data.error || 'unknown error'}`);
  if (data.duplicate) return console.log('This notification was already sent — skipped.');
  console.log(`Notification sent to ${data.sent} of ${data.total} subscribers.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
