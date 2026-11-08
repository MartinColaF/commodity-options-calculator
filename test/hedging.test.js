'use strict';

/* Hedging presets. Whoever holds a physical position read "Covered call" and
 * "Iron condor" and did not find themselves: the two hedges the list had were
 * named for traders, "Protective put" and "Collar". The hedges now come first,
 * under their own heading, named for who holds the position: a seller holds
 * it, a buyer will buy. */

const { test } = require('node:test');
const assert = require('node:assert');
const { wired } = require('./helpers/load-app');
const SPANISH = require('../es/words.js');

const HEDGES = ['protective-put', 'collar', 'fence', 'cap', 'buyer-collar'];

test('the hedges come first, under their own heading, and every strategy is listed once', () => {
  const { app } = wired();
  const html = app.strategyOptionsHtml();
  const groups = Array.from(html.matchAll(/<optgroup label="([^"]+)">([\s\S]*?)<\/optgroup>/g),
    m => ({ label: m[1], keys: Array.from(m[2].matchAll(/value="([^"]+)"/g), v => v[1]) }));
  assert.deepStrictEqual(groups.map(g => g.label), ['Hedging a physical position', 'Trading']);
  assert.deepStrictEqual(groups[0].keys, HEDGES);
  const all = groups[0].keys.concat(groups[1].keys);
  assert.deepStrictEqual(all.slice().sort(), Object.keys(app.STRATEGIES).sort(), 'each once');
  assert.ok(groups[1].keys.length >= 14, 'the trading strategies are all still there');
  assert.match(html, /^<option value="">Choose a strategy…<\/option>/);
});

test('a seller holds the physical, a buyer will buy it', () => {
  const { app } = wired();
  for (const key of HEDGES) {
    app.applyStrategy(key);
    const physical = app.state.legs.filter(l => l.kind === 'underlying');
    assert.strictEqual(physical.length, 1, `${key} has the physical position`);
    const seller = /^Seller: /.test(app.STRATEGIES[key].label);
    assert.ok(seller || /^Buyer: /.test(app.STRATEGIES[key].label), key);
    assert.strictEqual(physical[0].side, seller ? 1 : -1, key);
  }
});

test('a floor bounds what the seller can lose and keeps the rise; a cap does the same for the buyer', () => {
  const { app } = wired();
  app.applyStrategy('protective-put');
  let a = app.analyse();
  assert.ok(isFinite(a.maxLoss), `the seller's loss is bounded: ${a.maxLoss}`);
  assert.strictEqual(a.maxProfit, Infinity, 'and the rise is kept');
  app.applyStrategy('cap');
  a = app.analyse();
  assert.ok(isFinite(a.maxLoss), `the buyer's cost is capped: ${a.maxLoss}`);
  // A collar bounds both sides. A fence gives up the floor below the put it
  // sells, for a lower cost, and its call caps the rise.
  app.applyStrategy('collar');
  a = app.analyse();
  assert.ok(isFinite(a.maxLoss) && isFinite(a.maxProfit));
  app.applyStrategy('fence');
  const strikes = app.state.legs.filter(l => l.kind === 'put').map(l => l.strike).sort((x, y) => x - y);
  assert.strictEqual(strikes.length, 2, 'a put bought and a lower one sold');
  assert.ok(isFinite(app.analyse().maxProfit), 'its call caps the rise');
});

test('and in Spanish', () => {
  const { app } = wired({ lang: 'es', words: { es: SPANISH } });
  const html = app.strategyOptionsHtml();
  assert.match(html, /<optgroup label="Cobertura de una posición física">/);
  assert.match(html, />Vendedor: precio piso \(físico \+ compra de put\)</);
  assert.match(html, />Comprador: precio techo \(compra a futuro \+ compra de call\)</);
});
