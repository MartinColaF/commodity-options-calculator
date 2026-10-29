'use strict';

/* The page writes numbers one way whatever the browser's language. It used the
 * browser's, and a browser set to Spanish (Argentina) showed "$1.125,89",
 * "4.211,30" and "0,1325" beside "11.2%" and "4.00%", which go through toFixed,
 * on an English page whose fields take a decimal point. Node takes its
 * default language from LC_ALL, so a child process stands in for that browser. */

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { loadApp, resetState } = require('./helpers/load-app');

const LOADER = path.join(__dirname, 'helpers', 'load-app.js');

function inSpanish(code) {
  const script = `
    const { loadApp, resetState } = require(${JSON.stringify(LOADER)});
    const app = loadApp();
    resetState(app);
    process.stdout.write(JSON.stringify(${code}));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], {
    env: Object.assign({}, process.env, { LC_ALL: 'es_AR.UTF-8', LANG: 'es_AR.UTF-8' })
  }).toString());
}

test('a Spanish browser gets the same numbers as an English one', t => {
  const own = inSpanish('[(1234.5).toLocaleString()]')[0];
  if (own !== '1.234,5') {
    t.skip(`this runtime does not take its language from LC_ALL (it wrote ${own})`);
    return;
  }
  const shown = inSpanish("[app.fmt(4211.3, 2), app.money(-1129.6), app.fmtPrice(4000, true), app.fmt(0.1325, 4)]");
  assert.deepStrictEqual(shown, ['4,211.30', '−$1,129.60', '4,000', '0.1325']);
});

test("the chart's ticks are written the same way", () => {
  const app = loadApp();
  resetState(app);
  app.state.legs = [app.newLeg({ kind: 'call', strike: 4000, days: 30 })];
  assert.strictEqual(app.chartConfig(app.analyse()).options.locale, 'en-US');
});
