'use strict';

/* The scenario grid's shading. Gains and losses were shaded against one scale,
 * the largest P&L in the grid: a long call's losses, $1,130 at most beside
 * gains of $58,874, got an opacity of 0.0096, and the grid read as green and
 * nothing. Each sign now has its own scale, from a floor that shows. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');

function shades(html) {
  const out = { gain: [], loss: [], plain: 0 };
  for (const m of html.matchAll(/<td class="num"( style="background:rgba\((\d+),(\d+),(\d+),([\d.]+)\)")?>([^<]*)<\/td>/g)) {
    if (!m[1]) { out.plain++; continue; }
    (m[2] === '32' ? out.gain : out.loss).push({ alpha: +m[5], text: m[6] });
  }
  return out;
}

test('losses show beside much larger gains, each scaled to its own largest', () => {
  const { app, el } = wired();
  app.state.legs = [app.newLeg({ kind: 'call', strike: 4200, days: 30 })];
  const s = app.scenarioTable();
  assert.ok(s.best > 40 * s.worstLoss, `gains ${s.best} dwarf losses ${s.worstLoss}`);
  app.renderScenarios();
  const { gain, loss } = shades(el('scenarios').innerHTML);
  assert.ok(loss.length > 0 && gain.length > 0);
  assert.ok(loss.every(c => c.alpha >= 0.12 && /^−\$/.test(c.text)), 'every loss is visibly red');
  assert.ok(gain.every(c => c.alpha >= 0.12 && !/^-/.test(c.text)), 'every gain is visibly green');
  assert.strictEqual(Math.max.apply(null, loss.map(c => c.alpha)), 0.5, 'the largest loss is as strong as the largest gain');
  assert.strictEqual(Math.max.apply(null, gain.map(c => c.alpha)), 0.5);
});

test('a cell that rounds to nothing is left plain', () => {
  const { app, el } = wired();
  // An underlying leg at today's price makes nothing in the middle row.
  app.state.legs = [app.newLeg({ kind: 'underlying' })];
  app.renderScenarios();
  const { plain, gain, loss } = shades(el('scenarios').innerHTML);
  assert.ok(plain > 0, 'the unchanged price is plain');
  assert.ok(gain.length > 0 && loss.length > 0);
});
