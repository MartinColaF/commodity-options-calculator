'use strict';

/* The page's signs. A loss read "-$1,129.60" with a hyphen, shorter and lighter
 * than a minus in a column of figures; the chart's range read "+/-40%", the
 * greeks note "x", an empty breakeven "-", like a number's sign. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');

const MINUS = '−';

test('a number below zero is written with the minus sign wherever the page shows it', () => {
  const { app, el } = wired();
  assert.strictEqual(app.money(-1129.6), MINUS + '$1,129.60');
  assert.strictEqual(app.fmt(-0.0161, 4), MINUS + '0.0161');
  assert.strictEqual(app.fmt(-Infinity, 2), MINUS + '∞');
  assert.strictEqual(app.compactNumber(-24000), MINUS + '24k');
  app.applyStrategy('iron-condor');
  app.renderAll();
  for (const id of ['summary', 'greeks', 'scenarios', 'legsBody']) {
    const text = el(id).innerHTML.replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(text, /-\$?\d/, `${id} has no hyphen before a figure`);
    assert.match(text, new RegExp(MINUS + '\\$?\\d'), `${id} shows a loss or a negative figure`);
  }
});

test('but a field keeps the hyphen a number is typed and read with', () => {
  const { app, el } = wired();
  app.state.yield = -1.13;
  app.renderInputs();
  assert.strictEqual(String(el('yield').value), '-1.13');
  assert.strictEqual(JSON.stringify(app.snapshot()).includes(MINUS), false, 'nor does a saved scenario');
});

test('±, ×, an ellipsis, and a word for no breakeven', () => {
  const { app, el, fire } = wired();
  app.renderAll();
  fire('range', 'input', { value: '25' });
  assert.strictEqual(el('rangeLabel').textContent, '±25%');
  app.state.legs = [app.newLeg({ kind: 'call', strike: 4200, days: 30 })];
  app.state.legs[0].entry = 0;   // never below zero, so never crossing it
  app.renderResults();
  assert.match(el('summary').innerHTML, /Breakevens<\/span><strong>None<\/strong>/);
  assert.match(el('greeks').innerHTML, /per-unit greek × quantity × \$100\.00 multiplier/);
  app.state.legs.push(app.newLeg({ kind: 'underlying' }));
  app.renderLegs();
  assert.match(el('legsBody').innerHTML, /data-label="Theo\. value">—</, 'the underlying has no theoretical value of its own');
});

test('the English is American English, as the exchanges these contracts trade on write it', () => {
  // CME, ICE US and NYMEX write "annualized" and "realized"; the page wrote
  // "annualised" and "realised".
  const fs = require('fs');
  const path = require('path');
  const { calls } = require('./helpers/words');
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const text = f => read(f).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
  const src = read('app.js');
  const words = ['t', 'w', 'name'].reduce((all, fn) => all.concat(calls(src, fn).map(c => c.key || '')), []);
  const british = /\b\w*(annualis|realis|generalis|modell|labell|behaviour|colour|centre|optimis|minimis|maximis)\w*/i;
  for (const [where, body] of [['index.html', text('index.html')], ['methodology.html', text('methodology.html')],
    ['privacy.html', text('privacy.html')], ['app.js', words.join('\n')]]) {
    const hit = body.match(british);
    assert.ok(!hit, `${where}: "${hit && hit[0]}"`);
  }
});
