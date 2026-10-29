'use strict';

/* The page on a phone. Most visits come from links opened on one, so the cards
 * are reordered there, results first; fields are 16px so iOS does not zoom into
 * them; controls are 44px; and a field's edge stands out from the card. These
 * read the stylesheet and the markup, since there is no browser here. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { wired } = require('./helpers/load-app');

const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* The body of the first `@media <query> { … }`, braces balanced. */
function media(query) {
  const at = css.indexOf('@media ' + query + ' {');
  assert.ok(at >= 0, `styles.css has @media ${query}`);
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return { at, body: css.slice(css.indexOf('{', at) + 1, i) };
  }
  throw new Error('unbalanced');
}

test('every card has a place in the phone order, results before inputs', () => {
  const cards = Array.from(html.matchAll(/<section class="card" id="(\w+)"/g), m => m[1]);
  assert.strictEqual(cards.length, (html.match(/class="card"/g) || []).length, 'every card has an id');
  const phone = media('(max-width: 900px)').body;
  const order = {};
  for (const id of cards) {
    const m = phone.match(new RegExp(`#${id}\\s*\\{\\s*order:\\s*(\\d+);`));
    assert.ok(m, `#${id} has an order on a phone`);
    order[id] = +m[1];
  }
  assert.strictEqual(new Set(Object.values(order)).size, cards.length, 'no two cards share a place');
  for (const out of ['legs', 'cardResults', 'cardPayoff']) {
    for (const input of ['cardContract', 'cardMarket']) assert.ok(order[out] < order[input], `${out} before ${input}`);
  }
});

test('the reordered cards keep to the screen width', () => {
  // With the column wrappers set to display: contents the cards become the
  // grid's items, and without min-width: 0 the legs table widened the page.
  const phone = media('(max-width: 900px)').body;
  assert.match(phone, /\.grid > div\s*\{\s*display:\s*contents;/);
  assert.match(phone, /\.grid \.card[^{]*\{\s*min-width:\s*0;/);
});

test('phone sizes come after the rules they override', () => {
  const sixteen = media('(max-width: 900px), (pointer: coarse)');
  assert.match(sixteen.body, /input, select, textarea, #legs input, #legs select\s*\{\s*font-size:\s*16px;/);
  const touch = media('(pointer: coarse)');
  assert.match(touch.body, /min-height:\s*44px/);
  // Earlier in the file, the base sizes won and iOS still zoomed.
  for (const base of ['input, select, button, textarea {', '#legs input, #legs select {',
    'label.inline input[type=checkbox] {', '.chart-controls input[type=checkbox] {']) {
    const at = css.indexOf(base);
    assert.ok(at >= 0, base);
    assert.ok(at < sixteen.at && at < touch.at, `${base} comes before the phone sizes`);
  }
});

/* WCAG's contrast ratio between two #rrggbb colours. */
function contrast(a, b) {
  const lum = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test("a field's edge stands out from the card and the page at 3:1, in both schemes", () => {
  const vars = block => Object.fromEntries(Array.from(block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), m => [m[1], m[2].trim()]));
  const light = vars(css.match(/^:root\s*\{([^}]*)\}/m)[1]);
  const dark = Object.assign({}, light, vars(css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)[1]));
  for (const [name, v] of [['light', light], ['dark', dark]]) {
    for (const against of ['--card', '--bg', '--field']) {
      const r = contrast(v['--field-border'], v[against]);
      assert.ok(r >= 3, `${name}: --field-border against ${against} is ${r.toFixed(2)}:1`);
    }
  }
  assert.match(css, /input, select, button, textarea\s*\{[^}]*border:\s*1px solid var\(--field-border\)/);
  assert.match(css, /button\.ghost\s*\{[^}]*border:\s*1px solid var\(--field-border\)/);
});

test('on a phone the strategy says which contract it prices', () => {
  const { app, el } = wired();
  app.renderInputs();
  assert.strictEqual(el('legsContext').textContent, 'Gold (COMEX GC) · futures 4,000 · vol 15% · European');
  app.state.model = 'bs';
  app.state.style = 'american';
  app.state.vol = 18.47213595499958;
  app.renderInputs();
  assert.strictEqual(el('legsContext').textContent, 'Gold (COMEX GC) · spot 4,000 · vol 18.4721% · American');
});

test('a hint reads as a hint and an idle field as idle, both still legible', () => {
  // The legs table's placeholders, what a blank field takes from the panel, read
  // as values typed in; "90" in the carry check as 90 days; and a field faded to
  // half opacity read as an empty one.
  assert.match(css, /::placeholder\s*\{[^}]*color:\s*var\(--muted\);[^}]*font-style:\s*italic/);
  assert.match(css, /input:disabled, select:disabled\s*\{[^}]*background:\s*var\(--bg\);[^}]*border-style:\s*dashed/);
  const vars = block => Object.fromEntries(Array.from(block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), m => [m[1], m[2].trim()]));
  const light = vars(css.match(/^:root\s*\{([^}]*)\}/m)[1]);
  const dark = Object.assign({}, light, vars(css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)[1]));
  for (const [name, v] of [['light', light], ['dark', dark]]) {
    const r = contrast(v['--muted'], v['--field']);
    assert.ok(r >= 4.5, `${name}: a placeholder against its field is ${r.toFixed(2)}:1`);
  }
  for (const file of ['index.html', 'es/index.html']) {
    const page = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    for (const id of ['carryS', 'carryF', 'carryDays']) {
      const hint = page.match(new RegExp(`id="${id}"[^>]*placeholder="([^"]+)"`))[1];
      assert.doesNotMatch(hint, /^[\d.,]+$/, `${file} #${id}: "${hint}" is not a bare number`);
    }
  }
});
