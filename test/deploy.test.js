'use strict';

/* What Vercel deploys. .vercelignore keeps the notes, tests and tooling off the
 * public site; these tests make sure it never takes anything the page or the
 * market function needs with them. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const patterns = read('.vercelignore').split('\n')
  .map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const ignored = file => patterns.some(p => {
  const x = p.slice(1).replace(/\/$/, '');
  return file === x || file.startsWith(x + '/');
});

const SITE = 'https://commodity-options-calculator.vercel.app/';
const PAGES = ['index.html', 'privacy.html', 'methodology.html', 'es/index.html', 'es/privacy.html', 'es/methodology.html'];

/* Every local file the pages load or link, plus what the function needs. A
 * path is read the way the browser reads it: from the site's root when it
 * starts with /, from the page's own folder otherwise; a folder is its
 * index.html. */
function needed() {
  const files = ['api/market.js', 'commodities.js', 'package.json'].concat(PAGES);
  for (const file of PAGES) {
    const page = read(file);
    const dir = path.posix.dirname(file);
    const local = Array.from(page.matchAll(/\b(?:src|href)="([^"#?]+)"/g), m => m[1])
      .filter(u => !/^(https?:)?\/\//.test(u) && !u.startsWith('mailto:'))
      .map(u => (u.startsWith('/') ? u.slice(1) : path.posix.normalize(path.posix.join(dir, u))));
    // The preview images are named by absolute URLs, since crawlers resolve no
    // other kind, so each is mapped back to its file on this site.
    const own = Array.from(page.matchAll(/\b(?:content|href)="([^"]+)"/g), m => m[1])
      .filter(u => u.startsWith(SITE)).map(u => u.slice(SITE.length));
    files.push(...local, ...own);
  }
  return Array.from(new Set(files.map(f => (f === '' || f.endsWith('/') ? f + 'index.html' : f))));
}

test('.vercelignore uses only plain root-anchored paths', () => {
  // Globs and negations would make the checks below unreliable.
  assert.ok(patterns.length > 0);
  for (const p of patterns) assert.match(p, /^\/[^*?![\]]+$/, p);
});

test('nothing the page or the market function needs is left out of the deployment', () => {
  const files = needed();
  assert.ok(files.includes('app.js') && files.includes('styles.css') && files.includes('privacy.html'));
  assert.ok(files.includes('og.png') && files.includes('favicon.ico'), 'the preview image and the icons too');
  assert.ok(['es/words.js', 'es/og.png', 'i18n.js'].every(f => files.includes(f)), 'and the Spanish page\'s');
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} exists`);
    assert.ok(!ignored(f), `${f} is needed by the site but .vercelignore drops it`);
  }
});

test('the notes, tests and tooling are not deployed', () => {
  for (const f of ['CLAUDE.md', 'test/api.test.js', 'test/fixtures/treasury-2026-10.xml',
    'scripts/serve.js', '.github/workflows/test.yml', 'eslint.config.mjs']) {
    assert.ok(ignored(f), `${f} would be served on the public site`);
  }
});
