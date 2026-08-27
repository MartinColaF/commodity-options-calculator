'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState } = require('./helpers/load-app.js');

const app = loadApp();
const { state, newLeg, applyStrategy, analyse, netCost, netGreeks,
  dollarMultiplier, currentCommodity, STRATEGIES, COMMODITIES } = app;

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

test('bull call spread matches its closed-form limits', () => {
  resetState(app);
  state.legs = [
    newLeg({ kind: 'call', side: 1, strike: 3900, days: 30 }),
    newLeg({ kind: 'call', side: -1, strike: 4100, days: 30 })
  ];
  const a = analyse();
  const debit = netCost();
  assert.ok(debit > 0, 'a bull call spread is a debit: ' + debit);
  near(a.maxProfit, (4100 - 3900) * 100 - debit, 1, 'max profit = width - debit');
  near(a.maxLoss, -debit, 1, 'max loss = debit paid');
  assert.strictEqual(a.breakevens.length, 1, 'one breakeven');
  near(a.breakevens[0], 3900 + debit / 100, 1, 'breakeven = lower strike + debit per unit');
});

test('long straddle: unlimited upside, loss capped at the debit', () => {
  resetState(app);
  applyStrategy('straddle');
  const a = analyse();
  assert.strictEqual(a.maxProfit, Infinity, 'unbounded upside');
  near(a.maxLoss, -netCost(), 1, 'max loss = debit');
  assert.strictEqual(a.breakevens.length, 2, 'two breakevens');
  assert.ok(a.breakevens[0] < state.S && a.breakevens[1] > state.S, 'straddles the spot');
});

test('a naked short call has unlimited loss but a bounded credit', () => {
  resetState(app);
  applyStrategy('short-call');
  const a = analyse();
  assert.strictEqual(a.maxLoss, -Infinity, 'unbounded loss');
  near(a.maxProfit, Math.abs(netCost()), 1, 'max profit = credit received');
  assert.ok(a.pop > 0.5 && a.pop < 1, 'an out of the money short call usually expires worthless: ' + a.pop);
});

test('put payoffs are bounded because the price cannot go below zero', () => {
  resetState(app);

  applyStrategy('long-put');
  let a = analyse();
  const strike = state.legs[0].strike;
  assert.ok(Number.isFinite(a.maxProfit), 'a long put cannot make unlimited money');
  near(a.maxProfit, strike * 100 - netCost(), strike * 100 * 0.02, 'max profit approaches strike x multiplier');
  near(a.maxLoss, -netCost(), 1, 'max loss = debit');

  applyStrategy('short-put');
  a = analyse();
  assert.ok(Number.isFinite(a.maxLoss), 'a short put has a bounded loss');
  near(a.maxProfit, Math.abs(netCost()), 1, 'max profit = credit');
});

test('iron condor and butterfly are capped on both sides', () => {
  resetState(app);
  for (const name of ['iron-condor', 'butterfly']) {
    applyStrategy(name);
    const a = analyse();
    assert.ok(Number.isFinite(a.maxProfit) && Number.isFinite(a.maxLoss), `${name} is capped`);
    assert.strictEqual(a.breakevens.length, 2, `${name} has two breakevens`);
    assert.ok(a.maxProfit > 0 && a.maxLoss < 0, `${name} can win and lose`);
  }
  applyStrategy('iron-condor');
  assert.ok(netCost() < 0, 'an iron condor is opened for a credit');
});

test('a calendar spread keeps time value in the far leg at the near expiry', () => {
  resetState(app);
  applyStrategy('calendar');
  const a = analyse();
  assert.strictEqual(a.t, 30, 'the horizon is the nearest expiry');
  const peak = a.xs[a.ys.indexOf(Math.max(...a.ys))];
  near(peak, 4000, 300, 'profit peaks near the strike');
  assert.ok(Math.max(...a.ys) > 0, 'the far leg still carries value');
});

test('covered call delta sits between zero and one', () => {
  resetState(app);
  applyStrategy('covered-call');
  const g = netGreeks();
  assert.ok(g.unit.delta > 0 && g.unit.delta < 1, 'delta between 0 and 1: ' + g.unit.delta);
  assert.ok(g.unit.theta > 0, 'a covered call collects time value: ' + g.unit.theta);
});

