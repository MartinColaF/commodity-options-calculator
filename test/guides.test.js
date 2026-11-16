'use strict';

/* The guides: five hedges worked through the calculator, in English under
 * guides/ and in Spanish under es/guides/, each with a link that opens its
 * scenario. Every figure a guide quotes is the calculator's for that scenario,
 * so each test here opens the link the way the page does, recomputes the
 * figures, and finds them in both languages: a change to the pricing that moves
 * one fails here instead of leaving a guide that says something else. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./helpers/load-app');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const GUIDES = {
  soy: ['soybean-price-floor', 'piso-de-precio-soja'],
  coffee: ['coffee-zero-cost-collar', 'collar-costo-cero-cafe'],
  wti: ['crude-oil-price-cap', 'techo-de-precio-petroleo'],
  cattle: ['cattle-price-floor', 'piso-de-precio-ganado'],
  size: ['how-many-contracts', 'cuantos-contratos']
};
const pages = key => [`guides/${GUIDES[key][0]}.html`, `es/guides/${GUIDES[key][1]}.html`];
const ALL = [].concat(['guides/index.html', 'es/guides/index.html'], ...Object.keys(GUIDES).map(pages));
const text = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');

/* The guide's link, opened as the calculator opens it: the scenario after
 * "#s=" read by readHash() and taken by restore(). */
function open(file) {
  const href = read(file).match(/<a class="cta" href="([^"]+)">/)[1];
  const hash = href.slice(href.indexOf('#'));
  // readHash() needs atob, which a bare VM context lacks.
  const app = loadApp({ globals: { atob, location: { protocol: 'https:', hash, origin: 'https://example.test', pathname: '/' } } });
  const saved = app.readHash();
  assert.ok(saved, `${file}: the link carries a scenario`);
  assert.strictEqual(app.restore(saved), true, file);
  // Nothing in it was refused or dropped: what the page holds is the link.
  // (Both are the VM's objects, so compared as the JSON a link is made of.)
  assert.strictEqual(JSON.stringify(app.snapshot()), JSON.stringify(saved), `${file}: restored whole`);
  return { app, href };
}

/* Each figure must be in the guide and in its translation. */
function quotes(key, figures) {
  for (const file of pages(key)) {
    const body = text(read(file));
    for (const f of figures) assert.ok(body.includes(f), `${file} quotes ${f}`);
  }
}

test('every guide opens its scenario in the calculator in its own language', () => {
  for (const key of Object.keys(GUIDES)) {
    const [en, es] = pages(key).map(open);
    assert.ok(en.href.startsWith('/?ref=guide#s='), en.href.slice(0, 20));
    assert.ok(es.href.startsWith('/es/?ref=guide#s='), es.href.slice(0, 20));
    assert.strictEqual(en.href.split('#')[1], es.href.split('#')[1], `${key}: the same scenario in both`);
    // As a hedge is entered: American, the premium's interest at the rate,
    // the chart on the net price where there is a physical to price.
    assert.strictEqual(en.app.state.style, 'american', key);
    assert.strictEqual(en.app.state.financing.mode, 'rate', key);
  }
});

test('the soybean floor: the put, its cost, the floor in cents and in dollars a ton', () => {
  const { app } = open(pages('soy')[0]);
  const { fmt, fmtPrice, money } = app;
  const put = app.legEntry(app.state.legs[1]);
  const floor = app.netPrices(app.analyse()).worst;
  const s = app.contractsFor(app.state.hedgeQty);
  assert.strictEqual(app.state.legs[1].qty, 37, 'the legs hold 37 contracts');
  // A price is quoted as the calculator shows it, to an eighth of a cent.
  const figures = [fmtPrice(put) + ' ¢', money(put * 50), money(app.netCost()), fmtPrice(floor) + ' ¢', fmt(app.physicalPrice(floor), 2),
    fmt(s.exact, 2) + ' '];
  // And read nominally, as the extension worksheets do.
  app.state.financing.mode = 'none';
  const nominal = app.netPrices(app.analyse()).worst;
  figures.push(`1,000 − 40 − ${fmtPrice(put)} − 1 = ${fmtPrice(nominal)}`, fmt(app.physicalPrice(nominal), 2), fmtPrice(nominal - floor) + ' ¢');
  quotes('soy', figures);
  // The product review's numbers.
  assert.deepStrictEqual([fmtPrice(put), fmtPrice(nominal), fmt(app.physicalPrice(nominal), 2)], ['11.200', '947.800', '348.26']);
});

