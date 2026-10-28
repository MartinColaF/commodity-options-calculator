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

test('with no volatility an American option is exercised on its best date', () => {
  // The forward is known, so the holder picks when: now, at expiry, or the one
  // date in between at which the payoff's discounted value can turn. It used to
  // be worth its intrinsic value always, as if exercised now, and jumped to the
  // value of holding it at the smallest volatility above zero.
  const best = (kind, S, K, T, r, b) => {
    let v = 0;
    for (let i = 0; i <= 100000; i++) {
      const t = T * i / 100000, F = S * Math.exp(b * t);
      v = Math.max(v, Math.exp(-r * t) * Math.max(kind === 'call' ? F - K : K - F, 0));
    }
    return v;
  };
  const cases = [
    ['call', 100, 95, 0.5, 0.04, 0, 'a call on a future at a positive rate: exercised now'],
    ['call', 100, 95, 0.5, -0.01, 0, 'at a negative rate: held'],
    ['put', 95, 100, 0.5, -0.01, 0, 'a put at a negative rate: held'],
    ['call', 4500, 4000, 0.5, 0.04, 0.05, 'carry above the rate: held'],
    ['put', 3500, 4000, 0.5, 0.04, 0.05, 'a put with carry above the rate: exercised now'],
    ['call', 19000, 4000, 2, 0.05, 0.04, 'deep in the money, carry under the rate: in between']
  ];
  for (const [kind, S, K, T, r, b, label] of cases) {
    const v = americanPrice(kind, S, K, T, r, b, 0);
    assert.ok(Math.abs(v - best(kind, S, K, T, r, b)) < 1e-9 * S, `${label}: ${v}`);
  }
  const held = americanPrice('call', 4500, 4000, 0.5, 0.04, 0.05, 0);
  assert.ok(Math.abs(held - 601.761651) < 1e-6, 'it read 500');
  assert.ok(Math.abs(held - americanPrice('call', 4500, 4000, 0.5, 0.04, 0.05, 1e-6)) < 1e-6,
    'and meets the pricer just above zero volatility');

  // Its greeks are those of the date it is exercised on: the price's own
  // derivatives, in both carry conventions.
  for (const [kind, S, K, T, r, b, label] of cases) {
    for (const tracks of [false, true]) {
      const g = americanGreeks(kind, S, K, T, r, b, 0, tracks);
      const P = (s, t, rr, bb) => americanPrice(kind, s, K, t, rr, bb, 0);
      const h = S * 1e-6, hR = 1e-7;
      const fd = {
        delta: (P(S + h, T, r, b) - P(S - h, T, r, b)) / (2 * h),
        theta: (P(S, T - 1e-6, r, b) - P(S, T + 1e-6, r, b)) / 2e-6 / 365,
        rho: (P(S, T, r + hR, tracks ? b + hR : b) - P(S, T, r - hR, tracks ? b - hR : b)) / (2 * hR) / 100
      };
      for (const k of Object.keys(fd)) {
        assert.ok(Math.abs(g[k] - fd[k]) < 1e-6, `${label}, ${tracks ? 'cost of carry' : 'carry fixed'}: ${k} ${g[k]} vs ${fd[k]}`);
      }
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

/* ---- negative rates ----
 * Early exercise is worth nothing when the European price beats exercising at
 * every price: a call whose carry is at least the rate and at least zero, a
 * put whose rate and carry are both at most zero. Put-call symmetry maps one
 * rule onto the other. Below zero, BAW is only right where those rules leave
 * it some early-exercise value, and even its boundary can land on the wrong
 * side of the price: a put on a 100 future at r = -1% and 40% vol came out at
 * its intrinsic 20.00, below its European 22.20. */

const intrinsicOf = (kind, S, K) => Math.max(kind === 'call' ? S - K : K - S, 0);
const treePremium = (...c) => crr(...c, 400, true) - crr(...c, 400, false);

test('a put with its rate and carry at or below zero is worth the European price, as the tree says', () => {
  for (const r of [-0.01, -0.005, 0]) {
    for (const b of [0, r, -0.02]) {
      for (const [K, T, sigma] of [[120, 0.25, 0.2], [120, 0.25, 0.4], [100, 1, 0.3], [80, 2, 0.4]]) {
        const c = ['put', 100, K, T, r, b, sigma];
        const label = `put K=${K} T=${T} r=${r} b=${b} vol=${sigma}`;
        assert.strictEqual(americanPrice(...c), Math.max(gbs(...c).price, intrinsicOf('put', 100, K)), label);
        assert.ok(treePremium(...c) < 1e-9, `${label}: the tree finds early-exercise value`);
      }
    }
  }
  // REVISION_2_LOGICA.md, L5, and the worst case measured with it.
  assert.ok(Math.abs(americanPrice('put', 100, 120, 0.25, -0.01, 0, 0.2) - 20.1978) < 1e-4, 'was 20.2217');
  assert.ok(Math.abs(americanPrice('put', 100, 120, 0.25, -0.01, 0, 0.4) - 22.2027) < 1e-4, 'was 20.0000');
});

test('at negative rates a put with positive carry keeps its early-exercise value', () => {
  // The carry lifts the underlying while the put waits, so exercising can pay
  // even though the strike earns nothing: the tree puts 0.84 on this one.
  const c = ['put', 100, 120, 1, -0.01, 0.03, 0.2];
  const euro = gbs(...c).price;
  const tree = 2 * crr(...c, 800, true) - crr(...c, 400, true);
  assert.ok(tree - euro > 0.8, `the tree's premium: ${tree - euro}`);
  assert.ok(americanPrice(...c) > euro + 0.5, 'not collapsed onto the European price');
  assert.ok(Math.abs(americanPrice(...c) - tree) < 0.2, 'BAW, within its envelope');
});

test('at negative rates a call is European only once its carry is at least zero', () => {
  for (const [r, b] of [[-0.01, 0], [-0.01, 0.03], [0, 0], [-0.005, 0.01]]) {
    const c = ['call', 120, 100, 1, r, b, 0.3];
    assert.strictEqual(americanPrice(...c), Math.max(gbs(...c).price, 20), `r=${r} b=${b}`);
    assert.ok(treePremium(...c) < 1e-9, `r=${r} b=${b}: the tree finds early-exercise value`);
  }
  // A carry between the rate and zero clears b >= r, which was the whole test,
  // and the call was priced European: 0.82 short of the tree on this one.
  const c = ['call', 100, 80, 2, -0.02, -0.02, 0.2];
  const euro = gbs(...c).price;
  const tree = 2 * crr(...c, 800, true) - crr(...c, 400, true);
  assert.ok(tree - euro > 0.8, `the tree's premium: ${tree - euro}`);
  assert.ok(Math.abs(americanPrice(...c) - tree) < 0.2, 'BAW, within its envelope');
});

test('at negative rates no American price falls below the European one or below exercising', () => {
  // Past a misplaced boundary BAW returned the intrinsic value alone: a put
  // the European formula values at 103.03 came out at 100.
  for (const kind of ['call', 'put']) {
    for (const r of [-0.02, -0.005]) {
      for (const b of [-0.02, 0.01, 0.03]) {
        for (const [S, K] of [[50, 150], [100, 100], [200, 60]]) {
          for (const [T, sigma] of [[0.25, 0.4], [2, 0.2]]) {
            const c = [kind, S, K, T, r, b, sigma];
            const am = americanPrice(...c);
            const label = `${kind} S=${S} K=${K} T=${T} r=${r} b=${b} vol=${sigma}`;
            assert.ok(am >= gbs(...c).price - 1e-9, `${label}: ${am} below European ${gbs(...c).price}`);
            assert.ok(am >= intrinsicOf(kind, S, K) - 1e-9, `${label}: ${am} below intrinsic`);
          }
        }
      }
    }
  }
});

test('where BAW finds no exercise boundary, it adds no premium', () => {
  // At negative rates a put with carry above zero, or a call with carry below
  // it, can leave BAW's boundary equation without a root: no price matches
  // exercising with holding. Newton wandered and stopped anywhere - a third of
  // such contracts got a boundary that matched nothing - and now and then on
  // one whose premium does not exist.
  for (const [c, before] of [
    [['put', 100, 105, 1, -0.01, 0.015, 0.45], 24.5986],
    [['put', 110, 100, 10, -0.05, 0.02, 3], 6066.65]   // a put on a 100 strike pays at most 164.87 here
  ]) {
    const label = JSON.stringify(c);
    assert.ok(Number.isNaN(americanCritical(c[0], c[2], c[3], c[4], c[5], c[6])), `${label}: no boundary`);
    assert.strictEqual(americanPrice(...c), Math.max(gbs(...c).price, intrinsicOf(c[0], c[1], c[2])),
      `${label}: the European price, floored at intrinsic`);
    const tree = 2 * crr(...c, 800, true) - crr(...c, 400, true);
    assert.ok(Math.abs(americanPrice(...c) - tree) < 0.06, `${label}: ${americanPrice(...c)} against the tree's ${tree}; it read ${before}`);
  }
  // Nor does the price jump as the tenor moves: the first one read 24.60 at a
  // year, and 20.36 and 20.40 a day either side.
  let prev = null;
  for (let i = 0; i <= 400; i++) {
    const v = americanPrice('put', 100, 105, (364 + 2 * i / 400) / 365, -0.01, 0.015, 0.45);
    if (prev !== null) assert.ok(Math.abs(v - prev) < 1e-3, `a step of ${v - prev} at ${364 + 2 * i / 400} days`);
    prev = v;
  }
});

test('American theta is the price\'s rate of change, as the European one is', () => {
  // It came from a step of a day either side, which read a short option's
  // decay off a curve bending under it, and gave a decay to an option already
  // worth exercising wherever the step crossed the boundary.
  const rate = c => {
    const P = t => americanPrice(c[0], c[1], c[2], t, c[4], c[5], c[6]);
    const e = 1e-6 / 365;
    return (P(c[3] - e) - P(c[3] + e)) / (2 * e) / 365;
  };
  // A two-day put at the money on a future read -0.3819 a day for -0.3689.
  let c = ['put', 100, 100, 2 / 365, 0.04, 0, 0.5];
  let theta = americanGreeks(...c, false).theta;
  assert.ok(Math.abs(theta - rate(c)) < 1e-6 * Math.abs(rate(c)), `two-day put: ${theta} vs ${rate(c)}`);
  // A call with carry above the rate is never exercised early, so its theta is
  // gbs()'s: -0.1877, where it read -0.1903.
  c = ['call', 100, 100, 3 / 365, 0.04, 0.05, 0.3];
  theta = americanGreeks(...c, true).theta;
  assert.ok(Math.abs(theta - gbs(...c, true).theta) < 1e-6 * Math.abs(theta), `three-day call: ${theta} vs ${gbs(...c, true).theta}`);
  // Worth exercising now, a put is its intrinsic value, which expiry does not
  // move: no decay, where it read -0.0000788 a day.
  c = ['put', 100, 115, 10 / 365, 0.05, 0, 0.3];
  assert.strictEqual(americanPrice(...c), 15);
  assert.strictEqual(americanGreeks(...c, false).theta, 0);
});
