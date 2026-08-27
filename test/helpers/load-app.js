'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.resolve(__dirname, '..', '..', 'app.js');

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
  dollarMultiplier, newLeg, applyStrategy, strikeStep, carry,
  legValue, legGreeks, activeLegs, legEntry, strategyPnl,
  netCost, netGreeks, horizonDays, analyse,
  rateForTenor, realisedVol, impliedConvenienceYield, proxyAvailable,
  currentCommodity
};
renderAll = function () {};   /* these tests exercise logic, not rendering */
`;

function loadApp() {
  const store = new Map();
  const sandbox = {
    console,
    setTimeout, clearTimeout,
    document: { addEventListener() { }, getElementById() { return null; } },
    window: {},
    location: { protocol: 'https:', hash: '', origin: 'https://example.test', pathname: '/' },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    fetch: () => Promise.reject(new Error('network is not available in unit tests'))
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(APP, 'utf8') + EPILOGUE, sandbox, { filename: 'app.js' });
  return sandbox.__app;
}

/* Reset the shared state object to a known contract before each test. */
function resetState(app, over) {
  Object.assign(app.state, {
    commodity: 'gold', model: 'b76', S: 4000, vol: 15, rate: 4, yield: 0.3,
    days: 30, size: 100, quote: 'USD', legs: []
  }, over || {});
  return app.state;
}

module.exports = { loadApp, resetState };
