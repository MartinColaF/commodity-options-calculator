'use strict';

/* What a hedger reads. The physical trade prices soybeans in USD a ton and
 * hedges in contracts; CBOT quotes cents a bushel, and the greeks table gave
 * delta per unit. The page now says both: the price and the contract in the
 * physical unit, under the price, and the delta in futures contracts, under
 * the greeks. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');
const COMMODITIES = require('../commodities.js');
const SPANISH = require('../es/words.js');

test('each physical unit comes from the legal weights the trade uses', () => {
  const inPhysical = k => (COMMODITIES[k].size / COMMODITIES[k].physical.per).toFixed(2);
  assert.strictEqual(inPhysical('soybean'), '136.08', '5,000 bushels of 60 lb');
  assert.strictEqual(inPhysical('wheat'), '136.08');
  assert.strictEqual(inPhysical('corn'), '127.01', 'a bushel of corn is 56 lb');
  assert.strictEqual(inPhysical('sugar'), '50.80');
  assert.strictEqual(inPhysical('cotton'), '22.68');
  assert.strictEqual(inPhysical('copper'), '11.34');
  assert.strictEqual(inPhysical('coffee'), '283.50', 'in 60-kg bags');
  assert.strictEqual(inPhysical('cattle'), '18143.69', 'in kilos');
  for (const k of ['gold', 'silver', 'wti', 'brent', 'natgas', 'cocoa', 'custom']) {
    assert.strictEqual(COMMODITIES[k].physical, undefined, `${k} trades in the unit it is quoted in`);
  }
});

test('the price and the contract show in the physical unit, under the price', () => {
  const { app, el } = wired();
  Object.assign(app.state, { commodity: 'soybean', S: 1050, size: 5000, quote: 'cents' });
  app.renderInputs();
  assert.strictEqual(el('physicalInfo').hidden, false);
  assert.strictEqual(el('physicalInfo').textContent,
    'In physical terms: 385.81 USD/t, and 1 contract = 136.08 metric tons.');
  // The same price quoted in dollars reads the same in tons.
  Object.assign(app.state, { S: 10.5, quote: 'USD' });
  app.renderInputs();
  assert.match(el('physicalInfo').textContent, /^In physical terms: 385\.81 USD\/t,/);
  // Coffee in bags, cattle in kilos of live weight.
  Object.assign(app.state, { commodity: 'coffee', S: 300, size: 37500, quote: 'cents' });
  app.renderInputs();
  assert.strictEqual(el('physicalInfo').textContent,
    'In physical terms: 396.83 USD per 60-kg bag, and 1 contract = 283.50 60-kg bags.');
  Object.assign(app.state, { commodity: 'cattle', S: 230, size: 40000, quote: 'cents' });
  app.renderInputs();
  assert.match(el('physicalInfo').textContent, /^In physical terms: 5\.07 USD\/kg live weight, and 1 contract = 18,143\.69 kg\.$/);
  // Gold has no other unit, and the line goes.
  Object.assign(app.state, { commodity: 'gold', S: 4000, size: 100, quote: 'USD' });
  app.renderInputs();
  assert.strictEqual(el('physicalInfo').hidden, true);
  assert.strictEqual(el('physicalInfo').textContent, '');
});

test('and in Spanish', () => {
  const { app, el } = wired({ lang: 'es', words: { es: SPANISH } });
  Object.assign(app.state, { commodity: 'corn', S: 420, size: 5000, quote: 'cents' });
  app.renderInputs();
  assert.strictEqual(el('physicalInfo').textContent,
    'En físico: 165.35 USD/t, y 1 contrato = 127.01 toneladas métricas.');
});

test('the delta reads in futures contracts, with how many offset it', () => {
  const { app, el } = wired();
  assert.strictEqual(app.futuresDelta(-3.4), 'Delta in futures contracts: −3.40. Buying 3 leaves −0.40.');
  assert.strictEqual(app.futuresDelta(3.6), 'Delta in futures contracts: +3.60. Selling 4 leaves −0.40.');
  assert.strictEqual(app.futuresDelta(1), 'Delta in futures contracts: +1.00. Selling 1 leaves 0.00.');
  assert.strictEqual(app.futuresDelta(0.32), 'Delta in futures contracts: +0.32, less than one contract to offset.');
  assert.strictEqual(app.futuresDelta(-0.001), 'Delta in futures contracts: 0.00, less than one contract to offset.');
  // On the page it is the greeks table's own number: four puts at the money.
  app.state.legs = [app.newLeg({ kind: 'put', strike: 4000, days: 30, qty: 4 })];
  app.renderResults();
  const d = app.netGreeks().unit.delta;
  assert.ok(d < -1.5 && d > -2.5, `four puts at the money, about −2: ${d}`);
  assert.ok(el('greeks').innerHTML.includes(`<p class="small">${app.futuresDelta(d)}</p>`));
  assert.match(app.futuresDelta(d), /Buying 2 leaves/);
});
