'use strict';

/* The market-data actions: each fills one input from the network and reports
 * what it did. They used to read and write the page directly, so none of them
 * could run here and none had a test. Now they take their inputs as arguments
 * and return their results, and these tests run every one of them against a
 * fake network. There is no page in this VM, so an action that reached for the
 * DOM would throw. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, resetState } = require('./helpers/load-app.js');

const TREASURY = fs.readFileSync(path.join(__dirname, 'fixtures', 'treasury-2026-10.xml'), 'utf8');

/* ---- a fake network ---- */

const calls = [];
let handler = () => ({ status: 599, body: 'no handler set' });
const app = loadApp({
  fetch: async url => {
    url = String(url);
    calls.push(url);
    const a = handler(url);
    const text = typeof a.body === 'string' ? a.body : JSON.stringify(a.body);
    return {
      ok: a.status >= 200 && a.status < 300, status: a.status,
      json: async () => JSON.parse(text), text: async () => text
    };
  }
});
const { state } = app;

const ok = body => ({ status: 200, body });
/* Answers by the first key the URL contains; anything else is a 404. */
const serve = map => url => {
  for (const key of Object.keys(map)) {
    if (url.includes(key)) return typeof map[key] === 'function' ? map[key](url) : map[key];
  }
  return { status: 404, body: { error: 'not routed: ' + url } };
};

function fresh(over) {
  resetState(app, over);
  state.sources = { price: null, rate: null, vol: null, yield: null, legs: null };
  state.contractMonth = '';
  state.session.strip = [];
  app.storage.clear();     // the response cache lives in localStorage
  calls.length = 0;
}

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

/* A daily OHLC series of known shape, n days long. */
function series(base, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = +(base * Math.exp(0.012 * Math.sin(i * 1.7) + 0.004 * i / n)).toFixed(2);
    out.push({ date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10),
      o: +(c * 0.998).toFixed(2), h: +(c * 1.006).toFixed(2), l: +(c * 0.993).toFixed(2), c });
  }
  return out;
}

/* The function's months answer, which is the whole curve: the carry is read off
 * its two nearest contracts, and the third is there to show nothing else is. */
const CURVE = { commodity: 'gold', contracts: [
  { symbol: 'GCZ26.CMX', name: 'Gold Dec 26', price: 4025.5, expiry: '2026-12-15' },
  { symbol: 'GCG27.CMX', name: 'Gold Feb 27', price: 4061.2, expiry: '2027-02-15' },
  { symbol: 'GCJ27.CMX', name: 'Gold Apr 27', price: 4150.0, expiry: '2027-04-15' }] };
const CURVE_GAP_DAYS = 62;   // 15 Dec to 15 Feb

/* A strip whose expiries sit a known number of days from now. */
function strip(points) {
  return points.map(([days, price], i) => ({
    symbol: 'GC' + i, name: 'Gold month ' + i, price, currency: 'USD',
    expiry: new Date(Date.now() + days * 86400e3).toISOString().slice(0, 10)
  }));
}

/* ---- the Treasury curve ---- */

test('the Treasury feed is read without a DOM, from a real response', () => {
  const c = app.parseTreasuryXml(TREASURY);
  assert.strictEqual(c.date, '2026-10-23', 'the last day in the feed');
  assert.strictEqual(c.points.length, 13, 'one point per tenor');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.points[0])), { years: 1 / 12, yield: 4.11 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.points[12])), { years: 30, yield: 5.33 });
});

test('a tenor with no quote is skipped, and BC_30YEARDISPLAY is not BC_30YEAR', () => {
  const day = (date, fields) => '<m:properties><d:NEW_DATE m:type="Edm.DateTime">' + date +
    'T00:00:00</d:NEW_DATE>' + fields + '</m:properties>';
  const xml = '<feed>' +
    day('2026-01-02', '<d:BC_1MONTH m:type="Edm.Double">1.00</d:BC_1MONTH>') +
    day('2026-01-05', '<d:BC_1MONTH m:type="Edm.Double" m:null="true" />' +
      '<d:BC_2MONTH m:type="Edm.Double">4.20</d:BC_2MONTH>' +
      '<d:BC_30YEARDISPLAY m:type="Edm.Double">9.99</d:BC_30YEARDISPLAY>' +
      '<d:BC_30YEAR m:type="Edm.Double">5.10</d:BC_30YEAR>') + '</feed>';
  const c = app.parseTreasuryXml(xml);
  assert.strictEqual(c.date, '2026-01-05');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.points)),
    [{ years: 2 / 12, yield: 4.2 }, { years: 30, yield: 5.1 }]);
  assert.strictEqual(app.parseTreasuryXml('<html>Service unavailable</html>'), null);
  assert.strictEqual(app.parseTreasuryXml('<feed><m:properties></m:properties></feed>'), null);
});

