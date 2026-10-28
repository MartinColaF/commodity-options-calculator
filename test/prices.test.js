'use strict';

/* How a price is shown. Every price used to show two decimals, whatever the
 * market: a 30-day copper call worth 0.04204 read 0.04, $50.98 a contract
 * short of its value, and a copper strike of 4.70 was marked "K 5" on the
 * chart. Now each market shows as many decimals as its tick, through
 * priceDp() and fmtPrice(), everywhere a price appears. */

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState, wired } = require('./helpers/load-app.js');

const app = loadApp();
const { state, newLeg, COMMODITIES } = app;

/* A market at its own quoting, as presets leave it. */
function market(key, over) {
  const m = COMMODITIES[key];
  return resetState(app, Object.assign({ commodity: key, quote: m.quote, size: m.size }, over));
}

test('a price shows as many decimals as its market\'s tick, and never fewer than two', () => {
  const want = {
    gold: 2, silver: 3, copper: 4, wti: 2, brent: 2, natgas: 3, corn: 3, wheat: 3, soybean: 3,
    sugar: 2, coffee: 2, cocoa: 2, cotton: 2, cattle: 3
  };
  for (const key of Object.keys(want)) {
    market(key);
    assert.strictEqual(app.priceDp(), want[key], key);
  }
  // The tick is in the market's own unit: in dollars a cent-quoted price
  // needs two decimals more, and in cents a dollar-quoted one two fewer.
  market('corn', { quote: 'USD' });
  assert.strictEqual(app.priceDp(), 5, 'corn in dollars: an eighth of a cent is 0.00125');
  market('copper', { quote: 'cents' });
  assert.strictEqual(app.priceDp(), 2, 'copper in cents: 0.05');
});

test('a custom contract has no tick, so it shows five significant figures of its price', () => {
  for (const [S, dp] of [[4000, 2], [100, 2], [45.5, 3], [4.5, 4], [0.05, 6], [1e-9, 8]]) {
    market('custom', { S });
    assert.strictEqual(app.priceDp(), dp, 'at ' + S);
  }
});

test('the legs table shows each premium to within half a tick, in the review\'s cases', () => {
  // REVISION_2_LOGICA.md, L8: 30-day options at r = 4%.
  const cases = [
    ['copper', 4.5, 4.7, 22, '0.0420'],
    ['natgas', 3, 3.1, 60, '0.162'],
    ['silver', 53, 56, 28, '0.638'],
    ['gold', 4000, 4100, 15, '30.52']
  ];
  for (const [key, S, K, vol, shown] of cases) {
    market(key, { S, vol, rate: 4, days: 30 });
    const leg = newLeg({ kind: 'call', strike: K, days: 30 });
    state.legs = [leg];
    const premium = app.legGreeks(leg).price;
    const mult = app.dollarMultiplier(app.currentCommodity());
    const html = app.legRowHtml(leg, mult);
    assert.ok(html.includes('<td class="num" data-label="Theo.">' + shown + '</td>'), `${key}: ${shown}`);
    assert.ok(html.includes('data-f="entry" value="" placeholder="' + shown + '"'), `${key}: the default entry`);
    const tick = COMMODITIES[key].tick;
    assert.ok(Math.abs(Number(shown) - premium) * mult <= tick * mult / 2,
      `${key}: ${shown} against ${premium}, within half a tick a contract`);
  }
});

test('breakevens, strikes, the scenario grid and the chart read in the same decimals', () => {
  const { app: page, el } = wired();
  Object.assign(page.state, { commodity: 'copper', quote: 'USD', size: 25000, S: 4.5, vol: 22, rate: 4, days: 30 });
  page.state.legs = [page.newLeg({ kind: 'call', strike: 4.7, days: 30 })];
  // The premium with its month of interest at 4%, which moves the fourth decimal.
  const breakeven = 4.7 + page.legGreeks(page.state.legs[0]).price * Math.exp(0.04 * 30 / 365);

  page.renderResults();
  assert.match(el('summary').innerHTML, new RegExp('<strong>' + breakeven.toFixed(4).replace('.', '\\.') + '</strong>'),
    'the breakeven, to the tick');
  page.renderScenarios();
  assert.match(el('scenarios').innerHTML, /<th class="rowhead">4\.5000 <span/, 'the grid\'s price rows');

  page.state.chart.showLegs = true;
  const cfg = page.chartConfig(page.analyse());
  assert.ok(cfg.data.datasets.some(d => d.label === 'Long 1 call 4.7'), 'the leg in the legend');
  assert.ok(cfg.options.plugins.markers.lines.some(l => l.label === 'K 4.7'), 'the strike mark, not "K 5"');
  assert.strictEqual(cfg.options.plugins.tooltip.callbacks.title([{ parsed: { x: 4.51234 } }]), 'Price 4.5123');
});

test('every quote, source line and month label carries the market\'s decimals', async () => {
  const months = {
    commodity: 'copper', contracts: [
      { symbol: 'HGZ26.CMX', name: 'Copper Dec 26', price: 4.5025, currency: 'USD', expiry: '2026-12-15' },
      { symbol: 'HGH27.CMX', name: 'Copper Mar 27', price: 4.548, currency: 'USD', expiry: '2027-03-15' }]
  };
  const quote = { symbol: 'HG=F', name: 'Copper Dec 26', currency: 'USD', price: 4.5025 };
  const net = loadApp({
    fetch: async url => ({
      ok: true, status: 200, json: async () => (String(url).includes('fn=months') ? months : quote)
    })
  });
  const s = resetState(net, { commodity: 'copper', quote: 'USD', size: 25000, S: 4.4, rate: 4 });

  const r = await net.applyFuturesPrice();
  assert.match(r.message, /Copper Dec 26 at 4\.5025/);
  assert.match(s.sources.price.text, /Copper Dec 26 last 4\.5025 USD/);

  await net.applyCurveYield();
  assert.match(s.sources.yield.text, /Copper Dec 26 4\.5025 vs Copper Mar 27 4\.5480/);
  net.applyCarryYield(4.5025, 4.548, 90);
  assert.match(s.sources.yield.text, /F=4\.5480, S=4\.5025/);

  s.legs = [net.newLeg({ kind: 'call', strike: 4.7, days: 90 })];
  await net.applyLegPrices();
  assert.match(s.sources.legs.text, /from 4\.5025 in the panel, .* Copper Dec 26 4\.5025 vs Copper Mar 27 4\.5480/);

  await net.loadContractMonths();
  assert.strictEqual(net.monthLabel(s.session.strip[1]), 'Copper Mar 27 - 4.5480');
  net.useContractMonth('HGH27.CMX');
  assert.match(s.sources.price.text, /Copper Mar 27 4\.5480 USD/);
  await net.applyLegPrices();
  assert.match(s.sources.legs.text, /Copper Dec 26 4\.5025 to Copper Mar 27 4\.5480/);

  const html = net.legRowHtml(s.legs[0], 25000);
  assert.match(html, /data-f="under" value="[^"]*" placeholder="4\.5480"/, 'the leg price\'s placeholder');

  quote.price = -0.0125;
  net.storage.clear();   // the cached quote
  await assert.rejects(net.applyFuturesPrice(), /Copper Dec 26 last -0\.0125, below zero/);
});
