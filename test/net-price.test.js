'use strict';

/* The net price. A producer reads a hedge as the price the crop will fetch, not
 * as a P&L: the extension services' sheets write it as the strike, plus the
 * basis expected, less the premium and the commissions. The page works it out
 * at every price at the horizon, from the same P&L the chart draws, so the
 * premium is priced by the model and carries its interest, and says the floor
 * and the ceiling in the price's quote and in USD a ton. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');
const SPANISH = require('../es/words.js');

/* The product review's case: soybeans at 1050 cents, a 1000 put at 60 days,
 * 18% volatility, 4%, American, a basis 40 cents under and a cent of
 * commissions. */
function floor(page, financing) {
  const { app } = page;
  Object.assign(app.state, {
    commodity: 'soybean', model: 'b76', style: 'american', S: 1050, size: 5000, quote: 'cents',
    vol: 18, rate: 4, days: 60, basis: -40, commission: 1
  });
  app.state.financing = { mode: financing || 'none', rate: 4 };
  app.state.legs = [
    app.newLeg({ kind: 'underlying', side: 1, strike: 0, days: 60 }),
    app.newLeg({ kind: 'put', side: 1, strike: 1000, days: 60 })
  ];
  return app.state.legs;
}

test('the floor of a bought put is the review\'s, 947.80 cents a bushel or 348.26 USD a ton', () => {
  const page = wired();
  const { app } = page;
  const [, put] = floor(page);
  assert.strictEqual(app.legEntry(put).toFixed(2), '11.20');
  const np = app.netPrices(app.analyse());
  // 1000 − 40 − 11.20 − 1, read nominally as the sheets do.
  assert.strictEqual(np.side, 1);
  assert.strictEqual(np.worst.toFixed(2), '947.80');
  assert.strictEqual(app.physicalPrice(np.worst).toFixed(2), '348.26');
  // Above the put the crop sells with the market: no ceiling.
  assert.strictEqual(np.best, Infinity);
  // The premium paid today costs its interest by the horizon, at the risk-free
  // rate: 11.20 × (e^(0.04 × 60/365) − 1), seven hundredths of a cent.
  floor(page, 'rate');
  const financed = app.netPrices(app.analyse());
  assert.strictEqual(financed.worst.toFixed(2), '947.73');
  assert.strictEqual(app.physicalPrice(financed.worst).toFixed(2), '348.23');
});

test('the net price is the futures price, plus the basis and what the options make, less commissions', () => {
  const page = wired();
  const { app } = page;
  floor(page);
  const net = app.netPriceEvaluator();
  // Under the put, the floor; over it, the price less the premium.
  assert.strictEqual(net(900, 60).toFixed(2), '947.80');
  assert.strictEqual(net(1200, 60).toFixed(2), (1200 - 40 - 11.200381 - 1).toFixed(2));
  // Today, at today's price, the options are worth what they cost.
  assert.strictEqual(net(1050, 0).toFixed(6), (1050 - 40 - 1).toFixed(6));
  // An entry typed for the physical leg does not move it: the physical sells
  // at the price then, whatever it was booked at.
  app.state.legs[0].entry = 1000;
  assert.strictEqual(app.netPriceEvaluator()(1200, 60).toFixed(6), net(1200, 60).toFixed(6));
  // Nor does the size of the hedge: it is per unit.
  app.state.legs.forEach(l => { l.qty = 37; });
  assert.strictEqual(app.netPriceEvaluator()(900, 60).toFixed(6), net(900, 60).toFixed(6));
});

test('a collar\'s band is its strikes, plus the basis and the credit, less commissions', () => {
  const page = wired();
  const { app } = page;
  floor(page);
  app.state.legs.push(app.newLeg({ kind: 'call', side: -1, strike: 1100, days: 60 }));
  // The call sells for 12.37 against the put's 11.20, a credit of 1.17.
  const credit = -app.netCost() / 5000 / 0.01;
  assert.strictEqual(credit.toFixed(2), '1.17');
  const np = app.netPrices(app.analyse());
  assert.strictEqual(np.worst.toFixed(2), (1000 - 40 + credit - 1).toFixed(2));
  assert.strictEqual(np.best.toFixed(2), (1100 - 40 + credit - 1).toFixed(2));
  assert.strictEqual(app.physicalPrice(np.worst).toFixed(2), '352.80');
  assert.strictEqual(app.physicalPrice(np.best).toFixed(2), '389.55');
});