test('the rate is read off the Treasury curve at the contract tenor', async () => {
  fresh({ days: 30, rate: 4 });
  handler = serve({ 'home.treasury.gov': ok(TREASURY) });
  const r = await app.applyRate();
  // 30 days is inside the one-month point, 4.11% par: semi-annual, so 2 ln(1.02055).
  assert.strictEqual(state.rate, +(2 * Math.log(1 + 0.0411 / 2) * 100).toFixed(3));
  assert.strictEqual(state.rate, 4.068);
  assert.match(r.message, /risk-free rate 4\.068% \(Treasury 2026-10-23\)/);
  assert.match(state.sources.rate.text, /US Treasury par curve 2026-10-23, interpolated at 30d = 4\.11% par \(semi-annual\) -> 4\.068% continuous/);
});

test('a month with no data yet falls back to the month before', async () => {
  fresh({ days: 30, rate: 4 });
  let n = 0;
  handler = serve({ 'home.treasury.gov': () => (n++ === 0 ? ok('<feed></feed>') : ok(TREASURY)) });
  await app.applyRate();
  assert.strictEqual(calls.length, 2, 'two months asked for');
  assert.notStrictEqual(calls[0], calls[1]);
  assert.strictEqual(state.rate, 4.068);
});

test('when the Treasury cannot be read the rate keeps its value', async () => {
  fresh({ rate: 4 });
  handler = serve({ 'home.treasury.gov': { status: 503, body: 'down' } });
  await assert.rejects(app.applyRate(), /Treasury yield curve unavailable/);
  assert.strictEqual(state.rate, 4);
  assert.strictEqual(calls.length, 3, 'three months tried');
});

/* ---- the futures price ---- */

test('the price comes from the front month, and a USX quote switches to cents', async () => {
  fresh({ commodity: 'corn', S: 400, quote: 'USD' });
  handler = serve({ 'fn=quote&commodity=corn': ok({ symbol: 'ZC=F', name: 'Corn Dec 26',
    currency: 'USX', price: 431.25, asOf: '2026-10-24T18:20:00.000Z' }) });
  const r = await app.applyFuturesPrice();
  assert.strictEqual(state.S, 431.25);
  assert.strictEqual(state.quote, 'cents', 'getting this wrong scales P&L by 100');
  // Corn options move in eighths of a cent, so its prices show three decimals.
  assert.match(r.message, /Corn Dec 26 at 431\.250, quoting switched to cents/);
  assert.match(state.sources.price.text, /Corn Dec 26 last 431\.250 USX, 2026-10-24 18:20 UTC/);
});

test('the proxy\'s answers are cached, so a second click makes no request', async () => {
  fresh();
  handler = serve({ 'fn=quote&commodity=gold': ok({ symbol: 'GC=F', currency: 'USD', price: 4025.5 }) });
  await app.applyFuturesPrice();
  await app.applyFuturesPrice();
  assert.strictEqual(calls.length, 1);
});

test('a failed price leaves the old one, and the user is told why', async () => {
  const cases = [
    [{ status: 200, body: { price: 0 } }, /no price returned/],
    [{ status: 502, body: { error: 'Upstream market data unavailable' } }, /Upstream market data unavailable/],
    [{ status: 404, body: '<html>not found</html>' }, /the futures proxy is not deployed here/]
  ];
  for (const [answer, why] of cases) {
    fresh({ S: 4000 });
    handler = () => answer;
    await assert.rejects(app.applyFuturesPrice(), why);
    assert.strictEqual(state.S, 4000);
    assert.strictEqual(state.sources.price, null);
  }
});

