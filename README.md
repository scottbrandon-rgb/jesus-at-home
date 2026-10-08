# Jesus at Home

A weekly family devotional from Harrison Faith Youth: a small static site, installable as an app (PWA), with free Web Push notifications. Hosted on Netlify.

## How it works

| Piece | Files |
|---|---|
| This week's devotional | `content.md`, published from an Obsidian note (front matter, callouts and highlights supported) |
| Reader | `index.html`, `style.css`, `render.js` (shared Markdown renderer) |
| Past weeks | `archive/YYYY-MM-DD.md`, written on each publish |
| App shell + push | `manifest.json`, `sw.js` |
| Admin | `admin.html`: sign in, then **Publish Devotional** or **Send Notification** |
| Functions | `netlify/functions/`: `publish`, `broadcast`, `subscribe`, `manage-subscribers`. Shared login and lockout code is in `netlify/lib/auth.js` |
| Deploy + notify | `.github/workflows/deploy.yml`, `scripts/notify-after-deploy.js` |
| Obsidian | `obsidian/`: CSS snippet, weekly template, setup guide |

## Publishing flow

1. Write the note in Obsidian from `obsidian/Jesus at Home Template.md`.
2. In `/admin.html`, choose **Publish Devotional** and upload the note. Any file name works.
3. The `publish` function makes one commit to `main` containing `content.md`, `archive/<week>.md`, and (if notifying) `notify.json`.
4. The site deploys. The workflow's `notify` job waits until the live site serves the new `content.md`, then sends the notification. A publish notification is never sent twice.

## Configuration

**Netlify environment variables**

| Name | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Admin sign-in (5 wrong tries locks that IP out for 15 minutes) |
| `NETLIFY_SITE_ID`, `NETLIFY_API_TOKEN` | Netlify Blobs (subscribers, lockouts) |
| `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push. The public key is also in `index.html` |
| `GITHUB_TOKEN` | Fine-grained token for this repo only, with **Contents: read and write**. Used by `publish` |

**GitHub (Settings → Secrets and variables → Actions)**

| Name | Kind | Purpose |
|---|---|---|
| `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` | Secrets | Deploy |
| `ADMIN_PASSWORD` | Secret | Lets the workflow send the publish notification |
| `SITE_URL` | Variable | The live site address, e.g. `https://example.netlify.app` |
