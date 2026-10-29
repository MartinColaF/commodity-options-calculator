'use strict';

/* Who stands behind a number, how it is worked out and when. The page had none of
 * it: no method, no source code, no date, one link in the footer. The
 * methodology is a page of text in each language, and the footer of each
 * calculator links it with the code, the issues and the policy. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SITE = 'https://commodity-options-calculator.vercel.app/';
const REPO = 'https://github.com/MartinColaF/commodity-options-calculator';

const PAGES = [
  { lang: 'en', page: 'index.html', doc: 'methodology.html', home: '/', privacy: '/privacy.html',
    reviewed: /Methodology last reviewed (\w+ \d{4})\./, updated: /<p>Updated (\w+ \d{4})<\/p>/ },
  { lang: 'es', page: 'es/index.html', doc: 'es/methodology.html', home: '/es/', privacy: '/es/privacy.html',
    reviewed: /Metodología revisada por última vez en (\w+ de \d{4})\./, updated: /<p>Actualizado en (\w+ de \d{4})<\/p>/ }
];

test("each calculator's footer links its methodology, the code, the issues and its policy", () => {
  for (const p of PAGES) {
    const footer = read(p.page).match(/<footer>([\s\S]*?)<\/footer>/)[1];
    const links = Array.from(footer.matchAll(/<a href="([^"]+)"/g), m => m[1]);
    assert.deepStrictEqual(links, ['/' + p.doc, REPO, REPO + '/issues', p.privacy], p.page);
  }
});

test('the date in the footer is the one the methodology was last reviewed', () => {
  // A date on its own goes stale unnoticed; tied to the methodology's, it moves
  // when the method is reviewed. The two languages say the same month.
  const months = { October: 'octubre' };
  const en = PAGES[0], es = PAGES[1];
  const updated = read(en.page).match(en.updated)[1];
  assert.strictEqual(read(en.doc).match(en.reviewed)[1], updated);
  const [month, year] = updated.split(' ');
  assert.ok(months[month], `the Spanish for ${month} - add it here`);
  assert.strictEqual(read(es.page).match(es.updated)[1], `${months[month]} de ${year}`);
  assert.strictEqual(read(es.doc).match(es.reviewed)[1], `${months[month]} de ${year}`);
});

test('the methodology pages wear the site, lead back, and name each other', () => {
  for (const p of PAGES) {
    const html = read(p.doc);
    assert.match(html, new RegExp(`<html lang="${p.lang}">`));
    assert.match(html, /<link rel="stylesheet" href="(\.\.\/)?styles\.css">/);
    assert.doesNotMatch(html, /<script\b|<style\b/, 'no script and no style of its own');
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, new RegExp(`<nav class="doc-nav">\\s*<a href="${p.home}">&larr; `));
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}${p.doc}">`));
    for (const q of PAGES) assert.match(html, new RegExp(`hreflang="${q.lang}" href="${SITE}${q.doc}"`));
  }
});

test('the Spanish methodology is the English one, section for section', () => {
  const sections = f => Array.from(read(f).matchAll(/<h2>(\d+)\./g), m => m[1]);
  assert.deepStrictEqual(sections(PAGES[1].doc), sections(PAGES[0].doc));
  assert.ok(sections(PAGES[0].doc).length >= 6);
  const external = f => Array.from(read(f).matchAll(/<a href="(https:[^"]+)"/g), m => m[1]);
  assert.deepStrictEqual(external(PAGES[1].doc), external(PAGES[0].doc));
});

test('the methodology says what the page says about its numbers, and quotes what was measured', () => {
  const en = read(PAGES[0].doc), es = read(PAGES[1].doc);
  assert.match(en, /It is not implied volatility/);
  assert.match(es, /No es volatilidad implícita/);
  assert.match(en, /Nothing here is investment advice\./);
  assert.match(es, /Nada de esto es asesoramiento de inversión\./);
  // The figures it quotes are the ones the README reports as measured: when a
  // measurement changes there, it changes here, in both languages.
  const readme = read('README.md');
  for (const figure of ['0.008%', '0.58%', '2.6%', '$12.84', '24,768', '−37.63']) {
    assert.ok(readme.includes(figure), `README states ${figure}`);
    assert.ok(en.includes(figure) && es.includes(figure), `both methodologies quote ${figure}`);
  }
});