test('a quote below zero is refused with the reason, not taken as a missing price', async () => {
  // WTI's May 2020 contract settled at -37.63 on 20 April 2020, and no model
  // here prices a contract below zero.
  const cases = [
    [{ symbol: 'CL=F', name: 'Crude Oil May 20', price: -37.63 }, /Crude Oil May 20 last −37\.63, below zero/],
    [{ price: -5 }, /the contract last −5\.00, below zero, which these lognormal models cannot price/]
  ];
  for (const [body, why] of cases) {
    fresh({ commodity: 'wti', S: 60 });
    handler = serve({ 'fn=quote&commodity=wti': ok(body) });
    await assert.rejects(app.applyFuturesPrice(), why);
    assert.strictEqual(state.S, 60);
    assert.strictEqual(state.sources.price, null);
  }
});

test('the proxy is not tried from file://, nor for a market it does not serve', async () => {
  let asked = 0;
  const local = loadApp({ protocol: 'file:', fetch: async () => { asked++; throw new Error('no'); } });
  resetState(local);
  await assert.rejects(local.applyFuturesPrice(), /the futures proxy only runs on the deployed site/);
  fresh({ commodity: 'custom' });
  await assert.rejects(app.applyFuturesPrice(), /no futures contract mapped for this commodity/);
  assert.strictEqual(asked + calls.length, 0, 'no request made');
});

/* ---- volatility ---- */

test('volatility comes from the futures series, with the chosen window and estimator', async () => {
  fresh({ vol: 15 });
  const s = series(4000, 90);
  handler = serve({ 'fn=history&commodity=gold': ok({ symbol: 'GC=F', series: s }) });
  for (const [window, estimator] of [[20, 'close'], [60, 'ewma'], [30, 'parkinson']]) {
    app.storage.clear();
    const r = await app.applyVol({ window, estimator, avKey: '', symbol: '' });
    const expected = app.realisedVol(s, window)[estimator];
    // What the estimator measured, not its rounding to 0.01 (REVISION_2_LOGICA.md, L15).
    assert.strictEqual(state.vol, expected, `${estimator} over ${window}d`);
    assert.strictEqual(r.message, `volatility ${+expected.toFixed(4)}% from GC=F`, 'four decimals of it');
    assert.match(state.sources.vol.text, new RegExp('^' + estimator + ' realised vol, ' + window + 'd window'));
  }
});

test('when the function fails, volatility falls back to Alpha Vantage and keeps the key', async () => {
  const s = series(180, 90);
  const raw = {};
  for (const d of s) raw[d.date] = { '1. open': '' + d.o, '2. high': '' + d.h, '3. low': '' + d.l, '4. close': '' + d.c };
  const answers = {
    'fn=history': { status: 502, body: { error: 'Upstream market data unavailable' } },
    'alphavantage.co': ok({ 'Time Series (Daily)': raw })
  };

  fresh({ commodity: 'gold', vol: 15 });
  handler = serve(answers);
  let r = await app.applyVol({ window: 20, estimator: 'close', avKey: 'my-key', symbol: '' });
  const av = calls.find(u => u.includes('alphavantage.co'));
  assert.match(av, /symbol=GLD/, 'the preset ETF');
  assert.match(av, /apikey=my-key/);
  assert.strictEqual(app.storage.get(app.KEY_STORE), 'my-key');
  const close = app.realisedVol(s, 20).close;
  assert.strictEqual(state.vol, close);
  assert.strictEqual(r.message, `volatility ${+close.toFixed(4)}% from GLD (ETF proxy)`);
  assert.match(state.sources.vol.text, /SPDR Gold Shares/, 'names the proxy it used');

  // A ticker typed by hand is used instead, and not described as the preset.
  fresh({ commodity: 'gold', vol: 15 });
  handler = serve(answers);
  await app.applyVol({ window: 20, estimator: 'close', avKey: 'my-key', symbol: 'iau' });
  assert.match(calls.find(u => u.includes('alphavantage.co')), /symbol=IAU/);
  assert.match(state.sources.vol.text, /IAU \(symbol entered by you\)/);
});

