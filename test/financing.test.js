'use strict';

/* The premium's interest. An option's premium is paid or received today, so a
 * P&L read at a later date counts it with the interest it has carried since: a
 * debit pays that interest and a credit earns it. Read nominally, as it used to
 * be, a fairly priced option showed a profit it never had, premium x (e^(rT) -
 * 1) - 8.3% of the premium on a two-year option at 4% (REVISION_2_LOGICA.md,
 * L11). The risk-free rate is the default; the premium may carry a rate of the
 * user's own instead, or nothing, for the nominal P&L. */

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState, wired } = require('./helpers/load-app.js');

const app = loadApp();
const { state, newLeg } = app;

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

/* What one unit of premium paid today has grown to `days` later, at r percent. */
const grown = (r, days) => Math.exp(r / 100 * days / 365);

/* Gold at 4000, the legs 30 days out unless they say otherwise. */
function position(legs, over) {
  resetState(app, Object.assign({ style: 'european', vol: 20 }, over));
  state.legs = legs.map(l => newLeg(Object.assign({ days: 30 }, l)));
  return app.analyse();
}

test('a premium carries interest at the risk-free rate up to the date its P&L is read', () => {
  assert.strictEqual(loadApp().state.financing.mode, 'rate', 'a first visit starts there');
  const a = position([{ kind: 'call', strike: 4100 }]);
  const owed = app.legEntry(state.legs[0]) * grown(4, 30);

  // At expiry the call is worth nothing up to its strike, and what it lost is
  // the premium with a month's interest.
  near(app.strategyPnl(4100, 30), -owed * 100, 1e-6, 'at the strike, at expiry');
  near(a.maxLoss, -owed * 100, 1e-6, 'the maximum loss');
  near(a.breakevens[0], 4100 + owed, 1e-6, 'the breakeven');
  near(app.premiumInterest(30), app.netCost() * (grown(4, 30) - 1), 1e-9, 'the interest to the horizon');
  const grid = app.scenarioTable().panels[1].rows[3].cells;   // volatility unchanged, today's price
  near(grid[grid.length - 1], -owed * 100, 1e-6, 'the scenario grid at the horizon');

  // Nothing has been carried yet today, and halfway half a month has.
  near(app.strategyPnl(4000, 0), 0, 1e-9, 'today, at today\'s price');
  const halfway = app.legValue(state.legs[0], 4000, 15) - app.legEntry(state.legs[0]) * grown(4, 15);
  near(app.strategyPnl(4000, 15), halfway * 100, 1e-9, 'fifteen days in');
});

test('a fairly priced option breaks even on average once its premium carries interest', () => {
  // The risk-neutral expectation of the P&L at the horizon, by quadrature over
  // the panel contract's lognormal. At the risk-free rate it is zero - for a
  // leg still alive at the horizon too, the far month of a calendar. Read
  // nominally it is the premium's interest: a profit nobody makes.
  const expected = days => {
    const T = days / 365, s = state.vol / 100 * Math.sqrt(T), b = app.carry();
    const pnl = app.pnlEvaluator();
    let sum = 0;
    for (let i = -9000; i <= 9000; i++) {
      const z = i / 1000;
      sum += app.normPdf(z) * pnl(state.S * Math.exp(b * T - s * s / 2 + s * z), days);
    }
    return sum / 1000;
  };
  const cases = [
    ['a long call', {}, [{ kind: 'call', strike: 4100 }]],
    ['two years at 35%', { vol: 35 }, [{ kind: 'call', strike: 4000, days: 730 }]],
    ['a short put', {}, [{ kind: 'put', side: -1, strike: 3800, days: 90 }]],
    ['a bull call spread on spot', { model: 'bs' }, [
      { kind: 'call', strike: 4000, days: 180 }, { kind: 'call', side: -1, strike: 4400, days: 180 }]],
    ['a calendar', {}, [{ kind: 'call', side: -1, strike: 4000 }, { kind: 'call', strike: 4000, days: 60 }]]
  ];
  for (const [label, over, legs] of cases) {
    position(legs, over);
    const t = app.horizonDays();
    const interest = app.netCost() * (grown(4, t) - 1);
    // To the cent: the quadrature is good to a third of one, the interest is
    // twelve dollars or more.
    near(expected(t), 0, 0.01, label + ', at the risk-free rate');
    state.financing.mode = 'none';
    near(expected(t), interest, 0.01, label + ', nominal');
    assert.ok(Math.abs(interest) > 10, label + ': the interest is not lost in the tolerance');
  }
});

