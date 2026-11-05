'use strict';

/* The reports before the horizon. Grain options move on USDA's WASDE, released
 * at 12:00 ET on a published calendar, and how many fall before the horizon is
 * what a desk asks first. The page says it under the results. The calendar
 * runs out, so every test here says what time it is, and none depends on the
 * day it runs. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');
const REPORTS = require('../events.js');
const COMMODITIES = require('../commodities.js');
const SPANISH = require('../es/words.js');

const at = iso => Date.parse(iso);
const DAY = 86400000;

test('the WASDE dates are USDA\'s, each at 12:00 in Washington on a weekday', () => {
  // As listed on usda.gov's WASDE page, checked 2026-11-05.
  const listed = {
    2026: ['01-12', '02-10', '03-10', '04-09', '05-12', '06-11', '07-10', '08-12', '09-11', '10-09', '11-10', '12-10'],
    2027: ['01-12', '02-10', '03-10', '04-09', '05-12', '06-11', '07-09', '08-12', '09-10', '10-08', '11-10', '12-10']
  };
  const expected = Object.keys(listed).reduce((all, y) => all.concat(listed[y].map(d => `${y}-${d}`)), []);
  const washington = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
  });
  const parts = ms => Object.fromEntries(washington.formatToParts(ms).map(p => [p.type, p.value]));
  const releases = REPORTS.wasde.releases;
  assert.deepStrictEqual(releases.map(r => r.slice(0, 10)), expected);
  for (const r of releases) {
    const p = parts(at(r));
    // The offset is the one Washington keeps that day, daylight saving or not.
    assert.strictEqual(`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`, `${r.slice(0, 10)} 12:00`, r);
    assert.ok(!['Sat', 'Sun'].includes(p.weekday), r);
  }
  assert.deepStrictEqual(releases.slice().sort((x, y) => at(x) - at(y)), releases, 'in order');
});

test('the grains, the oilseeds and cotton follow the WASDE; no other market does', () => {
  for (const [key, c] of Object.entries(COMMODITIES)) {
    for (const r of c.reports || []) assert.ok(Object.prototype.hasOwnProperty.call(REPORTS, r), `${key}: ${r}`);
    const follows = ['corn', 'wheat', 'soybean', 'cotton'].includes(key);
    assert.deepStrictEqual(c.reports || [], follows ? ['wasde'] : [], key);
  }
});

test('a report counts until the minute it comes out', () => {
  const { app } = wired();
  const now = at('2026-11-05T15:00:00Z');
  const [r] = Array.from(app.reportsBetween('corn', now, now + 15 * DAY));
  assert.deepStrictEqual(Array.from(r.within), [at('2026-11-10T12:00:00-05:00')]);
  assert.strictEqual(r.last, at('2027-12-10T12:00:00-05:00'));
  assert.strictEqual(r.name, 'WASDE');
  assert.strictEqual(r.publisher, 'USDA');
  // A minute before noon in Washington the day's report is still ahead; at
  // noon it is out.
  assert.strictEqual(app.reportsBetween('wheat', at('2026-11-10T16:59:00Z'), at('2026-11-11T00:00:00Z'))[0].within.length, 1);
  const out = app.reportsBetween('wheat', at('2026-11-10T17:00:00Z'), at('2026-11-11T00:00:00Z'))[0];
  assert.strictEqual(out.within.length, 0);
  assert.strictEqual(out.next, at('2026-12-10T12:00:00-05:00'));
  assert.strictEqual(app.reportsBetween('gold', now, now + 400 * DAY).length, 0);
});

test('the line says how many come out by the horizon, and when', () => {
  const { app } = wired();
  app.state.commodity = 'corn';
  const now = at('2026-11-05T15:00:00Z');
  const line = days => app.reportsLine({ t: days }, now);
  assert.strictEqual(line(15), 'By the horizon, Nov 20, USDA publishes 1 WASDE report: Nov 10.');
  assert.strictEqual(line(45), 'By the horizon, Dec 20, USDA publishes 2 WASDE reports: Nov 10; Dec 10.');
  // A date in another year carries it, and its own comma.
  assert.strictEqual(line(70), 'By the horizon, Jan 14, 2027, USDA publishes 3 WASDE reports: Nov 10; Dec 10; Jan 12, 2027.');
  assert.strictEqual(line(200), 'By the horizon, May 24, 2027, USDA publishes 7 WASDE reports, from Nov 10 to May 12, 2027.');
  assert.strictEqual(line(3), 'No WASDE report comes out by the horizon, Nov 8; the next is on Nov 10.');
  // Past the end of the calendar it says so rather than count none.
  assert.strictEqual(line(800), 'By the horizon, Jan 13, 2029, USDA publishes 14 WASDE reports, from Nov 10 to Dec 10, 2027. ' +
    'USDA has dated them only to Dec 10, 2027, so there may be more.');
  assert.strictEqual(app.reportsLine({ t: 30 }, at('2027-12-15T00:00:00Z')),
    'USDA has dated WASDE reports only to Dec 10, so those before the horizon, Jan 13, 2028, are not known here.');
  app.state.commodity = 'gold';
  assert.strictEqual(line(45), '');
});

test('it shows under the results for a market that follows a report, with legs to price', () => {
  const { app, el } = wired();
  app.state.commodity = 'soybean';
  app.renderResults();
  assert.strictEqual(el('reportsInfo').hidden, true, 'no legs, no line');
  app.applyStrategy('protective-put');
  app.renderResults();
  assert.strictEqual(el('reportsInfo').hidden, false);
  assert.match(el('reportsInfo').textContent, /WASDE/);
  app.state.commodity = 'gold';
  app.renderResults();
  assert.strictEqual(el('reportsInfo').hidden, true);
  assert.strictEqual(el('reportsInfo').textContent, '');
});

test('and in Spanish', () => {
  const { app } = wired({ lang: 'es', words: { es: SPANISH } });
  app.state.commodity = 'cotton';
  const now = at('2026-11-05T15:00:00Z');
  assert.strictEqual(app.reportsLine({ t: 15 }, now), 'Hasta el horizonte, el 20 nov, USDA publica 1 informe WASDE: 10 nov.');
  assert.strictEqual(app.reportsLine({ t: 3 }, now), 'No sale ningún informe WASDE hasta el horizonte, el 8 nov; el próximo es el 10 nov.');
  assert.strictEqual(app.reportsLine({ t: 70 }, now), 'Hasta el horizonte, el 14 ene 2027, USDA publica 3 informes WASDE: 10 nov; 10 dic; 12 ene 2027.');
});
