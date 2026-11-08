'use strict';

/* The picture for a post. A shared link previews the generic og.png whatever
 * its scenario, since the scenario sits after "#", where no crawler reads, so
 * the page makes a picture of the position: the chart in the light palette,
 * the numbers beside it as the results card gives them, and where it came
 * from. It was copied once while Chart.js still had an animation running and
 * came out in the dark scheme's colours, pale on white. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { wired } = require('./helpers/load-app');
const SPANISH = require('../es/words.js');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const vars = body => Object.fromEntries(Array.from(body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), m => [m[1], m[2].trim()]));
const LIGHT = vars(css.match(/^:root\s*\{([^}]*)\}/m)[1]);
const DARK = Object.assign({}, LIGHT, vars(css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)[1]));

const flush = () => new Promise(resolve => setImmediate(resolve));

/* A 2D context that records what is drawn on it. */
function recorder() {
  const calls = [];
  const ctx = { calls };
  for (const k of ['fillRect', 'fillText', 'drawImage']) {
    ctx[k] = (...args) => calls.push({ op: k, args, fillStyle: ctx.fillStyle, font: ctx.font });
  }
  return ctx;
}

/* A page in the dark scheme with a stand-in for Chart.js and for the canvases
 * the picture is drawn on, and a log of what the chart was asked to do: whether
 * the light palette was held, and the colour its P&L line was given. The
 * stylesheet answers as a browser's would, light while the root holds
 * .printing. */
function withChart(opts) {
  const log = [];
  let doc;
  function FakeChart(context, cfg) {
    this.canvas = { width: 1400, height: 680 };
    this.data = cfg.data;
    log.push('create');
  }
  FakeChart.prototype.update = function () {
    const printing = doc.documentElement.classList.contains('printing');
    log.push(`update ${printing ? 'printing' : 'screen'} ${this.data.datasets[0].borderColor}`);
  };
  FakeChart.prototype.stop = function () { log.push('stop'); };
  FakeChart.prototype.resize = function () { };
  const getComputedStyle = () => {
    const v = doc.documentElement.classList.contains('printing') ? LIGHT : DARK;
    return { fontFamily: 'Inter', getPropertyValue: k => (Object.prototype.hasOwnProperty.call(v, k) ? v[k] : '') };
  };
  const o = Object.assign({}, opts);
  const page = wired(Object.assign(o, { globals: Object.assign({ Chart: FakeChart, getComputedStyle }, o.globals) }));
  doc = page.doc;
  const ctx = recorder();
  const made = [];
  doc.createElement = tag => {
    const node = tag === 'canvas'
      ? { getContext: () => ctx, toBlob: cb => cb({ png: true }) }
      : { click() { this.clicked = true; } };
    made.push(Object.assign(node, { tag }));
    return node;
  };
  page.el('payoffChart').getContext = () => ({});
  page.app.applyStrategy('bull-call');
  page.app.renderChartSafely(page.app.analyse());
  log.length = 0;
  return Object.assign(page, { log, ctx, made });
}

test('the picture says what the results card says, with each number\'s basis', () => {
  const { app, el } = wired();
  app.applyStrategy('bull-call');
  app.renderResults();
  const a = app.analyse();
  const text = app.shareImageText(a);
  assert.strictEqual(text.title, 'Gold (COMEX GC)');
  assert.strictEqual(text.subtitle, 'futures 4,000 · vol 15% · 30-day horizon');
  assert.strictEqual(a.breakevens.length, 1);
  assert.deepStrictEqual(Array.from(text.kpis, k => k[0]),
    ['Net debit (paid)', 'Max profit', 'Max loss', 'Breakeven', 'Prob. of profit']);
  // Every value is the one on the page.
  const summary = el('summary').innerHTML;
  for (const [label, value] of text.kpis) assert.ok(summary.includes(`${value}</strong>`), `${label}: ${value}`);
  assert.deepStrictEqual(Array.from(text.kpis, k => k[2]), ['', 'pos', 'neg', '', '']);
  // A probability passed around without its basis reads as a forecast.
  assert.strictEqual(text.kpis[4][3], 'risk-neutral, at 15.0% vol');
  assert.ok(summary.includes(text.kpis[4][3]));
  assert.match(text.footer, /^example\.test · Not investment advice · \d{4}-\d{2}-\d{2}$/);
});

