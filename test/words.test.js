'use strict';

/* The Spanish page's words, es/words.js. Every word app.js can show has an
 * entry - the ones it writes out, the markets' and strategies' names, the
 * market function's messages - and nothing else does; each translation keeps
 * its key's {placeholders} and markup. A word added to app.js without its
 * Spanish fails here, rather than showing in English on the Spanish page. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./helpers/load-app');
const { calls } = require('./helpers/words');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SPANISH = require('../es/words.js');
const app = loadApp();

/* Every key the page can look up. */
function keys() {
  const src = read('app.js');
  const out = new Set();
  for (const fn of ['t', 'w', 'name']) for (const c of calls(src, fn)) if (c.key != null) out.add(c.key);
  // The words that come from data, as test/i18n.test.js lists their sources.
  for (const k of Object.keys(app.COMMODITIES)) {
    const c = app.COMMODITIES[k];
    out.add(c.label).add(c.unit);
    if (c.proxy) out.add(c.proxy);
  }
  for (const k of Object.keys(app.STRATEGIES)) out.add(app.STRATEGIES[k].label);
  // The market function's own messages, which the page shows as its errors.
  for (const m of read('api/market.js').matchAll(/fail\(res, \d+, '([^']+)'\)/g)) out.add(m[1]);
  return out;
}

test('every word the page can show has its Spanish', () => {
  const all = keys();
  assert.ok(all.size > 250, `${all.size} words`);
  const missing = Array.from(all).filter(k => !Object.prototype.hasOwnProperty.call(SPANISH, k));
  assert.deepStrictEqual(missing, []);
});

test('and nothing else: a word app.js no longer asks for is not kept', () => {
  const all = keys();
  assert.deepStrictEqual(Object.keys(SPANISH).filter(k => !all.has(k)), []);
});

const names = s => Array.from(s.matchAll(/\{(\w+)\}/g), m => m[1]).sort();
const tags = s => Array.from(s.matchAll(/<\/?[a-z]+\b[^>]*>|&\w+;/g), m => m[0]);

test('each translation fills the same {placeholders} and keeps the same markup', () => {
  for (const [en, es] of Object.entries(SPANISH)) {
    assert.strictEqual(typeof es, 'string', en);
    assert.ok(es.trim(), `${en}: empty`);
    assert.deepStrictEqual(names(es), names(en), `${en} -> ${es}`);
    assert.deepStrictEqual(tags(es), tags(en), `${en} -> ${es}`);
  }
});

test('the Spanish says what the English says about where a number came from', () => {
  // The honesty notes: a translation that dropped "not market data" or the
  // dollar sign of a multiplier would mislead in one language only.
  for (const [en, es] of Object.entries(SPANISH)) {
    if (/not market data/.test(en)) assert.match(es, /no es dato de mercado/, en);
    if (/\$\{mult\}/.test(en)) assert.match(es, /\$\{mult\}/, en);
    if (/reali[sz]ed/i.test(en)) assert.match(es, /realizada/, en);
  }
});
