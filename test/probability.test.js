'use strict';

/* The probability of profit: the chance, under a risk-neutral lognormal, that
 * the reference contract ends the horizon where the position's P&L is
 * positive. Two things used to be wrong with it. It was integrated cell by
 * cell, so the cell holding a breakeven counted whole or not at all - 37.01%
 * against an exact 37.76% on a bull call spread. And it always used the
 * panel's volatility, so a call priced at its own 40% reported 14.5% instead
 * of 28.7%. */

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState } = require('./helpers/load-app.js');

const elements = {
  summary: { innerHTML: '' }, greeks: { innerHTML: '' },
  tDays: { max: 0, value: 0 }, tDaysLabel: { textContent: '' }
};
const app = loadApp({ elements });
const { state, newLeg } = app;

const T = 30 / 365;
/* P(F_T > B) for the gold contract at 4000 under Black-76: no drift. */
const above = (B, vol) => app.normCdf((Math.log(4000 / B) - vol * vol * T / 2) / (vol * Math.sqrt(T)));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

function position(legs, over) {
  resetState(app, Object.assign({ style: 'european', vol: 20 }, over));
  state.legs = legs.map(l => newLeg(Object.assign({ days: 30 }, l)));
  return app.analyse();
}
/* A leg's premium as it stands at the horizon: paid or received today, with a
 * month's interest at the 4% rate. That is what the position has to make back,
 * or has to give up, by expiry. */
const G = Math.exp(0.04 * T);
const premium = i => app.legEntry(state.legs[i]) * G;

test('the probability is exact at the breakevens, on either tail and between them', () => {
  let a = position([{ kind: 'call', strike: 4100 }]);
  near(a.pop, above(4100 + premium(0), 0.2), 'long call: above K + premium');

  a = position([{ kind: 'put', strike: 3900 }]);
  near(a.pop, 1 - above(3900 - premium(0), 0.2), 'long put: below K - premium, down to zero');

  a = position([{ kind: 'call', strike: 4000 }, { kind: 'call', side: -1, strike: 4200 }]);
  near(a.pop, above(4000 + app.netCost() * G / 100, 0.2), 'bull call spread: above K1 + debit');

  a = position([{ kind: 'call', strike: 4000 }, { kind: 'put', strike: 4000 }]);
  const paid = premium(0) + premium(1);
  near(a.pop, 1 - above(4000 - paid, 0.2) + above(4000 + paid, 0.2), 'long straddle: both tails');

  a = position([{ kind: 'call', side: -1, strike: 4200 }, { kind: 'put', side: -1, strike: 3800 }]);
  const got = premium(0) + premium(1);
  near(a.pop, above(3800 - got, 0.2) - above(4200 + got, 0.2), 'short strangle: between the breakevens');
});

test('the probability is measured at the volatility the option is priced at', () => {
  let a = position([{ kind: 'call', strike: 4100, vol: 40 }]);
  assert.strictEqual(a.popVol, 0.4);
  near(a.pop, above(4100 + premium(0), 0.4), 'at the leg\'s own 40%');

  a = position([{ kind: 'call', strike: 4100 }]);
  assert.strictEqual(a.popVol, 0.2, 'no volatility of its own: the panel\'s');
});

test('among the options at the horizon, the one nearest the money sets it', () => {
  // Listed first but further from the money, so the order cannot decide.
  let a = position([
    { kind: 'call', side: -1, strike: 4400, vol: 45 },
    { kind: 'call', strike: 4000, vol: 30 }
  ]);
  assert.strictEqual(a.popVol, 0.3);
  near(a.pop, above(4000 + app.netCost() * G / 100, 0.3), 'priced on two volatilities, measured at the money');

  // A far leg nearer the money does not count: the horizon is the near expiry.
  a = position([
    { kind: 'call', side: -1, strike: 4050 },
    { kind: 'call', strike: 4000, days: 60, vol: 50 }
  ]);
  assert.strictEqual(a.popVol, 0.2, 'the near leg has no volatility of its own');

  // Nearest the money of its own contract, not of the panel's.
  a = position([
    { kind: 'call', strike: 4050, vol: 25 },
    { kind: 'call', side: -1, strike: 4100, under: 4100, vol: 35 }
  ]);
  assert.strictEqual(a.popVol, 0.35);
});

test('with the skew on, the probability takes its at-the-money level', () => {
  const a = position([{ kind: 'call', strike: 4400 }], { skew: { on: true, rr: -5, bf: 1 } });
  assert.notStrictEqual(app.legVolPct(state.legs[0]), 20, 'the leg itself prices off the curve');
  assert.strictEqual(a.popVol, 0.2);
});

test('the summary says which volatility the probability was measured at', () => {
  // 28.66% read nominally, the review's figure; the premium's month of
  // interest moves the breakeven up 0.46 and the probability down to 28.63%.
  position([{ kind: 'call', strike: 4100, vol: 40 }]);
  app.renderResults();
  assert.match(elements.summary.innerHTML, /Prob\. of profit<\/span><strong>28\.6%<\/strong><small>risk-neutral, at 40\.0% vol<\/small>/);
});

test('a breakeven past the top of the grid is found, and the probability stops at it', () => {
  // Three futures against three calls on a month 5% dearer: once the calls are
  // in the money the position moves 0.15 of a point against the futures' side
  // per point, so a profit still left at the grid's top - four times the price
  // - runs out further up, at 20 times the call's premium. The breakevens and
  // the probability used to stop at the top and carry its sign to infinity.
  const t = 480 / 365, vol = 0.6;
  const over = B => app.normCdf((Math.log(4000 / B) - vol * vol * t / 2) / (vol * Math.sqrt(t)));
  for (const side of [1, -1]) {
    resetState(app, { style: 'european', vol: 60, financing: { mode: 'none' } });
    state.legs = [
      newLeg({ kind: 'underlying', side, qty: 3, days: 480 }),
      newLeg({ kind: 'call', side: -side, qty: 3, strike: 4000, days: 480, under: 4200 })
    ];
    const c = app.legEntry(state.legs[1]);
    const a = app.analyse();
    const lower = 4000 - c, upper = 20 * c;
    assert.ok(upper > Math.max(...app.statsGrid()), 'the upper one lies past the grid');
    assert.strictEqual(a.breakevens.length, 2, `${side > 0 ? 'long' : 'short'} futures: both breakevens`);
    assert.ok(Math.abs(a.breakevens[0] - lower) < 1e-6, `${a.breakevens[0]} vs ${lower}`);
    assert.ok(Math.abs(a.breakevens[1] - upper) < 1e-6, `${a.breakevens[1]} vs ${upper}`);
    // Long the futures, it gains between them; short, outside them.
    near(a.pop, side > 0 ? over(lower) - over(upper) : 1 - over(lower) + over(upper),
      side > 0 ? 'no profit counted past the upper breakeven' : 'the profit past it counted');
  }
});
