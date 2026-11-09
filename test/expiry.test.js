'use strict';

/* When a listed month's options stop trading. The option on a futures month
 * expires before the future: December corn options on Nov 20, 2026, the future
 * on Dec 14. Priced to mid-December, as the page did, an at-the-money call read
 * 57% dearer. Picking a listed month now sets the days to the option's own
 * expiry. Every test says what time it is. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');
const EXPIRIES = require('../expiries.js');
const COMMODITIES = require('../commodities.js');
const SPANISH = require('../es/words.js');

const at = iso => Date.parse(iso);

test('ICE\'s option expiries are as it lists them, each the regular option on a futures month', () => {
  // From each product's expiry page on ice.com, checked 2026-11-09: the option
  // named for its futures month, which is the last to expire on it.
  const listed = {
    'ice-sugar-11': {
      H27: '2/16/2027', K27: '4/15/2027', N27: '6/15/2027', V27: '9/15/2027', H28: '2/15/2028', K28: '4/17/2028',
      N28: '6/15/2028', V28: '9/15/2028', H29: '2/15/2029', K29: '4/16/2029', N29: '6/15/2029', V29: '9/17/2029'
    },
    'ice-coffee-c': {
      Z26: '11/12/2026', H27: '2/10/2027', K27: '4/9/2027', N27: '6/11/2027', U27: '8/13/2027', Z27: '11/12/2027',
      H28: '2/11/2028'
    },
    'ice-cocoa': {
      Z26: '11/13/2026', H27: '2/12/2027', K27: '4/9/2027', N27: '6/11/2027', U27: '8/13/2027', Z27: '11/12/2027',
      H28: '2/11/2028', K28: '4/13/2028', N28: '6/9/2028', U28: '8/11/2028'
    },
    'ice-cotton-2': {
      Z26: '11/13/2026', H27: '2/5/2027', K27: '4/16/2027', N27: '6/11/2027', V27: '9/10/2027', Z27: '11/12/2027',
      H28: '2/11/2028', K28: '4/13/2028', N28: '6/9/2028', V28: '9/15/2028', Z28: '11/10/2028', H29: '2/9/2029',
      K29: '4/13/2029', N29: '6/8/2029', V29: '9/14/2029'
    }
  };
  const iso = us => { const [m, d, y] = us.split('/'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };
  for (const [name, dates] of Object.entries(listed)) {
    const cal = EXPIRIES[name];
    assert.strictEqual(cal.exchange, 'ICE Futures U.S.', name);
    assert.deepStrictEqual(cal.dates, Object.fromEntries(Object.entries(dates).map(([k, v]) => [k, iso(v)])), name);
    // Each in the month before its futures month, on a weekday that is not a
    // holiday.
    const market = Object.values(COMMODITIES).find(c => c.optionExpiry === name);
    for (const [key, date] of Object.entries(cal.dates)) {
      assert.ok(market.futures.months.includes(key[0]), `${name} ${key}: a listed futures month`);
      const d = new Date(date + 'T00:00:00Z');
      assert.strictEqual((d.getUTCMonth() + 2 - 1) % 12 + 1, 'FGHJKMNQUVXZ'.indexOf(key[0]) + 1, `${name} ${key}`);
      assert.ok(d.getUTCDay() % 6 !== 0 && !EXPIRIES['cbot-grains'].holidays.includes(date), `${name} ${key} ${date}`);
    }
  }
  // Sugar's rule is simple enough to check: the 15th of the month before, or
  // the next business day. February 15, 2027 is Presidents Day.
  const holidays = EXPIRIES['cbot-grains'].holidays;
  for (const [key, date] of Object.entries(EXPIRIES['ice-sugar-11'].dates)) {
    const year = 2000 + Number(key.slice(1));
    let d = new Date(Date.UTC(year, 'FGHJKMNQUVXZ'.indexOf(key[0]) - 1, 15));
    while (d.getUTCDay() % 6 === 0 || holidays.includes(d.toISOString().slice(0, 10))) d = new Date(d.getTime() + 86400000);
    assert.strictEqual(date, d.toISOString().slice(0, 10), key);
  }
});

test('the US exchange holidays are NYSE\'s for 2026 to 2028, and ICE\'s for its softs in 2026', () => {
  const holidays = EXPIRIES['cbot-grains'].holidays;
  // ICE Futures U.S. 2026 Trading Holiday Calendar (June 9, 2025): the days
  // its softs are closed.
  const ice2026 = ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03',
    '2026-09-07', '2026-11-26', '2026-12-25'];
  assert.deepStrictEqual(holidays.filter(d => d.startsWith('2026')), ice2026);
  assert.strictEqual(holidays.filter(d => d.startsWith('2027')).length, 10);
  // New Year's Day 2028 is a Saturday, and not observed.
  assert.strictEqual(holidays.filter(d => d.startsWith('2028')).length, 9);
  assert.ok(!holidays.includes('2027-12-31'));
  for (const d of holidays) assert.ok(new Date(d + 'T00:00:00Z').getUTCDay() % 6 !== 0, `${d} is a weekday`);
  assert.strictEqual(EXPIRIES['cbot-grains'].through, '2028-12-31');
});

test('the CBOT grains expire on the last Friday at least two business days before the month before ends', () => {
  const { app } = wired();
  const date = (key, symbol) => app.optionExpiry(key, symbol).date;
  // The product review's: December 2026 corn on Nov 20, not Nov 27, which is
  // one business day before Nov 30.
  assert.strictEqual(date('corn', 'ZCZ26.CBT'), '2026-11-20');
  // As StoneX's daily options reports have them: July grain options on
  // Jun 26, 2026, August soybeans on Jul 24.
  assert.strictEqual(date('corn', 'ZCN26.CBT'), '2026-06-26');
  assert.strictEqual(date('soybean', 'ZSQ26.CBT'), '2026-07-24');
  // Christmas 2026 is the Friday, so January soybeans go on the Thursday.
  assert.strictEqual(date('soybean', 'ZSF27.CBT'), '2026-12-24');
  // November 30, 2027 is a Tuesday: the Friday after Thanksgiving is two
  // business days before it, and counts.
  assert.strictEqual(date('wheat', 'ZWZ27.CBT'), '2027-11-26');
  // A leap February ends on a Tuesday.
  assert.strictEqual(date('corn', 'ZCH28.CBT'), '2028-02-25');
  // New Year's Day 2028 is not observed, so 2027 ends on a business day.
  assert.strictEqual(date('soybean', 'ZSF28.CBT'), '2027-12-23');
  // Past the holidays the page knows, no date.
  const far = app.optionExpiry('corn', 'ZCH29.CBT');
  assert.strictEqual(far.date, '');
  assert.strictEqual(far.last, '2028-12-31');
  assert.strictEqual(far.listed, false);
  assert.strictEqual(far.exchange, 'CBOT');
});

test('only the markets with a calendar have one; a symbol must name a month', () => {
  const { app } = wired();
  const follows = {
    corn: 'cbot-grains', wheat: 'cbot-grains', soybean: 'cbot-grains',
    sugar: 'ice-sugar-11', coffee: 'ice-coffee-c', cocoa: 'ice-cocoa', cotton: 'ice-cotton-2'
  };
  for (const [key, c] of Object.entries(COMMODITIES)) {
    assert.strictEqual(c.optionExpiry, follows[key], key);
    if (c.optionExpiry) assert.ok(Object.prototype.hasOwnProperty.call(EXPIRIES, c.optionExpiry), key);
  }
  assert.strictEqual(app.optionExpiry('gold', 'GCZ26.CMX'), null);
  for (const symbol of ['', 'GC1', 'ZC=F', 'ZCZ26', '<img>']) assert.strictEqual(app.optionExpiry('corn', symbol), null, symbol);
  assert.strictEqual(app.optionExpiry('__proto__', 'ZCZ26.CBT'), null);
  // An ICE month past its list has no date either.
  assert.deepStrictEqual([app.optionExpiry('coffee', 'KCK28.NYB').date, app.optionExpiry('coffee', 'KCK28.NYB').last], ['', '2028-02-11']);
});

test('the days count in the exchange\'s own time zone', () => {
  const { app } = wired();
  assert.strictEqual(app.daysToDate('2026-11-20', 'America/Chicago', at('2026-11-03T15:00:00Z')), 17);
  // 11 p.m. on Nov 19 in Chicago is still the day before; half past midnight is the day.
  assert.strictEqual(app.daysToDate('2026-11-20', 'America/Chicago', at('2026-11-20T05:00:00Z')), 1);
  assert.strictEqual(app.daysToDate('2026-11-20', 'America/Chicago', at('2026-11-20T06:30:00Z')), 0);
  assert.strictEqual(app.daysToDate('2026-11-12', 'America/New_York', at('2026-11-13T12:00:00Z')), -1);
});

/* Corn at 430 cents, 25% volatility, 4%, American, with December listed. */
function corn(page) {
  const { app } = page;
  Object.assign(app.state, { commodity: 'corn', model: 'b76', style: 'american', S: 430, size: 5000, quote: 'cents', vol: 25, rate: 4, days: 30 });
  app.state.session.strip = [
    { symbol: 'ZCZ26.CBT', name: 'Corn Dec 26', price: 430, currency: 'USX', expiry: '2026-12-15' },
    { symbol: 'ZCH29.CBT', name: 'Corn Mar 29', price: 470, currency: 'USX', expiry: '2029-03-15' }
  ];
}

