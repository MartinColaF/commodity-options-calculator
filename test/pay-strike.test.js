'use strict';

/* The strike that pays for the hedge. A producer buys a put and asks which call
 * to sell so the collar costs nothing, or which lower put a fence can sell; a
 * spreadsheet answers with one volatility for every strike. The page moves the
 * strike of the leg chosen until the position's premiums come to the cost asked,
 * each strike at its own volatility, and lands on a listed strike when told the
 * interval strikes are listed at. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');
const SPANISH = require('../es/words.js');

/* The product review's case: soybeans at 1050 cents, a 1000 put and a 1100
 * call at 60 days, 18% volatility, 4%, American. */
function collar(page) {
  const { app } = page;
  Object.assign(app.state, {
    commodity: 'soybean', model: 'b76', style: 'american', S: 1050, size: 5000, quote: 'cents',
    vol: 18, rate: 4, days: 60
  });
  app.state.legs = [
    app.newLeg({ kind: 'underlying', side: 1, strike: 0, days: 60 }),
    app.newLeg({ kind: 'put', side: 1, strike: 1000, days: 60 }),
    app.newLeg({ kind: 'call', side: -1, strike: 1100, days: 60 })
  ];
  return { put: app.state.legs[1], call: app.state.legs[2] };
}

test('the call that pays for the put, exactly and on a listed strike', () => {
  const page = wired();
  const { app } = page;
  const { put, call } = collar(page);
  assert.strictEqual(app.legEntry(put).toFixed(2), '11.20');
  const exact = app.strikeForCost(call, 0);
  assert.strictEqual(exact.strike.toFixed(2), '1104.89');
  assert.ok(Math.abs(exact.cost) < 1e-6, `costs nothing there: ${exact.cost}`);
  // On strikes 5 cents apart, 1100 is the nearest that costs no more: a net
  // credit of 1.17 cents a bushel, $58.49 a contract. 1105 would cost money.
  const listed = app.strikeOnGrid(call, 0, exact.strike, 5);
  assert.strictEqual(listed.strike, 1100);
  assert.strictEqual(listed.cost.toFixed(2), '-58.49');
  assert.ok(app.costWithStrike(call)(1105) > 0);
  // A target other than zero: a collar that may cost $100.
  const paid = app.strikeForCost(call, 100);
  assert.ok(paid.strike > exact.strike && Math.abs(paid.cost - 100) < 1e-6);
});

test('with the skew on each strike is priced at its own volatility, and the strike moves', () => {
  const page = wired();
  const { app } = page;
  const { call } = collar(page);
  const flat = app.strikeForCost(call, 0).strike;
  app.state.skew = { on: true, rr: -3, bf: 1 };
  const skewed = app.strikeForCost(call, 0);
  assert.ok(Math.abs(skewed.strike - flat) > 5, `${skewed.strike} against ${flat}`);
  assert.ok(Math.abs(skewed.cost) < 1e-6);
  // Priced at the curve's volatility at that strike, not the panel's 18%.
  const there = Object.assign({}, call, { strike: skewed.strike });
  assert.notStrictEqual(app.legVolPct(there).toFixed(2), '18.00');
});

test('the strike moves and the entry for the old one goes; the other legs keep theirs', () => {
  const page = wired();
  const { app } = page;
  const { put, call } = collar(page);
  put.entry = 14; // the price paid for the put on a broker's screen
  call.entry = 9;  // typed for the 1100 call, no longer this leg's
  const r = app.applyStrikeForCost(call.id, 0, 0);
  assert.strictEqual(r.kind, 'ok');
  assert.strictEqual(call.entry, null);
  assert.strictEqual(put.entry, 14);
  // The call now pays for 14 cents, not the put's 11.20 theoretical.
  assert.ok(Math.abs(app.legEntry(call) - 14) < 0.001, app.legEntry(call));
  assert.ok(call.strike < 1104, call.strike);
  // Shown to the price's decimals, on the side that costs no more: zero, or a
  // cent of credit.
  assert.match(r.message, /^Leg 3 set to a strike of [\d,.]+, where the premiums come to the cost asked\. /);
  assert.match(r.message, /(Net cost: zero|Net credit \(received\): \$0\.0\d)\.$/);
  assert.ok(app.netCost() <= 0);
  // Shown to the price's decimals: a tick of 1/8 cent takes three.
  assert.strictEqual(String(call.strike).split('.')[1].length <= 3, true);
});