test('without a key, the function\'s own error is what the user sees', async () => {
  fresh({ vol: 15 });
  handler = serve({ 'fn=history': { status: 502, body: { error: 'Upstream market data unavailable' } } });
  await assert.rejects(app.applyVol({ window: 20, estimator: 'close', avKey: '', symbol: '' }),
    /Upstream market data unavailable/);
  assert.strictEqual(state.vol, 15);
  assert.ok(!calls.some(u => u.includes('alphavantage.co')), 'Alpha Vantage is not tried');
});

/* ---- the curve ---- */

test('the curve\'s convenience yield follows the carry formula and hands back its working', async () => {
  fresh({ rate: 4, yield: 0.3 });
  handler = serve({ 'fn=months&commodity=gold': ok(CURVE) });
  const r = await app.applyCurveYield();
  const y = app.impliedConvenienceYield(4025.5, 4061.2, CURVE_GAP_DAYS, 4);
  assert.strictEqual(state.yield, +y.toFixed(3));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.carry)), { near: 4025.5, far: 4061.2, days: CURVE_GAP_DAYS },
    'the numbers the manual carry boxes show');
  assert.match(state.sources.yield.text, /Gold Dec 26 4,025\.50 vs Gold Feb 27 4,061\.20, 62d apart/);
});

test('the curve is read through one gap and one slope', () => {
  assert.strictEqual(app.contractGapDays(CURVE.contracts[0], CURVE.contracts[1]), CURVE_GAP_DAYS);
  near(app.logSlope(100, 100 * Math.exp(0.05), 365), 0.05, 1e-12, 'a year at 5%');
  near(app.logSlope(100, 100 * Math.exp(0.05), 73), 0.25, 1e-12, 'the same move in a fifth of a year');
  // Under cost of carry the slope is r - y, which is what the yield inverts.
  const y = app.impliedConvenienceYield(4025.5, 4061.2, CURVE_GAP_DAYS, 4);
  near(y, 4 - 100 * app.logSlope(4025.5, 4061.2, CURVE_GAP_DAYS), 1e-12, 'y = r - slope');
});

test('the Yield button and the leg fill read the same slope off the curve', async () => {
  // They used to compute it separately, each with its own copy of the formula.
  fresh({ S: 4000, rate: 4, yield: 0.3 });
  handler = serve({ 'fn=months&commodity=gold': ok(CURVE) });
  await app.applyCurveYield();
  state.legs = [app.newLeg({ kind: 'call', strike: 4000, days: 365 })];
  await app.applyLegPrices();
  // A year out the leg sits at S e^slope, and the slope is r - y.
  const slope = Math.log(state.legs[0].under / 4000);
  near(100 * slope, 4 - state.yield, 1e-3, 'slope = r - y, in percent (the yield is shown to 3 dp)');
});

test('two contracts that give no spread leave the yield alone', async () => {
  fresh({ yield: 0.3 });
  const backwards = { contracts: [CURVE.contracts[1], CURVE.contracts[0]] };
  handler = serve({ 'fn=months': ok(backwards) });
  await assert.rejects(app.applyCurveYield(), /did not give a usable spread/);
  assert.strictEqual(state.yield, 0.3);
});

test('the Yield button, the leg fill and the month picker share one request', async () => {
  // They used to ask the function for curve and for months separately: two
  // requests probing up to 19 overlapping contracts upstream, cached under two
  // keys, and a carry measured on other quotes than the picker listed.
  fresh({ S: 4000, rate: 4, yield: 0.3 });
  handler = serve({ 'fn=months&commodity=gold': ok(CURVE) });
  const r = await app.applyCurveYield();
  state.legs = [app.newLeg({ kind: 'call', strike: 4000, days: 60 })];
  await app.applyLegPrices();
  await app.loadContractMonths();
  assert.deepStrictEqual(calls, ['/api/market?fn=months&commodity=gold'], 'one request');
  const [a, b] = state.session.strip;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.carry)), { near: a.price, far: b.price, days: CURVE_GAP_DAYS },
    'the carry is measured on the two nearest months the picker lists');
});