test('a credit earns the interest a debit pays', () => {
  let a = position([{ kind: 'put', side: -1, strike: 3900 }]);
  const credit = -app.netCost();
  near(a.maxProfit, credit * grown(4, 30), 1e-6, 'a short put keeps its credit and the interest on it');
  assert.ok(app.premiumInterest(30) < 0, 'interest earned is a negative cost');
  assert.ok(app.premiumInterestPerDay(0) < 0);

  resetState(app, { style: 'european', vol: 20 });
  app.applyStrategy('iron-condor');
  a = app.analyse();
  near(a.maxProfit, -app.netCost() * grown(4, 30), 1e-6, 'an iron condor too');
});

test('the premium can carry a rate of the user\'s own instead, or nothing', () => {
  for (const [financing, g] of [
    [{ mode: 'custom', rate: 6.5 }, grown(6.5, 30)],
    [{ mode: 'custom', rate: -1 }, grown(-1, 30)],
    [{ mode: 'none', rate: 9 }, 1]
  ]) {
    const a = position([{ kind: 'call', strike: 4100 }], { financing });
    const owed = app.legEntry(state.legs[0]) * g;
    const label = JSON.stringify(financing);
    near(a.maxLoss, -owed * 100, 1e-6, label + ': the maximum loss');
    near(a.breakevens[0], 4100 + owed, 1e-6, label + ': the breakeven');
    near(app.premiumInterest(30), app.netCost() * (g - 1), 1e-9, label + ': the interest');
  }
  // Only the carry changes: the premium is priced at the risk-free rate in
  // every mode, and today nothing has been carried in any.
  position([{ kind: 'call', strike: 4100 }], { financing: { mode: 'custom', rate: 9 } });
  const custom = { premium: app.legEntry(state.legs[0]), today: app.strategyPnl(4100, 0) };
  position([{ kind: 'call', strike: 4100 }]);
  assert.strictEqual(custom.premium, app.legEntry(state.legs[0]), 'the same premium');
  assert.strictEqual(custom.today, app.strategyPnl(4100, 0), 'the same P&L today, at another price');
});

test('a futures leg has no premium to carry', () => {
  for (const mode of ['rate', 'custom', 'none']) {
    position([{ kind: 'underlying', strike: 0 }], { financing: { mode, rate: 7 } });
    near(app.strategyPnl(4100, 30), 100 * 100, 1e-9, mode + ': the price move, and nothing else');
    assert.strictEqual(app.premiumInterest(30), 0, mode);
  }
  // In a covered call only the call's credit earns interest.
  position([{ kind: 'underlying', strike: 0 }, { kind: 'call', side: -1, strike: 4200 }]);
  const credit = app.legEntry(state.legs[1]);
  near(app.strategyPnl(4000, 30), credit * grown(4, 30) * 100, 1e-6, 'unchanged price, the call expired worthless');
});

test('the chart\'s leg curves add up to the position\'s, interest and all', () => {
  for (const mode of ['rate', 'custom', 'none']) {
    resetState(app, { vol: 20, financing: { mode, rate: 9 } });
    state.chart = { mode: 'payoff', tDays: 10, showLegs: true, range: 40 };
    app.applyStrategy('iron-condor');
    state.legs.push(newLeg({ kind: 'underlying', strike: 0, days: 30 }));
    const a = app.analyse();
    const sets = app.chartConfig(a).data.datasets;
    assert.strictEqual(sets.length, 2 + state.legs.length, 'the horizon, the tenth day and each leg');
    for (let i = 0; i < a.xs.length; i += 29) {
      const sum = sets.slice(2).reduce((acc, d) => acc + d.data[i].y, 0);
      near(sum, a.ys[i], 1e-6, `${mode}, at ${a.xs[i].toFixed(2)}`);
    }
  }
  state.chart.tDays = 0;
});

