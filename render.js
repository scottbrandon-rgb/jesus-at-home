// Jesus at Home — shared Markdown renderer
// Used by the reader (index.html) and the publish preview (admin.html) so both
// show exactly the same thing. Understands the Obsidian features we write in:
// front matter, callouts, ==highlights==, %%comments%%, [[wikilinks]].
// Requires marked and DOMPurify to be loaded first.

(function (global) {
  // ── Front matter ───────────────────────────────────────────────────
  // Reads simple `key: value` lines. List values (like cssclasses) are skipped.
  function parseFrontMatter(src) {
    const m = src.match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
    if (!m) return { meta: {}, body: src.replace(/^﻿/, '') };
    const meta = {};
    m[1].split(/\r?\n/).forEach((line) => {
      const kv = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
      if (!kv) return;
      let v = kv[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      else if (v === 'true') v = true;
      else if (v === 'false') v = false;
      meta[kv[1].toLowerCase()] = v;
    });
    return { meta, body: src.slice(m[0].length) };
  }

  // ── Obsidian syntax → plain Markdown/HTML (skips fenced code) ──────
  function convertObsidian(body, warnings) {
    let embeds = 0;
    const parts = body.replace(/%%[\s\S]*?%%/g, '').split(/(^```[\s\S]*?^```)/m);
    const out = parts.map((part, i) => {
      if (i % 2 === 1) return part; // fenced code block
      return part
        .replace(/!\[\[[^\]]*\]\]/g, () => { embeds++; return ''; })
        .replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target, alias) => (alias || target).trim())
        .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
    }).join('');
    if (embeds) {
      warnings.push(`${embeds} embedded file${embeds > 1 ? 's' : ''} (![[…]]) left out — images in your vault don't upload with the note.`);
    }
    return out;
  }

  // ── Callouts: > [!type] Title ──────────────────────────────────────
  // Builds the same structure Obsidian uses, so one set of styles fits both.
  function buildCallouts(root) {
    root.querySelectorAll('blockquote').forEach((bq) => {
      const first = bq.firstElementChild;
      if (!first || first.tagName !== 'P') return;
      const html = first.innerHTML;
      const br = html.search(/<br\s*\/?>/i);
      const head = br === -1 ? html : html.slice(0, br);
      const m = head.match(/^\s*\[!([\w-]+)\][+-]?\s*([\s\S]*)$/);
      if (!m) return;

      const type = m[1].toLowerCase();
      // Same default as Obsidian: the type name with a capital first letter
      const title = m[2].trim() || type.charAt(0).toUpperCase() + type.slice(1);
      const rest = br === -1 ? '' : html.slice(br).replace(/^<br\s*\/?>\s*/i, '');

      const callout = document.createElement('div');
      callout.className = 'callout';
      callout.dataset.callout = type;
      const titleEl = document.createElement('div');
      titleEl.className = 'callout-title';
      const inner = document.createElement('div');
      inner.className = 'callout-title-inner';
      inner.innerHTML = title;
      titleEl.appendChild(inner);
      const content = document.createElement('div');
      content.className = 'callout-content';

      if (rest.trim()) first.innerHTML = rest;
      else first.remove();
      while (bq.firstChild) content.appendChild(bq.firstChild);

      callout.appendChild(titleEl);
      if (content.childNodes.length) callout.appendChild(content);
      bq.replaceWith(callout);
    });
  }

  // ── Main entry ─────────────────────────────────────────────────────
  // Returns { html, meta, title, warnings }
  function render(src) {
    const warnings = [];
    const { meta, body } = parseFrontMatter(String(src || ''));
    const md = convertObsidian(body, warnings);

    marked.setOptions({ breaks: true, gfm: true });
    const clean = DOMPurify.sanitize(marked.parse(md));

    const tpl = document.createElement('template');
    tpl.innerHTML = clean;
    buildCallouts(tpl.content);

    const h1 = tpl.content.querySelector('h1');
    const box = document.createElement('div');
    box.appendChild(tpl.content);
    return {
      html: box.innerHTML,
      meta,
      title: h1 ? h1.textContent.trim() : '',
      warnings,
    };
  }

  global.JAH = { render, parseFrontMatter };
})(window);
