'use strict';

/* What a screen reader and a keyboard need to find their way. axe-core found no
 * <main> and 72 nodes outside any region, so a reader could not jump to the
 * results or the chart; three scenario tables that scroll sideways and that no
 * key could reach; and the chart, the page's main result, with no name. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { wired } = require('./helpers/load-app');

const ROOT = path.resolve(__dirname, '..');
const SPANISH = require('../es/words.js');

for (const file of ['index.html', 'es/index.html']) {
  test(`${file}: one <main> holds the cards, each a section named by its own heading`, () => {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const main = html.match(/<main>([\s\S]*?)<\/main>/g);
    assert.strictEqual(main && main.length, 1, 'one main');
    assert.match(main[0], /<div class="grid">/);
    const before = html.slice(0, html.indexOf('<main>')), after = html.slice(html.indexOf('</main>'));
    assert.match(before, /<header>/, 'the header stays outside');
    assert.match(after, /<footer>/, 'and the footer');
    const sections = Array.from(html.matchAll(/<section class="card" id="(\w+)" aria-labelledby="(\w+)">([\s\S]*?)<\/section>/g));
    assert.strictEqual(sections.length, 7);
    for (const [, id, label, body] of sections) {
      assert.match(body, new RegExp(`<h2 id="${label}">[^<]+`), `#${id} is named by its heading`);
    }
    assert.match(html, /<canvas id="payoffChart" role="img" aria-label="[^"]+">/);
  });
}

test('each scenario table can be reached with the keyboard, and says which one it is', () => {
  const { app, el } = wired();
  app.applyStrategy('bull-call');
  app.renderScenarios();
  const regions = Array.from(el('scenarios').innerHTML.matchAll(/<div class="table-scroll"([^>]*)>/g), m => m[1]);
  assert.strictEqual(regions.length, 3);
  for (const attrs of regions) {
    assert.match(attrs, /tabindex="0"/);
    assert.match(attrs, /role="region"/);
  }
  const names = regions.map(attrs => attrs.match(/aria-label="([^"]+)"/)[1]);
  assert.deepStrictEqual(names, ['Scenario grid, Volatility -5 points', 'Scenario grid, Volatility unchanged',
    'Scenario grid, Volatility +5 points']);
});

test('the chart says in words what it draws, and follows the position', () => {
  const { app, el } = wired();
  app.state.chart = { mode: 'payoff', tDays: 0, showLegs: false, range: 40 };
  app.state.legs = [];
  app.renderChartSafely(app.analyse());
  assert.strictEqual(el('payoffChart').getAttribute('aria-label'), 'Payoff chart: no legs yet.');

  app.applyStrategy('bull-call');
  const a = app.analyse();
  app.renderChartSafely(a);
  const said = el('payoffChart').getAttribute('aria-label');
  assert.match(said, /^Payoff chart: profit and loss at the 30-day horizon, for an underlying price from [\d,]+ to [\d,]+: /);
  assert.ok(said.includes('maximum profit ' + app.money(a.maxProfit)), said);
  assert.ok(said.includes('maximum loss ' + app.money(a.maxLoss)), said);
  assert.ok(said.includes('breakeven at ' + app.fmtPrice(a.breakevens[0])), said);
  assert.match(said, /The scenario grid below gives the profit and loss as a table\.$/);

  app.state.chart.mode = 'gamma';
  app.renderChartSafely(app.analyse());
  assert.match(el('payoffChart').getAttribute('aria-label'), /^Gamma profile of the position, for an underlying price from /);
});

test('and on the Spanish page, in Spanish', () => {
  const { app, el } = wired({ lang: 'es', words: { es: SPANISH } });
  app.applyStrategy('straddle');
  app.renderChartSafely(app.analyse());
  assert.match(el('payoffChart').getAttribute('aria-label'),
    /^Gráfico de payoff: ganancia y pérdida al horizonte de 30 días, .* puntos de equilibrio en [\d,.]+, [\d,.]+\./);
});
