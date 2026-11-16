'use strict';

/* What search engines read. Google Search Console verifies the site by a tag in
 * the home page's <head>, and checks it again from time to time, so it must
 * stay. The sitemap lists every page at its canonical address with its
 * translation, as the pages' own tags give them; the two used to be able to
 * drift apart, and Google trusts neither when they disagree. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://commodity-options-calculator.vercel.app';
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const GUIDES = [
  ['soybean-price-floor', 'piso-de-precio-soja'], ['coffee-zero-cost-collar', 'collar-costo-cero-cafe'],
  ['crude-oil-price-cap', 'techo-de-precio-petroleo'], ['cattle-price-floor', 'piso-de-precio-ganado'],
  ['how-many-contracts', 'cuantos-contratos']
];
const PAGES = ['index.html', 'es/index.html', 'methodology.html', 'es/methodology.html', 'privacy.html', 'es/privacy.html',
  'guides/index.html', 'es/guides/index.html'].concat(...GUIDES.map(([en, es]) => [`guides/${en}.html`, `es/guides/${es}.html`]));

test('both home pages carry the Search Console tag, once', () => {
  for (const f of ['index.html', 'es/index.html']) {
    const head = read(f).split('</head>')[0];
    const tags = head.match(/<meta name="google-site-verification" content="([\w-]+)">/g) || [];
    assert.strictEqual(tags.length, 1, f);
    assert.ok(tags[0].includes('MkhI9BdhRHLILFjaZ5nG1LWmyYk-ftI0sKvP5ts3UyY'), f);
  }
});

test('the sitemap lists every page at its canonical address, with the translations its tags give', () => {
  // Every page the site serves is in the list.
  const html = ['', 'es/', 'guides/', 'es/guides/'].reduce((all, dir) =>
    all.concat(fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.html')).map(f => dir + f)), []);
  assert.deepStrictEqual(html.sort(), PAGES.slice().sort());

  const xml = read('sitemap.xml');
  const urls = Array.from(xml.matchAll(/<url>([\s\S]*?)<\/url>/g), m => ({
    loc: m[1].match(/<loc>([^<]+)<\/loc>/)[1],
    alternates: Array.from(m[1].matchAll(/<xhtml:link rel="alternate" hreflang="([\w-]+)" href="([^"]+)"\/>/g), a => [a[1], a[2]])
  }));
  const pages = PAGES.map(f => {
    const head = read(f).split('</head>')[0];
    return {
      loc: head.match(/<link rel="canonical" href="([^"]+)">/)[1],
      alternates: Array.from(head.matchAll(/<link rel="alternate" hreflang="([\w-]+)" href="([^"]+)">/g), a => [a[1], a[2]])
    };
  });
  assert.deepStrictEqual(urls, pages);
  // Each address is the page it names.
  for (const u of urls) {
    assert.ok(u.loc.startsWith(SITE + '/'), u.loc);
    const p = u.loc.slice(SITE.length + 1);
    assert.ok(fs.existsSync(path.join(ROOT, p.endsWith('/') || p === '' ? p + 'index.html' : p)), u.loc);
  }
});

test('robots.txt lets crawlers in, keeps them off the market function, and names the sitemap', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${SITE}/sitemap\\.xml$`, 'm'));
});

test('both files reach the site', () => {
  const ignored = read('.vercelignore').split('\n').map(l => l.trim()).filter(l => l.startsWith('/'));
  for (const f of ['sitemap.xml', 'robots.txt']) {
    assert.ok(!ignored.some(i => ('/' + f).startsWith(i)), `${f} is not in .vercelignore`);
  }
});
