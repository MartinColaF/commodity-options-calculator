'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState } = require('./helpers/load-app');

const app = loadApp();
const { gbs, americanPrice, americanGreeks, americanCritical, impliedVol } = app;

/* ------------------------------------------------------------------
 * Independent reference: Cox-Ross-Rubinstein binomial tree.
 *
 * Written from the lattice definition rather than from anything app.js
 * does, so agreeing with it is real evidence that the Barone-Adesi-Whaley
 * approximation in the app is right. Generalised for cost of carry: the
 * risk-neutral probability uses e^(b*dt), and discounting uses r.
 * ---------------------------------------------------------------- */
function crr(kind, S, K, T, r, b, sigma, steps, american) {
  const dt = T / steps;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const p = (Math.exp(b * dt) - d) / (u - d);
  const disc = Math.exp(-r * dt);
  const sign = kind === 'call' ? 1 : -1;

  // Terminal payoffs.
  const v = new Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    const ST = S * Math.pow(u, 2 * i - steps);
    v[i] = Math.max(sign * (ST - K), 0);
  }
  // Roll back.
  for (let n = steps - 1; n >= 0; n--) {
    for (let i = 0; i <= n; i++) {
      v[i] = disc * (p * v[i + 1] + (1 - p) * v[i]);
      if (american) {
        const St = S * Math.pow(u, 2 * i - n);
        const ex = Math.max(sign * (St - K), 0);
        if (ex > v[i]) v[i] = ex;
      }
    }
  }
  return v[0];
}

/* A spread of contracts that covers both models and both sides of the money.
 * b = 0 is Black-76 on a futures price, b = r - q is spot with carry. */
const CASES = [
  { name: 'ATM futures call, 3m', kind: 'call', S: 100, K: 100, T: 0.25, r: 0.05, b: 0, sigma: 0.30 },
  { name: 'ATM futures put, 3m', kind: 'put', S: 100, K: 100, T: 0.25, r: 0.05, b: 0, sigma: 0.30 },
  { name: 'ITM futures call, 1y', kind: 'call', S: 120, K: 100, T: 1.0, r: 0.08, b: 0, sigma: 0.25 },
  { name: 'ITM futures put, 1y', kind: 'put', S: 80, K: 100, T: 1.0, r: 0.08, b: 0, sigma: 0.25 },
  { name: 'OTM futures call, 6m', kind: 'call', S: 90, K: 110, T: 0.5, r: 0.06, b: 0, sigma: 0.40 },
  { name: 'OTM futures put, 6m', kind: 'put', S: 110, K: 90, T: 0.5, r: 0.06, b: 0, sigma: 0.40 },
  { name: 'high-vol natgas-like put', kind: 'put', S: 3.0, K: 3.5, T: 0.5, r: 0.045, b: 0, sigma: 0.65 },
  { name: 'spot put, carry below rate', kind: 'put', S: 100, K: 100, T: 0.5, r: 0.06, b: 0.02, sigma: 0.30 },
  { name: 'spot call, carry below rate', kind: 'call', S: 100, K: 100, T: 0.5, r: 0.06, b: 0.02, sigma: 0.30 },
  { name: 'spot put, negative carry', kind: 'put', S: 100, K: 95, T: 0.75, r: 0.05, b: -0.03, sigma: 0.35 },
  { name: 'zero rate futures put', kind: 'put', S: 50, K: 55, T: 0.5, r: 0.0, b: 0, sigma: 0.30 }
];

test('American prices track a binomial tree within the approximation error', () => {
  for (const c of CASES) {
    const baw = americanPrice(c.kind, c.S, c.K, c.T, c.r, c.b, c.sigma);
    const tree = crr(c.kind, c.S, c.K, c.T, c.r, c.b, c.sigma, 2000, true);
    // BAW is a quadratic approximation, not an exact method. Half a percent of
    // the option's own value is the accuracy it is documented to deliver.
    const tol = Math.max(tree * 0.005, 1e-4);
    assert.ok(Math.abs(baw - tree) <= tol,
      `${c.name}: BAW ${baw.toFixed(6)} vs tree ${tree.toFixed(6)} (tol ${tol.toFixed(6)})`);
  }
});

