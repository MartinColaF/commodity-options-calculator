'use strict';

/* Every path that prices a leg - its value, its greeks, the P&L sweep and the
 * implied-volatility solver - goes through legPricingInputs(). They used to
 * assemble their inputs by hand, and the IV button drifted: it solved against
 * the panel price instead of the leg's own delivery month. These tests pin the
 * paths together so they cannot drift apart again. */

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState, wired } = require('./helpers/load-app.js');

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

/* ---- greeks on the chart's axis ----
 * The chart moves every leg's month in proportion to the reference contract,
 * so a month at `ratio` times the reference moves ratio dollars per dollar.
 * Every greek the page adds up is a derivative of that P&L: delta and gamma
 * against the reference price, vega and theta against the volatility and the
 * date, which the ratio does not touch. Delta and gamma used to add each
 * leg's own-month figures unscaled, and a call calendar whose months sat 2.5%
 * apart showed $0.49 of delta beside a chart sloping $1.78 per $1. */

/* Options on two months and a futures leg, the far month at c.under. */
function acrossMonths(c) {
  setup(c);
  state.legs = [
    newLeg({ kind: 'call', side: -1, qty: 2, strike: 100, days: 60 }),
    newLeg({ kind: 'call', side: 1, qty: 3, strike: 112, days: 180, under: c.under }),
    newLeg({ kind: 'put', side: 1, qty: 1, strike: 95, days: 180, under: c.under }),
    newLeg({ kind: 'underlying', side: -1, qty: 1, under: c.under })
  ];
}

/* The derivatives of the chart's P&L at P, tDays out, by central
 * differences. American greeks are central differences themselves, so they
 * take its steps - 0.01% of the price, 0.05 of a vol point and one day - and
 * the two agree to rounding; European greeks are exact, so a fine step. */
function derivatives(P, tDays) {
  const am = state.style === 'american';
  const dv = am ? 0.05 : 0.01, dt = am ? 1 : 0.01;
  const pnl = pnlEvaluator();
  const h = P * 1e-4;
  const up = pnl(P + h, tDays), mid = pnl(P, tDays), dn = pnl(P - h, tDays);
  return {
    delta: (up - dn) / (2 * h),
    gamma: (up - 2 * mid + dn) / (h * h),
    vega: (pnlEvaluator(dv)(P, tDays) - pnlEvaluator(-dv)(P, tDays)) / (2 * dv),
    theta: (pnl(P, tDays + dt) - pnl(P, tDays - dt)) / (2 * dt)
  };
}

/* Gamma is a second difference, so it carries more rounding than the rest. */
const TOL = { delta: 1e-6, gamma: 1e-4, vega: 1e-5, theta: 1e-5 };

test('the net greeks are the derivatives of the chart\'s P&L today', () => {
  for (const c of matrix()) {
    acrossMonths(c);
    const want = derivatives(state.S, 0);
    const got = app.netGreeks().money;
    for (const k of Object.keys(TOL)) {
      near(got[k], want[k], TOL[k] * Math.abs(want[k]) + 1e-6, `${k}, ${c.label}`);
    }
  }
});

test('each greek profile on the chart is the matching derivative of its curve', () => {
  for (const c of matrix()) {
    acrossMonths(c);
    state.chart.tDays = 20;
    for (const mode of Object.keys(TOL)) {
      state.chart.mode = mode;
      const points = app.chartConfig(app.analyse()).data.datasets[0].data;
      for (let i = 0; i < points.length; i += 97) {
        const { x, y } = points[i];
        const want = derivatives(x, 20)[mode];
        near(y, want, TOL[mode] * Math.abs(want) + 1e-6, `${mode} at ${x.toFixed(2)}, ${c.label}`);
      }
    }
  }
  state.chart.mode = 'payoff';
  state.chart.tDays = 0;
});

test('the legs table keeps each leg\'s delta against its own month', () => {
  // That is the hedge for the leg on its own month; the total is on the
  // chart's axis, and the greeks table says so once a month differs.
  setup({ style: 'european', skewOn: false });
  const leg = newLeg({ kind: 'call', side: 1, qty: 2, strike: 112, days: 180, under: 110 });
  state.legs = [leg];
  const own = legGreeks(leg).delta;
  assert.ok(app.legRowHtml(leg, 100).includes('<td class="num">' + app.fmt(2 * own, 3) + '</td>'));
  near(app.netGreeks().unit.delta, 2 * own * 1.1, 1e-12, 'the position, per point of the panel\'s 100');
});

test('the greeks table says what a point is once a leg prices off its own month', () => {
  const { app: page, el } = wired();
  const explained = /Delta and gamma are per point of the contract in the left panel/;
  page.state.legs = [page.newLeg({ kind: 'call', strike: 4100, days: 90 })];
  page.renderResults();
  assert.doesNotMatch(el('greeks').innerHTML, explained, 'one month: nothing to explain');
  page.state.legs.push(page.newLeg({ kind: 'call', side: -1, strike: 4200, days: 180, under: 4100 }));
  page.renderResults();
  assert.match(el('greeks').innerHTML, explained);
});

test('the IV button writes nothing for a premium without time value, and says why', () => {
  const { app: page, el, fire } = wired();
  Object.assign(page.state, { S: 100, vol: 30, rate: 4, style: 'european' });
  const press = leg => fire('legsBody', 'click', {
    dataset: { f: 'iv' }, matches: () => true,
    closest: sel => (sel === 'tr' ? { dataset: { id: String(leg.id) } } : {})
  });

  // REVISION_2_LOGICA.md, L9: 1.6 hours from expiry, 26.77 in the money.
  const deep = page.newLeg({ kind: 'put', strike: 126.77, days: 1.6 / 24 });
  page.state.legs = [deep];
  deep.entry = page.legGreeks(deep).price;
  press(deep);
  assert.strictEqual(deep.vol, null, 'no volatility written into the leg - it used to get 30%');
  assert.match(el('dataStatus').textContent, /^That premium has no time value/);

  deep.entry = 20;
  press(deep);
  assert.strictEqual(deep.vol, null);
  assert.match(el('dataStatus').textContent, /^No implied volatility solves that premium/,
    'a premium below the value at zero volatility has no volatility at all');

  // Not only deep in the money: any premium no higher than the value at zero
  // volatility - the discounted forward intrinsic for a European - has none.
  const itm = page.newLeg({ kind: 'call', strike: 95, days: 30 });
  page.state.legs = [itm];
  itm.entry = page.gbs('call', 100, 95, 30 / 365, 0.04, 0, 1e-8).price;
  press(itm);
  assert.strictEqual(itm.vol, null);
  assert.match(el('dataStatus').textContent, /^That premium has no time value/);

  const call = page.newLeg({ kind: 'call', strike: 105, days: 30 });
  page.state.legs = [call];
  call.entry = page.legGreeks(call).price;
  press(call);
  assert.strictEqual(call.vol, 30, 'a premium with time value still gives its volatility back');
});