test('one listed contract is not a curve', async () => {
  fresh({ S: 4000, yield: 0.3 });
  handler = serve({ 'fn=months': ok({ contracts: CURVE.contracts.slice(0, 1) }) });
  await assert.rejects(app.applyCurveYield(), /fewer than two listed contracts quote/);
  assert.strictEqual(state.yield, 0.3);
  state.legs = [app.newLeg({ kind: 'call', strike: 4000, days: 60 })];
  await assert.rejects(app.applyLegPrices(), /fewer than two listed contracts quote/);
  assert.strictEqual(state.legs[0].under, null);
  assert.strictEqual(state.sources.legs, null);
});

/* ---- the listed strip ---- */

test('the listed strip is kept for the picker, and an empty one is an error', async () => {
  fresh();
  const months = strip([[50, 4025.5], [110, 4061.2], [170, 4093.8]]);
  handler = serve({ 'fn=months&commodity=gold': ok({ contracts: months }) });
  const r = await app.loadContractMonths();
  assert.strictEqual(r.message, '3 listed months loaded');
  assert.deepStrictEqual(Array.from(state.session.strip, c => c.symbol), ['GC0', 'GC1', 'GC2']);

  app.storage.clear();
  handler = serve({ 'fn=months': ok({ contracts: [] }) });
  await assert.rejects(app.loadContractMonths(), /no listed contract quoted/);
  assert.strictEqual(state.session.strip.length, 3, 'the strip already loaded is kept');
});

test('picking a month prices the panel on it; going back stops claiming one', () => {
  fresh({ S: 4000 });
  state.session.strip = strip([[50, 4025.5], [110, 4061.2]]);
  app.useContractMonth('GC1');
  assert.strictEqual(state.S, 4061.2);
  assert.strictEqual(state.contractMonth, 'GC1');
  assert.match(state.sources.price.text, /one listed contract, not the continuous series/);
  app.useContractMonth('');
  assert.strictEqual(state.S, 4061.2, 'no front-month quote in hand, so the price stays');
  assert.strictEqual(state.sources.price, null);
});

/* ---- leg prices ---- */

test('legs priced along the two-contract slope, on their own source line, and undone', async () => {
  fresh({ S: 4000 });
  state.sources.price = { live: true, text: 'what the panel said' };
  state.legs = [
    app.newLeg({ kind: 'call', side: -1, strike: 4000, days: 30 }),
    app.newLeg({ kind: 'call', side: 1, strike: 4000, days: 60 }),
    app.newLeg({ kind: 'underlying', strike: 0, days: 30 })
  ];
  handler = serve({ 'fn=months&commodity=gold': ok(CURVE) });
  const r = await app.applyLegPrices();
  const slope = Math.log(4061.2 / 4025.5) / (CURVE_GAP_DAYS / 365);
  assert.strictEqual(state.legs[0].under, +(4000 * Math.exp(slope * 30 / 365)).toFixed(4));
  assert.strictEqual(state.legs[1].under, +(4000 * Math.exp(slope * 60 / 365)).toFixed(4));
  assert.strictEqual(state.legs[2].under, null, 'the underlying leg is the panel price');
  assert.strictEqual(r.message, `leg prices from a ${(slope * 100).toFixed(2)}%/yr curve`);
  assert.match(state.sources.legs.text, /^from 4,000\.00 in the panel, priced along the curve at 5\.20%\/yr/);
  // The panel price's own line is not the fill's to overwrite.
  assert.strictEqual(state.sources.price.text, 'what the panel said');

  await app.applyLegPrices();
  app.clearLegPrices();
  assert.ok(state.legs.every(l => l.under === null));
  assert.strictEqual(state.sources.legs, null);
  assert.strictEqual(state.sources.price.text, 'what the panel said');
});

test('with the strip loaded, legs interpolate between real quotes and nothing is fetched', async () => {
  fresh({ S: 4000 });
  state.session.strip = strip([[20, 4025.5], [80, 4061.2], [140, 4093.8]]);
  state.legs = [app.newLeg({ kind: 'call', days: 50 }), app.newLeg({ kind: 'put', days: 110 })];
  const r = await app.applyLegPrices();
  assert.strictEqual(calls.length, 0);
  for (const leg of state.legs) {
    assert.strictEqual(leg.under, +app.forwardFromStrip(leg.days).toFixed(4), `${leg.days}d leg`);
  }
  assert.ok(state.legs[0].under > 4025.5 && state.legs[0].under < 4061.2, 'between its two quotes');
  assert.strictEqual(r.message, 'leg prices from 3 listed contracts');
  assert.match(state.sources.legs.text, /^legs interpolated across 3 listed contracts/);
});

