'use strict';

/* restore() is the trust boundary: it takes state from a shared link, from
 * localStorage and from an imported file, all of which someone other than the
 * user can write. A crafted link once carried a strike of '"><img onerror=...>'
 * into the legs table, where it ran as script. These tests pin the boundary
 * shut, and pin the escaping in legRowHtml() behind it. */

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState } = require('./helpers/load-app.js');

const app = loadApp();
const { state, newLeg, snapshot, restore, legRowHtml } = app;

const HOSTILE = '"><img src=x onerror="document.title=\'pwned\'">';

const isNumOrNull = x => x === null || (typeof x === 'number' && isFinite(x));

function resetChart() {
  state.chart = { mode: 'payoff', tDays: 0, showLegs: true, range: 40 };
}

test('a hostile strike from a link never reaches the state as a string', () => {
  resetState(app);
  restore({ legs: [{ kind: 'call', side: 1, qty: 1, days: 30, strike: HOSTILE }] });
  // An option with no numeric strike is not a leg, so it is dropped rather
  // than carried through or given an invented strike.
  assert.strictEqual(state.legs.length, 0);
});

test('every leg field from a link is type-checked', () => {
  resetState(app, { days: 45 });
  restore({
    legs: [{
      kind: 'put', side: -1, strike: 100,
      qty: HOSTILE, days: HOSTILE, vol: HOSTILE, under: HOSTILE, entry: HOSTILE, on: HOSTILE
    }]
  });
  const leg = state.legs[0];
  assert.strictEqual(leg.qty, 1, 'qty falls back to 1');
  assert.strictEqual(leg.days, 45, 'days falls back to the panel default');
  assert.strictEqual(leg.vol, null);
  assert.strictEqual(leg.under, null);
  assert.strictEqual(leg.entry, null);
  assert.strictEqual(leg.on, true);
  for (const k of ['qty', 'strike', 'days', 'vol', 'under', 'entry', 'id']) {
    assert.ok(isNumOrNull(leg[k]), `${k} should be a number or null, got ${JSON.stringify(leg[k])}`);
  }
});

test('a link cannot choose a leg id', () => {
  resetState(app);
  restore({ legs: [{ kind: 'call', strike: 100, days: 30, id: HOSTILE }] });
  assert.strictEqual(typeof state.legs[0].id, 'number');
  restore({ legs: [{ kind: 'call', strike: 100, days: 30, id: 424242 }] });
  assert.notStrictEqual(state.legs[0].id, 424242, 'even a numeric id is assigned fresh');
});

test('kind and side come from a whitelist', () => {
  resetState(app);
  restore({
    legs: [
      { kind: 'banana', side: '-1', strike: 100, days: 30 },
      { kind: 'underlying', side: -1 }
    ]
  });
  assert.strictEqual(state.legs[0].kind, 'call', 'unknown kind falls back to call');
  assert.strictEqual(state.legs[0].side, 1, 'a string "-1" is not -1');
  assert.strictEqual(state.legs[1].kind, 'underlying');
  assert.strictEqual(state.legs[1].side, -1);
});

test('hostile top-level fields leave the state as it was', () => {
  resetState(app, { commodity: 'cocoa', model: 'bs', quote: 'cents', S: 5000, days: 60 });
  resetChart();
  restore({
    commodity: '__proto__', model: 'evil', quote: HOSTILE,
    S: 'abc', vol: HOSTILE, days: HOSTILE, size: [100],
    chart: { mode: 'constructor', tDays: HOSTILE, range: '40', showLegs: 'yes' },
    skew: { on: true, rr: '-5', bf: HOSTILE },
    scenario: { volShift: HOSTILE, pricePct: '20' }
  });
  assert.strictEqual(state.commodity, 'cocoa');
  assert.strictEqual(state.model, 'bs');
  assert.strictEqual(state.quote, 'cents');
  assert.strictEqual(state.S, 5000);
  assert.strictEqual(state.days, 60);
  assert.strictEqual(state.size, 100);
  assert.strictEqual(state.chart.mode, 'payoff');
  assert.strictEqual(state.chart.tDays, 0);
  assert.strictEqual(state.chart.range, 40);
  assert.strictEqual(state.chart.showLegs, true);
  // A string that merely looks numeric is still not what snapshot() writes.
  assert.strictEqual(state.skew.rr, 0);
  assert.strictEqual(state.skew.bf, 0);
  assert.strictEqual(state.scenario.volShift, 5);
  assert.strictEqual(state.scenario.pricePct, 20);
});

