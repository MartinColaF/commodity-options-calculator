'use strict';

/* Rosario's grains. A hedger in Argentina sells soybeans, corn and wheat
 * against A3 Mercados' (MATba-ROFEX's) futures, in dollars a metric ton, not
 * against CBOT's in cents a bushel. The page reads no quote for them: the price
 * is typed, and the page says so wherever it would otherwise fetch one. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, resetState, wired } = require('./helpers/load-app.js');
const COMMODITIES = require('../commodities.js');
const SPANISH = require('../es/words.js');

const TREASURY = fs.readFileSync(path.join(__dirname, 'fixtures', 'treasury-2026-10.xml'), 'utf8');
const ROSARIO = ['soybean-a3', 'corn-a3', 'wheat-a3'];

test('A3\'s soybeans, corn and wheat in dollars are its own contracts, typed by hand', () => {
  // A3's Guía de Futuros y Opciones Agro: 100 metric tons a contract, quoted in
  // US dollars a ton; its trading parameters set the tick at US$0.10 for the
  // futures and the options on them.
  for (const key of ROSARIO) {
    const c = COMMODITIES[key];
    assert.strictEqual(c.size, 100, key);
    assert.strictEqual(c.unit, 'metric tons', key);
    assert.strictEqual(c.quote, 'USD', key);
    assert.strictEqual(c.tick, 0.1, key);
    // No quote feed and no listed months, so no month's expiry to look up.
    assert.strictEqual(c.futures, null, key);
    assert.strictEqual(c.optionExpiry, undefined, key);
    assert.strictEqual(c.priceSymbol, '', key);
    // Already in tons: no physical unit to convert to.
    assert.strictEqual(c.physical, undefined, key);
    assert.deepStrictEqual(c.reports, ['wasde'], key);
  }
  assert.match(COMMODITIES['soybean-a3'].label, /SOJ/);
  assert.match(COMMODITIES['corn-a3'].label, /MAI/);
  assert.match(COMMODITIES['wheat-a3'].label, /TRI/);
});

test('a hedge in tons is a whole number of contracts, a dollar a ton is $100 a contract', () => {
  const page = wired();
  const { app, el, fire } = page;
  el('commodity').value = 'soybean-a3';
  fire('commodity', 'change');
  assert.strictEqual(app.state.commodity, 'soybean-a3');
  assert.strictEqual(app.dollarMultiplier(app.currentCommodity()), 100);
  assert.deepStrictEqual([app.hedgeUnit().unit, app.hedgeUnit().perContract], ['metric tons', 100]);
  const s = app.contractsFor(5000);
  assert.deepStrictEqual([s.exact, s.up.n, s.down.n], [50, 50, 50]);
  // Two decimals, as the tick has one.
  assert.strictEqual(app.fmtPrice(301.1), '301.10');
  assert.strictEqual(el('proxyNote').textContent, 'No quote feed and no ETF proxy - type the price and the volatility');
  assert.strictEqual(el('physicalInfo').hidden, true);
});

test('auto-fill takes the rate and says once why the rest stay as typed', async () => {
  const app = loadApp({
    fetch: async url => {
      const body = String(url).includes('home.treasury.gov') ? TREASURY : '{"error":"not routed"}';
      return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
    }
  });
  resetState(app, { commodity: 'corn-a3', S: 185, vol: 28, yield: 2.5, size: 100 });
  const r = await app.autoFill({ window: 20, estimator: 'close', avKey: '', symbol: '' });
  assert.strictEqual(r.done.length, 1, 'the risk-free rate');
  assert.strictEqual(app.state.S, 185);
  assert.deepStrictEqual(Array.from(app.failureLines(r.failed)), [
    'These are unchanged: futures price, volatility and convenience yield. The reason: the page reads no quotes for this market.'
  ]);
});

test('and in Spanish', async () => {
  const page = wired({ lang: 'es', words: { es: SPANISH } });
  const { app, el, fire } = page;
  el('commodity').value = 'wheat-a3';
  fire('commodity', 'change');
  assert.strictEqual(el('proxyNote').textContent, 'Sin cotizaciones ni ETF como proxy: ingresar el precio y la volatilidad a mano');
  assert.strictEqual(SPANISH[COMMODITIES['wheat-a3'].label], 'Trigo Rosario (A3/MATba TRI)');
  // The reason as the page throws it, in its own language.
  const reason = await app.proxyGet('quote', 'wheat-a3', 0).catch(e => e);
  const failed = ['futures price', 'volatility'].map(name => ({ name, error: reason }));
  assert.deepStrictEqual(Array.from(app.failureLines(failed)), [
    'No cambiaron: futures price y volatility. El motivo: la página no lee cotizaciones de este mercado.'
  ]);
});