test('cents-quoted contracts use the right dollar multiplier', () => {
  resetState(app, { commodity: 'corn', size: 5000, quote: 'cents', S: 450, vol: 28 });
  assert.strictEqual(dollarMultiplier(currentCommodity()), 50, 'corn is $50 per cent');
  state.legs = [newLeg({ kind: 'call', side: 1, strike: 460, days: 60 })];
  const cost = netCost();
  assert.ok(cost > 0 && cost < 50000, 'a corn call costs a sane number of dollars: ' + cost);

  // Copper is quoted in dollars per pound, not cents: 25000 x 1.
  resetState(app, { commodity: 'copper', size: 25000, quote: 'USD', S: 6.7 });
  assert.strictEqual(dollarMultiplier(currentCommodity()), 25000, 'copper is $25,000 per point');
  near(state.S * dollarMultiplier(currentCommodity()), 167500, 1, 'copper contract value');
});

test('the commodity table agrees with the quoting convention', () => {
  // Anything priced in cents must not also be sized as if it were dollars.
  for (const [key, c] of Object.entries(COMMODITIES)) {
    assert.ok(c.quote === 'USD' || c.quote === 'cents', `${key} has a valid quote unit`);
    assert.ok(c.size > 0, `${key} has a contract size`);
    assert.ok(c.vol > 0 && c.vol < 200, `${key} has a sane preset volatility`);
  }
});

test('every strategy preset builds and analyses cleanly', () => {
  resetState(app);
  for (const name of Object.keys(STRATEGIES)) {
    applyStrategy(name);
    const a = analyse();
    const g = netGreeks();
    assert.ok(state.legs.length > 0, `${name} produced legs`);
    assert.ok(a.ys.every(Number.isFinite), `${name} has a finite payoff curve`);
    assert.ok(a.pop >= 0 && a.pop <= 1, `${name} probability in range: ${a.pop}`);
    assert.ok(Number.isFinite(g.money.delta) && Number.isFinite(g.money.vega),
      `${name} has finite greeks`);
  }
});

test('both pricing models produce finite results for every commodity', () => {
  for (const key of Object.keys(COMMODITIES)) {
    const meta = COMMODITIES[key];
    for (const model of ['b76', 'bs']) {
      resetState(app, {
        commodity: key, model, size: meta.size, quote: meta.quote,
        vol: meta.vol, yield: meta.yield, S: 100
      });
      applyStrategy('bull-call');
      const a = analyse();
      assert.ok(a.ys.every(Number.isFinite), `${key}/${model} payoff is finite`);
    }
  }
});

test('degenerate inputs do not break the analysis', () => {
  for (const over of [{ days: 0 }, { vol: 0 }, { S: 0 }, { rate: -1 }, { vol: 300 }]) {
    resetState(app, over);
    applyStrategy('straddle');
    const a = analyse();
    assert.ok(a.ys.every(Number.isFinite),
      'payoff stays finite for ' + JSON.stringify(over));
    assert.ok(a.pop >= 0 && a.pop <= 1, 'probability stays in range for ' + JSON.stringify(over));
  }
});

test('inherited property names cannot pose as commodities or strategies', () => {
  // State can arrive from a shared link, so these names are reachable input.
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    resetState(app, { commodity: name });
    const c = currentCommodity();
    assert.ok(Number.isFinite(dollarMultiplier(c)),
      `${name} as a commodity still yields a usable multiplier`);

    resetState(app);
    const before = state.legs.length;
    applyStrategy(name);
    assert.strictEqual(state.legs.length, before,
      `${name} as a strategy name is ignored rather than throwing`);
  }
});

test('an inactive leg is excluded from the position', () => {
  resetState(app);
  state.legs = [
    newLeg({ kind: 'call', side: 1, strike: 4000, days: 30 }),
    newLeg({ kind: 'call', side: -1, strike: 4200, days: 30, on: false })
  ];
  const withOneOff = netCost();
  state.legs[1].on = true;
  assert.ok(netCost() < withOneOff, 'switching the short leg on reduces the debit');
});

test('quantity scales the position linearly', () => {
  resetState(app);
  state.legs = [newLeg({ kind: 'call', side: 1, strike: 4200, days: 30, qty: 1 })];
  const one = netCost();
  const greekOne = netGreeks().money.delta;
  state.legs[0].qty = 3;
  near(netCost(), one * 3, 1e-6, 'cost scales with quantity');
  near(netGreeks().money.delta, greekOne * 3, 1e-9, 'delta scales with quantity');
});
