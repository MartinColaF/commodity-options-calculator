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
 * Top-level function declarations become properties of the VM's global
 * object, so every function the two scripts declare is handed over on its own.
 * `const` and `let` bindings do not, so the epilogue captures the few the tests
 * read; a test that needs another one adds it here. This used to list every
 * function as well, 81 names kept by hand. */
const EPILOGUE = `
;globalThis.__bindings = {
  state, COMMODITIES, STRATEGIES, PROXY_COMMODITIES, KEY_STORE, STORE_KEY, CACHE_MAX_AGE
};
`;
/* No stub for renderAll: nothing outside the wiring calls it, and with no page
 * here, a domain function that did would throw and fail its test. */

/* There is no page: getElementById finds nothing, so code that reached for the
 * DOM would throw here. `opts.fetch` stands in for the network, which is
 * otherwise refused, and `opts.protocol` for the page's (file: in place of
 * https:). `opts.elements` maps ids to stand-in elements and `opts.globals`
 * adds globals such as a fake Chart. The returned app carries `storage`, the
 * Map behind localStorage. */
function loadApp(opts) {
  const o = opts || {};
  const store = new Map();
  const elements = o.elements || {};
  const sandbox = {
    console,
    setTimeout, clearTimeout,
    document: {
      addEventListener() { },
      getElementById: id => (Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null)
    },
    window: {},
    location: { protocol: o.protocol || 'https:', hash: '', origin: 'https://example.test', pathname: '/' },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      key: i => (i < store.size ? Array.from(store.keys())[i] : null),
      get length() { return store.size; }
    },
    fetch: o.fetch || (() => Promise.reject(new Error('network is not available in unit tests')))
  };
  Object.assign(sandbox, o.globals || {});
  vm.createContext(sandbox);
  const stubs = new Set(Object.keys(sandbox));
  // Two scripts in one context share their top-level bindings, as two
  // <script> tags on one page do, so app.js sees the table's const.
  vm.runInContext(fs.readFileSync(TABLE, 'utf8'), sandbox, { filename: 'commodities.js' });
  vm.runInContext(fs.readFileSync(APP, 'utf8') + EPILOGUE, sandbox, { filename: 'app.js' });
  const app = {};
  for (const k of Object.keys(sandbox)) {
    if (!stubs.has(k) && typeof sandbox[k] === 'function') app[k] = sandbox[k];
  }
  Object.assign(app, sandbox.__bindings);
  app.storage = store;
  return app;
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
  app.state.session = { strip: [] };
  if (over && over.skew) Object.assign(app.state.skew, over.skew);
  if (over && over.scenario) Object.assign(app.state.scenario, over.scenario);
  return app.state;
}

module.exports = { loadApp, resetState };
