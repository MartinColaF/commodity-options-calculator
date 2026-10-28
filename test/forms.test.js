'use strict';

/* The forms. "Clear" sat beside "+ Add leg", styled like it, and removed the
 * whole strategy with no way back, while a note below used "Clear" for another
 * button. The Contract card gave thirteen fields the same weight, four of which
 * decide a first result. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { wired } = require('./helpers/load-app');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
/* A stand-in target for a click on some other button on the page. */
const aButton = { closest: sel => (sel === 'button' ? {} : null) };

test('removing every leg can be undone, with the same legs back', () => {
  const { app, el, fire } = wired();
  app.applyStrategy('iron-condor');
  const legs = app.state.legs.slice();
  el('undoRemove').hidden = true;

  fire('clearLegs', 'click');
  assert.strictEqual(app.state.legs.length, 0);
  assert.strictEqual(el('legStatus').textContent, 'All 4 legs were removed.');
  assert.strictEqual(el('undoRemove').hidden, false, 'Undo is offered');

  fire('undoRemove', 'click');
  assert.deepStrictEqual(app.state.legs.map(l => l.id), legs.map(l => l.id), 'the same legs, ids and all');
  assert.strictEqual(el('undoRemove').hidden, true);
  assert.strictEqual(el('legStatus').textContent, '');
});

test('Undo lasts until the next thing done on the page', () => {
  const { app, el, fire } = wired();
  app.applyStrategy('straddle');
  fire('clearLegs', 'click');
  assert.strictEqual(el('legStatus').textContent, 'All 2 legs were removed.');
  fire('addLeg', 'click', aButton);
  assert.strictEqual(el('undoRemove').hidden, true, 'another button takes it away');
  const added = app.state.legs.length;
  fire('undoRemove', 'click');
  assert.strictEqual(app.state.legs.length, added, 'and Undo, pressed after, changes nothing');

  fire('clearLegs', 'click');
  fire('spot', 'input', { value: '4100' });
  assert.strictEqual(el('undoRemove').hidden, true, 'so does an edit');
});

test('removing legs from an empty table does nothing', () => {
  const { app, el, fire } = wired();
  app.state.legs = [];
  el('undoRemove').hidden = true;
  fire('clearLegs', 'click');
  assert.strictEqual(el('undoRemove').hidden, true);
  assert.strictEqual(el('legStatus').textContent, '');
});

test('the buttons are named for what they do, and the notes name them right', () => {
  assert.match(html, /<button id="clearLegs" class="text-danger">Remove all legs<\/button>/);
  assert.match(html, /<strong>Clear leg prices<\/strong> puts every leg back/);
  assert.match(html, /the <strong>Fill leg prices<\/strong> button below/);
  assert.doesNotMatch(html, /<strong>Clear<\/strong> puts/);
});

test('the four fields that decide a first result come before the folded settings', () => {
  const card = html.slice(html.indexOf('id="cardContract"'), html.indexOf('id="cardMarket"'));
  const fold = card.indexOf('<details class="advanced" id="contractAdvanced">');
  assert.ok(fold > 0);
  for (const id of ['commodity', 'spot', 'days', 'vol']) {
    const at = card.indexOf(`id="${id}"`);
    assert.ok(at > 0 && at < fold, `#${id} in view`);
  }
  for (const id of ['model', 'style', 'contractMonth', 'rate', 'financing', 'financingRate', 'yield', 'size', 'quote']) {
    assert.ok(card.indexOf(`id="${id}"`) > fold, `#${id} folded`);
  }
  const market = html.slice(html.indexOf('id="cardMarket"'), html.indexOf('id="legs"'));
  const marketFold = market.indexOf('<details class="advanced" id="marketAdvanced">');
  for (const id of ['autoFill', 'fetchPrice', 'fetchRate', 'fetchVol', 'fetchCurve', 'dataStatus']) {
    assert.ok(market.indexOf(`id="${id}"`) < marketFold, `#${id} in view`);
  }
  for (const id of ['volWindow', 'skewOn', 'carryS', 'avKey']) assert.ok(market.indexOf(`id="${id}"`) > marketFold, `#${id} folded`);
  assert.ok(market.indexOf('id="sources"') > market.indexOf('</details>\n\n'), 'the sources stay in view');
});

test('the folded settings say what they are set to', () => {
  const { app, el } = wired();
  app.renderInputs();
  assert.strictEqual(el('contractSummary').textContent,
    'Black-76 · European · front month · rate 4.00% · premium financed at the risk-free rate · 100 troy oz');
  Object.assign(app.state, { commodity: 'corn', model: 'bs', style: 'american', rate: 3.875, size: 5000, quote: 'cents' });
  app.state.financing = { mode: 'custom', rate: 5.5 };
  app.state.contractMonth = 'ZCH27.CBT';
  app.state.session.strip = [{ symbol: 'ZCH27.CBT', name: 'Corn Mar 27', expiry: '2027-03-15' }];
  app.renderInputs();
  assert.match(el('contractSummary').textContent,
    /^Black-Scholes-Merton · American · .+ · rate 3\.88% · premium financed at 5\.50% · 5,000 bushels, quoted in cents$/);
  app.state.financing = { mode: 'none', rate: 5.5 };
  app.renderInputs();
  assert.match(el('contractSummary').textContent, / · nominal P&L · /);
  assert.match(el('marketSummary').textContent, /skew off/);
});

test('a reason or a warning inside folded settings opens them', () => {
  const { app, el, fire } = wired();
  const contract = { open: false };
  el('sizeProblem').closest = sel => (sel === 'details' ? contract : null);
  fire('size', 'change', { value: '-5' });
  assert.match(el('sizeProblem').textContent, /Still using 100\./);
  assert.strictEqual(contract.open, true);

  const market = { open: false };
  el('skewWarning').closest = sel => (sel === 'details' ? market : null);
  Object.assign(app.state, { S: 100, vol: 20, rate: 4, days: 365 });
  app.state.skew = { on: true, rr: 30, bf: 0 };
  app.state.legs = [app.newLeg({ kind: 'put', strike: 60, days: 365 })];
  app.renderInputs();
  assert.notStrictEqual(el('skewWarning').textContent, '');
  assert.strictEqual(market.open, true);
});
