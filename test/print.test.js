'use strict';

/* The printed report. A risk committee, a bank or an auditor wants the hedge on
 * paper: the position, its results, the chart and the scenarios, with where
 * each market number came from and when. The page printed as it is showed
 * every button and, in the dark scheme, light text on white paper. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { wired } = require('./helpers/load-app');
const SPANISH = require('../es/words.js');

const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/* The body of `<selector or @media query> { … }`, braces balanced. */
function block(head) {
  const at = css.indexOf(head + ' {');
  assert.ok(at >= 0, `styles.css has ${head}`);
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', at) + 1, i);
  }
  throw new Error('unbalanced');
}
const vars = body => Object.fromEntries(Array.from(body.matchAll(/(--[\w-]+):\s*([^;]+);/g), m => [m[1], m[2].trim()]));

test('each page has the button, and a line for the date and the link that shows only on paper', () => {
  for (const [file, label] of [['index.html', 'Print or save as PDF'], ['es/index.html', 'Imprimir o guardar en PDF']]) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const save = html.match(/<section class="card" id="cardSave"[\s\S]*?<\/section>/)[0];
    assert.match(save, new RegExp(`<button id="print" class="ghost">${label}</button>`), file);
    assert.match(html.match(/<header>[\s\S]*?<\/header>/)[0], /<p class="print-only" id="printInfo"><\/p>/, file);
  }
  assert.match(css, /\.print-only \{ display: none; \}/, 'not on screen');
});

test('on paper: no controls, results first, and the cards kept whole', () => {
  const print = block('@media print');
  assert.match(print, /\.print-only \{ display: block; \}/);
  const hidden = print.match(/([^{}]+)\{ display: none !important; \}/)[1];
  for (const sel of ['.lang-switch', 'button', '.file-button', '#cardSave', '#strategy', 'input[type=range]']) {
    assert.ok(hidden.includes(sel), `${sel} is not printed`);
  }
  assert.match(print, /\.card \{ break-inside: avoid; \}/);
  // The phone's order, results before inputs, is the report's.
  assert.match(css, /@media \(max-width: 900px\), print \{/);
});

test('printing takes the light palette whatever the scheme, so the chart reads on paper', () => {
  const light = vars(block(':root'));
  const printing = vars(block(':root.printing'));
  assert.ok(Object.keys(light).length >= 20);
  assert.deepStrictEqual(printing, light, 'every colour as in the light scheme');
  assert.match(block(':root.printing'), /color-scheme: light;/);
  // Each colour the dark scheme changes is one printing sets back.
  const dark = vars(block('@media (prefers-color-scheme: dark)'));
  for (const k of Object.keys(dark)) assert.ok(k in printing, k);
});

test('the button prints, and the report says when and links to the scenario', () => {
  // shareLink() needs btoa, which a bare VM context lacks.
  const { app, el, fire, doc, win } = wired({ globals: { btoa } });
  fire('print', 'click');
  assert.strictEqual(win.printed, 1);
  // Before the browser lays out the print, whether from the button or its own menu.
  fire('window', 'beforeprint');
  // The link is a whole position long: named, and opening from a PDF.
  assert.match(el('printInfo').innerHTML,
    /^Printed \d{4}-\d{2}-\d{2} from example\.test\. <a href="https:\/\/example\.test\/\?ref=share#s=[A-Za-z0-9_-]+">Open this scenario<\/a>$/);
  assert.strictEqual(doc.documentElement.classList.contains('printing'), true);
  assert.ok(el('printInfo').innerHTML.includes(`href="${app.shareLink()}"`));
  fire('window', 'afterprint');
  assert.strictEqual(el('printInfo').innerHTML, '');
  assert.strictEqual(doc.documentElement.classList.contains('printing'), false);
});

test('and in Spanish', () => {
  const { el, fire } = wired({ lang: 'es', words: { es: SPANISH }, globals: { btoa } });
  fire('window', 'beforeprint');
  assert.match(el('printInfo').innerHTML, /^Impreso el \d{4}-\d{2}-\d{2} desde example\.test\. <a href="https:[^"]+">Abrir este escenario<\/a>$/);
});