test('on a grid it says the exact strike and what the listed one costs', () => {
  const page = wired();
  const { app } = page;
  const { call } = collar(page);
  const r = app.applyStrikeForCost(call.id, 0, 5);
  assert.strictEqual(call.strike, 1100);
  assert.strictEqual(r.message, 'Leg 3 set to a strike of 1,100: the cost asked is met exactly at 1,104.888, and ' +
    '1,100 is the nearest strike every 5 that costs no more. Net credit (received): $58.49.');
});

test('when no strike reaches the cost, it says how far it can go and changes nothing', () => {
  const page = wired();
  const { app } = page;
  const { call } = collar(page);
  app.applyStrikeForCost(call.id, 0, 5); // the call already pays for the put
  app.state.legs.splice(2, 0, app.newLeg({ kind: 'put', side: -1, strike: 950, days: 60 }));
  const lower = app.state.legs[2];
  const before = JSON.stringify(app.state.legs);
  // Selling the lower put only adds credit: the most the premiums come to is
  // what they come to with that put worth nothing.
  const r = app.applyStrikeForCost(lower.id, 0, 0);
  assert.strictEqual(r.kind, 'err');
  assert.match(r.message, /^No strike of leg 3 brings the premiums to \$0\.00: moving it, the most they come to is −\$58\.\d\d\.$/);
  assert.strictEqual(JSON.stringify(app.state.legs), before);
  const far = app.applyStrikeForCost(call.id, -1e9, 0);
  assert.match(far.message, /the least they come to is −\$[\d,.]+\.$/);
});

test('only an included option leg can be moved', () => {
  const page = wired();
  const { app } = page;
  const { call } = collar(page);
  const physical = app.state.legs[0];
  for (const id of [physical.id, 'nope', '']) {
    assert.strictEqual(app.applyStrikeForCost(id, 0, 0).message, 'Choose an option leg that is included in the strategy.');
  }
  call.on = false;
  assert.strictEqual(app.applyStrikeForCost(call.id, 0, 0).kind, 'err');
});

test('the choice offers the included options and falls on the one sold last', () => {
  const page = wired();
  const { app, el } = page;
  app.renderLegs();
  assert.strictEqual(el('payLeg').innerHTML, '<option value="">No option legs yet</option>');
  assert.strictEqual(el('payLeg').disabled, true);
  assert.strictEqual(el('payStrike').disabled, true);
  const { call } = collar(page);
  app.renderLegs();
  const options = Array.from(el('payLeg').innerHTML.matchAll(/<option value="(\d+)"( selected)?>([^<]+)</g));
  assert.deepStrictEqual(options.map(o => o[3]), ['Leg 2: Long Put 1,000', 'Leg 3: Short Call 1,100']);
  assert.strictEqual(options.find(o => o[2])[1], String(call.id), 'the call, which pays');
  assert.strictEqual(el('payStrike').disabled, false);
  // A choice made stays while its leg does.
  el('payLeg').value = String(app.state.legs[1].id);
  app.renderLegs();
  assert.match(el('payLeg').innerHTML, new RegExp(`value="${app.state.legs[1].id}" selected`));
});

test('the button: blank means zero cost and the exact strike; a bad interval is refused beside the table', () => {
  const page = wired();
  const { app, el, fire } = page;
  const { call } = collar(page);
  app.renderLegs();
  el('payLeg').value = String(call.id);
  fire('payStrike', 'click');
  assert.strictEqual(call.strike.toFixed(3), '1104.888');
  assert.match(el('legStatus').textContent, /^Leg 3 set to a strike of 1,104\.888/);
  el('payStep').value = '-5';
  fire('payStrike', 'click');
  assert.strictEqual(el('legProblem').textContent,
    'Enter the interval strikes are listed at, above zero, or leave it blank for the exact strike.');
  assert.strictEqual(el('payStep').getAttribute('aria-invalid'), 'true');
  assert.strictEqual(call.strike.toFixed(3), '1104.888', 'nothing moved');
  el('payStep').value = '5';
  el('payTarget').value = 'abc';
  fire('payStrike', 'click');
  assert.strictEqual(el('legProblem').textContent, 'Enter a number.');
  el('payTarget').value = '';
  fire('payStrike', 'click');
  assert.strictEqual(call.strike, 1100);
});

test('and in Spanish', () => {
  const page = wired({ lang: 'es', words: { es: SPANISH } });
  const { app, el } = page;
  const { call } = collar(page);
  app.renderLegs();
  assert.match(el('payLeg').innerHTML, />Pata 3: Venta Call 1,100</);
  assert.strictEqual(app.applyStrikeForCost(call.id, 0, 5).message, 'Pata 3 con strike 1,100: el costo pedido se ' +
    'cumple exacto en 1,104.888, y 1,100 es el strike más cercano, de los listados cada 5, que no cuesta más. ' +
    'Crédito neto (cobrado): $58.49.');
});
