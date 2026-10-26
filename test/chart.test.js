'use strict';

/* The payoff chart. chartConfig() is everything Chart.js is given, so what the
 * chart shows is tested here without a canvas. renderChart() creates the chart
 * once and updates it in place afterwards: destroying and re-creating it on
 * every render was most of a render's cost. */

const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, resetState } = require('./helpers/load-app.js');

/* A stand-in for Chart.js that records what is done to it. */
const made = [];
function FakeChart(ctx, cfg) {
  this.data = cfg.data;
  this.options = cfg.options;
  this.updates = [];
  made.push(this);
}
FakeChart.prototype.update = function (mode) { this.updates.push(mode); };
FakeChart.prototype.destroy = function () { this.destroyed = true; };

const box = { innerHTML: '' };
const canvas = { getContext: () => ({}), closest: () => box };
const app = loadApp({ globals: { Chart: FakeChart }, elements: { payoffChart: canvas } });
const { state } = app;

function condor(over) {
  resetState(app, Object.assign({ S: 4000, vol: 20, days: 30 }, over));
  state.chart = { mode: 'payoff', tDays: 0, showLegs: true, range: 40 };
  app.applyStrategy('iron-condor');
}

test('the payoff chart shows the horizon, today and every leg', () => {
  condor();
  const a = app.analyse();
  const sets = app.chartConfig(a).data.datasets;
  assert.deepStrictEqual(Array.from(sets, d => d.label), [
    'At horizon (30d)', 'Today (mark to market)',
    'Long 1 put 3,500.00', 'Short 1 put 3,750.00', 'Short 1 call 4,250.00', 'Long 1 call 4,500.00'
  ]);
  // The horizon series is the analysis itself, point for point.
  assert.deepStrictEqual(Array.from(sets[0].data, p => p.x), Array.from(a.xs));
  assert.deepStrictEqual(Array.from(sets[0].data, p => p.y), Array.from(a.ys));
});

test('hiding the legs or reaching the horizon drops those series', () => {
  condor();
  state.chart.showLegs = false;
  assert.strictEqual(app.chartConfig(app.analyse()).data.datasets.length, 2);
  state.chart.tDays = 30;   // at the horizon there is nothing left to mark to market
  assert.strictEqual(app.chartConfig(app.analyse()).data.datasets.length, 1);
});

test('each greek profile is one position series with its own axis title', () => {
  condor();
  for (const mode of ['delta', 'gamma', 'vega', 'theta']) {
    state.chart.mode = mode;
    const cfg = app.chartConfig(app.analyse());
    assert.strictEqual(cfg.data.datasets.length, 1, mode);
    assert.match(cfg.options.scales.y.title.text, new RegExp('^' + mode, 'i'));
  }
});

test('strike marks sit where each leg kinks on the shared axis, plus today\'s price', () => {
  condor();
  state.legs[0].under = 4400;   // a leg on its own delivery month, 10% over the panel
  const lines = app.chartConfig(app.analyse()).options.plugins.markers.lines;
  assert.strictEqual(lines.length, 5);
  assert.ok(Math.abs(lines[0].value - 3500 / 1.1) < 1e-9, 'the first strike, moved onto the axis');
  assert.deepStrictEqual([lines[4].label, lines[4].value], ['Now', 4000]);
});

test('the chart is created once and updated in place, without animation', () => {
  made.length = 0;
  condor();
  app.renderChart(app.analyse());
  state.chart.mode = 'delta';
  app.renderChart(app.analyse());
  state.chart.mode = 'payoff';
  state.chart.showLegs = false;
  app.renderChart(app.analyse());

  assert.strictEqual(made.length, 1, 'one chart, not one per render');
  const chart = made[0];
  assert.ok(!chart.destroyed);
  assert.deepStrictEqual(chart.updates, ['none', 'none']);
  // And it shows the latest state, not the first.
  assert.strictEqual(chart.data.datasets.length, 2);
  assert.strictEqual(chart.options.scales.y.title.text, 'Profit / loss ($)');
});

test('without Chart.js the chart gives way to a note and nothing throws', () => {
  // The same page with the library missing, as after a blocked CDN or a
  // failed integrity check. A theme change used to call renderChart() bare
  // and throw here; it now goes through renderChartSafely() as well.
  const noteBox = { innerHTML: '' };
  const bare = loadApp({ elements: { payoffChart: { getContext: () => ({}), closest: () => noteBox } } });
  resetState(bare, { S: 4000 });
  bare.state.legs = [bare.newLeg({ kind: 'call', strike: 4000 })];
  assert.doesNotThrow(() => bare.renderChartSafely(bare.analyse()));
  assert.match(noteBox.innerHTML, /could not be loaded/);
  assert.doesNotThrow(() => bare.renderChartSafely(bare.analyse()), 'and again, quietly');
});

/* ---- colours ---- */

test('the chart takes every colour from the stylesheet, in both schemes', () => {
  // They used to be written out in app.js as well, where only two of the
  // sixteen matched the page's palette and nothing kept the rest in step.
  const light = loadApp({ scheme: 'light' }).themeColors();
  const dark = loadApp({ scheme: 'dark' }).themeColors();
  assert.deepStrictEqual(Object.keys(light), ['grid', 'zero', 'text', 'net', 'now', 'leg', 'spot', 'strike']);
  for (const k of Object.keys(light)) {
    assert.ok(light[k], `--chart-${k} is set`);
    assert.ok(dark[k] && dark[k] !== light[k], `--chart-${k} has its own value in the dark block`);
  }
  assert.doesNotMatch(app.themeColors.toString(), /#[0-9a-f]{3}|rgba?\(/i, 'and none is left in app.js');
});

test('the series, the axes and the marks are drawn in those colours', () => {
  const dark = loadApp({ scheme: 'dark', globals: { Chart: FakeChart } });
  resetState(dark, { S: 4000, vol: 20, days: 30 });
  dark.state.chart = { mode: 'payoff', tDays: 0, showLegs: true, range: 40 };
  dark.applyStrategy('iron-condor');
  const col = dark.themeColors();
  const cfg = dark.chartConfig(dark.analyse());
  assert.deepStrictEqual(Array.from(cfg.data.datasets, d => d.borderColor),
    [col.net, col.now, col.leg, col.leg, col.leg, col.leg]);
  assert.strictEqual(cfg.options.scales.x.ticks.color, col.text);
  assert.strictEqual(cfg.options.scales.x.grid.color, col.grid);
  assert.strictEqual(cfg.options.scales.y.grid.color({ tick: { value: 0 } }), col.zero);
  const marks = cfg.options.plugins.markers.lines;
  assert.strictEqual(marks[marks.length - 1].color, col.spot);
  assert.ok(marks.slice(0, -1).every(m => m.color === col.strike));
});
