// Runs in GitHub Actions (the "Notification diagnostics" workflow).
// Asks the live site's diagnostics function for a health report and prints it.
// The repository is public, so only non-secret details are printed.

const fs = require('fs');

const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
const mark = (ok) => (ok === true ? '✓' : ok === false ? '✗' : '?');

function pageKey() {
  const m = fs.readFileSync('index.html', 'utf8').match(/VAPID_PUBLIC_KEY\s*=\s*'([^']+)'/);
  return m ? m[1] : null;
}

function describe(e) {
  const { at, type, ...rest } = e;
  const detail = Object.entries(rest)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('  ');
  return `${at}  ${type}  ${detail}`;
}

async function main() {
  if (!site) throw new Error('SITE_URL is not set.');
  if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD secret is not set.');

  console.log(`Site: ${site}`);
  const res = await fetch(`${site}/.netlify/functions/diagnostics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  });
  const r = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("GitHub's ADMIN_PASSWORD does not match Netlify's.");
  if (!res.ok) throw new Error(`Diagnostics failed (${res.status}): ${r.error || 'unknown error'}`);

  console.log(`Checked: ${r.checkedAt}`);
  console.log(`Netlify says the site is: ${r.site}\n`);

  console.log('Netlify settings');
  for (const [name, set] of Object.entries(r.settings)) console.log(`  ${mark(set)} ${name}`);

  const k = r.pushKeys;
  const key = pageKey();
  console.log('\nPush keys');
  console.log(`  ${mark(k.keysMatch)} Private key matches public key`);
  console.log(`  ${mark(k.subjectValid)} VAPID_SUBJECT starts with mailto: or https:`);
  console.log(`  ${mark(Boolean(key) && key === k.publicKey)} Key in index.html matches Netlify's VAPID_PUBLIC_KEY`);
  if (k.error) console.log(`    ${k.error}`);

  const st = r.storage;
  const storageOk = st.write === 'ok' && st.read === 'ok';
  console.log(`\nStorage (using ${st.credentials === 'automatic' ? "Netlify's automatic credentials" : 'NETLIFY_SITE_ID + NETLIFY_API_TOKEN'})`);
  console.log(`  ${mark(st.write === 'ok')} Write${st.write === 'ok' ? '' : `: ${st.write}`}`);
  console.log(`  ${mark(st.read === 'ok')} Read${st.read === 'ok' ? '' : `: ${st.read}`}`);
  if (!storageOk) console.log('  The lists below are unreliable: a list Netlify refuses comes back empty.');

  console.log('\nSubscribers');
  if (r.subscribers.error) {
    console.log(`  ✗ ${r.subscribers.error}`);
  } else {
    console.log(`  ${r.subscribers.count} saved`);
    for (const s of r.subscribers.list) {
      console.log(`  ${s.id}  ${s.service}  subscribed ${s.subscribedAt || '?'}  last seen ${s.lastSeen || '?'}`);
    }
  }

  console.log('\nOld text-message list');
  console.log(r.oldTextList.error ? `  ✗ ${r.oldTextList.error}` : `  ${r.oldTextList.count} phone numbers`);

  const last = r.lastPublishId;
  console.log(`\nLast publish notification id: ${last && last.error ? `✗ ${last.error}` : last || 'none'}`);

  console.log('\nRecent activity (newest first)');
  if (r.events.error) console.log(`  ✗ ${r.events.error}`);
  else if (!r.events.length) console.log('  none yet');
  else r.events.forEach((e) => console.log(`  ${describe(e)}`));
}

main().catch((err) => { console.error(err.message); process.exit(1); });