test('an unlimited maximum says how fast it grows, in the picture as on the page', () => {
  const { app, el } = wired();
  app.applyStrategy('short-strangle');
  app.renderResults();
  const text = app.shareImageText(app.analyse());
  const loss = text.kpis[2];
  assert.strictEqual(loss[1], 'Unlimited');
  assert.strictEqual(loss[3], '−$100.00 per point as the price rises');
  assert.ok(el('summary').innerHTML.includes(`<small>${loss[3]}</small>`));
  assert.strictEqual(text.kpis[1][3], '', 'a bounded maximum has no note');
});

test('the numbers stay in the left column, and the chart keeps its proportions in its box', () => {
  const { app } = wired();
  app.applyStrategy('iron-condor');
  const text = app.shareImageText(app.analyse());
  const box = app.SHARE_IMAGE.chart;
  const colors = { font: 'Inter', card: '#fff', text: '#111', muted: '#666', accent: '#06c', pos: '#070', neg: '#a00' };
  for (const [cw, ch] of [[1400, 680], [600, 600]]) {
    const ctx = recorder();
    app.drawShareImage(ctx, text, { width: cw, height: ch }, colors);
    const image = ctx.calls.find(c => c.op === 'drawImage');
    const [, x, y, w, h] = image.args;
    assert.ok(Math.abs(w / h - cw / ch) < 1e-9, 'its own proportions');
    assert.ok(x >= box.x - 1e-9 && y >= box.y - 1e-9 && x + w <= box.x + box.w + 1e-9 && y + h <= box.y + box.h + 1e-9, 'inside its box');
    assert.ok(Math.abs(w - box.w) < 1e-9 || Math.abs(h - box.h) < 1e-9, 'as large as the box allows');
    const texts = ctx.calls.filter(c => c.op === 'fillText');
    const footer = texts[texts.length - 1];
    assert.strictEqual(footer.args[0], text.footer);
    assert.ok(footer.args[2] > box.y + box.h, 'the foot is under the chart');
    let last = 0;
    for (const c of texts.slice(0, -1)) {
      const [, tx, ty, maxWidth] = c.args;
      assert.strictEqual(tx, 48);
      assert.ok(tx + maxWidth <= box.x, `"${c.args[0]}" can never reach the chart`);
      assert.ok(ty > last, 'line after line, none on another');
      last = ty;
    }
    assert.ok(last < footer.args[2] - 20);
  }
  // The background, the profit in green, the loss in red.
  const ctx = recorder();
  app.drawShareImage(ctx, text, { width: 1400, height: 680 }, colors);
  assert.deepStrictEqual(ctx.calls[0].args, [0, 0, 1200, 627]);
  assert.strictEqual(ctx.calls[0].fillStyle, '#fff');
  const value = s => ctx.calls.find(c => c.op === 'fillText' && c.args[0] === s);
  assert.strictEqual(value(text.kpis[1][1]).fillStyle, '#070');
  assert.strictEqual(value(text.kpis[2][1]).fillStyle, '#a00');
});

test('the chart is drawn at once in the light palette, copied, and given back', () => {
  assert.notStrictEqual(LIGHT['--chart-net'], DARK['--chart-net']);
  assert.notStrictEqual(LIGHT['--card'], DARK['--card']);
  const { app, doc, log, ctx } = withChart();
  const canvas = app.renderShareImage(app.analyse());
  assert.ok(canvas);
  assert.strictEqual(canvas.width, 1200);
  assert.strictEqual(canvas.height, 627);
  // Stopped before each drawing: a running animation left it to the next frame.
  assert.deepStrictEqual(log, [
    'stop', `update printing ${LIGHT['--chart-net']}`,
    'stop', `update screen ${DARK['--chart-net']}`
  ]);
  assert.strictEqual(doc.documentElement.classList.contains('printing'), false);
  const image = ctx.calls.find(c => c.op === 'drawImage');
  assert.deepStrictEqual(image.args[0], { width: 1400, height: 680 });
  // The picture's own colours are the light ones too.
  assert.strictEqual(ctx.calls[0].fillStyle, LIGHT['--card']);
  assert.strictEqual(ctx.calls.find(c => c.op === 'fillText').fillStyle, LIGHT['--text']);
  assert.ok(ctx.calls.some(c => c.op === 'fillText' && c.args[0] === 'Gold (COMEX GC)'));
});

