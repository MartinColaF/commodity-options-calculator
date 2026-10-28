'use strict';

/* Explanations behind "?". They were all on show: 18 notes, 596 words, 1,284px
 * of a phone's page. Reference explanations now open from a "?" beside what
 * they explain; what a number is, where it came from and what went wrong stay
 * in view. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { wired } = require('./helpers/load-app');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const buttons = Array.from(html.matchAll(/<button\b[^>]*class="help-btn"[^>]*>/g), m => ({
  tag: m[0], at: m.index,
  controls: (m[0].match(/aria-controls="([^"]+)"/) || [])[1]
}));

test('every "?" names what it opens, starts closed, and its explanation follows it', () => {
  assert.ok(buttons.length >= 10, `${buttons.length} help buttons`);
  for (const b of buttons) {
    assert.match(b.tag, /type="button"/);
    assert.match(b.tag, /aria-expanded="false"/);
    assert.match(b.tag, /aria-label="[^"]{6,}"/, 'a name a screen reader can announce');
    const panel = html.match(new RegExp(`<(p|div)\\b[^>]*id="${b.controls}"[^>]*>`));
    assert.ok(panel, `#${b.controls} exists`);
    assert.match(panel[0], /\bhidden\b/, `#${b.controls} starts closed`);
    assert.ok(panel.index > b.at, `#${b.controls} opens under its "?"`);
  }
});

test('what a number is, where it came from and what went wrong stay in view', () => {
  const shown = [
    /<p class="note" id="proxyNote">/, /<p class="note" id="yieldNote">/, /<p class="note" id="multInfo">/,
    /<p class="note">Historical \(realised\) volatility, not implied\./, /<div id="sources">/,
    /<p class="note" id="saveStatus"/, /<div class="disclaimer">/, /<p class="problem" id="spotProblem"/
  ];
  for (const re of shown) {
    const m = html.match(re);
    assert.ok(m, String(re));
    const tag = html.slice(m.index, html.indexOf('>', m.index) + 1);
    assert.doesNotMatch(tag, /\bhidden\b/, `${tag} is not hidden`);
  }
});

/* A stand-in "?" for the page's wiring. */
function helpButton(controls) {
  const attrs = { 'aria-controls': controls, 'aria-expanded': 'false' };
  const b = {
    classList: { contains: c => c === 'help-btn' },
    getAttribute: k => attrs[k],
    setAttribute: (k, v) => { attrs[k] = String(v); }
  };
  return { b, target: { closest: sel => (sel === 'button' ? b : null) } };
}

test('a "?" opens its explanation and closes it again', () => {
  const { el, fire } = wired();
  const { b, target } = helpButton('payoffHelp');
  el('payoffHelp').hidden = true;
  fire('payoffHelpButton', 'click', target);
  assert.strictEqual(el('payoffHelp').hidden, false);
  assert.strictEqual(b.getAttribute('aria-expanded'), 'true');
  fire('payoffHelpButton', 'click', target);
  assert.strictEqual(el('payoffHelp').hidden, true);
  assert.strictEqual(b.getAttribute('aria-expanded'), 'false');
});

test('opening an explanation leaves a refusal reason and an Undo where they were', () => {
  const { app, el, fire } = wired();
  app.applyStrategy('straddle');
  fire('clearLegs', 'click');
  assert.strictEqual(el('undoRemove').hidden, false);
  el('spotProblem').textContent = 'A price must be above zero.';
  fire('modelHelpButton', 'click', helpButton('modelHelp').target);
  assert.strictEqual(el('spotProblem').textContent, 'A price must be above zero.', 'the reason it may explain');
  assert.strictEqual(el('undoRemove').hidden, false, 'and the way back');
});

test("the scenario grid's explanation is written under its own \"?\"", () => {
  const { app, el } = wired();
  app.state.legs = [app.newLeg({ kind: 'call', strike: 4000, days: 30 })];
  app.renderScenarios();
  assert.match(el('scenarioHelp').textContent, /^P&L at each date assumes the volatility shift happens immediately/);
  assert.doesNotMatch(el('scenarios').innerHTML, /assumes the volatility shift/, 'not under the tables');
});
