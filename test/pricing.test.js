'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState } = require('./helpers/load-app.js');

const app = loadApp();
const { gbs, normCdf, impliedVol, realisedVol, rateForTenor, impliedConvenienceYield } = app;

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

const S = 4000, K = 4200, T = 30 / 365, r = 0.04, q = 0.003, sigma = 0.15;

test('normal CDF matches reference values', () => {
  near(normCdf(0), 0.5, 1e-12, 'N(0)');
  near(normCdf(1.959963985), 0.975, 1e-9, 'N(1.96)');
  near(normCdf(-3), 0.0013498980316301, 1e-12, 'N(-3)');
  near(normCdf(-1.644853627), 0.05, 1e-9, 'N(-1.645)');
});

test('put-call parity holds under Black-76', () => {
  const c = gbs('call', S, K, T, r, 0, sigma).price;
  const p = gbs('put', S, K, T, r, 0, sigma).price;
  near(c - p, Math.exp(-r * T) * (S - K), 1e-9, 'C - P');
});

test('put-call parity holds under Black-Scholes-Merton with carry', () => {
  const b = r - q;
  const c = gbs('call', S, K, T, r, b, sigma).price;
  const p = gbs('put', S, K, T, r, b, sigma).price;
  near(c - p, S * Math.exp(-q * T) - K * Math.exp(-r * T), 1e-9, 'C - P');
});

test('Black-76 reproduces a textbook value', () => {
  // F = K = 100, T = 1, r = 0, sigma = 20% -> 7.9656
  near(gbs('call', 100, 100, 1, 0, 0, 0.2).price, 7.9656, 1e-3, 'ATM call');
});

test('greeks agree with finite differences, both models and both types', () => {
  const central = (f, x, h) => (f(x + h) - f(x - h)) / (2 * h);

  // Black-76 pins the carry at 0; BSM moves it with the rate.
  for (const [b, tracks] of [[0, false], [r - q, true]]) {
    for (const kind of ['call', 'put']) {
      const label = `${kind} b=${b.toFixed(3)}`;
      const price = x => gbs(kind, x, K, T, r, b, sigma).price;
      const g = gbs(kind, S, K, T, r, b, sigma, tracks);

      near(central(price, S, 0.01), g.delta, 1e-6, `delta ${label}`);

      const gammaFd = (price(S + 0.5) - 2 * price(S) + price(S - 0.5)) / 0.25;
      near(gammaFd, g.gamma, 1e-7, `gamma ${label}`);

      const vegaFd = central(v => gbs(kind, S, K, T, r, b, v).price, sigma, 1e-4) / 100;
      near(vegaFd, g.vega, 1e-5, `vega ${label}`);

      const thetaFd = -central(t => gbs(kind, S, K, t, r, b, sigma).price, T, 1e-6) / 365;
      near(thetaFd, g.theta, 1e-5, `theta ${label}`);

      // Under BSM the rate also moves the carry term; under Black-76 it does not.
      const rhoFd = tracks
        ? central(rr => gbs(kind, S, K, T, rr, rr - q, sigma).price, r, 1e-6) / 100
        : central(rr => gbs(kind, S, K, T, rr, 0, sigma).price, r, 1e-6) / 100;
      near(rhoFd, g.rho, 1e-5, `rho ${label}`);
    }
  }
});

test('BSM rho stays BSM\'s when the yield equals the rate and the carry is zero', () => {
  // REVISION_2_LOGICA.md, L4: b = r - q is 0 here, which is also Black-76's
  // b, and the rho used to be chosen by looking at b.
  const central = (f, x, h) => (f(x + h) - f(x - h)) / (2 * h);
  const t = 182.5 / 365;
  for (const kind of ['call', 'put']) {
    const bsm = central(rr => gbs(kind, 100, 100, t, rr, rr - 0.04, 0.3).price, 0.04, 1e-6) / 100;
    near(gbs(kind, 100, 100, t, 0.04, 0, 0.3, true).rho, bsm, 1e-6, `${kind}, BSM`);
    const b76 = central(rr => gbs(kind, 100, 100, t, rr, 0, 0.3).price, 0.04, 1e-6) / 100;
    near(gbs(kind, 100, 100, t, 0.04, 0, 0.3, false).rho, b76, 1e-6, `${kind}, Black-76`);
    near(gbs(kind, 100, 100, t, 0.04, 0, 0.3).rho, b76, 1e-6,
      `${kind}, unstated: the carry is taken as fixed, as americanGreeks() takes it`);
  }
  near(gbs('call', 100, 100, t, 0.04, 0, 0.3, true).rho, 0.2244, 1e-4, 'the review\'s figure');

  // And through the app, which states the model rather than leaving it to b.
  resetState(app, { model: 'bs', style: 'european', S: 100, rate: 4, yield: 4, vol: 30, days: 182.5 });
  const leg = app.newLeg({ kind: 'call', strike: 100, days: 182.5 });
  near(app.legGreeks(leg).rho, 0.2244, 1e-4, 'a BSM call with the yield at the rate');
  resetState(app, { model: 'b76', style: 'european', S: 100, rate: 4, vol: 30, days: 182.5 });
  near(app.legGreeks(leg).rho, -0.0414, 1e-4, 'the same call under Black-76');
});

