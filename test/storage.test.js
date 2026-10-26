'use strict';

/* What the page keeps in localStorage: cached market data, the saved scenario
 * and the Alpha Vantage key. Cached responses used to be left behind forever,
 * one per ticker ever typed, and a full quota makes saving the scenario fail
 * silently. */

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState } = require('./helpers/load-app.js');

const HOUR = 3600e3;

function fresh() {
  const app = loadApp();
  resetState(app);
  return app;
}

const age = (app, key, ms) =>
  app.storage.set('coc.cache.' + key, JSON.stringify({ ts: Date.now() - ms, v: key }));

test('an entry found expired is removed, not just ignored', () => {
  const app = fresh();
  age(app, 'proxy.quote.gold', 10 * 60e3);   // ten minutes old
  assert.strictEqual(app.cacheGet('proxy.quote.gold', 5 * 60e3), null);
  assert.ok(!app.storage.has('coc.cache.proxy.quote.gold'));
  // A fresh one is returned and kept.
  app.cacheSet('proxy.quote.gold', { price: 1 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(app.cacheGet('proxy.quote.gold', 5 * 60e3))), { price: 1 });
});

test('pruning drops old and unreadable cache entries and nothing else', () => {
  const app = fresh();
  age(app, 'av.GLD', 2 * HOUR);
  age(app, 'av.OLDTICKER', 30 * 24 * HOUR);
  age(app, 'treasury', 13 * HOUR);
  app.storage.set('coc.cache.broken', '{not json');
  app.storage.set(app.STORE_KEY, '{"S":4000}');
  app.storage.set(app.KEY_STORE, 'my-key');
  app.storage.set('someone.else', 'x');

  app.pruneCache(app.CACHE_MAX_AGE);
  assert.deepStrictEqual(Array.from(app.storage.keys()).sort(),
    ['coc.avkey', 'coc.cache.av.GLD', 'coc.state.v2', 'someone.else']);
});

test('pruning finds every entry even when removals reorder the keys', () => {
  // The browser's key order is not stable across removals. Walking it by index
  // while removing skipped entries in Chrome: 2 of 50 survived a real prune.
  // A store whose key order shifts on every removal: odd positions move ahead
  // of even ones. Walking it by index loses 2 of 50 entries, as Chrome did.
  const store = new Map();
  let order = [];
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (!store.has(k)) order.push(k); store.set(k, String(v)); },
    removeItem: k => {
      store.delete(k);
      const rest = order.filter(x => x !== k);
      order = rest.filter((x, i) => i % 2).concat(rest.filter((x, i) => !(i % 2)));
    },
    key: i => (i < order.length ? order[i] : null),
    get length() { return order.length; }
  };
  const app = loadApp({ globals: { localStorage } });
  const old = JSON.stringify({ ts: Date.now() - 40 * 24 * HOUR, v: 'x' });
  for (let i = 0; i < 50; i++) localStorage.setItem('coc.cache.av.OLD' + i, old);
  localStorage.setItem('coc.avkey', 'my-key');
  app.pruneCache(app.CACHE_MAX_AGE);
  assert.deepStrictEqual(Array.from(store.keys()), ['coc.avkey']);
});

test('no caller keeps an entry longer than the pruning age', () => {
  // init() prunes at CACHE_MAX_AGE, so it must cover the longest TTL in use:
  // the Alpha Vantage series at 12 hours.
  const app = fresh();
  assert.ok(app.CACHE_MAX_AGE >= 12 * HOUR);
});

test('a full quota no longer loses the scenario: the cache makes room', () => {
  const store = new Map();
  const QUOTA = 4000;   // characters, across every key
  const used = () => Array.from(store.values()).reduce((n, v) => n + v.length, 0);
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      v = String(v);
      if (used() - (store.has(k) ? store.get(k).length : 0) + v.length > QUOTA) {
        const e = new Error('The quota has been exceeded.');
        e.name = 'QuotaExceededError';
        throw e;
      }
      store.set(k, v);
    },
    removeItem: k => store.delete(k),
    key: i => (i < store.size ? Array.from(store.keys())[i] : null),
    get length() { return store.size; }
  };
  const app = loadApp({ globals: { localStorage } });
  resetState(app);
  // Fill the quota with fresh cache entries, so pruning by age alone would
  // not free anything.
  for (let i = 0; used() < QUOTA - 300; i++) {
    store.set('coc.cache.av.T' + i, JSON.stringify({ ts: Date.now(), v: 'x'.repeat(200) }));
  }
  app.state.legs = [app.newLeg({ strike: 4100 })];

  app.persist();
  const saved = JSON.parse(store.get(app.STORE_KEY));
  assert.strictEqual(saved.legs[0].strike, 4100, 'the scenario was saved');
  assert.ok(Array.from(store.keys()).every(k => k.indexOf('coc.cache.') !== 0),
    'the cache gave way');
});
