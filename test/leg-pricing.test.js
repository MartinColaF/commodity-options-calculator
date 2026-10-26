'use strict';

/* Every path that prices a leg - its value, its greeks, the P&L sweep and the
 * implied-volatility solver - goes through legPricingInputs(). They used to
 * assemble their inputs by hand, and the IV button drifted: it solved against
 * the panel price instead of the leg's own delivery month. These tests pin the
 * paths together so they cannot drift apart again. */

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState } = require('./helpers/load-app.js');

const app = loadApp();
const { state, newLeg, legGreeks, legValue, legVolPct, legPricingInputs,
  legImpliedVol, pnlEvaluator } = app;

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

/* Every combination that changes how a leg is priced: exercise style, whether
 * the leg trades on its own delivery month, and whether the skew sets its
 * volatility. */
function* matrix() {
  for (const style of ['european', 'american']) {
    for (const under of [null, 110]) {
      for (const skewOn of [false, true]) {
        yield { style, under, skewOn, label: `${style}, under=${under}, skew ${skewOn ? 'on' : 'off'}` };
      }
    }
  }
}

function setup(c) {
  resetState(app, {
    S: 100, vol: 30, rate: 5, days: 180, style: c.style,
    skew: { on: c.skewOn, rr: -6, bf: 1.5 }
  });
}

test('the IV button solves against the leg\'s own month, not the panel price', () => {
  // The case that was wrong: a call on a month trading at 110 while the panel
  // shows 100. Its own theoretical premium must give back its own 30%, where
  // solving against the panel price returned 52.74%.
  resetState(app, { S: 100, vol: 30, rate: 5, days: 180, style: 'european' });
  const leg = newLeg({ kind: 'call', side: 1, strike: 100, days: 180, under: 110 });
  state.legs = [leg];
  const iv = legImpliedVol(leg, legGreeks(leg).price);
  near(iv * 100, 30, 1e-6, 'implied volatility, in percent');
});

test('the IV of a leg\'s own premium is the leg\'s own volatility', () => {
  for (const c of matrix()) {
    setup(c);
    for (const [kind, strike] of [['call', 105], ['put', 92]]) {
      const leg = newLeg({ kind, side: 1, strike, days: 180, under: c.under });
      state.legs = [leg];
      const iv = legImpliedVol(leg, legGreeks(leg).price);
      near(iv * 100, legVolPct(leg), 1e-3, `${kind} ${strike}, ${c.label}`);
    }
  }
});

test('a position marked at today\'s price, today, shows no profit or loss', () => {
  // The sweep and the entry cost price each leg through different callers;
  // if they assembled their inputs differently this would not be zero.
  for (const c of matrix()) {
    setup(c);
    state.legs = [
      newLeg({ kind: 'call', side: 1, qty: 2, strike: 105, days: 180, under: c.under }),
      newLeg({ kind: 'put', side: -1, qty: 1, strike: 92, days: 90, under: c.under && c.under - 3 }),
      newLeg({ kind: 'underlying', side: 1, qty: 1, under: c.under })
    ];
    near(pnlEvaluator()(state.S, 0), 0, 1e-6, c.label);
  }
});

test('a leg\'s value at today\'s price matches the price its greeks report', () => {
  for (const c of matrix()) {
    setup(c);
    for (const kind of ['call', 'put']) {
      const leg = newLeg({ kind, side: 1, strike: 100, days: 180, under: c.under });
      state.legs = [leg];
      near(legValue(leg, state.S, 0), legGreeks(leg).price, 1e-9, `${kind}, ${c.label}`);
    }
  }
});

test('today\'s inputs use the leg\'s own month even when the panel price is zero', () => {
  // legScenario(leg, 0) would give 0 here; the leg's own month is what it is
  // priced at today, which is what legGreeks() has always used.
  resetState(app, { S: 0, vol: 30, rate: 5, days: 90 });
  const leg = newLeg({ kind: 'call', strike: 100, days: 90, under: 110 });
  assert.strictEqual(legPricingInputs(leg).S, 110);
  // And a scenario price still moves it through the shared axis.
  resetState(app, { S: 100, vol: 30, rate: 5, days: 90 });
  near(legPricingInputs(leg, { P: 120 }).S, 132, 1e-9, 'a 20% move on a 110 month');
});