test('a buyer\'s cap is the call\'s strike, plus the basis, the premium and the commissions', () => {
  const page = wired();
  const { app } = page;
  floor(page);
  app.state.basis = 25;
  app.state.legs = [
    app.newLeg({ kind: 'underlying', side: -1, strike: 0, days: 60 }),
    app.newLeg({ kind: 'call', side: 1, strike: 1100, days: 60 })
  ];
  const premium = app.legEntry(app.state.legs[1]);
  assert.strictEqual(premium.toFixed(2), '12.37');
  const np = app.netPrices(app.analyse());
  assert.strictEqual(np.side, -1);
  assert.strictEqual(np.worst.toFixed(2), (1100 + 25 + premium + 1).toFixed(2));
  // The least it pays is near a price of zero: the basis, the premium and the
  // commissions.
  assert.ok(Math.abs(np.best - (25 + premium + 1)) < 0.5, np.best);
  // Below the call it pays the market, plus what the call cost.
  assert.strictEqual(app.netPriceEvaluator()(1000, 60).toFixed(2), (1000 + 25 + premium + 1).toFixed(2));
  // With no call, nothing caps it.
  app.state.legs[1].on = false;
  assert.strictEqual(app.netPrices(app.analyse()).worst, Infinity);
});

test('with no physical, or one on both sides, there is no net price, and the page says why', () => {
  const page = wired();
  const { app, el } = page;
  floor(page);
  app.state.legs[0].on = false;
  assert.strictEqual(app.physicalPosition(), null);
  assert.strictEqual(app.netPrices(app.analyse()), null);
  app.renderLegs();
  assert.strictEqual(el('netInfo').hidden, false);
  assert.strictEqual(el('netInfo').textContent,
    'The net price needs a leg for the physical: an underlying leg, long if you sell it, short if you buy it.');
  app.renderResults();
  assert.doesNotMatch(el('summary').innerHTML, /Net sale price/);
  assert.strictEqual(el('netPriceInfo').hidden, true);
  // A physical against a futures hedge cannot be told apart.
  app.state.legs[0].on = true;
  app.state.legs.push(app.newLeg({ kind: 'underlying', side: -1, strike: 0, days: 60 }));
  assert.strictEqual(app.physicalPosition(), null);
  app.renderLegs();
  assert.match(el('netInfo').textContent, /^Underlying legs on both sides/);
  // On the chart, the box says so in its place.
  app.state.chart.mode = 'net';
  const a = app.analyse();
  assert.strictEqual(app.chartConfig(a).data.datasets.length, 0);
  app.renderChartSafely(a);
  assert.strictEqual(el('chartEmpty').hidden, false);
  assert.match(el('chartEmpty').textContent, /^No net price to chart/);
  app.state.legs.pop();
  app.renderChartSafely(app.analyse());
  assert.strictEqual(el('chartEmpty').hidden, true);
});

test('the results give the floor and the ceiling, in the price and in USD a ton, and what they rest on', () => {
  const page = wired();
  const { app, el } = page;
  floor(page);
  app.renderResults();
  const html = el('summary').innerHTML;
  // Soybeans trade in eighths of a cent, so the price shows three decimals.
  assert.match(html, /<span>Net sale price floor<\/span><strong>947\.800<\/strong><small>348\.26 USD\/t<\/small>/);
  assert.match(html, /<span>Net sale price ceiling<\/span><strong>None<\/strong><small>rises with the price<\/small>/);
  assert.strictEqual(el('netPriceInfo').hidden, false);
  assert.strictEqual(el('netPriceInfo').textContent, 'The net sale price is per unit, in cents, at the horizon: ' +
    'the futures price there, plus the basis of −40, plus what the options make net of their premiums, as the ' +
    'P&L counts them, less commissions of 1.');
  // A market with no physical unit gives the price alone.
  Object.assign(app.state, { commodity: 'gold', S: 4000, size: 100, quote: 'USD', basis: 5, commission: 0.5 });
  app.state.legs = [
    app.newLeg({ kind: 'underlying', side: -1, strike: 0, days: 30 }),
    app.newLeg({ kind: 'call', side: 1, strike: 4200, days: 30 })
  ];
  app.renderResults();
  assert.match(el('summary').innerHTML, /<span>Net purchase price cap<\/span><strong>[\d,.]+<\/strong><\/div>/);
  assert.match(el('netPriceInfo').textContent, /^The net purchase price is per unit, in USD, .* plus commissions of 0\.5\.$/);
});

