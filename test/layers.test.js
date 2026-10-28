'use strict';

/* Which part of app.js may do what. The calculations and the market-data
 * actions never touch the page or ask for a redraw; the rendering draws the
 * state and never changes it; only the wiring connects the two. Both rules
 * were broken before: renderResults() clipped the chart date, renderMonths()
 * dropped the picked month, and applyStrategy() redrew the page itself. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, resetState } = require('./helpers/load-app.js');

/* app.js split at its numbered section headers, with comments removed so that
 * prose about a function does not count as a call to it. */
const source = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
const sections = {};
{
  const heads = Array.from(source.matchAll(/^ \* (\d+)\. ([^\n]+)$/gm));
  heads.forEach((m, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : source.length;
    sections[m[1]] = source.slice(m.index, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/[^\n]*/g, '$1');
  });
}

test('app.js has the sections these rules refer to', () => {
  for (const n of ['1', '5', '6', '7', '9', '10']) assert.ok(sections[n], `section ${n}`);
});

test('the rendering draws the state and never changes it', () => {
  const writes = sections['7'].match(/\bstate(\.\w+)+\s*(=(?!=)|\+=|-=|\+\+|--)/g);
  assert.strictEqual(writes, null, 'rendering writes ' + JSON.stringify(writes));
});

test('the calculations and the actions never touch the page or ask for a redraw', () => {
  for (const n of ['1', '2', '3', '4', '5', '6', '9']) {
    const s = sections[n];
    if (!s) continue;
    for (const pattern of [/\$\(/, /\bdocument\./, /\brender[A-Z]\w*\(/, /\bscheduleRender\(/,
      /\bset(Save)?Status\(/, /\brequestAnimationFrame\(/]) {
      assert.doesNotMatch(s, pattern, `section ${n} uses ${pattern}`);
    }
  }
});

const app = loadApp();
const { state } = app;

test('normalizeState keeps the chart date within the horizon', () => {
  resetState(app, { days: 30 });
  state.chart.tDays = 25;
  state.legs = [app.newLeg({ kind: 'call', days: 30 })];
  app.normalizeState();
  assert.strictEqual(state.chart.tDays, 25, 'inside the horizon: left alone');
  state.legs[0].days = 20;
  app.normalizeState();
  assert.strictEqual(state.chart.tDays, 20, 'the horizon moved in: the date follows');
});

test('reloading the strip drops a picked month it no longer lists, and keeps its price', async () => {
  const months = rows => ({ contracts: rows.map(([symbol, price]) => ({ symbol, price, expiry: '2027-03-15' })) });
  let answer = months([['A', 100], ['B', 110]]);
  const net = loadApp({ fetch: async () => ({ ok: true, status: 200, json: async () => answer }) });
  resetState(net, { S: 100 });
  await net.loadContractMonths();
  net.useContractMonth('B');
  assert.strictEqual(net.state.contractMonth, 'B');
  const source = net.state.sources.price;

  net.storage.clear();
  answer = months([['B', 111], ['C', 120]]);
  await net.loadContractMonths();
  assert.strictEqual(net.state.contractMonth, 'B', 'still listed: still picked');

  net.storage.clear();
  answer = months([['C', 120], ['D', 130]]);
  await net.loadContractMonths();
  assert.strictEqual(net.state.contractMonth, '', 'no longer listed: no longer picked');
  assert.strictEqual(net.state.S, 110, 'the price it gave stays');
  assert.strictEqual(net.state.sources.price, source, 'and so does the line saying where it came from');
});

test('changing commodity drops the strip, the month and the leg prices', () => {
  resetState(app, { commodity: 'cocoa', S: 5400 });
  state.session.strip = [{ symbol: 'CCH27.NYB', price: 5402, expiry: '2027-03-15' }];
  state.contractMonth = 'CCH27.NYB';
  state.legs = [app.newLeg({ kind: 'call', under: 5500 })];
  state.sources.legs = { live: true, text: 'legs interpolated across 1 listed contracts' };

  app.changeCommodity('gold');
  assert.strictEqual(state.commodity, 'gold');
  assert.strictEqual(state.session.strip.length, 0, 'no cocoa months offered while pricing gold');
  assert.strictEqual(state.contractMonth, '');
  assert.strictEqual(state.legs[0].under, null);
  assert.strictEqual(state.sources.legs, null);
  assert.strictEqual(state.vol, app.COMMODITIES.gold.vol, 'and the presets apply');

  app.changeCommodity('__proto__');
  assert.strictEqual(state.commodity, 'gold', 'a key that is not a market is ignored');
});

test('the strip is never saved or shared', () => {
  resetState(app);
  state.session.strip = [{ symbol: 'GCZ26.CMX', price: 4000, expiry: '2026-12-15' }];
  const saved = JSON.stringify(app.snapshot());
  assert.ok(!saved.includes('GCZ26'), 'not in the snapshot');
  app.restore({ session: { strip: [{ symbol: 'EVIL' }] } });
  assert.strictEqual(state.session.strip[0].symbol, 'GCZ26.CMX', 'and restore() does not take one');
});