test('the approximation error stays inside its documented envelope', () => {
  // BAW is a quadratic approximation and its error is worst for long-dated,
  // high-volatility options - exactly the corner listed commodity options
  // rarely reach. Measured across a 300-contract sweep (calls and puts, T from
  // one month to two years, strikes 0.8-1.25 of spot, vol 15-60%, rates 2-8%):
  //
  //   BAW      median 0.008% of the underlying, worst 0.58%
  //   European median 0.35%,                    worst 2.65%
  //
  // So pricing early exercise approximately beats ignoring it by ~4.5x at the
  // worst point. These are the four worst contracts in that sweep; the bound
  // is what the method delivers, not an aspiration.
  const S = 100;
  const worst = [
    { kind: 'put', K: 125, T: 2, r: 0.08, sigma: 0.6 },
    { kind: 'put', K: 110, T: 2, r: 0.08, sigma: 0.6 },
    { kind: 'call', K: 125, T: 2, r: 0.08, sigma: 0.6 },
    { kind: 'call', K: 110, T: 2, r: 0.08, sigma: 0.6 }
  ];
  for (const c of worst) {
    const baw = americanPrice(c.kind, S, c.K, c.T, c.r, 0, c.sigma);
    const tree = crr(c.kind, S, c.K, c.T, c.r, 0, c.sigma, 3000, true);
    const euro = gbs(c.kind, S, c.K, c.T, c.r, 0, c.sigma).price;
    const err = Math.abs(baw - tree);
    assert.ok(err <= 0.006 * S,
      `${c.kind} K=${c.K}: error ${err.toFixed(4)} exceeds 0.6% of the underlying`);
    assert.ok(err < Math.abs(euro - tree),
      `${c.kind} K=${c.K}: BAW should still beat ignoring early exercise`);
  }
});

test('the binomial reference itself reproduces the European closed form', () => {
  // Guards the guard: if the tree were wrong, the test above would be vacuous.
  for (const c of CASES) {
    const tree = crr(c.kind, c.S, c.K, c.T, c.r, c.b, c.sigma, 2000, false);
    const closed = gbs(c.kind, c.S, c.K, c.T, c.r, c.b, c.sigma).price;
    assert.ok(Math.abs(tree - closed) <= Math.max(closed * 0.002, 1e-4),
      `${c.name}: tree ${tree.toFixed(6)} vs closed form ${closed.toFixed(6)}`);
  }
});

test('American is never worth less than European or than intrinsic', () => {
  for (const c of CASES) {
    const baw = americanPrice(c.kind, c.S, c.K, c.T, c.r, c.b, c.sigma);
    const euro = gbs(c.kind, c.S, c.K, c.T, c.r, c.b, c.sigma).price;
    const intrinsic = Math.max(c.kind === 'call' ? c.S - c.K : c.K - c.S, 0);
    assert.ok(baw >= euro - 1e-9, `${c.name}: American ${baw} below European ${euro}`);
    assert.ok(baw >= intrinsic - 1e-9, `${c.name}: American ${baw} below intrinsic ${intrinsic}`);
  }
});

test('options on futures carry an early-exercise premium on both sides', () => {
  // The whole reason the feature exists: with b = 0 the futures margin account
  // earns nothing, so deep in-the-money calls AND puts are worth exercising.
  const deepCall = americanPrice('call', 150, 100, 1, 0.08, 0, 0.2)
    - gbs('call', 150, 100, 1, 0.08, 0, 0.2).price;
  const deepPut = americanPrice('put', 50, 100, 1, 0.08, 0, 0.2)
    - gbs('put', 50, 100, 1, 0.08, 0, 0.2).price;
  assert.ok(deepCall > 0.1, `expected a call premium, got ${deepCall}`);
  assert.ok(deepPut > 0.1, `expected a put premium, got ${deepPut}`);
});

test('a call with carry at or above the rate is never exercised early', () => {
  // b >= r means holding the underlying pays for the wait, so the American
  // call collapses onto the European one. b = r is the no-dividend spot case.
  for (const b of [0.05, 0.09]) {
    const am = americanPrice('call', 110, 100, 1, 0.05, b, 0.3);
    const eu = gbs('call', 110, 100, 1, 0.05, b, 0.3).price;
    assert.ok(Math.abs(am - eu) < 1e-9, `b=${b}: ${am} vs ${eu}`);
  }
});

test('the early-exercise premium grows with maturity', () => {
  let prev = -1;
  for (const T of [0.1, 0.5, 1, 2]) {
    const prem = americanPrice('put', 95, 100, T, 0.07, 0, 0.3)
      - gbs('put', 95, 100, T, 0.07, 0, 0.3).price;
    assert.ok(prem > prev, `premium at T=${T} (${prem}) did not exceed ${prev}`);
    prev = prem;
  }
});

test('the critical price sits beyond the strike and is exercised past it', () => {
  const callCrit = americanCritical('call', 100, 0.5, 0.06, 0, 0.3);
  const putCrit = americanCritical('put', 100, 0.5, 0.06, 0, 0.3);
  assert.ok(callCrit > 100, `call critical ${callCrit} should exceed the strike`);
  assert.ok(putCrit < 100 && putCrit > 0, `put critical ${putCrit} should sit below the strike`);
  // At or beyond the boundary the option is worth exactly its intrinsic value.
  assert.ok(Math.abs(americanPrice('call', callCrit * 1.05, 100, 0.5, 0.06, 0, 0.3)
    - (callCrit * 1.05 - 100)) < 1e-9);
  assert.ok(Math.abs(americanPrice('put', putCrit * 0.95, 100, 0.5, 0.06, 0, 0.3)
    - (100 - putCrit * 0.95)) < 1e-9);
});

