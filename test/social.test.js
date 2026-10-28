'use strict';

/* What a shared link shows. LinkedIn, X and messaging apps read the page's
 * markup without running any of it, so the preview has to be complete in
 * index.html, with absolute URLs, and the image it names has to be the size it
 * says. The Spanish page, es/index.html, has its own. test/deploy.test.js
 * checks that the deployment keeps the files. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://commodity-options-calculator.vercel.app/';
/* Each page, the folder it is served from and its language. */
const PAGES = [['index.html', '', 'en_US'], ['es/index.html', 'es/', 'es_LA']].map(([file, dir, locale]) => {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const meta = key => {
    const m = html.match(new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`));
    return m ? m[1] : null;
  };
  return { file, dir, locale, html, meta, canonical: (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] };
});

test('each page names one address, and its preview points at it', () => {
  for (const p of PAGES) {
    assert.strictEqual(p.canonical, SITE + p.dir, p.file);
    assert.strictEqual(p.meta('og:url'), p.canonical, p.file);
  }
});

test('a shared link has a title, a description and a large image, in the page\'s language', () => {
  for (const p of PAGES) {
    for (const k of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:image', 'og:image:alt', 'og:locale']) {
      assert.ok(p.meta(k), `${p.file} ${k}`);
    }
    assert.strictEqual(p.meta('twitter:card'), 'summary_large_image');
    assert.strictEqual(p.meta('og:locale'), p.locale);
    assert.strictEqual(p.meta('og:locale:alternate'), PAGES.find(q => q !== p).locale, 'and names the other');
  }
});

test('the preview promises nothing live', () => {
  // The disclaimer says the market data is historical or reference values, not
  // live quotes; the description once offered "live risk-free rates".
  for (const p of PAGES) {
    for (const k of ['description', 'og:description', 'og:title']) {
      assert.doesNotMatch(p.meta(k), /\b(live|real[- ]time)\b|en vivo|tiempo real/i, `${p.file} ${k}`);
    }
  }
});

test('each preview image is on this site, beside its page, and is the size it says', () => {
  for (const p of PAGES) {
    const url = p.meta('og:image');
    assert.ok(url.startsWith(p.canonical), `${url} is on ${p.canonical}`);
    const png = fs.readFileSync(path.join(ROOT, p.dir, url.slice(p.canonical.length)));
    assert.strictEqual(png.toString('latin1', 1, 4), 'PNG');
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    assert.strictEqual(w, +p.meta('og:image:width'));
    assert.strictEqual(h, +p.meta('og:image:height'));
    // LinkedIn shows link images at 1.91:1 and crops anything else.
    assert.ok(Math.abs(w / h - 1.91) < 0.01, `ratio ${w / h}`);
    assert.ok(png.length < 5 * 1024 * 1024, 'under the 5 MB LinkedIn accepts');
  }
});

test('the icons the pages link exist, in the formats they claim', () => {
  for (const p of PAGES) {
    const links = Array.from(p.html.matchAll(/<link rel="(icon|apple-touch-icon)" href="([^"]+)"/g),
      m => path.relative(ROOT, path.join(ROOT, p.dir, m[2])));
    assert.deepStrictEqual(links.slice().sort(), ['apple-touch-icon.png', 'favicon.ico', 'favicon.svg'], p.file);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'favicon.svg'), 'utf8'), /^<svg [^>]*viewBox=/);
  const ico = fs.readFileSync(path.join(ROOT, 'favicon.ico'));
  assert.deepStrictEqual(Array.from(ico.subarray(0, 4)), [0, 0, 1, 0], 'an ICO header');
  const touch = fs.readFileSync(path.join(ROOT, 'apple-touch-icon.png'));
  assert.strictEqual(touch.toString('latin1', 1, 4), 'PNG');
  assert.deepStrictEqual([touch.readUInt32BE(16), touch.readUInt32BE(20)], [180, 180]);
});
