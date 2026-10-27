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

test('an American calendar is unlimited only where its far call is never exercised', () => {
  // Whether a maximum was unlimited used to be read off the slope at the top
  // of the statistics grid, 16,000 on a 4,000 contract. A far American call
  // held over the horizon can be exercised well past that, or never, so the
  // slope there was not the slope at infinity, and each case below read wrong.
  const calendar = (over, K, nearDays, farDays) => {
    resetState(app, Object.assign({ style: 'american' }, over));
    state.legs = [newLeg({ kind: 'call', side: -1, strike: K, days: nearDays }), newLeg({ kind: 'call', strike: K, days: farDays })];
    return analyse();
  };
  const owed = nearDays => -netCost() * Math.exp(state.rate / 100 * nearDays / 365);

  // Exercised far past the grid - a small yield under Black-Scholes, a high
  // volatility and a long far leg under Black-76. The far call is never worth
  // less than exercising it, so the calendar cannot lose more than its debit
  // with the interest on it. Both read as an unlimited loss.
  let a = calendar({ model: 'bs', vol: 22, rate: 4.5, yield: 0.3 }, 4000, 45, 90);
  near(a.maxLoss, owed(45), 1e-6, 'Black-Scholes at a 0.3% yield: the debit with its interest');
  assert.strictEqual(a.upSlope, 0);
  a = calendar({ model: 'b76', vol: 75, rate: 1 }, 4500, 160, 510);
  near(a.maxLoss, owed(160), 1e-6, 'Black-76 at 75%, a 350-day far leg');

  // Never exercised, its forward rising faster than the near leg pays: at a
  // negative rate under Black-76, or with carry between a negative rate and
  // zero under Black-Scholes. The first read as an unlimited loss, the second
  // as bounded.
  a = calendar({ model: 'b76', vol: 80, rate: -0.5 }, 4000, 120, 540);
  assert.strictEqual(a.maxProfit, Infinity);
  near(a.upSlope, 100 * (Math.exp(0.005 * 420 / 365) - 1), 1e-9, 'its forward, per point');
  near(a.maxLoss, owed(120), 1e-6, 'and its loss is still the debit');
  a = calendar({ model: 'bs', vol: 25, rate: -0.5, yield: -0.1 }, 3400, 50, 140);
  assert.strictEqual(a.maxProfit, Infinity);
  near(a.upSlope, 100 * (Math.exp(0.001 * 90 / 365) - 1), 1e-9, 'its forward, per point');
});

test('a diagonal can do its worst far past the grid, and a calendar on two months grows by their gap', () => {
  // A short near call under a long far one at a higher strike, opened for a
  // credit. Under Black-Scholes with a small yield the far call is exercised
  // only from 31,383, past the grid's 16,000, and from there the position has
  // lost the gap between the strikes, less its credit with interest. Searched
  // up to 16,000 only, the loss read $9,177.49 instead of $15,234.29.
  resetState(app, { style: 'american', model: 'bs', vol: 12, rate: 4, yield: 0.5 });
  state.legs = [newLeg({ kind: 'call', side: -1, strike: 3400, days: 90 }), newLeg({ kind: 'call', strike: 3600, days: 450 })];
  let a = analyse();
  assert.ok(netCost() < 0, 'a credit');
  near(a.maxLoss, (3400 - 3600) * 100 - netCost() * Math.exp(0.04 * 90 / 365), 1e-6,
    'the strike gap, less the credit and its 90 days of interest');

  // A calendar whose far month trades 3% over the near one: once its call is
  // exercised, that month gains 1.03 points for each the near leg loses.
  resetState(app, { style: 'american', model: 'bs', vol: 22, rate: 4.5, yield: 0.3 });
  state.legs = [newLeg({ kind: 'call', side: -1, strike: 4000, days: 45 }), newLeg({ kind: 'call', strike: 4000, days: 90, under: 4120 })];
  a = analyse();
  assert.strictEqual(a.maxProfit, Infinity);
  near(a.upSlope, (1.03 - 1) * 100, 1e-9, '$3 a point');
});

