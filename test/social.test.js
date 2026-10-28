'use strict';

/* What a shared link shows. LinkedIn, X and messaging apps read the page's
 * markup without running any of it, so the preview has to be complete in
 * index.html, with absolute URLs, and the image it names has to be the size it
 * says. test/deploy.test.js checks that the deployment keeps the files. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function meta(key) {
  const m = html.match(new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`));
  return m ? m[1] : null;
}
const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
const links = Array.from(html.matchAll(/<link rel="(icon|apple-touch-icon)" href="\/?([^"]+)"/g), m => m[2]);

test('the page names one address, and the preview points at it', () => {
  assert.match(canonical || '', /^https:\/\/[^/]+\/$/);
  assert.strictEqual(meta('og:url'), canonical);
});

test('a shared link has a title, a description and a large image', () => {
  for (const k of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:image', 'og:image:alt', 'og:locale']) {
    assert.ok(meta(k), k);
  }
  assert.strictEqual(meta('twitter:card'), 'summary_large_image');
});

test('the preview promises nothing live', () => {
  // The disclaimer says the market data is historical or reference values, not
  // live quotes; the description once offered "live risk-free rates".
  for (const k of ['description', 'og:description', 'og:title']) {
    assert.doesNotMatch(meta(k), /\b(live|real[- ]time)\b/i, k);
  }
});

test('the preview image is on this site and is the size it says', () => {
  const url = meta('og:image');
  assert.ok(url.startsWith(canonical), `${url} is on ${canonical}`);
  const png = fs.readFileSync(path.join(ROOT, url.slice(canonical.length)));
  assert.strictEqual(png.toString('latin1', 1, 4), 'PNG');
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  assert.strictEqual(w, +meta('og:image:width'));
  assert.strictEqual(h, +meta('og:image:height'));
  // LinkedIn shows link images at 1.91:1 and crops anything else.
  assert.ok(Math.abs(w / h - 1.91) < 0.01, `ratio ${w / h}`);
  assert.ok(png.length < 5 * 1024 * 1024, 'under the 5 MB LinkedIn accepts');
});

test('the icons the page links exist, in the formats they claim', () => {
  assert.deepStrictEqual(links.slice().sort(), ['apple-touch-icon.png', 'favicon.ico', 'favicon.svg']);
  assert.match(fs.readFileSync(path.join(ROOT, 'favicon.svg'), 'utf8'), /^<svg [^>]*viewBox=/);
  const ico = fs.readFileSync(path.join(ROOT, 'favicon.ico'));
  assert.deepStrictEqual(Array.from(ico.subarray(0, 4)), [0, 0, 1, 0], 'an ICO header');
  const touch = fs.readFileSync(path.join(ROOT, 'apple-touch-icon.png'));
  assert.strictEqual(touch.toString('latin1', 1, 4), 'PNG');
  assert.deepStrictEqual([touch.readUInt32BE(16), touch.readUInt32BE(20)], [180, 180]);
});
