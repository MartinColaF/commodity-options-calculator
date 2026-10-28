'use strict';

/* The Save & share card answers on its own line, under its buttons: on a phone
 * the market-data status line is 3,400px above them, out of sight. Where the
 * system share sheet exists the share button opens it; elsewhere it copies the
 * link. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');

/* The page with `navigator` as given; shareLink() needs btoa, which a bare VM
 * context lacks. Every promise the click starts settles before setImmediate. */
const page = (navigator, globals) => wired({ globals: Object.assign({ navigator, btoa }, globals) });
const settled = () => new Promise(resolve => setImmediate(resolve));
const failure = name => Object.assign(new Error(name), { name });

test('where the share sheet exists, the button opens it with the scenario link', async () => {
  const shared = [];
  const { el, fire } = page({ share: async data => { shared.push(data); } });
  assert.strictEqual(el('share').textContent, 'Share link');
  fire('share', 'click');
  await settled();
  assert.strictEqual(shared.length, 1);
  assert.match(shared[0].url, /^https:\/\/example\.test\/#s=[A-Za-z0-9_-]+$/);
  assert.strictEqual(el('saveStatus').textContent, '', 'the sheet was the answer');
});

test('closing the share sheet copies nothing and says nothing', async () => {
  let copied = 0;
  const { el, fire } = page({
    share: () => Promise.reject(failure('AbortError')),
    clipboard: { writeText: async () => { copied++; } }
  });
  fire('share', 'click');
  await settled();
  assert.strictEqual(copied, 0);
  assert.strictEqual(el('saveStatus').textContent, '');
});

test('a share sheet that cannot open falls back to the clipboard', async () => {
  const copied = [];
  const { el, fire } = page({
    share: () => Promise.reject(failure('NotAllowedError')),
    clipboard: { writeText: async text => { copied.push(text); } }
  });
  fire('share', 'click');
  await settled();
  assert.strictEqual(copied.length, 1);
  assert.match(copied[0], /#s=/);
  assert.strictEqual(el('saveStatus').textContent, 'Shareable link copied to the clipboard.');
});

test('without a share sheet the link is copied, and the answer appears under the button', async () => {
  const copied = [];
  const { el, fire } = page({ clipboard: { writeText: async text => { copied.push(text); } } });
  assert.notStrictEqual(el('share').textContent, 'Share link', 'the label in the markup stays');
  fire('share', 'click');
  await settled();
  assert.strictEqual(copied.length, 1);
  assert.strictEqual(el('saveStatus').textContent, 'Shareable link copied to the clipboard.');
  assert.strictEqual(el('saveStatus').className, 'note pos');
  assert.strictEqual(el('dataStatus').textContent, '', 'not on the market-data line');
});

test('with no clipboard either, it points at the address bar', async () => {
  const { app, el, fire } = page({});
  fire('share', 'click');
  await settled();
  assert.strictEqual(el('saveStatus').textContent, 'Link is in the address bar - copy it from there.');
  assert.strictEqual(el('saveStatus').className, 'note', 'an instruction, not a success');
  assert.match(app.shareLink(), /#s=/);
});

/* A FileReader that reads the stand-in file's text at once. */
class FileReader {
  readAsText(file) { this.result = file.text; this.onload(); }
}

test('an import says what it did under the buttons, and a bad file says so as a problem', () => {
  const { app, el, fire } = page({}, { FileReader });
  app.state.S = 1234;
  const saved = JSON.stringify(app.snapshot());
  app.state.S = 4000;
  fire('importJson', 'change', { files: [{ text: saved }], value: 'strategy.json' });
  assert.strictEqual(app.state.S, 1234);
  assert.strictEqual(el('saveStatus').textContent, 'Strategy loaded.');
  assert.strictEqual(el('saveStatus').className, 'note pos');

  fire('importJson', 'change', { files: [{ text: '{not json' }], value: 'x.json' });
  assert.strictEqual(el('saveStatus').textContent, 'That file is not a valid strategy export.');
  assert.strictEqual(el('saveStatus').className, 'problem');
  assert.strictEqual(el('dataStatus').textContent, '');
});
