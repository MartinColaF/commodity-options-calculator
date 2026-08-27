'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load-app.js');

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

  for (const b of [0, r - q]) {
    for (const kind of ['call', 'put']) {
      const label = `${kind} b=${b.toFixed(3)}`;
      const price = x => gbs(kind, x, K, T, r, b, sigma).price;
      const g = gbs(kind, S, K, T, r, b, sigma);

      near(central(price, S, 0.01), g.delta, 1e-6, `delta ${label}`);

      const gammaFd = (price(S + 0.5) - 2 * price(S) + price(S - 0.5)) / 0.25;
      near(gammaFd, g.gamma, 1e-7, `gamma ${label}`);

      const vegaFd = central(v => gbs(kind, S, K, T, r, b, v).price, sigma, 1e-4) / 100;
      near(vegaFd, g.vega, 1e-5, `vega ${label}`);

      const thetaFd = -central(t => gbs(kind, S, K, t, r, b, sigma).price, T, 1e-6) / 365;
      near(thetaFd, g.theta, 1e-5, `theta ${label}`);

      // Under BSM the rate also moves the carry term; under Black-76 it does not.
      const rhoFd = b === 0
        ? central(rr => gbs(kind, S, K, T, rr, 0, sigma).price, r, 1e-6) / 100
        : central(rr => gbs(kind, S, K, T, rr, rr - q, sigma).price, r, 1e-6) / 100;
      near(rhoFd, g.rho, 1e-5, `rho ${label}`);
    }
  }
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
  // Annual to continuously compounded.
  near(rateForTenor(curve, 0.25).continuous, Math.log(1 + 0.039) * 100, 1e-9, 'continuous conversion');
  assert.ok(rateForTenor(curve, 0.25).continuous < rateForTenor(curve, 0.25).par,
    'the continuous rate is below the par rate');
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
