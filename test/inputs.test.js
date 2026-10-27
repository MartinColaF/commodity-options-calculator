'use strict';

/* What a number may be. A price, strike or size at or below zero, or a
 * negative volatility, used to reach the pricer from every place a number comes
 * in, without a word: a price of -100 valued a 4000 put at 4086.54, above its
 * strike, and a size of -100 swapped the maximum profit and loss. Now
 * inputProblem() is the one rule, and the panel, the legs table and a restored
 * scenario all refuse what it refuses - the panel and the table saying why,
 * beside the field. A quote below zero is in actions.test.js. */

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState, wired } = require('./helpers/load-app.js');

const app = loadApp();
const { state } = app;

test('a price, strike or size must be above zero, and a volatility not below it', () => {
  for (const key of ['S', 'under', 'strike', 'size']) {
    assert.strictEqual(app.inputProblem(key, 0.01), '', key + ' above zero');
    assert.match(app.inputProblem(key, 0), /must be above zero/, key + ' at zero');
    assert.match(app.inputProblem(key, -37.63), /must be above zero/, key + ' below zero');
  }
  assert.match(app.inputProblem('S', -1), /lognormal and cannot price a contract at or below zero/,
    'a price says why: the models cannot take one');
  assert.strictEqual(app.inputProblem('vol', 0), '', 'no volatility prices the intrinsic value');
  assert.match(app.inputProblem('vol', -0.5), /Volatility cannot be negative/);
  assert.strictEqual(app.inputProblem('rate', -2), '', 'a negative rate is a rate');
  assert.strictEqual(app.inputProblem('yield', -2), '', 'and a negative yield a yield');
  for (const v of [NaN, Infinity, '4000', null, undefined]) {
    assert.match(app.inputProblem('S', v), /Enter a number/, String(v));
    assert.match(app.inputProblem('rate', v), /Enter a number/, 'any key: ' + String(v));
  }
});

test('a scenario cannot bring back a price, size or volatility the pricer cannot take', () => {
  resetState(app);
  app.restore({ S: -100, vol: -10, size: 0, rate: -0.5, yield: -1 });
  assert.strictEqual(state.S, 4000, 'the price stays');
  assert.strictEqual(state.vol, 15, 'the volatility stays');
  assert.strictEqual(state.size, 100, 'the size stays');
  assert.strictEqual(state.rate, -0.5, 'a negative rate is taken');
  assert.strictEqual(state.yield, -1, 'and so is a negative yield');

  app.restore({ S: 3500, vol: 0, size: 10 });
  assert.deepStrictEqual([state.S, state.vol, state.size], [3500, 0, 10]);
});

test('a restored option with no strike above zero is not a leg; a bad volatility or price is left blank', () => {
  resetState(app);
  app.restore({
    legs: [
      { kind: 'put', strike: 0 },
      { kind: 'call', strike: -50 },
      { kind: 'call', strike: 4100, vol: -10, under: 0, entry: 12 },
      { kind: 'call', strike: 4200, vol: 0, under: 4050 },
      { kind: 'underlying', strike: 0 }
    ]
  });
  assert.deepStrictEqual(state.legs.map(l => l.kind + ' ' + l.strike), ['call 4100', 'call 4200', 'underlying 0'],
    'an underlying has no strike to check');
  const [bad, good] = state.legs;
  assert.strictEqual(bad.vol, null, 'the panel\'s volatility instead');
  assert.strictEqual(bad.under, null, 'the panel\'s contract instead');
  assert.strictEqual(bad.entry, 12, 'the rest of the leg is kept');
  assert.strictEqual(good.vol, 0);
  assert.strictEqual(good.under, 4050);
});

