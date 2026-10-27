'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState, wired } = require('./helpers/load-app.js');

const app = loadApp();
const { state, newLeg, normCdf, forwardDelta, skewVol, legVolPct,
  snapshot, restore } = app;

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

/* app.js runs inside a VM, so the arrays it returns carry that realm's
 * Array.prototype and deepStrictEqual - which compares prototypes - rejects
 * them against a literal. Copy into a host array before comparing. */
const sameList = (actual, expected, msg) =>
  assert.deepStrictEqual(Array.from(actual), expected, msg);

/* Invert the skew curve: find the strike whose forward delta is d, at the
 * volatility the curve itself assigns to that strike. Bisection on strike,
 * because the relationship runs through the iterative solve. */
function strikeForDelta(d, S, T, b, atm, rr, bf) {
  let lo = S * 0.01, hi = S * 100;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = skewVol(S, mid, T, b, atm, rr, bf);
    if (forwardDelta(S, mid, T, b, v) > d) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

test('forward delta is N(d1) and spans the unit interval', () => {
  const S = 100, T = 0.5, b = 0, sigma = 0.3;
  const vt = sigma * Math.sqrt(T);
  const d1 = k => (Math.log(S / k) + (b + sigma * sigma / 2) * T) / vt;
  for (const K of [70, 100, 140]) {
    near(forwardDelta(S, K, T, b, sigma), normCdf(d1(K)), 1e-12, `delta at K=${K}`);
  }
  assert.ok(forwardDelta(S, 1e6, T, b, sigma) < 0.001, 'far out of the money');
  assert.ok(forwardDelta(S, 1e-6, T, b, sigma) > 0.999, 'far in the money');
});

test('a flat surface returns the at-the-money volatility everywhere', () => {
  for (const K of [60, 80, 100, 130, 180]) {
    near(skewVol(100, K, 0.5, 0, 0.30, 0, 0), 0.30, 1e-12, `K=${K}`);
  }
});

test('the curve reproduces the 25-delta quotes it was built from', () => {
  // This is the whole contract of the parameterisation: feed it a risk
  // reversal and a butterfly, and the 25-delta call and put must come back
  // with exactly the volatilities those quotes define.
  const S = 100, T = 0.5, b = 0, atm = 0.30, rr = -0.04, bf = 0.01;

  const kCall = strikeForDelta(0.25, S, T, b, atm, rr, bf);
  const kPut = strikeForDelta(0.75, S, T, b, atm, rr, bf);

  const vCall = skewVol(S, kCall, T, b, atm, rr, bf);
  const vPut = skewVol(S, kPut, T, b, atm, rr, bf);

  near(vCall - vPut, rr, 1e-6, 'risk reversal is the 25d call minus the 25d put');
  near((vCall + vPut) / 2 - atm, bf, 1e-6, 'butterfly is the wings over the middle');
  near(vCall, atm + bf + rr / 2, 1e-6, '25d call volatility');
  near(vPut, atm + bf - rr / 2, 1e-6, '25d put volatility');
  // A negative risk reversal is the usual commodity-put skew: puts bid.
  assert.ok(vPut > vCall, 'a negative risk reversal should bid the put');
});

test('a positive butterfly lifts both wings above the middle', () => {
  const v = K => skewVol(100, K, 0.5, 0, 0.30, 0, 0.02);
  const atTheMoney = v(100);
  assert.ok(v(70) > atTheMoney, 'low strike above the middle');
  assert.ok(v(145) > atTheMoney, 'high strike above the middle');
  near(atTheMoney, 0.30, 2e-3, 'the middle stays near the quoted level');
});

test('an extreme risk reversal clamps instead of going negative', () => {
  // A wide enough skew drives one wing through zero; the pricer must never
  // see a non-positive volatility.
  for (const K of [20, 50, 100, 200, 500]) {
    const v = skewVol(100, K, 1, 0, 0.20, 0.90, -0.30);
    assert.ok(v > 0 && isFinite(v), `K=${K} produced ${v}`);
  }
});

/* ---- reading the curve at a strike ----
 * A strike's volatility is where the curve and the delta agree: the delta d
 * whose volatility on the curve gives d back through forwardDelta(). A
 * fixed-point iteration used to look for it, and on steep wings it could stop
 * on a volatility the curve does not give at that strike's delta. */

/* How far v is from what the curve gives at v's own delta: zero when v is read
 * off the curve correctly. */
const gap = (K, T, atm, rr, bf, v) => Math.abs(app.skewCurve(forwardDelta(100, K, T, 0, v), atm, rr, bf) - v);

test('a strike is read where the curve and the delta agree', () => {
  // REVISION_2_LOGICA.md, L10: of 40,000 surfaces the fixed point stopped over
  // a tenth of a point off in 180. These four, every wing under the
  // at-the-money level, it left 0.19 to 0.75 of a point off - at 32.98%, for
  // the first, a volatility 1.5 points from the curve's at its own delta.
  for (const [K, T, atm, rr, bf] of [[164.3, 1.4246, 0.158, 0.042, 0.077], [168.66, 1.7734, 0.2, -0.137, 0.099],
    [130.87, 1.2623, 0.207, 0.191, 0.095], [187.68, 1.9219, 0.205, -0.125, 0.098]]) {
    const v = skewVol(100, K, T, 0, atm, rr, bf);
    assert.ok(gap(K, T, atm, rr, bf, v) < 1e-12, `K=${K}: ${v} is not on the curve`);
    assert.strictEqual(app.skewProblem(100, K, T, 0, atm, rr, bf), '');
  }
  near(skewVol(100, 164.3, 1.4246, 0, 0.158, 0.042, 0.077), 0.337324, 1e-6, 'the first, where it was 0.329806');

  // Every realistic surface: one volatility per strike, read exactly.
  for (const atm of [0.15, 0.3, 0.6]) {
    for (const rr of [-0.08, 0, 0.05]) {
      for (const bf of [0, 0.01, 0.03]) {
        for (const K of [50, 80, 100, 125, 200]) {
          for (const T of [7 / 365, 0.5, 2]) {
            const v = skewVol(100, K, T, 0, atm, rr, bf);
            const label = `atm ${atm} rr ${rr} bf ${bf} K ${K} T ${T}`;
            assert.ok(gap(K, T, atm, rr, bf, v) < 1e-12, label);
            assert.strictEqual(app.skewProblem(100, K, T, 0, atm, rr, bf), '', label);
          }
        }
      }
    }
  }
});

test('a curve steeper than its at-the-money level says where it cannot be read', () => {
  // A risk reversal of 30 points against an at-the-money 20 takes the put wing
  // below zero: those strikes price at the floor.
  for (const K of [60, 80]) assert.strictEqual(app.skewProblem(100, K, 1, 0, 0.2, 0.3, 0), 'floor', `K=${K}`);
  near(skewVol(100, 80, 1, 0, 0.2, 0.3, 0), 1e-4, 1e-12, 'the floor itself');
  for (const K of [100, 120]) assert.strictEqual(app.skewProblem(100, K, 1, 0, 0.2, 0.3, 0), '', `K=${K}`);
  // This one, from the same 40,000, fits its strike at three volatilities.
  assert.strictEqual(app.skewProblem(100, 102.653, 1.6444, 0, 0.1272, -0.1517, 0.0006), 'several');
});

test('the skew note names the strikes the curve cannot read, and only those', () => {
  const { app: page, el } = wired();
  Object.assign(page.state, { S: 100, vol: 20, rate: 4, days: 365 });
  page.state.skew = { on: true, rr: 30, bf: 0 };
  page.state.legs = [
    page.newLeg({ kind: 'put', strike: 60, days: 365 }),
    page.newLeg({ kind: 'put', strike: 80, days: 365 }),
    page.newLeg({ kind: 'call', strike: 80, days: 365 }),
    page.newLeg({ kind: 'put', strike: 70, days: 365, vol: 25 }),
    page.newLeg({ kind: 'call', strike: 100, days: 365 })
  ];
  page.renderInputs();
  assert.strictEqual(el('skewWarning').textContent,
    'This curve is steeper than its at-the-money level allows. At the 60 and 80 strikes it goes below zero, ' +
    'so the leg prices at the 0.01% floor. Narrow the risk reversal or the butterfly, or type a Vol for those legs.',
    'each strike once, and not the leg with a Vol of its own');

  Object.assign(page.state, { vol: 12.72 });
  page.state.skew = { on: true, rr: -15.17, bf: 0.06 };
  page.state.legs = [page.newLeg({ kind: 'call', strike: 102.653, days: 1.6444 * 365 })];
  page.renderInputs();
  assert.match(el('skewWarning').textContent, /At the 102\.65 strike more than one volatility fits it\./);

  page.state.skew = { on: true, rr: -5, bf: 1 };
  page.renderInputs();
  assert.strictEqual(el('skewWarning').textContent, '', 'a realistic surface reads everywhere');

  Object.assign(page.state, { vol: 20 });
  page.state.skew = { on: true, rr: 30, bf: 0 };
  page.state.legs = [page.newLeg({ kind: 'put', strike: 80, days: 365 })];
  page.renderInputs();
  assert.notStrictEqual(el('skewWarning').textContent, '');
  page.state.skew.on = false;
  page.renderInputs();
  assert.strictEqual(el('skewWarning').textContent, '', 'with the skew off there is no curve to read');
});

test('legs take the curve only when the skew is on and their vol is blank', () => {
  resetState(app, { S: 100, vol: 30, rate: 5, days: 180 });
  const blank = newLeg({ kind: 'put', strike: 80, days: 180 });
  const explicit = newLeg({ kind: 'put', strike: 80, days: 180, vol: 42 });

  near(legVolPct(blank), 30, 1e-9, 'skew off: the global number');
  near(legVolPct(explicit), 42, 1e-9, 'skew off: the override');

  state.skew = { on: true, rr: -6, bf: 1 };
  assert.ok(legVolPct(blank) > 30,
    `a low strike under a put skew should price above 30, got ${legVolPct(blank)}`);
  near(legVolPct(explicit), 42, 1e-9, 'skew on: the override still wins');
});

test('the skew is read at the leg own month, not the panel price', () => {
  resetState(app, { S: 100, vol: 30, rate: 5, days: 180, skew: { on: true, rr: -8, bf: 1 } });
  const shared = newLeg({ kind: 'call', strike: 110, days: 180 });
  const ownMonth = newLeg({ kind: 'call', strike: 110, days: 180, under: 115 });
  assert.ok(Math.abs(legVolPct(shared) - legVolPct(ownMonth)) > 1e-6,
    'a leg on a different month sits at a different point on the curve');
});

test('a put skew makes a put spread cost more than a flat surface', () => {
  // Buying the higher strike and selling the lower one: the skew bids the leg
  // being sold less than the one being bought, net of the curve shape.
  const cost = skew => {
    resetState(app, { S: 100, vol: 30, rate: 5, days: 180, skew });
    state.legs = [
      newLeg({ kind: 'put', side: 1, strike: 100, days: 180 }),
      newLeg({ kind: 'put', side: -1, strike: 80, days: 180 })
    ];
    return app.netCost();
  };
  const flat = cost({ on: false, rr: 0, bf: 0 });
  const skewed = cost({ on: true, rr: -8, bf: 1.5 });
  assert.ok(Math.abs(skewed - flat) > 1e-6, 'the skew should move the spread');
  assert.ok(skewed < flat,
    `a bid put wing raises the short leg's value, cheapening the debit: ${skewed} vs ${flat}`);
});

test('the scenario grid is priced, shaped and ordered as advertised', () => {
  resetState(app, {
    S: 100, vol: 30, rate: 5, days: 120,
    scenario: { volShift: 5, pricePct: 20 }
  });
  state.legs = [newLeg({ kind: 'call', side: 1, strike: 100, days: 120 })];

  const s = app.scenarioTable();
  assert.strictEqual(s.horizon, 120, 'horizon is the nearest expiry');
  assert.strictEqual(s.panels.length, 3, 'one panel per volatility shift');
  sameList(Array.from(s.panels).map(p => p.volShift), [-5, 0, 5], 'volatility shifts');
  sameList(s.days, [0, 30, 60, 90, 120], 'date columns');

  for (const panel of s.panels) {
    assert.strictEqual(panel.rows.length, 7, 'seven price rows');
    assert.strictEqual(panel.rows[0].cells.length, 5, 'five date columns');
    for (const row of panel.rows) {
      for (const c of row.cells) assert.ok(isFinite(c), `cell was ${c}`);
    }
  }
  // Rows run from the lowest price up, and carry their percentage move.
  near(s.panels[0].rows[0].pct, -0.20, 1e-9, 'first row is the bottom of the range');
  near(s.panels[0].rows[6].pct, 0.20, 1e-9, 'last row is the top');
  near(s.panels[0].rows[3].price, 100, 1e-9, 'the middle row is the current price');
});

test('the scenario grid prices volatility and time the way a long call feels them', () => {
  resetState(app, {
    S: 100, vol: 30, rate: 5, days: 120,
    scenario: { volShift: 5, pricePct: 20 }
  });
  state.legs = [newLeg({ kind: 'call', side: 1, strike: 100, days: 120 })];
  const s = app.scenarioTable();
  const [down, flat, up] = s.panels;
  const mid = 3; // the at-the-money row

  // A long call is vega positive: more volatility is worth more, at any date
  // before expiry.
  for (let c = 0; c < s.days.length - 1; c++) {
    assert.ok(up.panels === undefined);
    assert.ok(up.rows[mid].cells[c] > flat.rows[mid].cells[c],
      `higher vol should help at column ${c}`);
    assert.ok(down.rows[mid].cells[c] < flat.rows[mid].cells[c],
      `lower vol should hurt at column ${c}`);
  }
  // Held at the strike, it decays towards losing the whole premium.
  const row = flat.rows[mid].cells;
  for (let c = 1; c < row.length; c++) {
    assert.ok(row[c] < row[c - 1], `time decay should be monotone at column ${c}`);
  }
  // At expiry, at the strike, the loss is the premium paid, with the interest
  // it carried for the 120 days at 5%.
  near(row[row.length - 1], -app.netCost() * Math.exp(0.05 * 120 / 365), 1e-6, 'expires worthless at the strike');
});

test('a zero volatility shift collapses the grid to one panel', () => {
  resetState(app, {
    S: 100, vol: 30, rate: 5, days: 60,
    scenario: { volShift: 0, pricePct: 15 }
  });
  state.legs = [newLeg({ kind: 'put', side: -1, strike: 95, days: 60 })];
  const s = app.scenarioTable();
  assert.strictEqual(s.panels.length, 1, 'no duplicate panels');
  assert.strictEqual(s.panels[0].volShift, 0);
});

test('a zero-day horizon does not produce repeated columns', () => {
  resetState(app, { S: 100, vol: 30, rate: 5, days: 0 });
  state.legs = [newLeg({ kind: 'call', side: 1, strike: 100, days: 0 })];
  const s = app.scenarioTable();
  sameList(s.days, [0], 'five identical columns collapse to one');
});

test('a negative volatility shift cannot drive a leg below zero volatility', () => {
  resetState(app, {
    S: 100, vol: 3, rate: 5, days: 90,
    scenario: { volShift: 40, pricePct: 20 }
  });
  state.legs = [newLeg({ kind: 'call', side: 1, strike: 100, days: 90 })];
  const s = app.scenarioTable();
  for (const panel of s.panels) {
    for (const row of panel.rows) {
      for (const c of row.cells) assert.ok(isFinite(c), `cell was ${c}`);
    }
  }
});

test('the skew and scenario settings survive a save and restore', () => {
  resetState(app, { S: 100 });
  state.skew = { on: true, rr: -7.5, bf: 1.25 };
  state.scenario = { volShift: 8, pricePct: 35 };
  const saved = JSON.parse(JSON.stringify(snapshot()));

  resetState(app, { S: 100 });
  assert.strictEqual(state.skew.on, false, 'reset really cleared it');
  restore(saved);
  assert.strictEqual(state.skew.on, true);
  near(state.skew.rr, -7.5, 1e-9, 'risk reversal');
  near(state.skew.bf, 1.25, 1e-9, 'butterfly');
  near(state.scenario.volShift, 8, 1e-9, 'volatility shift');
  near(state.scenario.pricePct, 35, 1e-9, 'price range');
});

test('a scenario saved before the skew existed restores with it off', () => {
  resetState(app, { S: 100 });
  state.skew = { on: true, rr: -5, bf: 2 };
  restore({ S: 100, model: 'b76' });
  assert.strictEqual(state.skew.on, false,
    'an old link must not switch on a surface it never had');
});
