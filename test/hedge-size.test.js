'use strict';

/* The size of the hedge. A buyer or an exporter starts from a quantity, 5,000
 * tons of soybeans, and asks how many contracts that is: 36.74, so 37 cover a
 * little more and 36 a little less. The page says both and puts either on the
 * legs. The quantity is in the physical trade's unit where the market has one,
 * and in the contract's own elsewhere. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');
const SPANISH = require('../es/words.js');

function soybeans(app) {
  Object.assign(app.state, { commodity: 'soybean', S: 1050, size: 5000, quote: 'cents' });
}

test('the unit a hedge is sized in, and what one contract holds', () => {
  const { app } = wired();
  soybeans(app);
  assert.strictEqual(app.hedgeUnit().unit, 'metric tons');
  assert.strictEqual(app.hedgeUnit().perContract.toFixed(2), '136.08');
  Object.assign(app.state, { commodity: 'coffee', size: 37500 });
  assert.deepStrictEqual([app.hedgeUnit().unit, app.hedgeUnit().perContract.toFixed(2)], ['60-kg bags', '283.50']);
  // No physical unit: the contract's own, at the size typed in the panel.
  Object.assign(app.state, { commodity: 'gold', size: 100 });
  assert.deepStrictEqual([app.hedgeUnit().unit, app.hedgeUnit().perContract], ['troy oz', 100]);
});

test('5,000 tons of soybeans are 36.74 contracts: 37 cover a little more, 36 a little less', () => {
  const { app } = wired();
  soybeans(app);
  const s = app.contractsFor(5000);
  assert.strictEqual(s.exact.toFixed(2), '36.74');
  assert.deepStrictEqual([s.up.n, s.up.covers.toFixed(2)], [37, '5034.88']);
  assert.deepStrictEqual([s.down.n, s.down.covers.toFixed(2)], [36, '4898.80']);
  // A whole number of contracts is just that number.
  const ten = app.contractsFor(10 * app.hedgeUnit().perContract);
  assert.deepStrictEqual([ten.up.n, ten.down.n], [10, 10]);
});

test('the page says both and offers each; under one contract, only one', () => {
  const { app, el } = wired();
  soybeans(app);
  app.renderLegs();
  assert.strictEqual(el('hedgeInfo').hidden, true, 'no quantity, nothing to say');
  assert.strictEqual(el('hedgeButtons').hidden, true);
  assert.strictEqual(el('hedgeUnit').textContent, 'metric tons');
  app.state.hedgeQty = 5000;
  app.renderLegs();
  assert.strictEqual(el('hedgeInfo').textContent,
    '36.74 contracts of 136.08 metric tons: 37 cover 5,034.88, 34.88 more; 36 cover 4,898.80, 101.20 less.');
  assert.deepStrictEqual([el('hedgeUp').textContent, el('hedgeUp').dataset.n], ['Hedge with 37 contracts', '37']);
  assert.deepStrictEqual([el('hedgeDown').textContent, el('hedgeDown').hidden], ['Hedge with 36 contracts', false]);
  app.state.hedgeQty = 50;
  app.renderLegs();
  assert.strictEqual(el('hedgeInfo').textContent, '0.37 contracts of 136.08 metric tons: 1 covers 136.08, 86.08 more.');
  assert.deepStrictEqual([el('hedgeUp').textContent, el('hedgeDown').hidden], ['Hedge with 1 contract', true]);
  // Whole ounces read whole.
  Object.assign(app.state, { commodity: 'gold', size: 100, quote: 'USD', hedgeQty: 300 });
  app.renderLegs();
  assert.strictEqual(el('hedgeInfo').textContent, '3 contracts of 100 troy oz cover it exactly.');
  assert.strictEqual(el('hedgeDown').hidden, true);
});

test('the button puts the contracts on the physical leg and scales every included leg with it', () => {
  const { app } = wired();
  soybeans(app);
  app.applyStrategy('collar');
  assert.strictEqual(app.applyHedgeContracts(37), true);
  assert.deepStrictEqual(Array.from(app.state.legs, l => l.qty), [37, 37, 37]);
  // A ratio keeps its shape; a leg left out is left alone.
  app.applyStrategy('ratio');
  app.state.legs.push(app.newLeg({ kind: 'put', qty: 5, strike: 1000, on: false }));
  app.applyHedgeContracts(12);
  assert.deepStrictEqual(Array.from(app.state.legs, l => l.qty), [12, 24, 5]);
  app.state.legs = [];
  assert.strictEqual(app.applyHedgeContracts(12), false);
});

test('typed, refused, cleared, and the button says what it did', () => {
  const { app, el, fire } = wired();
  soybeans(app);
  app.applyStrategy('protective-put');
  fire('hedgeQty', 'input', { value: '5000' });
  assert.strictEqual(app.state.hedgeQty, 5000);
  fire('hedgeQty', 'input', { value: '-5' });
  assert.strictEqual(app.state.hedgeQty, 5000, 'a refused number never reaches the state');
  fire('hedgeQty', 'change', { value: '-5' });
  assert.strictEqual(el('hedgeQtyProblem').textContent, 'Enter a quantity above zero, or leave it blank.');
  assert.strictEqual(el('hedgeQty').getAttribute('aria-invalid'), 'true');
  fire('hedgeQty', 'input', { value: '' });
  assert.strictEqual(app.state.hedgeQty, null);
  app.state.hedgeQty = 5000;
  app.renderLegs();
  fire('hedgeDown', 'click');
  assert.deepStrictEqual(Array.from(app.state.legs, l => l.qty), [36, 36]);
  assert.strictEqual(el('legStatus').textContent,
    'Sized to 36 contracts, 4,898.80 metric tons: every included leg is scaled with it.');
  app.state.legs = [];
  fire('hedgeUp', 'click');
  assert.strictEqual(el('legStatus').textContent, 'Add a leg first: there is nothing to size.');
});

test('another market in the same unit keeps the quantity; another unit drops it', () => {
  const { app } = wired();
  soybeans(app);
  app.state.hedgeQty = 5000;
  app.changeCommodity('corn');
  assert.strictEqual(app.state.hedgeQty, 5000, 'tons of corn');
  app.changeCommodity('gold');
  assert.strictEqual(app.state.hedgeQty, null, 'not 5,000 ounces of gold');
});

test('it is saved and shared with the scenario; one saved before it hedged no stated quantity', () => {
  const { app } = wired();
  soybeans(app);
  app.state.hedgeQty = 5000;
  const saved = JSON.parse(JSON.stringify(app.snapshot()));
  assert.strictEqual(saved.hedgeQty, 5000);
  app.state.hedgeQty = null;
  app.restore(saved);
  assert.strictEqual(app.state.hedgeQty, 5000);
  delete saved.hedgeQty;
  app.restore(saved);
  assert.strictEqual(app.state.hedgeQty, null);
  for (const bad of ['5000', -3, 0, '"><img src=x>', [5000]]) {
    app.restore(Object.assign({}, saved, { hedgeQty: bad }));
    assert.strictEqual(app.state.hedgeQty, null, JSON.stringify(bad));
  }
});

test('and in Spanish', () => {
  const { app, el } = wired({ lang: 'es', words: { es: SPANISH } });
  soybeans(app);
  app.state.hedgeQty = 5000;
  app.renderLegs();
  assert.strictEqual(el('hedgeUnit').textContent, 'toneladas métricas');
  assert.strictEqual(el('hedgeInfo').textContent, '36.74 contratos de 136.08 toneladas métricas: 37 cubren ' +
    '5,034.88, 34.88 de más; 36 cubren 4,898.80, 101.20 de menos.');
  assert.strictEqual(el('hedgeUp').textContent, 'Cubrir con 37 contratos');
});