test('with no volatility the verdict still follows the pricer', () => {
  // americanPrice() takes a call with no volatility at its intrinsic value, so
  // past the strikes an American calendar on one is flat, where a European one
  // rides its forward up: carry above the rate here.
  for (const style of ['american', 'european']) {
    resetState(app, { style, model: 'bs', vol: 0, rate: 4, yield: -1 });
    applyStrategy('calendar');
    const a = analyse(), pnl = app.pnlEvaluator();
    const slope = (pnl(8e7, a.t) - pnl(4e7, a.t)) / 4e7;
    near(a.upSlope, slope, 1e-6, style + ': the P&L\'s own slope');
    assert.strictEqual(Number.isFinite(a.maxProfit), Math.abs(slope) < 1e-7, style + ': bounded only if flat');
  }
  // And the maxima: a diagonal whose far call is worth holding until its
  // forward's line meets exercising, 62,830 at a 0.3% yield, only does its
  // worst from there - the gap between the strikes and its debit with
  // interest, which the grid, stopping at 16,000, read as $16,191.38.
  resetState(app, { style: 'american', model: 'bs', vol: 0, rate: 4.5, yield: 0.3 });
  state.legs = [newLeg({ kind: 'call', side: -1, strike: 4000, days: 45 }), newLeg({ kind: 'call', strike: 4200, days: 90 })];
  near(analyse().maxLoss, (4000 - 4200) * 100 - netCost() * Math.exp(0.045 * 45 / 365), 1e-6, 'past the crossing');
});

test('legs on months that move in exact proportion add up flat, rounding aside', () => {
  // Calls on months at a tenth, a fifth and three tenths of the panel's price:
  // the two long ones gain what the short one loses, although 0.1 + 0.2 is not
  // 0.3 in floating point. One unit a contract, so no multiplier rounds the
  // difference away first.
  resetState(app, { style: 'european', commodity: 'custom', size: 1, quote: 'USD', S: 4000 });
  state.legs = [
    newLeg({ kind: 'call', strike: 300, under: 400 }),
    newLeg({ kind: 'call', strike: 600, under: 800 }),
    newLeg({ kind: 'call', side: -1, strike: 900, under: 1200 })
  ];
  const a = analyse();
  assert.ok(Number.isFinite(a.maxProfit) && Number.isFinite(a.maxLoss), 'bounded');
  assert.strictEqual(a.upSlope, 0);
});

test('across random American calendars, the verdict, its rate and the maxima are the P&L\'s own', () => {
  // The truth is the P&L itself: read at two prices far past where the far
  // call is exercised, where it is a straight line, and scanned densely from
  // near zero out to there. On main, 196 of 2,000 such calendars read
  // Unlimited though bounded, 30 with the sign reversed and one bounded
  // though not.
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 80; i++) {
    const model = rand() < 0.5 ? 'b76' : 'bs';
    const over = { style: 'american', model, vol: 10 + rand() * 70, rate: -1 + rand() * 9, yield: model === 'bs' ? -2 + rand() * 7 : 0.3 };
    const nearDays = Math.round(7 + rand() * 173), farDays = Math.round(nearDays * (1.5 + rand() * 2.5));
    const K = Math.round(4000 * (0.8 + rand() * 0.4));
    resetState(app, over);
    state.legs = [newLeg({ kind: 'call', side: -1, strike: K, days: nearDays }), newLeg({ kind: 'call', strike: K, days: farDays })];
    const a = analyse(), pnl = app.pnlEvaluator(), t = a.t;
    const r = state.rate / 100, b = app.carry(), tau = (farDays - t) / 365;
    const boundary = b >= r && b >= 0 ? 0 : app.americanCritical('call', K, tau, r, b, state.vol / 100);
    const far = Math.max(4 * boundary, 4e7);
    const slope = (pnl(2 * far, t) - pnl(far, t)) / far;
    const label = JSON.stringify(Object.assign({ K, nearDays, farDays }, over));
    if (Math.abs(slope) > 1e-7) {
      assert.strictEqual(slope > 0 ? a.maxProfit : a.maxLoss, slope > 0 ? Infinity : -Infinity, label);
      near(a.upSlope, slope, 1e-6 * Math.abs(slope), label + ': the rate');
    } else {
      assert.ok(Number.isFinite(a.maxProfit) && Number.isFinite(a.maxLoss), label + ': bounded');
    }
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k <= 2000; k++) {
      const y = pnl(4 * Math.pow(far / 2, k / 2000), t);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    if (Number.isFinite(a.maxLoss)) assert.ok(a.maxLoss <= lo + 0.01, `${label}: no loss past ${a.maxLoss}, scanned ${lo}`);
    if (Number.isFinite(a.maxProfit)) assert.ok(a.maxProfit >= hi - 0.01, `${label}: no profit past ${a.maxProfit}, scanned ${hi}`);
  }
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
