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
  assert.strictEqual(el('dataStatus').textContent, 'Risk-free rate...');
  assert.strictEqual(el('dataStatus').className, 'status busy');

  fail(new Error('offline'));
  await settled(() => !el('fetchRate').disabled);
  assert.strictEqual(el('fetchRate').disabled, false);
  assert.strictEqual(el('fetchRate').textContent, 'Rate', 'its own label back');
  assert.strictEqual(el('fetchRate').getAttribute('aria-busy'), null);
  assert.match(el('dataStatus').textContent, /^Risk-free rate failed: .*The current value is unchanged\.$/);
  assert.strictEqual(el('dataStatus').className, 'status err');
});

test('Auto-fill is held the same way, and lets go when every source has failed', async () => {
  const { el, fire } = wired({ fetch: () => Promise.reject(new Error('offline')) });
  el('autoFill').textContent = 'Auto-fill from market data';
  fire('autoFill', 'click');
  assert.strictEqual(el('autoFill').disabled, true);
  await settled(() => !el('autoFill').disabled);
  assert.strictEqual(el('autoFill').textContent, 'Auto-fill from market data');
  assert.match(el('dataStatus').textContent, /^Left unchanged: /);
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
  assert.match(el('monthStatus').textContent, /^Contract months failed: /);
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