test('the panel refuses a price, volatility or size the pricer cannot take, and says why beside the field', () => {
  const { app: page, el, fire } = wired();
  const s = page.state;
  const type = (id, value) => {
    el(id).value = value;
    fire(id, 'input');
  };
  const commit = (id, value) => {
    type(id, value);
    fire(id, 'change');
  };

  type('spot', '-100');
  assert.strictEqual(s.S, 4000, 'typed, it never reaches the state');
  assert.strictEqual(el('spotProblem').textContent, '', 'and nothing is said before it is committed');
  fire('spot', 'change');
  assert.match(el('spotProblem').textContent,
    /^A price must be above zero: these models are lognormal .* Still using 4000\.$/);
  assert.strictEqual(String(el('spot').value), '4000', 'the field goes back to the price in use');
  assert.strictEqual(el('dataStatus').textContent, '', 'beside the field, not on the status line a card away');

  type('spot', '3');
  assert.strictEqual(el('spotProblem').textContent, '', 'typing again clears the reason');
  assert.strictEqual(s.S, 3, 'and a good number goes through');

  commit('vol', '-5');
  assert.strictEqual(s.vol, 15);
  assert.strictEqual(el('volProblem').textContent, 'Volatility cannot be negative. Still using 15%.');
  commit('vol', '0');
  assert.strictEqual(s.vol, 0, 'no volatility is a volatility');
  assert.strictEqual(el('volProblem').textContent, '');

  commit('size', '0');
  assert.strictEqual(s.size, 100);
  assert.strictEqual(el('sizeProblem').textContent, 'Units per contract must be above zero. Still using 100.');
  commit('size', '-100');
  assert.strictEqual(s.size, 100, 'a negative size would swap profit and loss');

  commit('rate', '-0.5');
  assert.strictEqual(s.rate, -0.5, 'a negative rate is taken');
});

test('a reason lasts until the next thing the user does, which may change its field', () => {
  const { app: page, el, fire } = wired();
  const s = page.state;
  const refuseSize = () => {
    el('size').value = '0';
    fire('size', 'input');
    fire('size', 'change');
    assert.match(el('sizeProblem').textContent, /Still using 100\./);
  };

  refuseSize();
  fire('summary', 'click');
  assert.match(el('sizeProblem').textContent, /Still using 100\./,
    'a click that is not on a button - the one that took the focus off the field - leaves it');

  // A new market sets a new size, and "still using 100" would no longer be true.
  el('commodity').value = 'wti';
  fire('commodity', 'change');
  assert.strictEqual(s.size, 1000);
  assert.strictEqual(el('sizeProblem').textContent, '');

  s.commodity = 'gold';
  s.size = 100;
  refuseSize();
  const button = { closest: sel => (sel === 'button' ? {} : null) };
  fire('usePreset', 'click', button);
  assert.strictEqual(el('sizeProblem').textContent, '', 'a button anywhere clears it too');
});

test('the legs table refuses a strike, volatility or price the pricer cannot take, and says why under it', () => {
  const { app: page, el, fire } = wired();
  const s = page.state;
  s.legs = [page.newLeg({ kind: 'put', strike: 3900, days: 30 })];
  const leg = s.legs[0];
  // The table commits a field on change, which bubbles up to its body.
  const edit = (f, value) => fire('legsBody', 'change', {
    dataset: { f }, value, closest: () => ({ dataset: { id: String(leg.id) } })
  });

  edit('strike', '-50');
  assert.strictEqual(leg.strike, 3900);
  assert.strictEqual(el('legProblem').textContent, 'A strike must be above zero. The leg keeps its previous value.');
  assert.match(el('legsBody').innerHTML, /data-f="strike" value="3900"/, 'the table, drawn again, shows the strike in use');

  edit('vol', '-10');
  assert.strictEqual(leg.vol, null);
  assert.match(el('legProblem').textContent, /^Volatility cannot be negative\./);

  edit('under', '0');
  assert.strictEqual(leg.under, null);
  assert.match(el('legProblem').textContent, /^A price must be above zero/);

  edit('strike', '4100');
  assert.strictEqual(leg.strike, 4100);
  assert.strictEqual(el('legProblem').textContent, '', 'the next edit that goes through clears the reason');

  edit('vol', '0');
  assert.strictEqual(leg.vol, 0);
  edit('under', '3950');
  assert.strictEqual(leg.under, 3950);
  edit('vol', '');
  edit('under', '');
  assert.strictEqual(leg.vol, null, 'a blank still means the panel\'s volatility');
  assert.strictEqual(leg.under, null, 'and the panel\'s contract');

  edit('strike', '0');
  assert.notStrictEqual(el('legProblem').textContent, '');
  el('strategy').value = 'long-call';
  fire('strategy', 'change');
  assert.strictEqual(el('legProblem').textContent, '', 'a new set of legs is not the leg it was about');
});
