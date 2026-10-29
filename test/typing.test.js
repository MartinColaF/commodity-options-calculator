'use strict';

/* A field being typed in is never written over. The panel's fields skip it
 * (setField()); the legs table, rebuilt whole on every drawing, is left alone
 * while one of its fields holds what has not been committed. It used to be
 * rebuilt anyway, and Chromium, removing a field that holds an uncommitted
 * edit, fires its change: a price arriving while "4100" was typed made the
 * leg's strike 41, "4." lost its point and "-" its sign, and the commit drew
 * the table inside the drawing that was removing it, which threw. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');

/* The page with one leg, its strike field focused and typed in. */
function typingIn(opts) {
  const page = wired(opts);
  const { app, el, fire, doc } = page;
  const leg = app.newLeg({ kind: 'call', strike: 4200, days: 30 });
  app.state.legs = [leg];
  const field = { value: '4200', dataset: { f: 'strike' }, closest: () => ({ dataset: { id: String(leg.id) } }) };
  el('legsBody').contains = node => node === field;
  doc.activeElement = field;
  fire('legsBody', 'input', field);
  field.value = '41';
  return Object.assign(page, { leg, field });
}

test('a drawing from elsewhere leaves the legs table alone while one of its fields is typed in', () => {
  const { app, el, leg, field } = typingIn();
  assert.strictEqual(field.dataset.editing, 'true', 'marked as typed in');
  el('legsBody').innerHTML = 'as typed';
  app.state.S = 4100; // a price arriving, say from Auto-fill
  app.renderAll();
  assert.strictEqual(el('legsBody').innerHTML, 'as typed', 'the field is not rebuilt under the typing');
  assert.strictEqual(leg.strike, 4200, 'and nothing half typed is committed');
  assert.match(el('summary').innerHTML, /class="kpi"/, 'the rest of the page is drawn');
});

test('committing the field draws the table at once', () => {
  const { el, fire, leg, field } = typingIn();
  field.value = '4100';
  // The change comes while the field still has the focus.
  fire('legsBody', 'change', field);
  assert.strictEqual(leg.strike, 4100);
  assert.strictEqual(field.dataset.editing, undefined);
  assert.match(el('legsBody').innerHTML, /data-f="strike" value="4100"/);
});

test('left without a change, the table is drawn again on the next frame', () => {
  const frames = [];
  const { app, el, fire, doc, leg, field } = typingIn({ globals: { requestAnimationFrame: fn => frames.push(fn) } });
  el('legsBody').innerHTML = 'as typed';
  app.state.S = 4300;
  app.renderAll();
  assert.strictEqual(el('legsBody').innerHTML, 'as typed');
  // Put back as it was and left: the browser fires no change.
  field.value = '4200';
  doc.activeElement = null;
  fire('legsBody', 'focusout', field);
  assert.strictEqual(field.dataset.editing, undefined);
  assert.strictEqual(frames.length, 1, 'a drawing is asked for');
  frames[0]();
  assert.match(el('legsBody').innerHTML, new RegExp(`<tr data-id="${leg.id}"`), 'with the price that arrived meanwhile');
  assert.strictEqual(leg.strike, 4200);
});

test('a window losing the focus does not end the typing', () => {
  // The field gets its focusout but stays the focused element; drawn then,
  // the table would be rebuilt under the typing after all.
  const frames = [];
  const { fire, field } = typingIn({ globals: { requestAnimationFrame: fn => frames.push(fn) } });
  fire('legsBody', 'focusout', field);
  assert.strictEqual(field.dataset.editing, 'true');
  assert.strictEqual(frames.length, 0);
});

test('a refused price keeps what was typed through the drawing its typing asked for', () => {
  // Typed and left within one frame: the drawing scheduled by the last
  // keystroke comes after the refusal, with the field no longer focused.
  const frames = [];
  const { el, fire } = wired({ globals: { requestAnimationFrame: fn => frames.push(fn) } });
  el('spot').value = '-100';
  fire('spot', 'input');
  fire('spot', 'change');
  assert.strictEqual(el('spot').getAttribute('aria-invalid'), 'true');
  frames.splice(0).forEach(fn => fn());
  assert.strictEqual(String(el('spot').value), '-100', 'not the price in use written over it');
  // The next thing done clears the mark, and its drawing shows the price in use.
  el('days').value = '45';
  fire('days', 'input');
  frames.splice(0).forEach(fn => fn());
  assert.strictEqual(String(el('spot').value), '4000');
});

test('a field only focused, not typed in, is drawn as before', () => {
  const { app, el, doc, leg } = typingIn();
  const focused = { value: '30', dataset: { f: 'days' }, closest: () => ({ dataset: { id: String(leg.id) } }) };
  el('legsBody').contains = node => node === focused;
  doc.activeElement = focused;
  el('legsBody').innerHTML = 'old';
  app.renderAll();
  assert.match(el('legsBody').innerHTML, /<tr data-id=/);
});
