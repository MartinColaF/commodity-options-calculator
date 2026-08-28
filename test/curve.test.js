'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState } = require('./helpers/load-app.js');

const app = loadApp();
const { state, newLeg, gbs, legUnder, legScenario, strikeOnAxis,
  legValue, legGreeks, legEntry, analyse, netCost, snapshot, restore } = app;

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

test('a leg without its own price uses the contract in the panel', () => {
  resetState(app, { S: 100 });
  const leg = newLeg({ kind: 'call', strike: 100, days: 30 });
  assert.strictEqual(legUnder(leg), 100);
  assert.strictEqual(legScenario(leg, 120), 120);
  assert.strictEqual(strikeOnAxis(leg), 100);
});

test('a leg prices off its own delivery month', () => {
  resetState(app, { S: 100, vol: 30, rate: 5, days: 180 });
  const own = newLeg({ kind: 'call', strike: 105, days: 180, under: 108 });
  const shared = newLeg({ kind: 'call', strike: 105, days: 180 });

  assert.strictEqual(legUnder(own), 108);
  // Priced at 108, not at the panel's 100.
  near(legGreeks(own).price,
    gbs('call', 108, 105, 180 / 365, 0.05, 0, 0.3).price, 1e-9,
    'the leg is priced on its own contract');
  assert.ok(legGreeks(own).price > legGreeks(shared).price,
    'a higher delivery month is worth more to a call');
});

test('the payoff kink moves to where that month reaches the strike', () => {
  // A leg trading at 120 while the reference is at 100 hits its 120 strike
  // when the reference reaches 100 - the axis is shared, the prices are not.
  resetState(app, { S: 100 });
  const leg = newLeg({ kind: 'call', strike: 120, days: 30, under: 120 });
  near(strikeOnAxis(leg), 100, 1e-9, 'kink lands on the reference axis');
  near(legScenario(leg, 100), 120, 1e-9, 'at reference 100 the month is at 120');
  // And the option is exactly at the money there.
  near(legValue(leg, 100, 30), 0, 1e-9, 'worthless at expiry, at the money');
});

test('a flat curve reproduces the shared-price behaviour exactly', () => {
  // Setting every leg to the reference price must change nothing, or the
  // feature would silently move every existing scenario.
  const build = withUnder => {
    resetState(app, { S: 100, vol: 25, rate: 5, days: 90 });
    state.legs = [
      newLeg({ kind: 'call', side: 1, strike: 100, days: 90, under: withUnder ? 100 : null }),
      newLeg({ kind: 'call', side: -1, strike: 115, days: 90, under: withUnder ? 100 : null }),
      newLeg({ kind: 'put', side: 1, strike: 90, days: 90, under: withUnder ? 100 : null })
    ];
    const a = analyse();
    return { cost: netCost(), ys: a.ys, xs: a.xs, max: a.maxProfit, be: a.breakevens };
  };
  const implicit = build(false);
  const explicit = build(true);
  near(implicit.cost, explicit.cost, 1e-9, 'net cost');
  near(implicit.max, explicit.max, 1e-6, 'max profit');
  assert.strictEqual(implicit.ys.length, explicit.ys.length);
  for (let i = 0; i < implicit.ys.length; i += 13) {
    near(implicit.ys[i], explicit.ys[i], 1e-9, `payoff at ${implicit.xs[i]}`);
  }
});

test('a contango curve makes a calendar spread worth more than a flat one', () => {
  // The far month trades above the near one, so a long far call gains and the
  // approximation of pricing both months at one price understated it.
  const value = slope => {
    resetState(app, { S: 100, vol: 30, rate: 5, days: 90 });
    const px = d => +(100 * Math.exp(slope * d / 365)).toFixed(6);
    state.legs = [
      newLeg({ kind: 'call', side: -1, strike: 100, days: 90, under: px(90) }),
      newLeg({ kind: 'call', side: 1, strike: 100, days: 180, under: px(180) })
    ];
    return netCost();
  };
  const flat = value(0);
  const contango = value(0.06);
  assert.ok(contango > flat,
    `contango calendar ${contango} should cost more than flat ${flat}`);
});

test('an underlying leg follows its own month too', () => {
  resetState(app, { S: 100 });
  const leg = newLeg({ kind: 'underlying', side: 1, under: 110 });
  assert.strictEqual(legEntry(leg), 110, 'entry is that month, not the panel price');
  near(legValue(leg, 120, 0), 132, 1e-9, 'a 20% move takes 110 to 132');
});

test('a zero or negative leg price falls back instead of dividing by it', () => {
  resetState(app, { S: 100 });
  for (const bad of [0, -5, null]) {
    const leg = newLeg({ kind: 'call', strike: 100, days: 30, under: bad });
    assert.strictEqual(legUnder(leg), 100, `under=${bad} should fall back`);
    assert.ok(isFinite(strikeOnAxis(leg)), `under=${bad} produced a bad axis point`);
  }
});

test('a reference price of zero does not produce NaN scenarios', () => {
  // Half-typed price fields reach this code; a ratio of under/0 must not leak.
  resetState(app, { S: 0 });
  const leg = newLeg({ kind: 'call', strike: 100, days: 30, under: 120 });
  assert.ok(isFinite(legScenario(leg, 50)), 'scenario went non-finite');
  assert.ok(isFinite(strikeOnAxis(leg)), 'axis point went non-finite');
});

test('the stats grid still spans past the furthest kink', () => {
  // Max profit and breakevens are searched on this grid, so a leg on a far
  // month must not fall outside it.
  resetState(app, { S: 100 });
  state.legs = [newLeg({ kind: 'put', side: 1, strike: 200, days: 90, under: 200 })];
  const g = app.statsGrid();
  const kink = strikeOnAxis(state.legs[0]);
  assert.ok(g[0] < kink && g[g.length - 1] > kink,
    `kink at ${kink} outside grid [${g[0]}, ${g[g.length - 1]}]`);
});

test('the leg price survives a save and restore', () => {
  resetState(app, { S: 100 });
  state.legs = [
    newLeg({ kind: 'call', strike: 100, days: 90, under: 103.5 }),
    newLeg({ kind: 'call', strike: 100, days: 180, under: null })
  ];
  const saved = JSON.parse(JSON.stringify(snapshot()));
  resetState(app, { S: 100 });
  state.legs = [];
  restore(saved);
  assert.strictEqual(state.legs.length, 2);
  assert.strictEqual(state.legs[0].under, 103.5);
  assert.strictEqual(state.legs[1].under, null);
});