test('leg prices need an option leg', async () => {
  fresh();
  state.legs = [app.newLeg({ kind: 'underlying' })];
  await assert.rejects(app.applyLegPrices(), /add an option leg first/);
});

/* ---- where each number came from ----
 *
 * Every market input says where it came from, and that line must stay true:
 * a number typed by hand is the user's, and the month picker shows the month
 * the price belongs to. Both used to drift. */

const QUOTE = { symbol: 'GC=F', name: 'Gold Dec 26', currency: 'USD', price: 4025.5, asOf: '2026-10-26T03:39:56.000Z' };

test('fetching the front month drops a picked listed month', async () => {
  fresh({ S: 4000 });
  state.session.strip = strip([[50, 4025.5], [110, 4061.2]]);
  app.useContractMonth('GC1');
  assert.strictEqual(state.contractMonth, 'GC1');
  handler = serve({ 'fn=quote&commodity=gold': ok(QUOTE) });
  await app.applyFuturesPrice();
  assert.strictEqual(state.S, 4025.5);
  assert.strictEqual(state.contractMonth, '', 'the picker used to stay on the month');
  assert.match(state.sources.price.text, /^Gold Dec 26 last 4,025\.50/);
});

test('a price typed by hand is the user\'s, not a listed contract\'s', () => {
  fresh({ S: 4000 });
  state.session.strip = strip([[50, 4025.5], [110, 4061.2]]);
  app.useContractMonth('GC1');
  assert.match(state.sources.price.text, /one listed contract/);

  app.typeMarketInput('S', 6000);
  assert.strictEqual(state.S, 6000);
  assert.strictEqual(state.sources.price, null, 'it used to keep the month\'s quote as its source');
  assert.strictEqual(state.contractMonth, '');
});

test('a rate, volatility or yield typed over a fetched one loses its source', () => {
  for (const key of ['rate', 'vol', 'yield']) {
    fresh({ rate: 4, vol: 15, yield: 0.3 });
    state.sources[key] = { live: true, text: 'from the market' };
    app.typeMarketInput(key, 7.5);
    assert.strictEqual(state[key], 7.5);
    assert.strictEqual(state.sources[key], null, key);
  }
  // Only the market inputs: anything else is ignored rather than written.
  fresh({ size: 100 });
  app.typeMarketInput('size', 5);
  app.typeMarketInput('__proto__', 5);
  assert.strictEqual(state.size, 100);
});

test('a leg price typed over a fill stops the line vouching for every leg', async () => {
  fresh({ S: 4000 });
  state.session.strip = strip([[20, 4025.5], [80, 4061.2], [140, 4093.8]]);
  state.legs = [app.newLeg({ kind: 'call', days: 50 }), app.newLeg({ kind: 'put', days: 110 })];
  await app.applyLegPrices();
  const filled = state.sources.legs.text;

  app.typeLegPrice(state.legs[0], 4500);
  assert.strictEqual(state.legs[0].under, 4500);
  assert.strictEqual(state.sources.legs.text, filled + '; edited by hand since');
  app.typeLegPrice(state.legs[1], 4600);
  assert.strictEqual(state.sources.legs.text, filled + '; edited by hand since', 'said once');

  // Blank every leg by hand and nothing is left for the line to describe.
  app.typeLegPrice(state.legs[0], null);
  app.typeLegPrice(state.legs[1], null);
  assert.strictEqual(state.sources.legs, null);
});

test('fill, type a price, undo the fill: no stale source comes back', async () => {
  // When one line served both, undoing the fill restored whatever the price
  // line said before it - here a quote for a price the user has since typed over.
  fresh({ S: 4000 });
  state.sources.price = { live: true, text: 'Gold Dec 26 last 4,000.00' };
  state.legs = [app.newLeg({ kind: 'call', days: 50 })];
  state.session.strip = strip([[20, 4025.5], [80, 4061.2]]);
  await app.applyLegPrices();
  app.typeMarketInput('S', 4100);
  app.clearLegPrices();
  assert.strictEqual(state.sources.price, null);
  assert.strictEqual(state.sources.legs, null);
});

