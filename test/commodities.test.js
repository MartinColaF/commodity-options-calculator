'use strict';

/* commodities.js is the one table of markets, read by the page and by the
 * market-data function. It used to be three lists in two shapes, and the page's
 * list of markets the function serves was a literal: forgetting to extend it
 * made the data buttons fail with "no futures contract mapped", and no test
 * noticed. These tests pin the page and the function to the same table. */

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load-app.js');
const TABLE = require('../commodities.js');

const app = loadApp();
const withFutures = Object.keys(TABLE).filter(k => TABLE[k].futures);

test('the page reads the same table the function requires', () => {
  // Compared as JSON: the page's copy lives in the VM's realm.
  assert.deepStrictEqual(JSON.parse(JSON.stringify(app.COMMODITIES)), TABLE);
});

test('the page sends to the function exactly the markets that have futures data', () => {
  assert.deepStrictEqual(Array.from(app.PROXY_COMMODITIES), withFutures);
  for (const key of Object.keys(TABLE)) {
    assert.strictEqual(app.proxyAvailable(key), Boolean(TABLE[key].futures), key);
  }
});

test('every market with futures data names its contracts in a form the function can build', () => {
  const MONTHS = 'FGHJKMNQUVXZ';
  assert.ok(withFutures.length > 0, 'some markets have futures data');
  for (const key of withFutures) {
    const f = TABLE[key].futures;
    assert.match(f.root, /^[A-Z]{2}$/, `${key}: a two-letter root`);
    assert.match(f.suffix, /^[A-Z]{3}$/, `${key}: a three-letter exchange suffix`);
    assert.ok(f.months.length > 0, `${key}: at least one listed month`);
    // Month codes, each once, in calendar order.
    const order = Array.from(f.months, c => MONTHS.indexOf(c));
    assert.ok(order.every(i => i >= 0), `${key}: only CME month codes in "${f.months}"`);
    assert.ok(order.every((i, n) => n === 0 || i > order[n - 1]), `${key}: months in calendar order`);
  }
});

test('the custom market has no futures data and stays off the function', () => {
  assert.strictEqual(TABLE.custom.futures, null);
  assert.ok(!app.PROXY_COMMODITIES.includes('custom'));
});
