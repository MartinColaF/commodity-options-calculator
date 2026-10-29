'use strict';

/* Loading and empty states. Every market-data action wrote to one status line
 * at the foot of the Market data card: on a phone 948px below Auto-fill and
 * further still from the legs table and the month picker, so a tap seemed to
 * do nothing, and the button stayed live for the nine seconds a failing fetch
 * took. With no legs, the results read $0.00 in green and red and a 0.0%
 * chance of profit, over a flat line at zero. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');

/* Waits until every promise the click started has settled. */
async function settled(done) {
  for (let i = 0; i < 100 && !done(); i++) await new Promise(resolve => setImmediate(resolve));
}

test('a market button says it is fetching, stays held until done, and reports beneath itself', async () => {
  // Every request waits on one gate, which then fails them all.
  let fail;
  const gate = new Promise((resolve, reject) => { fail = reject; });
  gate.catch(() => { });
  const { el, fire } = wired({ fetch: () => gate });
  el('fetchRate').textContent = 'Rate';
  fire('fetchRate', 'click');
  assert.strictEqual(el('fetchRate').disabled, true, 'held while it waits');
  assert.strictEqual(el('fetchRate').textContent, 'Fetching…');
  assert.strictEqual(el('fetchRate').getAttribute('aria-busy'), 'true');
  assert.strictEqual(el('dataStatus').textContent, 'Risk-free rate…');
  assert.strictEqual(el('dataStatus').className, 'status busy');

  fail(new Error('offline'));
  await settled(() => !el('fetchRate').disabled);
  assert.strictEqual(el('fetchRate').disabled, false);
  assert.strictEqual(el('fetchRate').textContent, 'Rate', 'its own label back');
  assert.strictEqual(el('fetchRate').getAttribute('aria-busy'), null);
  assert.strictEqual(el('dataStatus').textContent, 'Risk-free rate: could not reach the US Treasury curve. Still using 4.00%.');
  assert.strictEqual(el('dataStatus').className, 'status err');
});

test('Auto-fill is held the same way, and lets go when every source has failed', async () => {
  const { el, fire } = wired({ fetch: () => Promise.reject(new Error('offline')) });
  el('autoFill').textContent = 'Auto-fill from market data';
  fire('autoFill', 'click');
  assert.strictEqual(el('autoFill').disabled, true);
  await settled(() => !el('autoFill').disabled);
  assert.strictEqual(el('autoFill').textContent, 'Auto-fill from market data');
  // Said once per service, not once per input in the service's own words.
  assert.strictEqual(el('dataStatus').textContent,
    'Could not reach the US Treasury curve, so these are unchanged: risk-free rate. ' +
    'Could not reach the futures data service, so these are unchanged: futures price, volatility and convenience yield. ' +
    'You can type any of them in.');
});

test('a button the page had disabled stays disabled after its fetch', async () => {
  const { el, fire } = wired({ fetch: () => Promise.reject(new Error('offline')) });
  el('fetchCurve').disabled = true;
  fire('fetchCurve', 'click');
  await settled(() => el('fetchCurve').getAttribute('aria-busy') === null);
  assert.strictEqual(el('fetchCurve').disabled, true);
});

test('the month picker, the carry check and the legs table each report under their own buttons', async () => {
  const { app, el, fire } = wired({ fetch: () => Promise.reject(new Error('offline')) });
  fire('loadMonths', 'click');
  await settled(() => !el('loadMonths').disabled);
  assert.strictEqual(el('monthStatus').textContent,
    'Contract months: could not reach the futures data service. The list of months is unchanged.');
  assert.strictEqual(el('dataStatus').textContent, '');

  el('carryS').value = ''; el('carryF').value = ''; el('carryDays').value = '';
  fire('implyYield', 'click');
  assert.match(el('carryStatus').textContent, /^Enter a spot price/);
  assert.strictEqual(el('monthStatus').textContent, '', 'one message at a time');

  const leg = app.newLeg({ kind: 'call', strike: 4000, days: 30 });
  app.state.legs = [leg];
  fire('legsBody', 'click', {
    dataset: { f: 'iv' }, matches: () => true,
    closest: sel => (sel === 'tr' ? { dataset: { id: String(leg.id) } } : {})
  });
  assert.match(el('legStatus').textContent, /^Enter the market premium in the Entry column/);
  assert.strictEqual(el('carryStatus').textContent, '');
});