test('presets drop a picked month along with the price\'s source, and keep the price', () => {
  fresh({ S: 4000 });
  state.session.strip = strip([[50, 4025.5], [110, 4061.2]]);
  app.useContractMonth('GC1');
  app.applyPreset();
  assert.strictEqual(state.S, 4061.2);
  assert.strictEqual(state.contractMonth, '');
  assert.strictEqual(state.sources.price, null);
});

/* ---- everything at once ---- */

test('auto-fill reports each input on its own and keeps going past a failure', async () => {
  fresh({ days: 30, rate: 4, S: 4000, vol: 15, yield: 0.3 });
  handler = serve({
    'home.treasury.gov': ok(TREASURY),
    'fn=quote': { status: 502, body: { error: 'Upstream market data unavailable' } },
    'fn=history': ok({ symbol: 'GC=F', series: series(4000, 90) }),
    'fn=months': ok(CURVE)
  });
  const r = await app.autoFill({ window: 20, estimator: 'close', avKey: '', symbol: '' });
  assert.strictEqual(r.done.length, 3);
  assert.deepStrictEqual(Array.from(r.failed, f => [f.name, f.error.service, f.error.message]),
    [['futures price', 'futures', 'Upstream market data unavailable']], 'the input, and the service that did not answer');
  assert.strictEqual(state.S, 4000, 'the price that failed kept its value');
  assert.ok(r.results.some(x => x.carry), 'the curve\'s working comes back for the carry boxes');
  // The yield is computed with the rate fetched a step earlier.
  assert.strictEqual(state.rate, 4.068);
  assert.strictEqual(state.yield, +app.impliedConvenienceYield(4025.5, 4061.2, CURVE_GAP_DAYS, 4.068).toFixed(3));
});

/* ---- by hand, and the presets ---- */

test('the carry boxes imply a yield, and an empty box is refused with the reason', () => {
  fresh({ rate: 4, yield: 0.3 });
  const r = app.applyCarryYield(4000, 4100, 90);
  const y = app.impliedConvenienceYield(4000, 4100, 90, 4);
  assert.strictEqual(state.yield, +y.toFixed(3));
  assert.strictEqual(r.message, 'Convenience yield implied from the spot/futures basis: ' + y.toFixed(3) + '%.');
  assert.match(state.sources.yield.text, /^implied by carry: F=4,100\.00, S=4,000\.00, 90d, r=4%/);

  assert.throws(() => app.applyCarryYield(NaN, 4100, 90),
    /Enter a spot price, a futures price and the days to the futures expiry\./);
  assert.strictEqual(state.yield, +y.toFixed(3), 'unchanged by the refused attempt');
});

test('presets reset the inputs, clear the leg prices and say they are not market data', async () => {
  fresh({ commodity: 'corn', S: 431.25, vol: 22, yield: 1, size: 1, quote: 'USD' });
  state.legs = [app.newLeg({ kind: 'call', days: 30 })];
  state.session.strip = strip([[20, 431.25], [80, 445.5]]);
  await app.applyLegPrices();
  assert.ok(state.legs[0].under > 0);

  app.applyPreset();
  const meta = app.COMMODITIES.corn;
  assert.strictEqual(state.vol, meta.vol);
  assert.strictEqual(state.yield, meta.yield);
  assert.strictEqual(state.size, meta.size);
  assert.strictEqual(state.quote, meta.quote);
  assert.strictEqual(state.legs[0].under, null, 'leg prices are market data too');
  assert.strictEqual(state.sources.legs, null);
  assert.strictEqual(state.sources.price, null);
  assert.strictEqual(state.S, 431.25, 'presets have no price; the one in the panel stays');
  assert.strictEqual(state.sources.vol.live, false);
  assert.match(state.sources.vol.text, /not market data/);
  assert.match(state.sources.yield.text, /not market data/);
});