test('the chart draws the net price, with its floor and ceiling across it', () => {
  const page = wired();
  const { app } = page;
  floor(page);
  app.state.legs.push(app.newLeg({ kind: 'call', side: -1, strike: 1100, days: 60 }));
  app.state.chart.mode = 'net';
  app.state.chart.tDays = 0;
  const a = app.analyse();
  const cfg = app.chartConfig(a);
  const [horizon, today] = cfg.data.datasets;
  assert.strictEqual(horizon.label, 'At horizon (60d)');
  assert.strictEqual(today.label, 'Today (mark to market)');
  const net = app.netPriceEvaluator();
  horizon.data.forEach(p => assert.strictEqual(p.y, net(p.x, 60)));
  assert.strictEqual(cfg.options.scales.y.title.text, 'Net sale price');
  const levels = Array.from(cfg.options.plugins.markers.levels, l => l.label);
  assert.deepStrictEqual(levels, ['Floor 960.170', 'Ceiling 1,060.170']);
  // A price, not dollars, in the tooltip.
  const tip = cfg.options.plugins.tooltip.callbacks.label({ dataset: horizon, parsed: { y: 960.17 } });
  assert.strictEqual(tip, 'At horizon (60d): 960.170');
  assert.strictEqual(app.chartSummary(a), 'Net sale price at the 60-day horizon, for an underlying price from ' +
    `${a.xs[0].toLocaleString('en-US', { maximumFractionDigits: 3 })} to ${a.xs[a.xs.length - 1].toLocaleString('en-US', { maximumFractionDigits: 3 })}: ` +
    'floor 960.170, ceiling 1,060.170.');
  // Without the call there is no ceiling to mark.
  app.state.legs[2].on = false;
  const open = app.chartConfig(app.analyse());
  assert.deepStrictEqual(Array.from(open.options.plugins.markers.levels, l => l.label), ['Floor 947.800']);
  assert.match(app.chartSummary(app.analyse()), /floor 947\.800, ceiling no limit\.$/);
});

test('a level is drawn across the chart, its label clear of the strikes\'', () => {
  const page = wired();
  const { app } = page;
  const drawn = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, setLineDash() {}, stroke() {},
    moveTo(x, y) { drawn.push(['from', x, y]); }, lineTo(x, y) { drawn.push(['to', x, y]); },
    measureText: s => ({ width: s.length * 6 }),
    fillText(s, x, y) { drawn.push(['text', s, x, y]); }
  };
  const chart = {
    ctx, chartArea: { left: 40, right: 640, top: 10, bottom: 310 },
    scales: { x: { getPixelForValue: () => -1 }, y: { getPixelForValue: v => 310 - (v - 900) * 1.5 } },
    options: { plugins: { markers: { lines: [], levels: [{ value: 960, label: 'Floor 960', color: '#999' }, { value: 1090, label: 'Ceiling 1090', color: '#999' }] } } }
  };
  app.markerPlugin.afterDatasetsDraw(chart);
  // 960 is at y = 220: a line from edge to edge, its label above it.
  assert.deepStrictEqual(drawn.slice(0, 3), [['from', 40, 220], ['to', 640, 220], ['text', 'Floor 960', 636, 216]]);
  // 1090 is at y = 25, under the strikes' labels: its own goes beneath the line.
  assert.deepStrictEqual(drawn[5], ['text', 'Ceiling 1090', 636, 38]);
});

test('the basis may be below zero and blank is none; commissions below zero are refused', () => {
  const page = wired();
  const { app, el, fire } = page;
  floor(page);
  app.renderLegs();
  assert.strictEqual(el('basisUnit').textContent, 'cents');
  assert.strictEqual(el('commissionUnit').textContent, 'cents');
  el('basis').value = '-35.5';
  fire('basis', 'input');
  assert.strictEqual(app.state.basis, -35.5);
  el('basis').value = '';
  fire('basis', 'input');
  assert.strictEqual(app.state.basis, 0);
  el('commission').value = '-1';
  fire('commission', 'input');
  fire('commission', 'change');
  assert.strictEqual(app.state.commission, 1, 'the number in use stays');
  assert.strictEqual(el('commissionProblem').textContent,
    'Enter commissions of zero or more: they are a cost, and a basis may be below zero instead.');
  assert.strictEqual(el('commission').getAttribute('aria-invalid'), 'true');
  el('commission').value = '0.5';
  fire('commission', 'input');
  assert.strictEqual(app.state.commission, 0.5);
});

test('a basis is one market\'s, so another market starts without one; a scenario saved before has none', () => {
  const page = wired();
  const { app } = page;
  floor(page);
  app.changeCommodity('corn');
  assert.strictEqual(app.state.basis, 0);
  assert.strictEqual(app.state.commission, 0);
  floor(page);
  const saved = app.snapshot();
  assert.strictEqual(saved.basis, -40);
  assert.strictEqual(saved.commission, 1);
  delete saved.basis;
  delete saved.commission;
  app.restore(saved);
  assert.strictEqual(app.state.basis, 0);
  assert.strictEqual(app.state.commission, 0);
});

test('and in Spanish', () => {
  const page = wired({ lang: 'es', words: { es: SPANISH } });
  const { app, el } = page;
  floor(page);
  app.renderResults();
  assert.match(el('summary').innerHTML, /<span>Piso del precio neto de venta<\/span><strong>947\.800<\/strong><small>348\.26 USD\/t<\/small>/);
  assert.match(el('summary').innerHTML, /<span>Techo del precio neto de venta<\/span><strong>Ninguno<\/strong><small>sube con el precio<\/small>/);
  assert.strictEqual(el('netPriceInfo').textContent, 'El precio neto de venta es por unidad, en centavos, al horizonte: ' +
    'el precio del futuro en ese momento, más la base de −40, más lo que dejan las opciones neto de sus primas, como ' +
    'las cuenta el P&L, menos comisiones de 1.');
});
