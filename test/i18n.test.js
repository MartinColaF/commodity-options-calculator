'use strict';

/* The page's words. app.js writes every word a reader sees through t(), keyed
 * by its English text, so that a page published in another language can hold
 * its own: the English page has no table and reads exactly as written. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, wired } = require('./helpers/load-app');
const { calls } = require('./helpers/words');

const ROOT = path.resolve(__dirname, '..');
const words = require('../i18n.js');
const source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

test('t() gives back the English text, with its {placeholders} filled', () => {
  assert.strictEqual(words.PAGE_LANG, 'en', 'with no page, the language the code is written in');
  assert.strictEqual(words.t('Max profit'), 'Max profit');
  assert.strictEqual(words.t('{n} of {m} legs', { n: 2, m: 3 }), '2 of 3 legs');
  assert.strictEqual(words.t('{n} and {n}', { n: 0 }), '0 and 0', 'a name used twice, and a zero');
  assert.strictEqual(words.t('{price} {other}', { price: '$& $1' }), '$& $1 {other}',
    'a value is put in as it is, and a name with no value is left alone');
  assert.ok(!Object.prototype.hasOwnProperty.call(words.TRANSLATIONS, 'en'), 'English needs no table');
});

test('a page in another language takes its words from its table, and English for the rest', () => {
  const xx = { 'Max profit': 'XX profit', '{n} days': '{n} XX-days', 'Horizon': 'XX horizon' };
  const { app, el } = wired({ lang: 'XX-yy', words: { xx } });
  app.state.legs = [app.newLeg({ kind: 'call', strike: 4000, days: 30 })];
  app.renderResults();
  const html = el('summary').innerHTML;
  assert.match(html, /<span>XX profit<\/span>/);
  assert.match(html, /<span>XX horizon<\/span><strong>30 XX-days<\/strong>/);
  assert.match(html, /<span>Max loss<\/span>/, 'a word with no entry stays in English');
});

test("a table's lookups cannot reach the object's own properties", () => {
  const app = loadApp({ lang: 'xx', words: { xx: { 'Max loss': 'XX loss' } } });
  assert.strictEqual(app.t('Max loss'), 'XX loss');
  assert.strictEqual(app.t('constructor'), 'constructor');
  assert.strictEqual(app.t('__proto__'), '__proto__');
  // A language named like a property of every object has no table.
  assert.strictEqual(loadApp({ lang: '__proto__' }).t('Max loss'), 'Max loss');
});

/* The keys that come from data, each where it is read. Anything else a page's
 * table must be able to find by searching the source for its text. */
const FROM_DATA = [
  'json.error',                // the market function's own message
  'c.unit', 'c.label',         // a market in commodities.js
  'COMMODITIES[k].label',
  'meta.proxy',                // the market's ETF proxy, described
  'STRATEGIES[k].label',
  'what', 'text'               // legRowHtml's helpers, called with literals
];

test("every word t() is asked for is written out in app.js, or comes from the markets' and strategies' tables", () => {
  const all = calls(source, 't');
  assert.ok(all.length > 150, `${all.length} calls`);
  const expressions = all.filter(c => c.expression != null);
  for (const c of expressions) {
    assert.ok(FROM_DATA.includes(c.expression), `app.js:${c.line} t(${c.expression}) - a key a table cannot list`);
  }
  // legRowHtml's two helpers take only literals, which they hand to t().
  for (const fn of ['w', 'name']) {
    const helper = calls(source, fn);
    assert.ok(helper.length > 5, fn);
    for (const c of helper) assert.strictEqual(c.expression, undefined, `app.js:${c.line} ${fn}(${c.expression})`);
  }
  assert.ok(all.some(c => c.key === 'Position column = per-unit greek × quantity × ${mult} multiplier.'),
    'a key made of a literal is read whole');
  assert.ok(all.some(c => c.key && c.key.startsWith('Theta is the options\' own decay. The P&amp;L also carries the ' +
    "premium's interest: {amount} a day at {rate}%.")), 'and one made of literals joined with +');
});

test('every placeholder in a key is a plain {name}', () => {
  for (const c of calls(source, 't')) {
    if (c.key == null) continue;
    const braces = c.key.replace(/\{\w+\}/g, '');
    assert.doesNotMatch(braces, /[{}]/, `app.js:${c.line} ${c.key}`);
  }
});

test("under the tests, a t() call missing a placeholder's value fails rather than showing braces", () => {
  const app = loadApp();
  assert.throws(() => app.t('{n} days'), /has no value for \{n\}/);
  assert.throws(() => app.t('{n} of {m}', { n: 1 }), /has no value for \{m\}/);
  assert.strictEqual(app.t('{n} days', { n: 3 }), '3 days');
});

test('i18n.js loads before app.js, which writes its words through it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const order = ['commodities.js', 'i18n.js', 'app.js'].map(f => html.indexOf(`<script src="${f}"></script>`));
  assert.ok(order.every(i => i > 0), order.join());
  assert.deepStrictEqual(order.slice().sort((a, b) => a - b), order);
});

test('a count of one reads in the singular, as each language writes it', () => {
  // A sentence per form, where "1 days" used to be built with an "s" on the end.
  const { app, el } = wired();
  app.state.legs = [app.newLeg({ kind: 'call', strike: 4000, days: 1 })];
  app.state.chart.tDays = 1;
  app.renderResults();
  assert.match(el('summary').innerHTML, /<span>Horizon<\/span><strong>1 day<\/strong>/);
  assert.strictEqual(el('tDaysLabel').textContent, 'in 1 day');
});