test('a commodity key must be the table\'s own, not an inherited one', () => {
  resetState(app, { commodity: 'gold' });
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    restore({ commodity: key });
    assert.strictEqual(state.commodity, 'gold', `${key} must not be accepted`);
  }
  restore({ commodity: ['cocoa'] });
  assert.strictEqual(state.commodity, 'gold', 'an array that coerces to a key is rejected');
  restore({ commodity: 'cocoa' });
  assert.strictEqual(state.commodity, 'cocoa', 'a real key still restores');
});

test('a legitimate scenario round-trips through a link unchanged', () => {
  // The boundary must not cost a genuine user anything. Build a scenario that
  // touches every restored field, save it, restore it, save it again.
  resetState(app, {
    commodity: 'cocoa', model: 'bs', style: 'american', quote: 'USD',
    S: 5560, vol: 42.5, rate: 3.9, yield: -3.59, days: 90, size: 10,
    skew: { on: true, rr: -6.5, bf: 1.25 },
    scenario: { volShift: 8, pricePct: 35 },
    financing: { mode: 'custom', rate: 6.25 }
  });
  state.chart = { mode: 'vega', tDays: 12, showLegs: false, range: 55 };
  state.legs = [
    newLeg({ kind: 'call', side: 1, qty: 2, strike: 5600, days: 90, vol: null, under: 5665, entry: null }),
    newLeg({ kind: 'put', side: -1, qty: 1, strike: 5400, days: 180, vol: 47.25, under: null, entry: 312.5 }),
    newLeg({ kind: 'underlying', side: 1, qty: 1, strike: 0, days: 90, under: 5716, on: false })
  ];

  const before = JSON.stringify(snapshot());
  resetState(app);
  resetChart();
  state.legs = [];
  assert.ok(restore(JSON.parse(before)));
  const after = JSON.stringify(snapshot());
  assert.strictEqual(after, before);
});

test('restore refuses anything that is not an object', () => {
  for (const bad of [null, undefined, 'string', 42, true]) {
    assert.strictEqual(restore(bad), false, `restore(${JSON.stringify(bad)})`);
  }
});

test('legRowHtml escapes every value it interpolates', () => {
  // Bypass restore() on purpose: the row builder must hold even if some other
  // path ever hands it a leg with the wrong types.
  resetState(app, { S: 100 });
  const leg = newLeg({ kind: 'call', strike: HOSTILE, vol: HOSTILE, under: HOSTILE, entry: HOSTILE });
  leg.id = HOSTILE;
  const html = legRowHtml(leg, 100);
  assert.ok(!html.includes('<img'), 'no raw <img> survives');
  assert.ok(!html.includes('onerror="'), 'no attribute can be opened by the payload');
  assert.ok(html.includes('&lt;img'), 'the payload is present, but as text');
  assert.ok(html.includes('&quot;'), 'its quotes are escaped');
});

test('legRowHtml still renders an ordinary leg as before', () => {
  resetState(app, { S: 100, vol: 30, rate: 5 });
  const leg = newLeg({ kind: 'put', side: -1, qty: 2, strike: 95, days: 60 });
  const html = legRowHtml(leg, 100);
  assert.ok(html.includes(`data-id="${leg.id}"`));
  assert.ok(html.includes('value="95"'), 'the strike is in its input');
  assert.ok(html.includes('value="2"'), 'the quantity is in its input');
  assert.ok(/<option value="-1" selected>Short<\/option>/.test(html), 'short is selected');
  assert.ok(/<option value="put" selected>Put<\/option>/.test(html), 'put is selected');
});
