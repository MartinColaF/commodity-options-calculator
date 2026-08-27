'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const handler = require('../api/market.js');

const MONTH_CODES = { F: 1, G: 2, H: 3, J: 4, K: 5, M: 6, N: 7, Q: 8, U: 9, V: 10, X: 11, Z: 12 };

function mockRes() {
  const out = { headers: {}, code: 0, body: null };
  const res = {
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    status(c) { out.code = c; return res; },
    json(b) { out.body = b; return res; },
    out
  };
  return res;
}

/* Shape of the upstream chart payload, trimmed to what the handler reads. */
function chartPayload(over) {
  const o = Object.assign({
    symbol: 'GC=F', shortName: 'Gold Dec 26', currency: 'USD',
    price: 4674.3, time: Math.floor(Date.now() / 1000),
    closes: null
  }, over || {});

  const meta = {
    symbol: o.symbol, shortName: o.shortName, currency: o.currency,
    regularMarketPrice: o.price, regularMarketTime: o.time
  };
  const result = { meta };

  if (o.closes) {
    const day = 86400;
    const start = Math.floor(Date.now() / 1000) - o.closes.length * day;
    result.timestamp = o.closes.map((_, i) => start + i * day);
    result.indicators = {
      quote: [{
        open: o.closes.map(c => (c == null ? null : c * 0.999)),
        high: o.closes.map(c => (c == null ? null : c * 1.004)),
        low: o.closes.map(c => (c == null ? null : c * 0.996)),
        close: o.closes.slice()
      }]
    };
  }
  return { chart: { result: [result] } };
}

/* Installs a fetch mock that records every requested symbol. */
function mockFetch(responder) {
  const seen = [];
  global.fetch = async (url) => {
    const symbol = decodeURIComponent(String(url).split('/chart/')[1].split('?')[0]);
    seen.push(symbol);
    const payload = responder(symbol);
    if (payload === 'network-error') throw new Error('socket hang up');
    if (payload === null) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => payload };
  };
  return seen;
}

async function call(query, method) {
  const res = mockRes();
  await handler({ method: method || 'GET', query }, res);
  return res.out;
}

test('rejects anything that is not a known commodity', async () => {
  const original = global.fetch;
  const seen = mockFetch(() => chartPayload());
  try {
    for (const commodity of ['bitcoin', '../../etc/passwd', '', 'GC=F', '__proto__']) {
      const out = await call({ fn: 'quote', commodity });
      assert.strictEqual(out.code, 400, `${commodity} is refused`);
      assert.match(out.body.error, /Unknown commodity/, 'explains why');
    }
    assert.strictEqual(seen.length, 0, 'no upstream request is made for a rejected commodity');
  } finally { global.fetch = original; }
});

test('rejects unknown actions and non-GET methods', async () => {
  const original = global.fetch;
  mockFetch(() => chartPayload());
  try {
    const bad = await call({ fn: 'delete-everything', commodity: 'gold' });
    assert.strictEqual(bad.code, 400);
    assert.match(bad.body.error, /Unknown fn/);

    const post = await call({ fn: 'quote', commodity: 'gold' }, 'POST');
    assert.strictEqual(post.code, 405);
  } finally { global.fetch = original; }
});

test('quote returns the front month with cache headers', async () => {
  const original = global.fetch;
  const seen = mockFetch(() => chartPayload());
  try {
    const out = await call({ fn: 'quote', commodity: 'gold' });
    assert.strictEqual(out.code, 200);
    assert.deepStrictEqual(seen, ['GC=F'], 'asks for the continuous front month');
    assert.strictEqual(out.body.price, 4674.3);
    assert.strictEqual(out.body.currency, 'USD');
    assert.strictEqual(out.body.commodity, 'gold');
    assert.ok(out.body.asOf, 'reports when the quote was taken');
    assert.match(out.headers['cache-control'], /s-maxage=\d+/, 'is edge cacheable');
  } finally { global.fetch = original; }
});

test('quote passes the cents currency through, which drives the multiplier', async () => {
  const original = global.fetch;
  mockFetch(() => chartPayload({ symbol: 'ZC=F', shortName: 'Corn Dec 26', currency: 'USX', price: 535.75 }));
  try {
    const out = await call({ fn: 'quote', commodity: 'corn' });
    assert.strictEqual(out.body.currency, 'USX', 'cents-quoted contracts are reported as USX');
  } finally { global.fetch = original; }
});