test('American greeks match finite differences of the American price', () => {
  const c = { kind: 'put', S: 100, K: 105, T: 0.5, r: 0.06, b: 0, sigma: 0.3 };
  const g = americanGreeks(c.kind, c.S, c.K, c.T, c.r, c.b, c.sigma, false);
  const P = (S, T, r, sigma) => americanPrice(c.kind, S, c.K, T, r, c.b, sigma);

  const h = 0.01;
  const delta = (P(c.S + h, c.T, c.r, c.sigma) - P(c.S - h, c.T, c.r, c.sigma)) / (2 * h);
  assert.ok(Math.abs(g.delta - delta) < 1e-3, `delta ${g.delta} vs ${delta}`);
  assert.ok(g.delta < 0 && g.delta > -1, `put delta out of range: ${g.delta}`);
  assert.ok(g.gamma > 0, `gamma should be positive, got ${g.gamma}`);
  assert.ok(g.vega > 0, `a long option is vega positive, got ${g.vega}`);
  assert.ok(g.theta < 0, `a long option decays, got ${g.theta}`);
});

test('Black-76 rho ignores the carry bump, cost-of-carry rho does not', () => {
  const args = ['call', 100, 100, 1, 0.05, 0, 0.3];
  const pinned = americanGreeks(...args, false);
  const tracking = americanGreeks(...args, true);
  // Same price either way - the flag only changes how the rate is bumped.
  assert.ok(Math.abs(pinned.price - tracking.price) < 1e-12);
  assert.ok(Math.abs(pinned.rho - tracking.rho) > 1e-6,
    'the two rho conventions should not coincide for a futures call');
  // Under Black-76 the rate only discounts, so a call loses value as r rises.
  assert.ok(pinned.rho < 0, `expected negative Black-76 rho, got ${pinned.rho}`);
});

test('implied volatility round-trips through the American pricer', () => {
  for (const c of CASES.slice(0, 6)) {
    const px = americanPrice(c.kind, c.S, c.K, c.T, c.r, c.b, c.sigma);
    const iv = impliedVol(c.kind, px, c.S, c.K, c.T, c.r, c.b, 'american');
    assert.ok(Math.abs(iv - c.sigma) < 1e-4, `${c.name}: recovered ${iv}, wanted ${c.sigma}`);
  }
});

test('inverting an American premium with the European model overstates vol', () => {
  // This is the bug the style-aware solver prevents: the same premium buys
  // less volatility once early exercise is priced in.
  const c = { kind: 'put', S: 95, K: 100, T: 1, r: 0.08, b: 0, sigma: 0.35 };
  const px = americanPrice(c.kind, c.S, c.K, c.T, c.r, c.b, c.sigma);
  const wrong = impliedVol(c.kind, px, c.S, c.K, c.T, c.r, c.b, 'european');
  const right = impliedVol(c.kind, px, c.S, c.K, c.T, c.r, c.b, 'american');
  assert.ok(Math.abs(right - c.sigma) < 1e-4);
  assert.ok(wrong > right + 1e-3, `European inversion ${wrong} should exceed ${right}`);
});

test('degenerate inputs fall back to intrinsic instead of NaN', () => {
  const bad = [
    ['call', 100, 100, 0, 0.05, 0, 0.3],
    ['put', 100, 100, 0.5, 0.05, 0, 0],
    ['call', 0, 100, 0.5, 0.05, 0, 0.3],
    ['put', 100, 0, 0.5, 0.05, 0, 0.3]
  ];
  for (const args of bad) {
    const px = americanPrice(...args);
    assert.ok(isFinite(px) && px >= 0, `americanPrice(${args}) returned ${px}`);
    const g = americanGreeks(...args, false);
    for (const k of ['price', 'delta', 'gamma', 'vega', 'theta', 'rho']) {
      assert.ok(isFinite(g[k]), `greek ${k} was ${g[k]} for ${args}`);
    }
  }
});

test('the strategy engine prices legs with the selected exercise style', () => {
  const mk = style => {
    const s = resetState(app, { style, S: 100, vol: 30, rate: 8, days: 365 });
    s.legs = [app.newLeg({ kind: 'put', side: 1, strike: 110, days: 365 })];
    return app.legGreeks(s.legs[0]).price;
  };
  const euro = mk('european');
  const amer = mk('american');
  assert.ok(amer > euro, `American leg ${amer} should beat European ${euro}`);
  assert.ok(Math.abs(amer - americanPrice('put', 100, 110, 1, 0.08, 0, 0.3)) < 1e-9);
});

test('a shared scenario without an exercise style restores as European', () => {
  // Links and saved states predate the setting; repricing them silently would
  // change numbers someone already wrote down.
  resetState(app, { style: 'american' });
  app.state.legs = [];
  assert.ok(app.restore({ S: 100, model: 'b76' }));
  assert.strictEqual(app.state.style, 'european');
  assert.ok(app.restore({ S: 100, style: 'american' }));
  assert.strictEqual(app.state.style, 'american');
});