test('with no legs, the results say so instead of showing a zero position', () => {
  const { app, el } = wired();
  app.state.legs = [];
  app.renderResults();
  assert.match(el('summary').innerHTML, /No legs yet\. <a href="#strategy">Choose a strategy<\/a>/);
  assert.doesNotMatch(el('summary').innerHTML, /kpi|\$0\.00/);
  assert.strictEqual(el('greeks').innerHTML, '');

  const leg = app.newLeg({ kind: 'call', strike: 4000, days: 30 });
  leg.on = false;
  app.state.legs = [leg];
  app.renderResults();
  assert.match(el('summary').innerHTML, /Every leg is switched off/);

  leg.on = true;
  app.renderResults();
  assert.match(el('summary').innerHTML, /class="kpi"/);
  assert.match(el('greeks').innerHTML, /<table class="greeks">/);
});

test('with no legs, the chart draws no curve and says why in its place', () => {
  const { app, el } = wired();
  app.state.legs = [];
  assert.strictEqual(app.chartConfig(app.analyse()).data.datasets.length, 0, 'not a flat line at zero');
  app.renderChartSafely(app.analyse());
  assert.strictEqual(el('chartEmpty').hidden, false);

  app.state.legs = [app.newLeg({ kind: 'call', strike: 4000, days: 30 })];
  assert.ok(app.chartConfig(app.analyse()).data.datasets.length > 0);
  app.renderChartSafely(app.analyse());
  assert.strictEqual(el('chartEmpty').hidden, true);
});

test('a reason about the data is given as it is, and a service that answered is not blamed', async () => {
  // The futures function answers, but with too short a history to measure.
  const reply = body => Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  const { el, fire } = wired({
    fetch: url => (String(url).includes('fn=history') ? reply({ symbol: 'GC=F', series: [] })
      : Promise.reject(new Error('offline')))
  });
  el('volWindow').value = '20';
  el('volEstimator').value = 'close';
  fire('fetchVol', 'click');
  await settled(() => !el('fetchVol').disabled);
  assert.strictEqual(el('dataStatus').textContent, 'Volatility: not enough history. Still using 15%.');

  fire('autoFill', 'click');
  await settled(() => !el('autoFill').disabled);
  assert.match(el('dataStatus').textContent, / The volatility is unchanged: not enough history\. You can type any of them in\.$/);
  assert.doesNotMatch(el('dataStatus').textContent, /unchanged: [^.]*volatility/, 'not counted with the futures that did not answer');
});

test("a service's own full stop is not doubled", () => {
  const { app } = wired();
  assert.strictEqual(app.reasonOf(new Error('Our standard API rate limit is 25 requests per day.')),
    'Our standard API rate limit is 25 requests per day');
  assert.strictEqual(app.listOf(['a']), 'a');
  assert.strictEqual(app.listOf(['a', 'b', 'c']), 'a, b and c');
});

test('on the Spanish page too, with no full stop doubled after the name of a service', async () => {
  const SPANISH = require('../es/words.js');
  const { app, el, fire } = wired({ lang: 'es', words: { es: SPANISH }, fetch: () => Promise.reject(new Error('offline')) });
  // A service's name sits inside a sentence, before that sentence's own full
  // stop: "la curva del Tesoro de EE. UU." read "EE. UU.." on the page.
  for (const service of ['treasury', 'futures', 'alphavantage']) {
    assert.doesNotMatch(app.serviceName(service), /\.$/, service);
  }
  fire('fetchRate', 'click');
  await settled(() => !el('fetchRate').disabled);
  assert.strictEqual(el('dataStatus').textContent,
    'Tasa libre de riesgo: no se pudo consultar la curva del Tesoro estadounidense. Se sigue usando 4.00%.');
  fire('autoFill', 'click');
  await settled(() => !el('autoFill').disabled);
  assert.match(el('dataStatus').textContent, /^No se pudo consultar la curva del Tesoro estadounidense, así que no cambiaron: /);
  assert.doesNotMatch(el('dataStatus').textContent, /\.\./);
});