test('history parses the series and drops gaps', async () => {
  const original = global.fetch;
  mockFetch(() => chartPayload({ closes: [100, 101, null, 103, 104] }));
  try {
    const out = await call({ fn: 'history', commodity: 'gold' });
    assert.strictEqual(out.code, 200);
    assert.strictEqual(out.body.series.length, 4, 'the null close is dropped');
    assert.ok(out.body.series.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date)), 'dates are ISO days');
    assert.ok(out.body.series.every(d => d.c > 0 && d.h >= d.c && d.l <= d.c), 'OHLC is coherent');
  } finally { global.fetch = original; }
});

test('curve skips the current delivery month', async () => {
  const original = global.fetch;
  const seen = mockFetch(sym => chartPayload({ symbol: sym, shortName: sym, price: 4600 }));
  try {
    await call({ fn: 'curve', commodity: 'gold' });
    assert.ok(seen.length > 0, 'contracts were probed');

    const now = new Date();
    for (const sym of seen) {
      const m = sym.match(/^[A-Z]{2}([A-Z])(\d{2})\./);
      assert.ok(m, 'symbol looks like a month contract: ' + sym);
      const month = MONTH_CODES[m[1]];
      const year = 2000 + Number(m[2]);
      const after = year > now.getUTCFullYear() ||
        (year === now.getUTCFullYear() && month > now.getUTCMonth() + 1);
      assert.ok(after, `${sym} is later than the current month, which is in delivery`);
    }
  } finally { global.fetch = original; }
});

test('curve ignores contracts that have not traded recently', async () => {
  const original = global.fetch;
  const stale = Math.floor(Date.now() / 1000) - 30 * 86400;
  const fresh = Math.floor(Date.now() / 1000) - 3600;
  let n = 0;
  const seen = mockFetch(sym => {
    n++;
    // The first contract probed is stale and must be skipped.
    return chartPayload({ symbol: sym, shortName: sym, price: 4600 + n, time: n === 1 ? stale : fresh });
  });
  try {
    const out = await call({ fn: 'curve', commodity: 'gold' });
    assert.strictEqual(out.code, 200);
    assert.strictEqual(out.body.contracts.length, 2, 'two contracts returned');
    assert.ok(!out.body.contracts.some(c => c.symbol === seen[0]),
      'the stale contract is not used');
    for (const c of out.body.contracts) {
      assert.ok(c.price > 0 && c.expiry && c.asOf, 'each contract is fully described');
    }
    assert.ok(new Date(out.body.contracts[1].expiry) > new Date(out.body.contracts[0].expiry),
      'contracts come back in chronological order');
  } finally { global.fetch = original; }
});

test('curve fails cleanly when too few contracts quote', async () => {
  const original = global.fetch;
  mockFetch(() => null); // every probe 404s
  try {
    const out = await call({ fn: 'curve', commodity: 'cocoa' });
    assert.strictEqual(out.code, 502);
    assert.match(out.body.error, /two contracts/);
  } finally { global.fetch = original; }
});

test('upstream failures surface as 502 rather than throwing', async () => {
  const original = global.fetch;
  mockFetch(() => 'network-error');
  try {
    const out = await call({ fn: 'quote', commodity: 'wti' });
    assert.strictEqual(out.code, 502);
    assert.ok(out.body.error, 'an error message is returned');
  } finally { global.fetch = original; }
});

test('every commodity in the table resolves to a symbol', async () => {
  const original = global.fetch;
  const seen = mockFetch(sym => chartPayload({ symbol: sym, shortName: sym }));
  try {
    const commodities = ['gold', 'silver', 'copper', 'wti', 'brent', 'natgas', 'corn',
      'wheat', 'soybean', 'sugar', 'coffee', 'cocoa', 'cotton', 'cattle'];
    for (const c of commodities) {
      const out = await call({ fn: 'quote', commodity: c });
      assert.strictEqual(out.code, 200, `${c} resolves`);
    }
    assert.strictEqual(seen.length, commodities.length);
    assert.ok(seen.every(s => s.endsWith('=F')), 'all use the continuous front month');
  } finally { global.fetch = original; }
});
