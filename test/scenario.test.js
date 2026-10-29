'use strict';

/* The scenario grid's shading. Gains and losses were shaded against one scale,
 * the largest P&L in the grid: a long call's losses, $1,130 at most beside
 * gains of $58,874, got an opacity of 0.0096, and the grid read as green and
 * nothing. Each sign now has its own scale, from a floor that shows. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { wired } = require('./helpers/load-app');

/* Each cell's shade: its step, gain-0 to gain-9 or loss-0 to loss-9, read as the
 * opacity the stylesheet gives it. */
const STYLES = fs.readFileSync(path.resolve(__dirname, '..', 'styles.css'), 'utf8');
function shades(html) {
  const out = { gain: [], loss: [], plain: 0 };
  for (const m of html.matchAll(/<td class="num(?: (gain|loss)-(\d))?">([^<]*)<\/td>/g)) {
    if (!m[1]) { out.plain++; continue; }
    const rule = STYLES.match(new RegExp(`\\.scenario td\\.${m[1]}-${m[2]} \\{ background: rgba\\((\\d+),(\\d+),(\\d+),([\\d.]+)\\); \\}`));
    (m[1] === 'gain' ? out.gain : out.loss).push({ alpha: +rule[4], rgb: rule.slice(1, 4).join(','), text: m[3] });
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
  assert.ok(loss.every(c => c.alpha >= 0.12 && c.rgb === '190,60,48' && /^−\$/.test(c.text)), 'every loss is visibly red');
  assert.ok(gain.every(c => c.alpha >= 0.12 && c.rgb === '32,140,96' && !/^−/.test(c.text)), 'every gain is visibly green');
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
