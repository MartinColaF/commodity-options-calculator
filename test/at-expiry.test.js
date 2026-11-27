'use strict';

/* The summary at expiry, first under Results: what each stretch of prices does
 * to the position, in words. At expiry an option is worth what it is in the
 * money, so the P&L is a straight line between strikes and the summary rests
 * on no model; every figure in it is the chart's at the horizon, which these
 * tests check point by point. With options on more than one expiry, each
 * expiry's options are described on their own and the result of closing at
 * the first comes from analyse(), as the chart's does. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');
const SPANISH = require('../es/words.js');

const text = html => html.replace(/<\/(li|p)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, '\'').trim().split('\n');

function page(opts) {
  const p = wired(opts);
  p.app.state.style = 'american';
  return p;
}

test('a bull call spread in three stretches, each the chart\'s P&L at expiry', () => {
  const { app, el } = page();
  app.applyStrategy('bull-call');
  app.renderResults();
  assert.strictEqual(el('expiryBlock').hidden, false);
  const a = app.analyse();
  const f = app.pnlEvaluator();
  const loss = app.money(f(4000, 30)), profit = app.money(f(4500, 30));
  assert.deepStrictEqual(text(el('expiry').innerHTML), [
    `Below 4,000: every option expires worthless; a fixed loss of ${loss}.`,
    `Between 4,000 and 4,500: the long call 4,000 is exercised; the result goes from ${loss} to ${profit}, $100.00 a point; ` +
      `breakeven at ${app.fmtPrice(a.breakevens[0])}.`,
    `Above 4,500: the long call 4,000 and the short call 4,500 are exercised; a fixed profit of ${profit}.`
  ]);
  // The same maxima as the results beside it.
  assert.strictEqual(loss, app.money(a.maxLoss));
  assert.strictEqual(profit, app.money(a.maxProfit));
  assert.match(el('expiryNote').textContent, /^At expiry each option is worth what it is in the money, so none of this depends on volatility\. The premiums are counted with their interest to expiry\. American options are taken as held to expiry\.$/);
});

test('over random positions on one expiry, every stretch is the chart\'s line and every breakeven the results\'', () => {
  const { app } = page();
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 200; n++) {
    app.state.legs = [];
    const count = 1 + Math.floor(rnd() * 4);
    for (let i = 0; i < count; i++) {
      app.state.legs.push(app.newLeg({
        kind: rnd() < 0.5 ? 'call' : 'put', side: rnd() < 0.5 ? 1 : -1,
        strike: Math.round(3000 + rnd() * 2000), qty: 1 + Math.floor(rnd() * 3), days: 30
      }));
    }
    if (rnd() < 0.3) app.state.legs.push(app.newLeg({ kind: 'underlying', side: rnd() < 0.5 ? 1 : -1, days: 30 }));
    // A physical turns the summary to net prices; this checks the P&L.
    if (app.physicalPosition()) continue;
    const o = app.expiryOutline();
    const f = app.pnlEvaluator();
    const scale = 1 + Math.abs(f(4000, 30));
    for (const r of o.regions) {
      // Straight inside: the value at a third of the way is the line's.
      const lo = r.lo, hi = r.hi === Infinity ? 2 * r.lo : r.hi;
      const x = lo + (hi - lo) / 3;
      assert.ok(Math.abs(f(x, 30) - (r.from + r.slope * (x - lo))) < 1e-6 * scale, `stretch from ${lo}`);
      if (r.to != null) assert.ok(Math.abs(f(r.hi, 30) - r.to) < 1e-6 * scale);
    }
    // Every breakeven in a stretch is one the results show, and none is missed.
    const zeros = o.regions.map(r => r.zero).filter(z => z != null);
    const bes = Array.from(app.analyse().breakevens);
    assert.strictEqual(zeros.length, bes.length, `breakevens ${zeros} vs ${bes}`);
    zeros.forEach((z, i) => assert.ok(Math.abs(z - bes[i]) < 1e-6 * 4000, `${z} vs ${bes[i]}`));
  }
});

test('a hedge reads as its net price: the floor fixed, the market above it, the basis and the commissions in it', () => {
  const { app, el } = page();
  Object.assign(app.state, { commodity: 'soybean', S: 1050, size: 5000, quote: 'cents', days: 60, vol: 18, basis: -40, commission: 1 });
  app.state.legs = [app.newLeg({ kind: 'underlying', side: 1, days: 60 }), app.newLeg({ kind: 'put', side: 1, strike: 1000, days: 60 })];
  app.renderResults();
  const floor = app.netPrices(app.analyse()).worst;
  const net = app.netPriceEvaluator();
  const less = 1100 - net(1100, 60);
  assert.deepStrictEqual(text(el('expiry').innerHTML), [
    `Below 1,000: the long put 1,000 is exercised; the net sale price is fixed at ${app.fmtPrice(floor)} (${app.fmt(app.physicalPrice(floor), 2)} USD/t).`,
    `Above 1,000: the option expires worthless; the net sale price is the futures price minus ${app.fmtPrice(less)}.`
  ]);
  assert.strictEqual(app.fmtPrice(floor), '947.726', 'the guide\'s floor');
  assert.strictEqual(app.fmtPrice(less), '52.274');
  // The basis moves it point for point: what a hedger sees change.
  app.state.basis = -60;
  app.renderResults();
  assert.match(el('expiry').innerHTML, /fixed at 927\.726/);
  assert.match(el('expiry').innerHTML, /futures price minus 72\.274/);
  // A breakeven is a P&L's; a net price has none.
  assert.doesNotMatch(el('expiry').innerHTML, /breakeven/);
});

test('a buyer\'s cap and a seller\'s collar', () => {
  const { app, el } = page();
  Object.assign(app.state, { commodity: 'wti', S: 70, size: 1000, quote: 'USD', days: 30, vol: 35 });
  app.state.legs = [app.newLeg({ kind: 'underlying', side: -1, days: 30 }), app.newLeg({ kind: 'call', side: 1, strike: 75, days: 30 })];
  app.renderResults();
  const cap = app.netPrices(app.analyse()).worst;
  assert.deepStrictEqual(text(el('expiry').innerHTML), [
    `Below 75: the option expires worthless; the net purchase price is the futures price plus ${app.fmtPrice(cap - 75)}.`,
    `Above 75: the long call 75 is exercised; the net purchase price is fixed at ${app.fmtPrice(cap)}.`
  ]);
  Object.assign(app.state, { commodity: 'coffee', S: 300, size: 37500, quote: 'cents', days: 60, vol: 45 });
  app.state.legs = [app.newLeg({ kind: 'underlying', side: 1, days: 60 }), app.newLeg({ kind: 'put', side: 1, strike: 280, days: 60 }),
    app.newLeg({ kind: 'call', side: -1, strike: 324.31, days: 60 })];
  app.renderResults();
  const np = app.netPrices(app.analyse());
  const lines = text(el('expiry').innerHTML);
  assert.strictEqual(lines.length, 3);
  assert.ok(lines[0].endsWith(`fixed at ${app.fmtPrice(np.worst)} (${app.fmt(app.physicalPrice(np.worst), 2)} USD per 60-kg bag).`), lines[0]);
  assert.match(lines[1], /^Between 280 and 324\.31: every option expires worthless; the net sale price is the futures price (minus|plus) /);
  assert.ok(lines[2].endsWith(`fixed at ${app.fmtPrice(np.best)} (${app.fmt(app.physicalPrice(np.best), 2)} USD per 60-kg bag).`), lines[2]);
});

test('a hedge on part of the physical: the net price at either end of a stretch', () => {
  const { app, el } = page();
  Object.assign(app.state, { commodity: 'soybean', S: 1050, size: 5000, quote: 'cents', days: 60, vol: 18 });
  app.state.legs = [app.newLeg({ kind: 'underlying', side: 1, qty: 2, days: 60 }), app.newLeg({ kind: 'put', side: 1, strike: 1000, days: 60 })];
  app.renderResults();
  const net = app.netPriceEvaluator();
  const price = x => `${app.fmtPrice(x)} (${app.fmt(app.physicalPrice(x), 2)} USD/t)`;
  const [below] = text(el('expiry').innerHTML);
  // Half the physical is covered: below the strike it falls half a point a point.
  assert.strictEqual(below, `Below 1,000: the long put 1,000 is exercised; the net sale price goes from ${price(net(1000, 60))} at 1,000 ` +
    `to ${price(net(1e-9, 60))} if the price falls to zero.`);
});

test('a calendar: each expiry\'s option, and closing everything at the first as the chart does', () => {
  const { app, el } = page();
  app.applyStrategy('calendar');
  app.renderResults();
  const a = app.analyse();
  assert.deepStrictEqual(text(el('expiry').innerHTML), [
    'Options expiring in 30 days',
    'Below 4,000: the option expires worthless.',
    'Above 4,000: the short call 4,000 is exercised; $100.00 a point above 4,000 is paid.',
    'Options expiring in 60 days',
    'Below 4,000: the option expires worthless.',
    'Above 4,000: the long call 4,000 is exercised; $100.00 a point above 4,000 is received.',
    `Net premium paid today: ${app.money(app.netCost())}.`,
    `Closing every leg at the first expiry, in 30 days, as the chart does: from ${app.money(a.maxLoss)} at worst to ` +
      `${app.money(a.maxProfit)} at best, breaking even at ${app.fmtPrice(a.breakevens[0])} and ${app.fmtPrice(a.breakevens[1])}. ` +
      'The options still open then are valued by the model, each at its own volatility.'
  ]);
  assert.match(el('expiryNote').textContent, /^Each expiry's options are shown as if held to it/);
  // A futures leg expires with none of them: what it makes, said once.
  app.state.legs.push(app.newLeg({ kind: 'underlying', side: 1, qty: 2 }));
  app.renderResults();
  assert.ok(text(el('expiry').innerHTML).includes('The futures legs gain $200.00 for each point above 4,000.00 and lose as much for each point below it.'));
});

test('nothing to say with no option: no legs, every leg off, or futures alone', () => {
  const { app, el } = page();
  app.renderResults();
  assert.strictEqual(el('expiryBlock').hidden, true);
  app.state.legs = [app.newLeg({ kind: 'underlying', side: 1 })];
  app.renderResults();
  assert.strictEqual(el('expiryBlock').hidden, true);
  app.state.legs = [app.newLeg({ kind: 'call', strike: 4000 })];
  app.state.legs[0].on = false;
  app.renderResults();
  assert.strictEqual(el('expiryBlock').hidden, true);
});

test('the notes say what the figures rest on', () => {
  const { app, el } = page();
  app.applyStrategy('long-call');
  app.state.financing.mode = 'none';
  app.state.style = 'european';
  app.renderResults();
  assert.strictEqual(el('expiryNote').textContent,
    'At expiry each option is worth what it is in the money, so none of this depends on volatility. The premiums are counted, without interest.');
  // A leg on its own month reads on the panel's contract, as the chart does.
  app.state.legs[0].under = 4100;
  app.renderResults();
  assert.match(el('expiryNote').textContent, /Prices are those of the contract in the left panel/);
});

test('only the bold and the list are markup', () => {
  const { app, el } = page();
  app.applyStrategy('iron-condor');
  app.renderResults();
  const tags = Array.from(el('expiry').innerHTML.matchAll(/<\/?([a-z]+)[^>]*>/g), m => m[1]);
  assert.deepStrictEqual(Array.from(new Set(tags)).sort(), ['li', 'strong', 'ul']);
  assert.strictEqual(text(el('expiry').innerHTML).length, 5, 'five stretches between four strikes');
});

test('and in Spanish, impersonal', () => {
  const { app, el } = page({ lang: 'es', words: { es: SPANISH } });
  app.applyStrategy('bull-call');
  app.renderResults();
  const lines = text(el('expiry').innerHTML);
  assert.match(lines[0], /^Por debajo de 4,000: todas las opciones vencen sin valor; pérdida fija de −\$[\d,.]+\.$/);
  assert.match(lines[1], /^Entre 4,000 y 4,500: se ejerce el call comprado 4,000; el resultado va de .* por punto; equilibrio en 4,068\.48\.$/);
  assert.match(lines[2], /^Por encima de 4,500: se ejercen el call comprado 4,000 y el call vendido 4,500; ganancia fija de \$[\d,.]+\.$/);
  Object.assign(app.state, { commodity: 'soybean', S: 1050, size: 5000, quote: 'cents', days: 60, vol: 18, basis: -40, commission: 1 });
  app.state.legs = [app.newLeg({ kind: 'underlying', side: 1, days: 60 }), app.newLeg({ kind: 'put', side: 1, strike: 1000, days: 60 })];
  app.renderResults();
  assert.deepStrictEqual(text(el('expiry').innerHTML), [
    'Por debajo de 1,000: se ejerce el put comprado 1,000; el precio neto de venta queda fijo en 947.726 (348.23 USD/t).',
    'Por encima de 1,000: la opción vence sin valor; el precio neto de venta es el precio del futuro menos 52.274.'
  ]);
});