test('a premium with no time value implies no volatility, and one with a little still does', () => {
  // REVISION_2_LOGICA.md, L9: a put 1.6 hours from expiry and 26.77 in the
  // money is worth the same at 30% as at 297.7%. The solver handed back its
  // 30% starting point for it, or its 0.01% floor under American exercise.
  const t = 1.6 / 24 / 365;
  near(gbs('put', 100, 126.77, t, 0.04, 0, 0.3).price, gbs('put', 100, 126.77, t, 0.04, 0, 2.977).price, 1e-8,
    'the premium does not depend on the volatility');
  assert.ok(Number.isNaN(impliedVol('put', gbs('put', 100, 126.77, t, 0.04, 0, 2.977).price, 100, 126.77, t, 0.04, 0)),
    'European');
  const am = app.americanPrice('put', 100, 126.77, t, 0.04, 0, 2.977);
  assert.ok(Number.isNaN(impliedVol('put', am, 100, 126.77, t, 0.04, 0, 'american')), 'American');

  // The line is a millionth of the underlying: a call 22% out of the money,
  // its premium four millionths of the price, gives its 20% back; one 25% out,
  // at 0.7 of a millionth, gives none.
  const T = 30 / 365;
  near(impliedVol('call', gbs('call', 100, 122, T, 0.04, 0, 0.2).price, 100, 122, T, 0.04, 0), 0.2, 1e-6,
    'just above the line');
  assert.ok(Number.isNaN(impliedVol('call', gbs('call', 100, 125, T, 0.04, 0, 0.2).price, 100, 125, T, 0.04, 0)),
    'just below it');
});

test('implied volatility round trips', () => {
  for (const kind of ['call', 'put']) {
    for (const vol of [0.05, 0.15, 0.42, 0.9, 2.0]) {
      const px = gbs(kind, S, K, T, r, 0, vol).price;
      near(impliedVol(kind, px, S, K, T, r, 0), vol, 1e-5, `IV ${kind} ${vol}`);
    }
  }
});

test('implied volatility rejects prices below intrinsic value', () => {
  const intrinsic = gbs('call', 4500, 4200, T, r, 0, 1e-8).price;
  assert.ok(Number.isNaN(impliedVol('call', intrinsic - 10, 4500, 4200, T, r, 0)),
    'a price under intrinsic has no solution');
});

test('degenerate inputs return intrinsic value instead of NaN', () => {
  near(gbs('call', 4300, 4200, 0, r, 0, sigma).price, 100, 1e-9, 'expired ITM call');
  near(gbs('put', 4300, 4200, 0, r, 0, sigma).price, 0, 1e-9, 'expired OTM put');
  assert.ok(gbs('call', 4000, 4200, T, r, 0, 0).price < 1e-9, 'zero vol, out of the money');
  for (const v of [gbs('call', 0, 4200, T, r, 0, sigma), gbs('put', 4000, 0, T, r, 0, sigma)]) {
    assert.ok(Number.isFinite(v.price), 'zero price or strike stays finite');
  }
});

test('with no volatility an option keeps the theta and rho of its one cash flow', () => {
  // REVISION_2_LOGICA.md, L14 (T16): a 30-day call on a 100 future struck at
  // 95, at 4%, with no volatility, is worth its forward's intrinsic,
  // discounted. The price was right; it showed no theta and no rho.
  const g = gbs('call', 100, 95, 30 / 365, 0.04, 0, 0);
  near(g.price, 5 * Math.exp(-0.04 * 30 / 365), 1e-12, 'the price');
  near(g.theta, 0.000546, 5e-7, 'it accretes towards its payoff');
  near(g.theta, 0.04 * g.price / 365, 1e-15, 'r V a day');
  near(g.rho, -0.004096, 5e-7, 'and is discounted');
  near(g.rho, -(30 / 365) * g.price / 100, 1e-15, '-T V a point');
  // The closed form a hair above zero volatility gives the same greeks, in
  // both models, calls and puts, in and out of the money.
  for (const tracks of [false, true]) {
    const b = tracks ? 0.02 : 0;
    for (const [kind, k] of [['call', 90], ['call', 110], ['put', 90], ['put', 110]]) {
      const z = gbs(kind, 100, k, 0.5, 0.04, b, 0, tracks), lim = gbs(kind, 100, k, 0.5, 0.04, b, 1e-7, tracks);
      for (const key of ['price', 'delta', 'gamma', 'vega', 'theta', 'rho']) {
        near(z[key], lim[key], 1e-9, `${kind} ${k}, ${tracks ? 'cost of carry' : 'Black-76'}: ${key}`);
      }
    }
  }
  // Expired, there is nothing left to carry; with no rate and no carry,
  // nothing drifts. A plain 0 each time - -0 would read "-0.0000".
  const x = gbs('call', 4300, 4200, 0, r, 0, sigma);
  assert.strictEqual(x.theta, 0);
  assert.strictEqual(x.rho, 0);
  assert.strictEqual(gbs('call', 100, 95, 0.5, 0, 0, 0).theta, 0);
});

