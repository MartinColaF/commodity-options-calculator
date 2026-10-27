'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState, wired } = require('./helpers/load-app.js');

const app = loadApp();
const { state, newLeg, applyStrategy, analyse, netCost, netGreeks,
  dollarMultiplier, currentCommodity, STRATEGIES, COMMODITIES } = app;

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

/* A premium paid today and read at the 30-day horizon counts with a month's
 * interest at the 4% rate: what a debit owes and a credit has earned by then. */
const carried = x => x * Math.exp(0.04 * 30 / 365);

test('bull call spread matches its closed-form limits', () => {
  resetState(app);
  state.legs = [
    newLeg({ kind: 'call', side: 1, strike: 3900, days: 30 }),
    newLeg({ kind: 'call', side: -1, strike: 4100, days: 30 })
  ];
  let a = analyse();
  const debit = netCost();
  assert.ok(debit > 0, 'a bull call spread is a debit: ' + debit);
  near(a.maxProfit, (4100 - 3900) * 100 - carried(debit), 1, 'max profit = width - debit, with its interest');
  near(a.maxLoss, -carried(debit), 1, 'max loss = debit paid, with its interest');
  assert.strictEqual(a.breakevens.length, 1, 'one breakeven');
  near(a.breakevens[0], 3900 + carried(debit) / 100, 1e-6, 'breakeven = lower strike + debit per unit');

  // Read nominally, the debit carries nothing.
  state.financing.mode = 'none';
  a = analyse();
  near(a.maxProfit, (4100 - 3900) * 100 - debit, 1, 'nominal max profit');
  near(a.maxLoss, -debit, 1, 'nominal max loss');
  near(a.breakevens[0], 3900 + debit / 100, 1e-6, 'nominal breakeven');
});

test('long straddle: unlimited upside, loss capped at the debit', () => {
  resetState(app);
  applyStrategy('straddle');
  const a = analyse();
  assert.strictEqual(a.maxProfit, Infinity, 'unbounded upside');
  near(a.maxLoss, -carried(netCost()), 1, 'max loss = debit, with its interest');
  assert.strictEqual(a.breakevens.length, 2, 'two breakevens');
  assert.ok(a.breakevens[0] < state.S && a.breakevens[1] > state.S, 'straddles the spot');
});

test('a naked short call has unlimited loss but a bounded credit', () => {
  resetState(app);
  applyStrategy('short-call');
  const a = analyse();
  assert.strictEqual(a.maxLoss, -Infinity, 'unbounded loss');
  near(a.maxProfit, carried(Math.abs(netCost())), 1, 'max profit = credit received, with its interest');
  assert.ok(a.pop > 0.5 && a.pop < 1, 'an out of the money short call usually expires worthless: ' + a.pop);
});

