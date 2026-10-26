'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'app.js');
/* Loaded first, as index.html does: app.js reads its table at load time. */
const TABLE = path.join(ROOT, 'commodities.js');

/* app.js is deliberately a plain browser script with no module system, so the
 * page still works when opened from a file:// path. To exercise its maths in
 * node we run it inside a VM with a minimal DOM and then hand back its
 * internals.
 *
 * Top-level `const` bindings do not become properties of the VM's global
 * object, so the epilogue captures them explicitly. */
const EPILOGUE = `
;globalThis.__app = {
  state, COMMODITIES, STRATEGIES, PROXY_COMMODITIES,
  normPdf, normCdf, gbs, impliedVol,
  americanPrice, americanGreeks, americanCritical, priceOption,
  dollarMultiplier, newLeg, applyStrategy, strikeStep, carry, carryTracksRate,
  legValue, legGreeks, activeLegs, legEntry, strategyPnl, pnlEvaluator,
  legUnder, legRatio, legScenario, strikeOnAxis, displayGrid, statsGrid,
  clearLegPrices, forwardFromStrip, daysUntil,
  /* contractMonths is a module-level binding the loader owns, so hand the
     tests a setter rather than letting them reach for the variable. */
  __setContractMonths: rows => { contractMonths = rows; },
  netCost, netGreeks, horizonDays, analyse, snapshot, restore,
  sanitizeLeg, legRowHtml, legPricingInputs, legImpliedVol,
  KEY_STORE, parseTreasuryXml, fetchYieldCurve, applyRate, applyFuturesPrice, applyVol,
  applyCurveYield, loadContractMonths, useContractMonth, applyLegPrices, autoFill,
  applyCarryYield, applyPreset, contractGapDays, logSlope,
  __contractMonths: () => contractMonths,
  forwardDelta, skewVol, legVolPct, scenarioTable,
  rateForTenor, realisedVol, impliedConvenienceYield, proxyAvailable,
  currentCommodity
};
renderAll = function () {};   /* these tests exercise logic, not rendering */
`;

/* There is no page: getElementById finds nothing, so code that reached for the
 * DOM would throw here. `opts.fetch` stands in for the network, which is
 * otherwise refused, and `opts.protocol` for the page's (file: in place of
 * https:). The returned app carries `storage`, the Map behind localStorage. */
function loadApp(opts) {
  const o = opts || {};
  const store = new Map();
  const sandbox = {
    console,
    setTimeout, clearTimeout,
    document: { addEventListener() { }, getElementById() { return null; } },
    window: {},
    location: { protocol: o.protocol || 'https:', hash: '', origin: 'https://example.test', pathname: '/' },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    fetch: o.fetch || (() => Promise.reject(new Error('network is not available in unit tests')))
  };
  vm.createContext(sandbox);
  // Two scripts in one context share their top-level bindings, as two
  // <script> tags on one page do, so app.js sees the table's const.
  vm.runInContext(fs.readFileSync(TABLE, 'utf8'), sandbox, { filename: 'commodities.js' });
  vm.runInContext(fs.readFileSync(APP, 'utf8') + EPILOGUE, sandbox, { filename: 'app.js' });
  sandbox.__app.storage = store;
  return sandbox.__app;
}

/* Reset the shared state object to a known contract before each test. */
function resetState(app, over) {
  Object.assign(app.state, {
    commodity: 'gold', model: 'b76', style: 'european',
    S: 4000, vol: 15, rate: 4, yield: 0.3,
    days: 30, size: 100, quote: 'USD', legs: []
  }, over || {});
  // Nested state is shared across tests, so reset it rather than letting one
  // test's skew or scenario settings leak into the next.
  app.state.skew = { on: false, rr: 0, bf: 0 };
  app.state.scenario = { volShift: 5, pricePct: 20 };
  if (over && over.skew) Object.assign(app.state.skew, over.skew);
  if (over && over.scenario) Object.assign(app.state.scenario, over.scenario);
  return app.state;
}

module.exports = { loadApp, resetState };