test('the print also stops the chart before drawing it for paper', () => {
  const { fire, log } = withChart({ globals: { btoa } });
  fire('window', 'beforeprint');
  assert.deepStrictEqual(log.slice(0, 2), ['stop', `update printing ${LIGHT['--chart-net']}`]);
  fire('window', 'afterprint');
  assert.deepStrictEqual(log.slice(2, 4), ['stop', `update screen ${DARK['--chart-net']}`]);
});

test('the button saves the picture as a file where there is no share sheet', async () => {
  const revoked = [];
  const { el, fire, made } = withChart({
    globals: { URL: { createObjectURL: () => 'blob:picture', revokeObjectURL: u => revoked.push(u) } }
  });
  fire('shareImage', 'click');
  await flush();
  const link = made.find(n => n.tag === 'a');
  assert.ok(link && link.clicked);
  assert.match(link.download, /^gold-\d{4}-\d{2}-\d{2}\.png$/);
  assert.deepStrictEqual(revoked, ['blob:picture']);
  assert.strictEqual(el('saveStatus').textContent, `Picture saved as ${link.download}.`);
  assert.strictEqual(el('saveStatus').className, 'note pos');
});

test('where the share sheet takes files, the picture goes there; closing it says nothing', async () => {
  class File { constructor(parts, name, o) { this.name = name; this.type = o.type; } }
  const shared = [];
  let refuse = null;
  const navigator = {
    share: async d => { if (refuse) throw refuse; shared.push(d); },
    canShare: d => Array.isArray(d.files)
  };
  const { el, fire, made } = withChart({ globals: { File, navigator, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } } } });
  fire('shareImage', 'click');
  await flush();
  assert.strictEqual(shared.length, 1);
  assert.match(shared[0].files[0].name, /^gold-\d{4}-\d{2}-\d{2}\.png$/);
  assert.strictEqual(shared[0].files[0].type, 'image/png');
  assert.ok(!made.some(n => n.tag === 'a'), 'nothing downloaded');
  assert.strictEqual(el('saveStatus').textContent, '');
  // Closed: not a failure.
  refuse = Object.assign(new Error('closed'), { name: 'AbortError' });
  fire('shareImage', 'click');
  await flush();
  assert.ok(!made.some(n => n.tag === 'a'));
  assert.strictEqual(el('saveStatus').textContent, '');
  // The sheet could not open: saved as a file instead.
  refuse = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  fire('shareImage', 'click');
  await flush();
  assert.ok(made.some(n => n.tag === 'a' && n.clicked));
  assert.match(el('saveStatus').textContent, /^Picture saved as gold-/);
});

test('with nothing to draw, or no chart library, the button says so under itself', () => {
  const { app, el, fire } = wired();
  fire('shareImage', 'click');
  assert.strictEqual(el('saveStatus').textContent, 'There is nothing to draw yet: choose a strategy or add a leg.');
  assert.strictEqual(el('saveStatus').className, 'problem');
  // No Chart.js here: the page has no chart to copy.
  app.applyStrategy('bull-call');
  fire('shareImage', 'click');
  assert.strictEqual(el('saveStatus').textContent, 'The chart library could not be loaded, so there is no picture to make.');
});

test('and in Spanish', () => {
  const { app, el, fire } = wired({ lang: 'es', words: { es: SPANISH } });
  fire('shareImage', 'click');
  assert.strictEqual(el('saveStatus').textContent, 'Todavía no hay nada que dibujar: elegir una estrategia o agregar una pata.');
  app.applyStrategy('collar');
  const text = app.shareImageText(app.analyse());
  assert.strictEqual(text.title, 'Oro (COMEX GC)');
  assert.strictEqual(text.subtitle, 'futuro 4,000 · vol 15% · horizonte de 30 días');
  assert.strictEqual(text.kpis[4][3], 'neutral al riesgo, con vol de 15.0%');
  assert.match(text.footer, /^example\.test · No es asesoramiento de inversión · \d{4}-\d{2}-\d{2}$/);
});
