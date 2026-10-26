'use strict';

/* The test loader. app.js has no module system, so the tests run it in a VM
 * and read back what it declared: every top-level function on its own, since a
 * function declaration becomes a property of the VM's global object, and the
 * few `const` bindings the tests need through the epilogue, since those do
 * not. The loader used to list all 81 names it handed over by hand. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./helpers/load-app.js');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
const app = loadApp();

test('every top-level function in app.js reaches the tests without being listed', () => {
  const declared = Array.from(source.matchAll(/^(?:async )?function (\w+)/gm), m => m[1]);
  assert.ok(declared.length > 100, 'app.js declares its functions at top level');
  assert.ok(declared.includes('autoFill'), 'async functions included');
  assert.deepStrictEqual(declared.filter(n => typeof app[n] !== 'function'), []);
});

test('the const bindings come through the epilogue, and are the ones app.js uses', () => {
  for (const k of ['state', 'COMMODITIES', 'STRATEGIES', 'PROXY_COMMODITIES']) {
    assert.strictEqual(typeof app[k], 'object', k);
  }
  for (const k of ['KEY_STORE', 'STORE_KEY']) assert.strictEqual(typeof app[k], 'string', k);
  assert.ok(app.CACHE_MAX_AGE > 0);
  app.setReferencePrice(1234, null, '');
  assert.strictEqual(app.state.S, 1234, 'the state the tests read is the state the functions write');
});

test('what the loader stands in for is not mistaken for part of app.js', () => {
  assert.strictEqual(app.fetch, undefined);
  assert.strictEqual(app.setTimeout, undefined);
  const withChart = loadApp({ globals: { Chart: function Chart() { } } });
  assert.strictEqual(withChart.Chart, undefined, 'nor is a global a test passes in');
});