test('the coffee collar: the call that pays for the put, and the band', () => {
  const { app } = open(pages('coffee')[0]);
  const { fmt, fmtPrice, money } = app;
  const call = app.state.legs[2];
  const exact = app.strikeForCost(call, 0).strike;
  // The strike in the link is the one the button lands on.
  const held = call.strike;
  app.applyStrikeForCost(call.id, 0, 0);
  assert.strictEqual(call.strike, held, 'the scenario holds the strike the calculator finds');
  const put = app.legEntry(app.state.legs[1]);
  const np = app.netPrices(app.analyse());
  quotes('coffee', [fmtPrice(put) + ' ¢', money(put * 375), fmtPrice(exact) + ' ¢', fmtPrice(call.strike) + ' ¢',
    fmtPrice(app.legEntry(call)) + ' ¢', money(-app.netCost()), fmtPrice(np.worst) + ' ¢', fmtPrice(np.best) + ' ¢',
    fmt(app.physicalPrice(np.worst), 2), fmt(app.physicalPrice(np.best), 2)]);
  assert.ok(-app.netCost() >= 0, 'it costs nothing');
});

test('the crude oil cap: the call and the most the oil can cost', () => {
  const { app } = open(pages('wti')[0]);
  const { fmtPrice, money } = app;
  assert.strictEqual(app.state.legs[0].side, -1, 'a buyer holds the physical short');
  const call = app.legEntry(app.state.legs[1]);
  quotes('wti', [fmtPrice(call) + ' ', money(call * 1000), fmtPrice(app.netPrices(app.analyse()).worst) + ' ']);
});

test('the cattle floor: how many contracts 100 head are, the put and the floor a kilo', () => {
  const { app } = open(pages('cattle')[0]);
  const { fmt, fmtPrice, money } = app;
  const put = app.legEntry(app.state.legs[1]);
  const floor = app.netPrices(app.analyse()).worst;
  const s = app.contractsFor(app.state.hedgeQty);
  assert.strictEqual(app.state.hedgeQty, 60000, '100 head at 600 kg');
  quotes('cattle', [fmtPrice(put) + ' ¢', money(put * 400), fmtPrice(floor) + ' ¢', fmt(app.physicalPrice(floor), 2) + ' ',
    fmt(s.perContract, 2) + ' kg', fmt(s.exact, 2) + ' ', fmt(s.down.covers, 2) + ' kg', fmt(60000 - s.down.covers, 2) + ' ',
    fmt(s.up.covers, 2) + ' kg', fmt(s.up.covers - 60000, 2) + ' ']);
  assert.deepStrictEqual([s.down.n, s.up.n], [3, 4]);
});

test('how many contracts: 5,000 tons, market by market, and the scenario that sizes them', () => {
  const COMMODITIES = require('../commodities.js');
  const { app } = open(pages('size')[0]);
  const { fmt } = app;
  const s = app.contractsFor(5000);
  assert.strictEqual(app.state.hedgeQty, 5000);
  // The button the guide names puts 37 on both legs.
  app.applyHedgeContracts(s.up.n);
  assert.deepStrictEqual(Array.from(app.state.legs, l => l.qty), [37, 37]);
  for (const key of ['soybean', 'corn', 'sugar', 'cotton']) {
    const m = loadApp();
    m.state.commodity = key;
    m.state.size = COMMODITIES[key].size;
    const c = m.contractsFor(5000);
    quotes('size', [fmt(c.perContract, 2) + ' t', fmt(c.exact, 2) + ' ', `${c.up.n} `, fmt(c.up.covers, 2) + ' t',
      fmt(c.up.covers - 5000, 2) + ' ', `${c.down.n} `, fmt(c.down.covers, 2) + ' t', fmt(5000 - c.down.covers, 2) + ' ']);
  }
  const r = loadApp();
  r.state.commodity = 'soybean-a3';
  r.state.size = 100;
  assert.deepStrictEqual([r.contractsFor(5000).exact, r.contractsFor(5000).up.n], [50, 50]);
  quotes('size', ['100.00 t', ' 50 ']);
});