test('put payoffs are bounded because the price cannot go below zero', () => {
  resetState(app);

  applyStrategy('long-put');
  let a = analyse();
  const strike = state.legs[0].strike;
  assert.ok(Number.isFinite(a.maxProfit), 'a long put cannot make unlimited money');
  near(a.maxProfit, strike * 100 - netCost(), strike * 100 * 0.02, 'max profit approaches strike x multiplier');
  near(a.maxLoss, -carried(netCost()), 1, 'max loss = debit, with its interest');

  applyStrategy('short-put');
  a = analyse();
  assert.ok(Number.isFinite(a.maxLoss), 'a short put has a bounded loss');
  near(a.maxProfit, carried(Math.abs(netCost())), 1, 'max profit = credit, with its interest');
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

test('an unlimited maximum comes with how fast it grows: a calendar bleeds where a naked call falls', () => {
  // REVISION_2_LOGICA.md, L12: past the strikes a European call calendar's far
  // leg is worth its intrinsic discounted for the month it has left, so the
  // position loses (e^(-r 30/365) - 1) x $100 a point. "Unlimited" alone read
  // like a naked call's $100.
  resetState(app);
  applyStrategy('calendar');
  let a = analyse();
  assert.strictEqual(a.maxLoss, -Infinity, 'in the model the loss has no floor');
  near(a.upSlope, (Math.exp(-0.04 * 30 / 365) - 1) * 100, 1e-6, 'a European calendar, per point');
  // American, the far leg is exercised up there instead: a floor, and flat.
  state.style = 'american';
  a = analyse();
  assert.ok(Number.isFinite(a.maxLoss), 'an American calendar\'s loss is bounded');
  near(a.upSlope, 0, 1e-9, 'flat as the price rises');

  state.style = 'european';
  applyStrategy('short-call');
  near(analyse().upSlope, -100, 1e-6, 'a naked call loses the multiplier a point');
  applyStrategy('long-call');
  near(analyse().upSlope, 100, 1e-6, 'a long call makes it');
  resetState(app, { commodity: 'corn', size: 5000, quote: 'cents', S: 450, vol: 28 });
  applyStrategy('long-call');
  near(analyse().upSlope, 50, 1e-6, 'corn, per cent: its $50 multiplier');
});

test('the summary gives that rate under an unlimited maximum, and nothing under a bounded one', () => {
  const { app: page, el } = wired();
  const summary = () => { page.renderResults(); return el('summary').innerHTML; };
  page.applyStrategy('calendar');
  assert.match(summary(), /Max loss<\/span><strong class="neg">Unlimited<\/strong><small>-\$0\.33 per point as the price rises<\/small>/);
  assert.match(summary(), /Max profit<\/span><strong class="pos">[^<]+<\/strong><\/div>/, 'a bounded maximum has no rate');
  page.state.style = 'american';
  assert.doesNotMatch(summary(), /as the price rises/, 'nor an American calendar');

  page.applyStrategy('long-call');
  assert.match(summary(), /Max profit<\/span><strong class="pos">Unlimited<\/strong><small>\$100\.00 per point as the price rises<\/small>/);
  // A rate too small for cents keeps two significant figures.
  Object.assign(page.state, { style: 'european', rate: 0.01 });
  page.applyStrategy('calendar');
  assert.match(summary(), /Unlimited<\/strong><small>-\$0\.00082 per point as the price rises<\/small>/);
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

test('the prepared P&L evaluator matches the one-shot function', () => {
  // analyse() hoists the entry cost out of the grid sweep. If the prepared
  // form ever drifts from strategyPnl the payoff curve would silently shift,
  // so pin them together in both exercise styles.
  for (const style of ['european', 'american']) {
    resetState(app, { style, S: 100, vol: 30, rate: 8, days: 180 });
    state.legs = [
      newLeg({ kind: 'put', side: 1, strike: 95, days: 180 }),
      newLeg({ kind: 'call', side: -1, strike: 110, days: 180 }),
      newLeg({ kind: 'underlying', side: 1 })
    ];
    const a = analyse();
    for (let i = 0; i < a.xs.length; i += 37) {
      near(a.ys[i], app.strategyPnl(a.xs[i], a.t), 1e-9,
        `${style}: prepared curve at ${a.xs[i]}`);
    }
  }
});

test('an explicit entry price is used instead of the theoretical one', () => {
  // The hoist must not lose the per-leg entry override.
  resetState(app, { S: 100, vol: 30, rate: 8, days: 180 });
  state.legs = [newLeg({ kind: 'call', side: 1, strike: 100, days: 180, entry: 2 })];
  const mult = dollarMultiplier(currentCommodity());
  near(netCost(), 2 * mult, 1e-9, 'net cost follows the entry override');
  // At expiry, at the strike, the option expires worthless and the loss is the
  // premium actually paid, with the interest it carried for 180 days at 8%.
  near(app.strategyPnl(100, 180), -2 * mult * Math.exp(0.08 * 180 / 365), 1e-6, 'P&L is measured from the entry');
  state.financing.mode = 'none';
  near(app.strategyPnl(100, 180), -2 * mult, 1e-6, 'and nominally from the entry alone');
});
