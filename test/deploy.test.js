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

/* Every local file index.html loads or links, plus what the function needs. */
function needed() {
  const page = read('index.html');
  const local = Array.from(page.matchAll(/\b(?:src|href)="([^"#?]+)"/g), m => m[1])
    .filter(u => !/^(https?:)?\/\//.test(u) && !u.startsWith('mailto:'))
    .map(u => u.replace(/^\//, ''));
  // The preview image is named by an absolute URL, since crawlers resolve no
  // other kind, so it is mapped back to its file on this site.
  const site = (page.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  const own = site ? Array.from(page.matchAll(/\bcontent="([^"]+)"/g), m => m[1])
    .filter(u => u.startsWith(site) && u.length > site.length).map(u => u.slice(site.length)) : [];
  return Array.from(new Set(local.concat(own, ['index.html', 'api/market.js', 'commodities.js', 'package.json'])));
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
