'use strict';

/* The Spanish page, es/index.html. It is index.html with its words in Spanish:
 * the same elements, ids, classes and attributes in the same order, the same
 * policy and the same scripts, with words.js before app.js. A change to one
 * page that is not made to the other fails here. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, resetState, wired } = require('./helpers/load-app');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const en = read('index.html');
const es = read('es/index.html');
const SPANISH = require('../es/words.js');
const SITE = 'https://commodity-options-calculator.vercel.app/';

/* Attributes that hold words: compared by name, not by value. */
const WORDY = ['aria-label', 'placeholder', 'title'];

/* The body as a list of tags, words left out, and the text between them. The
 * language switch, the page's own words file and the paths that differ only
 * because the Spanish page sits one folder down are taken out first. */
function shape(html) {
  const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'))
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<p class="lang-switch">[\s\S]*?<\/p>/, '')
    .replace('<script src="../es/words.js"></script>', '');
  const tags = [], texts = [];
  for (const m of body.matchAll(/<(\/?)([a-z0-9]+)\b([^>]*)>([^<]*)/gi)) {
    const attrs = Array.from(m[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g), a => {
      if (WORDY.includes(a[1])) return a[1];
      if (a[1] === 'href' || a[1] === 'src') return a[1] + '=' + a[2].replace(/^\.\.\//, '').replace(/^\/es\//, '/');
      return a[0];
    });
    tags.push(`<${m[1]}${m[2]} ${attrs.join(' ')}>`);
    texts.push(m[4].replace(/\s+/g, ' ').trim());
  }
  return { tags, texts };
}

test('the Spanish page has the English page\'s elements, attributes and order', () => {
  const a = shape(en), b = shape(es);
  assert.ok(a.tags.length > 400, `${a.tags.length} tags`);
  for (let i = 0; i < Math.max(a.tags.length, b.tags.length); i++) {
    assert.strictEqual(b.tags[i], a.tags[i], `tag ${i}, after "${a.texts[i - 1] || ''}"`);
  }
});

/* Text that reads the same in both: names, units, symbols and market terms. */
const SAME = new Set(['', '?', '×', 'IV', 'USD', 'Payoff', 'Skew', 'Strike', 'Vol', 'Vol %', 'Delta', 'Black-76 (option on futures)',
  'Black-Scholes-Merton (spot + carry)', 'EWMA (0.94)', 'Parkinson', 'Close-to-close', '20d', '30d', '60d', '90d',
  'F = S·e', '(r−y)T', 'Alpha Vantage', 'JSON']);

test('every word of the Spanish page is in Spanish, apart from names and market terms', () => {
  const a = shape(en), b = shape(es);
  const left = [];
  if (a.texts.length !== b.texts.length) assert.fail(`${a.texts.length} texts in English, ${b.texts.length} in Spanish`);
  a.texts.forEach((t, i) => {
    if (t && t === b.texts[i] && !SAME.has(t.replace(/&middot;/g, '·').replace(/&minus;/g, '−'))) left.push(t);
  });
  assert.deepStrictEqual(left, [], 'still in English');
  const words = Array.from(es.matchAll(/\b(?:aria-label|placeholder|title)="([^"]+)"/g), m => m[1]);
  const english = Array.from(en.matchAll(/\b(?:aria-label|placeholder|title)="([^"]+)"/g), m => m[1]);
  assert.strictEqual(words.length, english.length);
  words.forEach((w, i) => { if (w === english[i]) assert.fail(`still in English: ${w}`); });
});

test('the Spanish page speaks to no one in particular', () => {
  // Impersonal, as decided for the Spanish text: no tú, vos or usted, and no
  // imperative addressed to the reader.
  const text = (es + Object.values(SPANISH).join('\n')).replace(/<[^>]+>/g, ' ');
  // A word is letters, accented ones included, which \b does not know.
  const word = list => new RegExp(`(?<!\\p{L})(${list})(?!\\p{L})`, 'iu');
  assert.doesNotMatch(text, word('tú|tu|tus|vos|usted|ustedes|te|contigo'));
  // The imperatives that cannot also be a third person: "se usa" is impersonal.
  assert.doesNotMatch(text, word('elegí|ingresá|tocá|hacé|cargá|usá|probá|mirá|haz|pulsa|pulsá'));
});