test('deep in and out of the money behave sensibly', () => {
  const deepItm = gbs('call', 8000, 4200, T, r, 0, sigma);
  near(deepItm.delta, Math.exp(-r * T), 1e-4, 'deep ITM call delta approaches the discount factor');
  const deepOtm = gbs('call', 1000, 4200, T, r, 0, sigma);
  assert.ok(deepOtm.price < 1e-6 && deepOtm.delta < 1e-6, 'deep OTM call is worthless');
});

test('realised volatility recovers a known volatility', () => {
  // Deterministic pseudo-random walk with a 25% annual volatility.
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const sd = 0.25 / Math.sqrt(252);

  const series = [];
  let px = 100;
  for (let i = 0; i < 1200; i++) {
    const open = px;
    px = px * Math.exp(gauss() * sd);
    series.push({ date: 'd' + i, o: open, c: px, h: Math.max(open, px) * 1.001, l: Math.min(open, px) * 0.999 });
  }

  const rv = realisedVol(series, 250);
  near(rv.close, 25, 3, 'close-to-close volatility');
  assert.ok(rv.ewma > 10 && rv.ewma < 45, 'EWMA in a sane range: ' + rv.ewma);
  assert.ok(rv.parkinson > 0, 'Parkinson estimator produced a value');
  assert.strictEqual(rv.days, 250, 'window respected');
  assert.strictEqual(realisedVol(series.slice(0, 3), 30), null, 'too little history returns null');
});

test('yield curve interpolation and continuous compounding', () => {
  const curve = {
    date: '2026-08-26',
    points: [{ years: 1 / 12, yield: 3.8 }, { years: 0.25, yield: 3.9 }, { years: 1, yield: 4.06 }]
  };
  // Half way between 3 months and 1 year, linearly.
  const mid = rateForTenor(curve, (0.25 + 1) / 2);
  near(mid.par, (3.9 + 4.06) / 2, 1e-9, 'linear interpolation');
  // Outside the curve it clamps rather than extrapolating.
  near(rateForTenor(curve, 0.001).par, 3.8, 1e-9, 'below the short end');
  near(rateForTenor(curve, 40).par, 4.06, 1e-9, 'beyond the long end');
  // The par curve is bond-equivalent, compounded semi-annually: (1 + y/2)^2 = e^r.
  const r = rateForTenor(curve, 0.25).continuous / 100;
  near(Math.exp(r), Math.pow(1 + 0.039 / 2, 2), 1e-12, 'semi-annual to continuous');
  assert.ok(r * 100 < 3.9, 'the continuous rate is below the par rate');
  // It used to be read as annual, ln(1 + y), which is lower by about y^2/4.
  const gap = r * 100 - Math.log(1.039) * 100;
  assert.ok(gap > 0.035 && gap < 0.038, `3.7bp above the annual reading at 3.9% (got ${gap})`);
});

test('convenience yield inverts the cost of carry', () => {
  // Contango means carry costs exceed the benefit of holding: yield below the rate.
  const contango = impliedConvenienceYield(4000, 4050, 90, 4);
  assert.ok(contango < 4, 'contango implies a low convenience yield: ' + contango);
  // Backwardation implies a high convenience yield.
  const backwardation = impliedConvenienceYield(4000, 3950, 90, 4);
  assert.ok(backwardation > 4, 'backwardation implies a high yield: ' + backwardation);
  // Round trip: F = S e^{(r-y)T} must reproduce the input futures price.
  const y = impliedConvenienceYield(4000, 4050, 90, 4) / 100;
  near(4000 * Math.exp((0.04 - y) * 90 / 365), 4050, 1e-6, 'round trip');
  assert.ok(Number.isNaN(impliedConvenienceYield(0, 4050, 90, 4)), 'invalid spot rejected');
});
