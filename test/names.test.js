'use strict';

/* Every control has a name a screen reader can announce. axe-core found eight
 * without one, most in the legs table, whose header row names a column for
 * sighted users but not the input under it: a reader said "edit text". */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, resetState, wired } = require('./helpers/load-app');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const app = loadApp();
resetState(app, { S: 100, vol: 30, rate: 5 });

test('every field on the page has a label or an aria-label', () => {
  const labelled = new Set(Array.from(html.matchAll(/<label[^>]*\bfor="([^"]+)"/g), m => m[1]));
  // A field inside its <label> is named by it too.
  for (const block of html.match(/<label\b[\s\S]*?<\/label>/g)) {
    for (const m of block.matchAll(/\bid="([^"]+)"/g)) labelled.add(m[1]);
  }
  const fields = Array.from(html.matchAll(/<(input|select|textarea)\b([^>]*)>/g), m => m[2]);
  assert.ok(fields.length > 30);
  for (const attrs of fields) {
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    assert.ok(/aria-label="[^"]+"/.test(attrs) || labelled.has(id), `#${id} has no label`);
  }
});

test('no header cell is empty to a screen reader', () => {
  const heads = Array.from(html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g), m => m[1]);
  for (const h of heads) assert.ok(h.replace(/<[^>]+>/g, '').trim(), `an empty <th>: ${h}`);
  // The greeks table is drawn by the page.
  const { app: page, el } = wired();
  page.state.legs = [page.newLeg({ kind: 'call', strike: 4000, days: 30 })];
  page.renderResults();
  const greeks = el('greeks').innerHTML;
  assert.match(greeks, /<th>/);
  for (const h of greeks.match(/<th\b[^>]*>[\s\S]*?<\/th>/g)) {
    assert.ok(h.replace(/<[^>]+>/g, '').trim(), `an empty <th> in the greeks: ${h}`);
  }
});

test('every control in a leg row says what it is and which leg', () => {
  const leg = app.newLeg({ kind: 'put', side: -1, qty: 2, strike: 95, days: 60 });
  const row = app.legRowHtml(leg, 100, 3);
  const controls = row.match(/<(input|select|button)\b[^>]*>/g);
  assert.strictEqual(controls.length, 11);
  for (const c of controls) assert.match(c, /aria-label="[^"]+, leg 3"/, c);
  assert.match(row, /data-f="del"[^>]*aria-label="Remove, leg 3"[^>]*>×</);
  // Without a place in the table, the name still says what the field is.
  assert.match(app.legRowHtml(leg, 100), /data-f="strike"[^>]*aria-label="Strike"/);
});

test("a leg card's headings are the table's column headings", () => {
  // On a phone each leg is a card, headed by its cells' data-label; elsewhere
  // the header row heads them. A column renamed in one place only would
  // disagree between the two layouts.
  const thead = html.match(/<thead>([\s\S]*?)<\/thead>/)[1];
  const heads = Array.from(thead.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g), m => m[1].replace(/<[^>]+>/g, '').trim());
  const row = app.legRowHtml(app.newLeg({ kind: 'call', strike: 100, days: 30 }), 100, 1);
  const labels = Array.from(row.matchAll(/<td\b([^>]*)>/g), m => (m[1].match(/data-label="([^"]*)"/) || [])[1]);
  assert.strictEqual(labels.length, heads.length, 'one cell per column');
  for (let i = 0; i < heads.length - 1; i++) assert.strictEqual(labels[i], heads[i], `column ${i + 1}`);
  assert.strictEqual(labels[heads.length - 1], undefined, 'the buttons need no heading');
});