test('picking a listed month sets the days to its options\' expiry, and the legs on them follow', () => {
  const page = wired();
  const { app } = page;
  corn(page);
  app.state.legs = [
    app.newLeg({ kind: 'call', side: 1, strike: 430, days: 30 }),
    app.newLeg({ kind: 'call', side: -1, strike: 460, days: 90 })
  ];
  const r = app.useContractMonth('ZCZ26.CBT', at('2026-11-03T15:00:00Z'));
  assert.strictEqual(app.state.days, 17);
  assert.deepStrictEqual(app.state.legs.map(l => l.days), [17, 90], 'a leg on its own expiry keeps it');
  assert.strictEqual(r.message, 'Days to expiry set to 17: the Dec 2026 options stop trading on Fri, Nov 20, 2026.');
  // What it was worth getting right: the call at the money at 17 days and at
  // the 42 to mid-December.
  const call = app.state.legs[0];
  assert.strictEqual(app.legValue(call).toFixed(2), '9.24');
  assert.strictEqual(app.legValue(Object.assign({}, call, { days: 42 })).toFixed(2), '14.49');
  // Typing in the Days field moves the legs the same way.
  app.setDefaultDays(20);
  assert.deepStrictEqual(app.state.legs.map(l => l.days), [20, 90]);
});