test('the page says what the premium carries, and at what rate', () => {
  const { app: page, el, fire } = wired();
  const s = page.state;
  s.legs = [page.newLeg({ kind: 'call', strike: 4100, days: 30 })];
  const draw = () => { page.renderInputs(); page.renderResults(); page.renderScenarios(); };
  draw();
  const amount = x => page.money(x).replace(/[$.]/g, '\\$&');

  assert.match(el('summary').innerHTML, new RegExp('Premium interest</span><strong>' + amount(-page.premiumInterest(30)) +
    '</strong><small>to the horizon, at 4\\.00%, the risk-free rate</small>'));
  assert.match(el('greeks').innerHTML, new RegExp('Theta is the options\' own decay\\. The P&amp;L also carries the ' +
    'premium\'s interest: ' + amount(-page.premiumInterestPerDay(0)) + ' a day at 4\\.00%\\.'));
  assert.match(el('scenarioHelp').textContent, /Each date includes the premium's interest up to it, at 4\.00%\./);
  assert.match(el('financingNote').textContent, /at the risk-free rate above - the one that discounts the price/);
  assert.strictEqual(el('financingRate').disabled, true, 'no rate of your own to type');

  el('financing').value = 'custom';
  fire('financing', 'input');
  el('financingRate').value = '6.5';
  fire('financingRate', 'input');
  assert.deepStrictEqual([s.financing.mode, s.financing.rate], ['custom', 6.5]);
  el('financingRate').value = '6.';
  fire('financingRate', 'input');
  el('financingRate').value = '';
  fire('financingRate', 'input');
  assert.strictEqual(s.financing.rate, 6, 'a half-typed number is read as far as it goes, an empty box keeps it');
  el('financingRate').value = '-0.25';
  fire('financingRate', 'input');
  assert.strictEqual(s.financing.rate, -0.25, 'like any rate it may be negative');
  draw();
  assert.strictEqual(el('financingRate').disabled, false);
  assert.match(el('summary').innerHTML, /<small>to the horizon, at −0\.25%, your rate<\/small>/);
  assert.match(el('financingNote').textContent, /at your own rate, continuously compounded/);

  el('financing').value = 'none';
  fire('financing', 'input');
  draw();
  assert.match(el('summary').innerHTML, /Premium interest<\/span><strong>Not charged<\/strong><small>nominal P&amp;L<\/small>/);
  assert.doesNotMatch(el('greeks').innerHTML, /premium's interest/);
  assert.match(el('scenarioHelp').textContent, /The P&L is nominal: the premium carries no interest\./);
  assert.match(el('financingNote').textContent, /^Nominal P&L/);
  assert.strictEqual(el('financingRate').disabled, true);
});

test('a scenario saved before the premium carried interest keeps its nominal P&L', () => {
  resetState(app);
  assert.ok(app.restore({ S: 4000, legs: [{ kind: 'call', strike: 4100, days: 30 }] }));
  assert.strictEqual(state.financing.mode, 'none', 'read as it was when it was saved');
  assert.strictEqual(state.financing.rate, 4, 'and the rate box keeps its value');

  // Only the three modes, and a rate only if it is a number.
  for (const bad of [{ mode: 'evil', rate: '5' }, { mode: '__proto__', rate: Infinity }, 'rate', ['custom'], null]) {
    resetState(app);
    app.restore({ financing: bad });
    assert.deepStrictEqual([state.financing.mode, state.financing.rate], ['none', 4], JSON.stringify(bad));
  }
  app.restore({ financing: { mode: 'custom', rate: -0.75 } });
  assert.deepStrictEqual([state.financing.mode, state.financing.rate], ['custom', -0.75]);
  app.restore({ financing: { mode: 'rate' } });
  assert.deepStrictEqual([state.financing.mode, state.financing.rate], ['rate', -0.75], 'a rate left out keeps its value');

  // One saved now says how it was read, so it does not come back nominal: the
  // default included, which a scenario without the field would lose.
  for (const financing of [{ mode: 'rate', rate: 4 }, { mode: 'custom', rate: 6.25 }]) {
    resetState(app, { financing });
    const saved = JSON.parse(JSON.stringify(app.snapshot()));
    resetState(app, { financing: { mode: 'none', rate: 1 } });
    app.restore(saved);
    assert.deepStrictEqual([state.financing.mode, state.financing.rate], [financing.mode, financing.rate]);
  }
});
