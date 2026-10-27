'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'app.js');
/* Loaded first, as index.html does: app.js reads its table at load time. */
const TABLE = path.join(ROOT, 'commodities.js');
const STYLES = path.join(ROOT, 'styles.css');

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

/* The custom properties styles.css sets on :root for one colour scheme - the
 * light block, with the dark block's on top for 'dark' - which is what
 * getComputedStyle gives app.js for the root element. */
function cssVariables(scheme) {
  const css = fs.readFileSync(STYLES, 'utf8');
  const read = block => {
    const out = {};
    for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
  };
  const light = read(css.match(/^:root\s*\{([^}]*)\}/m)[1]);
  if (scheme !== 'dark') return light;
  const dark = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/);
  return Object.assign({}, light, read(dark[1]));
}

/* There is no page: getElementById finds nothing, so code that reached for the
 * DOM would throw here. `opts.fetch` stands in for the network, which is
 * otherwise refused, and `opts.protocol` for the page's (file: in place of
 * https:). `opts.elements` maps ids to stand-in elements and `opts.globals`
 * adds globals such as a fake Chart. The stylesheet is styles.css in
 * `opts.scheme`, 'light' unless it says 'dark'. The returned app carries
 * `storage`, the Map behind localStorage. */
function loadApp(opts) {
  const o = opts || {};
  const store = new Map();
  const elements = o.elements || {};
  const sandbox = {
    console,
    setTimeout, clearTimeout,
    document: {
      addEventListener() { },
      getElementById: id => (Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null),
      documentElement: {}
    },
    getComputedStyle: () => {
      const vars = cssVariables(o.scheme);
      return { getPropertyValue: k => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '') };
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

/* The app with a stand-in for every element the page has, bound by
 * bindInputs() as the page binds them. `fire(id, type, target)` dispatches an
 * event at that element in the order a page would: the document's
 * capture-phase listeners, the element's own, then the document's bubbling
 * ones, each in the order they were added. `target` is the event's target,
 * the stand-in itself unless given, and `el(id)` is the stand-in, holding what
 * the wiring wrote into it. A redraw is real when the wiring asks for one with
 * renderAll(); one scheduled for the next frame never comes, since there are
 * no frames. */
function wired(opts) {
  const listeners = {};
  const listen = on => (type, fn, capture) => {
    const key = on + ' ' + type + (capture ? ' capture' : '');
    (listeners[key] = listeners[key] || []).push(fn);
  };
  const made = {};
  const element = id => ({
    value: '', checked: false, textContent: '', innerHTML: '', dataset: {},
    addEventListener: listen(id),
    closest: () => null
  });
  const el = id => made[id] || (made[id] = element(id));
  const app = loadApp(Object.assign({}, opts, {
    globals: Object.assign({
      document: { addEventListener: listen('document'), getElementById: el, documentElement: {} },
      window: { matchMedia: () => ({ addEventListener() { } }) },
      requestAnimationFrame: () => { }
    }, opts && opts.globals)
  }));
  resetState(app);
  app.bindInputs();
  const fire = (id, type, target) => {
    const e = { target: target || el(id) };
    for (const key of ['document ' + type + ' capture', id + ' ' + type + ' capture', id + ' ' + type, 'document ' + type]) {
      (listeners[key] || []).forEach(fn => fn(e));
    }
  };
  return { app, el, fire };
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
  app.state.financing = { mode: 'rate', rate: 4 };
  if (over && over.skew) Object.assign(app.state.skew, over.skew);
  if (over && over.scenario) Object.assign(app.state.scenario, over.scenario);
  if (over && over.financing) Object.assign(app.state.financing, over.financing);
  return app.state;
}

module.exports = { loadApp, resetState, wired };