test('a month the page cannot date, or whose options have expired, keeps the days, and the note says why', () => {
  const page = wired();
  const { app, el } = page;
  corn(page);
  const now = at('2026-11-03T15:00:00Z');
  assert.strictEqual(app.useContractMonth('ZCH29.CBT', now).message, '');
  assert.strictEqual(app.state.days, 30);
  assert.strictEqual(app.expiryLine('ZCH29.CBT', now),
    'The page\'s calendar of these options goes only to Dec 31, 2028: enter the days to the Mar 2029 options\' expiry.');
  assert.strictEqual(app.useContractMonth('ZCZ26.CBT', at('2026-11-25T15:00:00Z')).message, '');
  assert.strictEqual(app.state.days, 30);
  assert.strictEqual(app.expiryLine('ZCZ26.CBT', at('2026-11-25T15:00:00Z')),
    'The regular Dec 2026 options stopped trading on Fri, Nov 20, 2026.');
  assert.strictEqual(app.expiryLine('ZCZ26.CBT', now), 'The Dec 2026 options stop trading on Fri, Nov 20, 2026, by CBOT\'s rule.');
  // The front month says nothing; a market without a calendar says so.
  assert.strictEqual(app.expiryLine('', now), '');
  Object.assign(app.state, { commodity: 'gold' });
  assert.strictEqual(app.expiryLine('GCZ26.CMX', now),
    'The page does not have this market\'s option expiries: enter the days to the expiry of the options you price.');
  Object.assign(app.state, { commodity: 'coffee' });
  assert.strictEqual(app.expiryLine('KCH27.NYB', now), 'The Mar 2027 options stop trading on Wed, Feb 10, 2027, as ICE Futures U.S. lists them.');
  // Under the days field, while a month is picked.
  app.state.contractMonth = 'KCH27.NYB';
  app.renderInputs();
  assert.strictEqual(el('expiryInfo').hidden, false);
  assert.match(el('expiryInfo').textContent, /^The Mar 2027 options stop trading on Wed, Feb 10, 2027/);
  app.state.contractMonth = '';
  app.renderInputs();
  assert.strictEqual(el('expiryInfo').hidden, true);
});

test('the picker sets the days and says so under itself', () => {
  const page = wired();
  const { app, el, fire } = page;
  corn(page);
  app.renderMonths();
  el('contractMonth').value = 'ZCZ26.CBT';
  fire('contractMonth', 'change');
  // The wiring reads the clock, so the days are whatever is left to Nov 20,
  // 2026 today, and nothing once it has passed.
  const left = app.daysToDate('2026-11-20', 'America/Chicago', Date.now());
  if (left >= 0) {
    assert.strictEqual(app.state.days, left);
    assert.match(el('monthStatus').textContent, new RegExp(`^Days to expiry set to ${left}: the Dec 2026 options`));
  } else {
    assert.strictEqual(app.state.days, 30);
    assert.strictEqual(el('monthStatus').textContent, '');
  }
});

test('and in Spanish', () => {
  const page = wired({ lang: 'es', words: { es: SPANISH } });
  const { app } = page;
  corn(page);
  const now = at('2026-11-03T15:00:00Z');
  assert.strictEqual(app.useContractMonth('ZCZ26.CBT', now).message,
    'Días al vencimiento: 17. Las opciones dic 2026 dejan de operarse el vie, 20 nov 2026.');
  assert.strictEqual(app.expiryLine('ZCZ26.CBT', now), 'Las opciones dic 2026 dejan de operarse el vie, 20 nov 2026, según la regla de CBOT.');
  Object.assign(app.state, { commodity: 'cotton' });
  assert.strictEqual(app.expiryLine('CTH27.NYB', now),
    'Según el calendario de ICE Futures U.S., las opciones mar 2027 dejan de operarse el vie, 5 feb 2027.');
});