test('each guide and its translation are the same page, tag for tag, and name each other', () => {
  const tags = html => Array.from(html.split('<body>')[1].matchAll(/<(\/?[a-z0-9]+)((?:\s+class="[^"]*")?)[^>]*>/g), m => m[1] + m[2]);
  const meta = html => Array.from(html.split('</head>')[0].matchAll(/<(meta|link) (\w+(?:-\w+)?)="([\w:-]+)"/g), m => m.slice(1, 4).join(' '));
  for (let i = 0; i < ALL.length; i += 2) {
    const en = read(ALL[i]), es = read(ALL[i + 1]);
    assert.deepStrictEqual(tags(es), tags(en), ALL[i + 1]);
    assert.deepStrictEqual(meta(es), meta(en), ALL[i + 1]);
    const canonical = html => html.match(/<link rel="canonical" href="https:\/\/[^/]+([^"]+)">/)[1];
    const alternate = (html, lang) => html.match(new RegExp(`hreflang="${lang}" href="https://[^/]+([^"]+)"`))[1];
    for (const [html, file] of [[en, ALL[i]], [es, ALL[i + 1]]]) {
      assert.strictEqual(alternate(html, 'en'), canonical(en), file);
      assert.strictEqual(alternate(html, 'es'), canonical(es), file);
      assert.strictEqual(canonical(html), '/' + file.replace(/index\.html$/, ''), file);
    }
    // The language switch at the top goes to the translation.
    assert.ok(en.includes(`<a href="${canonical(es)}" hreflang="es" lang="es">Español</a>`), ALL[i]);
    assert.ok(es.includes(`<a href="${canonical(en)}" hreflang="en" lang="en">English</a>`), ALL[i + 1]);
  }
});

test('the guides are listed, and the calculator links the list', () => {
  for (const [list, home, n] of [['guides/index.html', 'index.html', 0], ['es/guides/index.html', 'es/index.html', 1]]) {
    const html = read(list);
    for (const key of Object.keys(GUIDES)) assert.ok(html.includes(`<a href="/${pages(key)[n]}">`), `${list} lists ${key}`);
    assert.ok(read(home).includes(`<a href="/${list.replace('index.html', '')}">`), `${home} links ${list}`);
  }
});

test('the guides run nothing inline and find their files', () => {
  for (const file of ALL) {
    const html = read(file);
    assert.doesNotMatch(html, /\sstyle=/, `${file}: no inline style`);
    assert.deepStrictEqual(Array.from(html.matchAll(/<script\b[^>]*>/g), m => m[0]),
      [`<script src="${file.startsWith('es/') ? '../../' : '../'}analytics.js">`], `${file}: only the visit count`);
    assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'self' file:; object-src 'none'; base-uri 'self'; form-action 'self'"/);
    // Illustrative prices, said so on the page.
    assert.match(text(html), /illustrative, not market data|ilustrativos, no datos de mercado/, file);
  }
});

test('the English is American and signs are minus signs; the Spanish speaks to no one', () => {
  const british = /\b\w*(annualis|realis|generalis|modell|labell|behaviour|colour|centre|optimis|minimis|maximis|harvest-time)\w*/i;
  const word = list => new RegExp(`(?<!\\p{L})(${list})(?!\\p{L})`, 'iu');
  for (const file of ALL) {
    const body = text(read(file));
    assert.doesNotMatch(body, /(^|[\s(])-\$?\d/, `${file}: a hyphen before a figure`);
    if (file.startsWith('es/')) {
      assert.doesNotMatch(body, word('tú|tu|tus|vos|usted|ustedes|te|contigo'), file);
      assert.doesNotMatch(body, word('elegí|ingresá|tocá|hacé|cargá|usá|probá|mirá|haz|pulsa|pulsá|abrí'), file);
    } else {
      const hit = body.match(british);
      assert.ok(!hit, `${file}: "${hit && hit[0]}"`);
    }
  }
});