test('the same policy, the same Chart.js and the same scripts, one folder down', () => {
  const csp = html => html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)[1];
  assert.strictEqual(csp(es), csp(en));
  const chartjs = html => html.match(/<script src="https:[^>]*>/)[0];
  assert.strictEqual(chartjs(es), chartjs(en));
  const scripts = html => Array.from(html.matchAll(/<script src="([^h][^"]*)"><\/script>/g), m => m[1]);
  assert.deepStrictEqual(scripts(en), ['commodities.js', 'i18n.js', 'app.js']);
  assert.deepStrictEqual(scripts(es), ['../commodities.js', '../i18n.js', '../es/words.js', '../app.js'],
    'its words load after i18n.js and before app.js');
  for (const f of Array.from(es.matchAll(/\b(?:src|href)="([^"#:]+)"/g), m => m[1])) {
    const file = f.startsWith('/') ? path.join(ROOT, f, f.endsWith('/') ? 'index.html' : '') : path.join(ROOT, 'es', f);
    assert.ok(fs.existsSync(file), `${f} is there`);
  }
});

test('the Spanish page finds its files at /es and at /es/ alike', () => {
  // Vercel serves the page at both, and the browser reads a relative path from
  // the folder the address ends in: from /es, words.js was /words.js, a 404,
  // and every word app.js writes came out in English.
  for (const f of Array.from(es.matchAll(/\b(?:src|href)="([^"#:]+)"/g), m => m[1])) {
    assert.strictEqual(new URL(f, SITE + 'es').href, new URL(f, SITE + 'es/').href, f);
  }
});

test('each page says which language it is in and where the other one is', () => {
  assert.match(en, /<html lang="en">/);
  assert.match(es, /<html lang="es">/);
  const alternates = html => Array.from(html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g), m => m[1] + ' ' + m[2]);
  const both = [`en ${SITE}`, `es ${SITE}es/`, `x-default ${SITE}`];
  assert.deepStrictEqual(alternates(en), both);
  assert.deepStrictEqual(alternates(es), both);
  assert.match(en, /<p class="lang-switch"><a href="\/es\/" hreflang="es" lang="es">Español<\/a><\/p>/);
  assert.match(es, /<p class="lang-switch"><a href="\/" hreflang="en" lang="en">English<\/a><\/p>/);
  assert.match(es, /<a href="\/es\/privacy.html">Política de privacidad<\/a>/);
});

test('the notes name the Spanish buttons by what they say', () => {
  const button = id => es.match(new RegExp(`<button id="${id}"[^>]*>([^<]+)<`))[1];
  assert.match(es, new RegExp(`el botón <strong>${button('fillLegPrices')}</strong>`));
  assert.match(es, new RegExp(`<strong>${button('clearLegPrices')}</strong> vuelve a poner`));
  assert.ok(SPANISH['Pricing against one listed contract. "Fill leg prices" now interpolates between these {n} real quotes instead of extrapolating a single slope.']
    .includes(`"${button('fillLegPrices')}"`), 'the month note quotes the fill button');
});

/* The app as the Spanish page runs it. */
const spanish = opts => Object.assign({ lang: 'es', words: { es: SPANISH } }, opts);

test("a leg card's headings are the Spanish table's column headings", () => {
  const app = loadApp(spanish());
  resetState(app, { S: 100, vol: 30 });
  const thead = es.match(/<thead>([\s\S]*?)<\/thead>/)[1];
  const heads = Array.from(thead.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g), m => m[1].replace(/<[^>]+>/g, '').trim());
  const row = app.legRowHtml(app.newLeg({ kind: 'call', strike: 100, days: 30 }), 100, 2);
  const labels = Array.from(row.matchAll(/<td\b([^>]*)>/g), m => (m[1].match(/data-label="([^"]*)"/) || [])[1]);
  for (let i = 0; i < heads.length - 1; i++) assert.strictEqual(labels[i], heads[i], `column ${i + 1}`);
  assert.match(row, /data-f="del"[^>]*aria-label="Quitar, pata 2"/);
  assert.match(row, /<option value="-1" >Venta<\/option>/);
});

test('the Spanish page writes its results, chart and messages in Spanish, with the decimal point', () => {
  const { app, el, fire } = wired(spanish());
  app.applyStrategy('bull-call');
  app.renderAll();
  assert.match(el('summary').innerHTML, /<span>Ganancia máxima<\/span><strong class="pos">\$[\d,]+\.\d\d<\/strong>/);
  assert.match(el('summary').innerHTML, /<span>Horizonte<\/span><strong>30 días<\/strong>/);
  assert.match(el('contractSummary').textContent, /^Black-76 · Europea · primer vencimiento · tasa 4\.00% · /);
  assert.match(el('multInfo').textContent, /^1 contrato = 100 onzas troy - multiplicador del P&L \$100\.00 por punto$/);
  const cfg = app.chartConfig(app.analyse());
  assert.strictEqual(cfg.options.scales.y.title.text, 'Ganancia / pérdida ($)');
  assert.strictEqual(cfg.data.datasets[0].label, 'Al horizonte (30d)');
  fire('spot', 'change', { value: '-5' });
  assert.match(el('spotProblem').textContent, /^Se necesita un precio mayor que cero\. .* Se sigue usando 4,000\.00\.$/);
  fire('clearLegs', 'click');
  assert.strictEqual(el('legStatus').textContent, 'Se quitaron las 2 patas.');
});

test('the Spanish page names its markets and strategies in Spanish', () => {
  const page = loadApp(spanish());
  assert.strictEqual(page.t(page.COMMODITIES.soybean.label), 'Soja (CBOT ZS)');
  assert.strictEqual(page.t(page.STRATEGIES['short-call'].label), 'Venta de call (descubierta)');
});
