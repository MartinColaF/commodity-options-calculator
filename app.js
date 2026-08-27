/* Commodity Options Calculator
 * Generalised Black-Scholes-Merton (cost of carry) pricer, multi-leg strategy
 * builder and market data helpers. No build step: plain script, works on
 * file:// as well as GitHub Pages.
 */
'use strict';

/* ============================================================
 * 1. Math
 * ========================================================== */

function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/* Hart (1968) rational approximation. Double precision accuracy, much better
 * than the 5-term Abramowitz & Stegun polynomial. */
function normCdf(x) {
  const z = Math.abs(x);
  let c;
  if (z > 37) {
    c = 0;
  } else {
    const e = Math.exp(-z * z / 2);
    if (z < 7.07106781186547) {
      let b = 3.52624965998911e-02 * z + 0.700383064443688;
      b = b * z + 6.37396220353165;
      b = b * z + 33.912866078383;
      b = b * z + 112.079291497871;
      b = b * z + 221.213596169931;
      b = b * z + 220.206867912376;
      let d = 8.83883476483184e-02 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;
      c = e * b / d;
    } else {
      let b = z + 0.65;
      b = z + 4 / b;
      b = z + 3 / b;
      b = z + 2 / b;
      b = z + 1 / b;
      c = e / (b * 2.506628274631);
    }
  }
  return x > 0 ? 1 - c : c;
}

/* Generalised Black-Scholes-Merton.
 *   b = r - q  -> Black-Scholes-Merton on a spot underlying with carry
 *   b = 0      -> Black-76 on a futures price (discounting at r)
 * Returns price plus greeks in "natural" units:
 *   vega  per 1 vol point (1%)
 *   theta per calendar day
 *   rho   per 1 rate point (1%)
 */
function gbs(kind, S, K, T, r, b, sigma) {
  const isCall = kind === 'call';
  if (!(T > 0) || !(sigma > 0) || !(S > 0) || !(K > 0)) {
    const fwd = S * Math.exp(b * Math.max(T, 0));
    const disc = Math.exp(-r * Math.max(T, 0));
    const itm = isCall ? fwd > K : fwd < K;
    const intrinsic = Math.max(isCall ? fwd - K : K - fwd, 0) * disc;
    return {
      price: intrinsic,
      delta: itm ? (isCall ? 1 : -1) * Math.exp((b - r) * Math.max(T, 0)) : 0,
      gamma: 0, vega: 0, theta: 0, rho: 0, d1: NaN, d2: NaN
    };
  }

  const sqrtT = Math.sqrt(T);
  const vt = sigma * sqrtT;
  const d1 = (Math.log(S / K) + (b + sigma * sigma / 2) * T) / vt;
  const d2 = d1 - vt;
  const eb = Math.exp((b - r) * T);   // carry discount factor
  const er = Math.exp(-r * T);        // cash discount factor
  const nd1 = normCdf(d1), nd2 = normCdf(d2);
  const pdf = normPdf(d1);

  const price = isCall
    ? S * eb * nd1 - K * er * nd2
    : K * er * normCdf(-d2) - S * eb * normCdf(-d1);

  const delta = isCall ? eb * nd1 : eb * (nd1 - 1);
  const gamma = eb * pdf / (S * vt);
  const vega = S * eb * pdf * sqrtT / 100;

  let theta;
  if (isCall) {
    theta = -S * eb * pdf * sigma / (2 * sqrtT)
      - (b - r) * S * eb * nd1
      - r * K * er * nd2;
  } else {
    theta = -S * eb * pdf * sigma / (2 * sqrtT)
      + (b - r) * S * eb * normCdf(-d1)
      + r * K * er * normCdf(-d2);
  }
  theta /= 365;

  let rho;
  if (Math.abs(b) < 1e-12) {
    // Black-76: r only enters through discounting.
    rho = -T * price / 100;
  } else {
    rho = (isCall ? K * T * er * nd2 : -K * T * er * normCdf(-d2)) / 100;
  }

  return { price, delta, gamma, vega, theta, rho, d1, d2 };
}

/* Implied volatility: Newton with vega, bisection fallback. */
function impliedVol(kind, target, S, K, T, r, b) {
  if (!(target > 0) || !(T > 0)) return NaN;
  const intrinsic = gbs(kind, S, K, T, r, b, 1e-8).price;
  if (target < intrinsic - 1e-8) return NaN;

  let sigma = 0.3;
  for (let i = 0; i < 60; i++) {
    const o = gbs(kind, S, K, T, r, b, sigma);
    const diff = o.price - target;
    if (Math.abs(diff) < 1e-8) return sigma;
    const vega = o.vega * 100; // per 1.00 of vol
    if (!(vega > 1e-10)) break;
    const step = diff / vega;
    sigma -= Math.max(-0.5, Math.min(0.5, step));
    if (!(sigma > 0)) { sigma = 1e-4; }
    if (sigma > 10) { sigma = 10; break; }
  }
  // Bisection fallback
  let lo = 1e-4, hi = 10;
  if (gbs(kind, S, K, T, r, b, hi).price < target) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (gbs(kind, S, K, T, r, b, mid).price < target) lo = mid; else hi = mid;
  }
  const out = (lo + hi) / 2;
  return Math.abs(gbs(kind, S, K, T, r, b, out).price - target) < 1e-4 ? out : NaN;
}

/* ============================================================
 * 2. Commodity reference data
 * ========================================================== */

/* size/quote drive the dollar multiplier: cents-quoted grains and softs need
 * the 0.01 factor or P&L comes out 100x too big.
 * vol/yield are long-run typical values used only as a fallback - they are
 * NOT live market data and the UI labels them as such.
 * priceSymbol is a liquid ETF used to estimate realised volatility. Its price
 * level is unrelated to the futures price, only its returns are used. */
const COMMODITIES = {
  gold: { label: 'Gold (COMEX GC)', size: 100, unit: 'troy oz', quote: 'USD', vol: 15, yield: 0.3, priceSymbol: 'GLD', proxy: 'SPDR Gold Shares - tracks spot gold closely' },
  silver: { label: 'Silver (COMEX SI)', size: 5000, unit: 'troy oz', quote: 'USD', vol: 28, yield: 0.3, priceSymbol: 'SLV', proxy: 'iShares Silver Trust' },
  copper: { label: 'Copper (COMEX HG)', size: 25000, unit: 'lb', quote: 'USD', vol: 25, yield: 1.5, priceSymbol: 'CPER', proxy: 'US Copper Index Fund' },
  wti: { label: 'Crude Oil WTI (NYMEX CL)', size: 1000, unit: 'barrels', quote: 'USD', vol: 35, yield: 4, priceSymbol: 'USO', proxy: 'US Oil Fund - rolls front-month WTI' },
  brent: { label: 'Crude Oil Brent (ICE B)', size: 1000, unit: 'barrels', quote: 'USD', vol: 33, yield: 3.5, priceSymbol: 'BNO', proxy: 'US Brent Oil Fund' },
  natgas: { label: 'Natural Gas (NYMEX NG)', size: 10000, unit: 'MMBtu', quote: 'USD', vol: 60, yield: 5, priceSymbol: 'UNG', proxy: 'US Natural Gas Fund' },
  corn: { label: 'Corn (CBOT ZC)', size: 5000, unit: 'bushels', quote: 'cents', vol: 28, yield: 2.5, priceSymbol: 'CORN', proxy: 'Teucrium Corn Fund' },
  wheat: { label: 'Wheat (CBOT ZW)', size: 5000, unit: 'bushels', quote: 'cents', vol: 30, yield: 3, priceSymbol: 'WEAT', proxy: 'Teucrium Wheat Fund' },
  soybean: { label: 'Soybeans (CBOT ZS)', size: 5000, unit: 'bushels', quote: 'cents', vol: 25, yield: 2.5, priceSymbol: 'SOYB', proxy: 'Teucrium Soybean Fund' },
  sugar: { label: 'Sugar #11 (ICE SB)', size: 112000, unit: 'lb', quote: 'cents', vol: 40, yield: 2, priceSymbol: 'CANE', proxy: 'Teucrium Sugar Fund' },
  coffee: { label: 'Coffee C (ICE KC)', size: 37500, unit: 'lb', quote: 'cents', vol: 45, yield: 1.5, priceSymbol: 'JO', proxy: 'iPath Coffee ETN - thin, treat vol with care' },
  cocoa: { label: 'Cocoa (ICE CC)', size: 10, unit: 'metric tons', quote: 'USD', vol: 40, yield: 1, priceSymbol: '', proxy: 'No ETF proxy - use the futures buttons above' },
  cotton: { label: 'Cotton #2 (ICE CT)', size: 50000, unit: 'lb', quote: 'cents', vol: 25, yield: 1.5, priceSymbol: 'BAL', proxy: 'iPath Cotton ETN - thin' },
  cattle: { label: 'Live Cattle (CME LE)', size: 40000, unit: 'lb', quote: 'cents', vol: 15, yield: 1, priceSymbol: '', proxy: 'No ETF proxy - use the futures buttons above' },
  custom: { label: 'Custom / other', size: 1, unit: 'units', quote: 'USD', vol: 30, yield: 0, priceSymbol: '', proxy: 'Set the contract size and symbol yourself' }
};

function dollarMultiplier(c) {
  return c.size * (c.quote === 'cents' ? 0.01 : 1);
}

/* ============================================================
 * 3. State
 * ========================================================== */

const STORE_KEY = 'coc.state.v2';
const KEY_STORE = 'coc.avkey';

let nextLegId = 1;

const state = {
  commodity: 'gold',
  model: 'b76',
  S: 4000,
  vol: 15,
  rate: 4.0,
  yield: 0.3,
  days: 30,
  size: 100,
  quote: 'USD',
  legs: [],
  chart: { mode: 'payoff', tDays: 0, showLegs: true, range: 40 },
  sources: { price: null, rate: null, vol: null, yield: null }
};

function newLeg(over) {
  return Object.assign({
    id: nextLegId++,
    on: true,
    side: 1,          // +1 long, -1 short
    kind: 'call',     // call | put | underlying
    qty: 1,
    strike: 4200,
    days: 30,         // own expiry, enables calendars
    vol: null,        // null -> use the global vol
    entry: null       // null -> use the theoretical price as the entry cost
  }, over || {});
}

/* ============================================================
 * 4. Strategy presets
 * ========================================================== */

/* k = at-the-money reference, w = strike step */
const STRATEGIES = {
  'long-call': { label: 'Long call', legs: (k, w) => [{ side: 1, kind: 'call', strike: k }] },
  'long-put': { label: 'Long put', legs: (k, w) => [{ side: 1, kind: 'put', strike: k }] },
  'short-call': { label: 'Short call (naked)', legs: (k, w) => [{ side: -1, kind: 'call', strike: k + w }] },
  'short-put': { label: 'Short put (naked)', legs: (k, w) => [{ side: -1, kind: 'put', strike: k - w }] },
  'covered-call': { label: 'Covered call', legs: (k, w) => [{ side: 1, kind: 'underlying', strike: 0 }, { side: -1, kind: 'call', strike: k + w }] },
  'protective-put': { label: 'Protective put', legs: (k, w) => [{ side: 1, kind: 'underlying', strike: 0 }, { side: 1, kind: 'put', strike: k - w }] },
  'bull-call': { label: 'Bull call spread', legs: (k, w) => [{ side: 1, kind: 'call', strike: k }, { side: -1, kind: 'call', strike: k + 2 * w }] },
  'bear-put': { label: 'Bear put spread', legs: (k, w) => [{ side: 1, kind: 'put', strike: k }, { side: -1, kind: 'put', strike: k - 2 * w }] },
  'straddle': { label: 'Long straddle', legs: (k, w) => [{ side: 1, kind: 'call', strike: k }, { side: 1, kind: 'put', strike: k }] },
  'strangle': { label: 'Long strangle', legs: (k, w) => [{ side: 1, kind: 'call', strike: k + w }, { side: 1, kind: 'put', strike: k - w }] },
  'short-strangle': { label: 'Short strangle', legs: (k, w) => [{ side: -1, kind: 'call', strike: k + w }, { side: -1, kind: 'put', strike: k - w }] },
  'butterfly': { label: 'Call butterfly', legs: (k, w) => [{ side: 1, kind: 'call', strike: k - w }, { side: -1, kind: 'call', strike: k, qty: 2 }, { side: 1, kind: 'call', strike: k + w }] },
  'iron-condor': {
    label: 'Iron condor', legs: (k, w) => [
      { side: 1, kind: 'put', strike: k - 2 * w }, { side: -1, kind: 'put', strike: k - w },
      { side: -1, kind: 'call', strike: k + w }, { side: 1, kind: 'call', strike: k + 2 * w }]
  },
  'collar': {
    label: 'Collar', legs: (k, w) => [
      { side: 1, kind: 'underlying', strike: 0 },
      { side: 1, kind: 'put', strike: k - w }, { side: -1, kind: 'call', strike: k + w }]
  },
  'calendar': {
    label: 'Call calendar spread', legs: (k, w, d) => [
      { side: -1, kind: 'call', strike: k, days: d },
      { side: 1, kind: 'call', strike: k, days: d * 2 }]
  },
  'ratio': { label: 'Call ratio 1x2', legs: (k, w) => [{ side: 1, kind: 'call', strike: k }, { side: -1, kind: 'call', strike: k + w, qty: 2 }] }
};

function applyStrategy(name) {
  const def = STRATEGIES[name];
  if (!def) return;
  const step = strikeStep(state.S);
  const k = Math.round(state.S / step) * step;
  state.legs = def.legs(k, step, state.days).map(l => newLeg(Object.assign({ days: state.days }, l)));
  renderAll();
}

function strikeStep(S) {
  const raw = S * 0.05;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2.5 : norm < 7.5 ? 5 : 10;
  return nice * mag;
}

/* ============================================================
 * 5. Pricing engine
 * ========================================================== */

function carry() {
  const r = state.rate / 100;
  const q = state.yield / 100;
  return state.model === 'b76' ? 0 : r - q;
}

/* Value of one unit of a leg at underlying price P, tDays after today. */
function legValue(leg, P, tDays) {
  if (leg.kind === 'underlying') return P;
  const tau = Math.max(leg.days - tDays, 0) / 365;
  const sigma = (leg.vol == null ? state.vol : leg.vol) / 100;
  return gbs(leg.kind, P, leg.strike, tau, state.rate / 100, carry(), sigma).price;
}

/* Greeks of one unit of a leg today. */
function legGreeks(leg) {
  if (leg.kind === 'underlying') {
    return { price: state.S, delta: 1, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }
  const sigma = (leg.vol == null ? state.vol : leg.vol) / 100;
  return gbs(leg.kind, state.S, leg.strike, leg.days / 365,
    state.rate / 100, carry(), sigma);
}

function activeLegs() {
  return state.legs.filter(l => l.on);
}

function legEntry(leg) {
  if (leg.entry != null) return leg.entry;
  return leg.kind === 'underlying' ? state.S : legGreeks(leg).price;
}

/* Net P&L in currency at underlying price P, tDays from today. */
function strategyPnl(P, tDays) {
  const mult = dollarMultiplier(currentCommodity());
  let pnl = 0;
  for (const leg of activeLegs()) {
    pnl += leg.side * leg.qty * mult * (legValue(leg, P, tDays) - legEntry(leg));
  }
  return pnl;
}

/* Net cost today: positive = debit paid, negative = credit received. */
function netCost() {
  const mult = dollarMultiplier(currentCommodity());
  let c = 0;
  for (const leg of activeLegs()) {
    if (leg.kind === 'underlying') continue; // financed, not a premium
    c += leg.side * leg.qty * mult * legEntry(leg);
  }
  return c;
}

function netGreeks() {
  const mult = dollarMultiplier(currentCommodity());
  const acc = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  for (const leg of activeLegs()) {
    const g = legGreeks(leg);
    const w = leg.side * leg.qty;
    acc.delta += w * g.delta;
    acc.gamma += w * g.gamma;
    acc.vega += w * g.vega;
    acc.theta += w * g.theta;
    acc.rho += w * g.rho;
  }
  return {
    unit: acc,
    money: {
      delta: acc.delta * mult, gamma: acc.gamma * mult, vega: acc.vega * mult,
      theta: acc.theta * mult, rho: acc.rho * mult
    }
  };
}

/* Evaluation horizon: the nearest expiry among the active legs. That is the
 * usual convention - a calendar spread's far leg still has time value there. */
function horizonDays() {
  const opts = activeLegs().filter(l => l.kind !== 'underlying');
  if (!opts.length) return state.days;
  return Math.min.apply(null, opts.map(l => l.days));
}

/* Grid builder. Strikes are inserted exactly so the payoff kinks stay sharp. */
function gridBetween(lo, hi, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(lo + (hi - lo) * i / (n - 1));
  for (const leg of activeLegs()) {
    if (leg.kind !== 'underlying' && leg.strike > lo && leg.strike < hi) {
      const eps = (hi - lo) * 1e-7;
      out.push(leg.strike - eps, leg.strike, leg.strike + eps);
    }
  }
  return out.sort((a, b) => a - b);
}

/* Grid shown in the chart. */
function displayGrid() {
  const pct = state.chart.range / 100;
  return gridBetween(Math.max(state.S * (1 - pct), 1e-6), state.S * (1 + pct), 241);
}

/* Grid used for the statistics: spans the whole economically possible range,
 * from a price of ~0 up well past the highest strike, so a long put's capped
 * profit and a short put's capped loss are found even when they sit outside
 * the zoom level of the chart. */
function statsGrid() {
  const strikes = activeLegs().filter(l => l.kind !== 'underlying').map(l => l.strike);
  const hi = Math.max(state.S * 4, ...strikes.map(k => k * 2.5));
  return gridBetween(state.S * 1e-6, hi, 1200);
}

function analyse() {
  const t = horizonDays();
  const xs = displayGrid();
  const ys = xs.map(p => strategyPnl(p, t));

  const wx = statsGrid();
  const wy = wx.map(p => strategyPnl(p, t));
  const n = wy.length;

  let maxP = -Infinity, minP = Infinity;
  for (const y of wy) { if (y > maxP) maxP = y; if (y < minP) minP = y; }

  // Breakevens by sign change, searched over the full range.
  const bes = [];
  for (let i = 1; i < wx.length; i++) {
    const a = wy[i - 1], b = wy[i];
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
      const x = wx[i - 1] + (wx[i] - wx[i - 1]) * (0 - a) / (b - a);
      if (!bes.length || Math.abs(x - bes[bes.length - 1]) > state.S * 1e-3) bes.push(x);
    }
  }

  // Only the upside is open ended: the underlying cannot fall below zero, so
  // whatever the payoff is at a price of ~0 is a real, attainable bound.
  const slopeHi = wy[n - 1] - wy[n - 2];
  const unlimitedProfit = slopeHi > 1e-9;
  const unlimitedLoss = slopeHi < -1e-9;

  // Risk-neutral probability of profit at the horizon.
  const sigma = state.vol / 100, T = t / 365, b = carry();
  let pop = 0;
  if (T > 0 && sigma > 0) {
    const mu = Math.log(state.S) + (b - sigma * sigma / 2) * T;
    const sd = sigma * Math.sqrt(T);
    const lnCdf = x => normCdf((Math.log(x) - mu) / sd);
    for (let i = 1; i < wx.length; i++) {
      const mid = (wy[i - 1] + wy[i]) / 2;
      if (mid > 0) pop += lnCdf(wx[i]) - lnCdf(wx[i - 1]);
    }
    if (wy[0] > 0) pop += lnCdf(wx[0]);
    if (wy[n - 1] > 0) pop += 1 - lnCdf(wx[n - 1]);
  }

  return {
    t, xs, ys,
    maxProfit: unlimitedProfit ? Infinity : maxP,
    maxLoss: unlimitedLoss ? -Infinity : minP,
    breakevens: bes, pop
  };
}

/* ============================================================
 * 6. Market data providers
 * ========================================================== */

function cacheGet(key, ttlMs) {
  try {
    const raw = localStorage.getItem('coc.cache.' + key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (Date.now() - o.ts > ttlMs) return null;
    return o.v;
  } catch (e) { return null; }
}

function cacheSet(key, v) {
  try {
    localStorage.setItem('coc.cache.' + key, JSON.stringify({ ts: Date.now(), v: v }));
  } catch (e) { /* quota or private mode - not fatal */ }
}

const TREASURY_URL = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml';
const TENORS = [
  ['BC_1MONTH', 1 / 12], ['BC_2MONTH', 2 / 12], ['BC_3MONTH', 0.25], ['BC_4MONTH', 4 / 12],
  ['BC_6MONTH', 0.5], ['BC_1YEAR', 1], ['BC_2YEAR', 2], ['BC_3YEAR', 3],
  ['BC_5YEAR', 5], ['BC_7YEAR', 7], ['BC_10YEAR', 10], ['BC_20YEAR', 20], ['BC_30YEAR', 30]
];

async function fetchYieldCurve() {
  const cached = cacheGet('treasury', 6 * 3600e3);
  if (cached) return cached;

  const now = new Date();
  for (let back = 0; back < 3; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const ym = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
    const url = TREASURY_URL + '?data=daily_treasury_yield_curve&field_tdr_date_value_month=' + ym;
    let text;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      text = await res.text();
    } catch (e) { continue; }

    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const props = doc.getElementsByTagNameNS('*', 'properties');
    if (!props.length) continue;
    const last = props[props.length - 1];
    const val = tag => {
      const el = last.getElementsByTagNameNS('*', tag)[0];
      return el ? parseFloat(el.textContent) : NaN;
    };
    const dateEl = last.getElementsByTagNameNS('*', 'NEW_DATE')[0];
    const points = TENORS
      .map(([t, y]) => ({ years: y, yield: val(t) }))
      .filter(p => isFinite(p.yield));
    if (!points.length) continue;

    const curve = { date: dateEl ? dateEl.textContent.slice(0, 10) : '', points };
    cacheSet('treasury', curve);
    return curve;
  }
  throw new Error('Treasury yield curve unavailable');
}

/* Linear interpolation on the par curve, then annual -> continuously compounded. */
function rateForTenor(curve, years) {
  const p = curve.points;
  let y;
  if (years <= p[0].years) y = p[0].yield;
  else if (years >= p[p.length - 1].years) y = p[p.length - 1].yield;
  else {
    for (let i = 1; i < p.length; i++) {
      if (years <= p[i].years) {
        const w = (years - p[i - 1].years) / (p[i].years - p[i - 1].years);
        y = p[i - 1].yield + w * (p[i].yield - p[i - 1].yield);
        break;
      }
    }
  }
  return { par: y, continuous: Math.log(1 + y / 100) * 100 };
}

const AV_URL = 'https://www.alphavantage.co/query';

async function fetchDailySeries(symbol, key) {
  const ck = 'av.' + symbol.toUpperCase();
  const cached = cacheGet(ck, 12 * 3600e3);
  if (cached) return cached;

  const url = AV_URL + '?function=TIME_SERIES_DAILY&symbol=' + encodeURIComponent(symbol) +
    '&outputsize=compact&apikey=' + encodeURIComponent(key);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Alpha Vantage HTTP ' + res.status);
  const json = await res.json();

  if (json['Note'] || json['Information']) {
    throw new Error(json['Note'] || json['Information']);
  }
  const raw = json['Time Series (Daily)'];
  if (!raw) throw new Error(json['Error Message'] || 'Symbol not found: ' + symbol);

  const series = Object.keys(raw).sort().map(d => ({
    date: d,
    o: +raw[d]['1. open'], h: +raw[d]['2. high'],
    l: +raw[d]['3. low'], c: +raw[d]['4. close']
  }));
  cacheSet(ck, series);
  return series;
}

/* Annualised realised volatility, three estimators, in percent. */
function realisedVol(series, window) {
  const s = series.slice(-(window + 1));
  if (s.length < 5) return null;
  const rets = [];
  for (let i = 1; i < s.length; i++) rets.push(Math.log(s[i].c / s[i - 1].c));

  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varc = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1);
  const close = Math.sqrt(varc * 252) * 100;

  const lambda = 0.94;
  let ew = varc;
  for (const r of rets) ew = lambda * ew + (1 - lambda) * r * r;
  const ewma = Math.sqrt(ew * 252) * 100;

  let pk = 0, pn = 0;
  for (const d of s) {
    if (d.h > 0 && d.l > 0) { const lr = Math.log(d.h / d.l); pk += lr * lr; pn++; }
  }
  const park = pn ? Math.sqrt(pk / (4 * Math.log(2) * pn) * 252) * 100 : null;

  return { close, ewma, parkinson: park, days: rets.length, last: s[s.length - 1].date };
}

/* ---- Futures data through our own /api/market function ----
 * Yahoo sends no CORS headers, so the request goes through the serverless
 * proxy in api/market.js. It only exists on the deployed site: opening the
 * page from a file:// path just falls back to the other providers. */

const PROXY = '/api/market';
const PROXY_COMMODITIES = ['gold', 'silver', 'copper', 'wti', 'brent', 'natgas',
  'corn', 'wheat', 'soybean', 'sugar', 'coffee', 'cocoa', 'cotton', 'cattle'];

function proxyAvailable(commodity) {
  return /^https?:$/.test(location.protocol) &&
    PROXY_COMMODITIES.indexOf(commodity) !== -1;
}

async function proxyGet(fn, commodity, ttlMs) {
  if (!proxyAvailable(commodity)) {
    throw new Error(PROXY_COMMODITIES.indexOf(commodity) === -1
      ? 'no futures contract mapped for this commodity'
      : 'the futures proxy only runs on the deployed site');
  }
  const ck = 'proxy.' + fn + '.' + commodity;
  const cached = cacheGet(ck, ttlMs);
  if (cached) return cached;

  const res = await fetch(PROXY + '?fn=' + fn + '&commodity=' + encodeURIComponent(commodity));
  let json = null;
  try { json = await res.json(); } catch (e) { /* an HTML error page, not JSON */ }
  if (!res.ok) {
    throw new Error(res.status === 404
      ? 'the futures proxy is not deployed here'
      : (json && json.error) || ('proxy returned HTTP ' + res.status));
  }
  cacheSet(ck, json);
  return json;
}

/* Convenience yield implied by the cost-of-carry relation F = S e^{(r+u-y)T}. */
function impliedConvenienceYield(spot, futures, days, ratePct) {
  const T = days / 365;
  if (!(spot > 0) || !(futures > 0) || !(T > 0)) return NaN;
  return (ratePct / 100 - Math.log(futures / spot) / T) * 100;
}

/* ============================================================
 * 7. Rendering
 * ========================================================== */

const $ = id => document.getElementById(id);

function currentCommodity() {
  const c = Object.assign({}, COMMODITIES[state.commodity] || COMMODITIES.custom);
  c.size = state.size;
  c.quote = state.quote;
  return c;
}

function fmt(x, dp) {
  if (!isFinite(x)) return x > 0 ? '∞' : '-∞';
  return x.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function money(x) {
  if (x === Infinity) return 'Unlimited';
  if (x === -Infinity) return 'Unlimited';
  const sign = x < 0 ? '-' : '';
  return sign + '$' + fmt(Math.abs(x), 2);
}

/* Never overwrite the field the user is typing in: doing so eats half-typed
 * values like "4000." and moves the caret. */
function setField(id, value) {
  const el = $(id);
  if (el !== document.activeElement) el.value = value;
}

function renderInputs() {
  setField('commodity', state.commodity);
  setField('model', state.model);
  setField('spot', state.S);
  setField('vol', state.vol);
  setField('rate', state.rate);
  setField('yield', state.yield);
  setField('days', state.days);
  setField('size', state.size);
  setField('quote', state.quote);

  const isB76 = state.model === 'b76';
  $('yield').disabled = isB76;
  $('yieldNote').textContent = isB76
    ? 'Not used in Black-76: the futures price already embeds carry and convenience yield.'
    : 'Net convenience yield (benefit of holding the physical, minus storage).';

  const c = currentCommodity();
  $('spotLabel').textContent = isB76 ? 'Futures price' : 'Spot price';
  $('multInfo').textContent = '1 contract = ' + fmt(c.size, 0) + ' ' + c.unit +
    (c.quote === 'cents' ? ' (quoted in cents)' : '') +
    ' - P&L multiplier $' + fmt(dollarMultiplier(c), 2) + ' per point';
}

function renderSources() {
  const rows = [
    ['Underlying price', state.sources.price],
    ['Risk-free rate', state.sources.rate],
    ['Volatility', state.sources.vol],
    ['Convenience yield', state.sources.yield]
  ];
  $('sources').innerHTML = rows.map(([name, s]) => {
    if (!s) return '<div class="src"><span class="dot preset"></span>' + name +
      ': <em>manual / preset (not market data)</em></div>';
    return '<div class="src"><span class="dot ' + (s.live ? 'live' : 'preset') + '"></span>' +
      name + ': ' + escapeHtml(s.text) + '</div>';
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function renderLegs() {
  const mult = dollarMultiplier(currentCommodity());
  const body = state.legs.map(leg => {
    const g = legGreeks(leg);
    const entry = legEntry(leg);
    const isU = leg.kind === 'underlying';
    return `<tr data-id="${leg.id}" class="${leg.on ? '' : 'off'}">
      <td><input type="checkbox" data-f="on" ${leg.on ? 'checked' : ''} title="Include in the strategy"></td>
      <td><select data-f="side">
        <option value="1" ${leg.side === 1 ? 'selected' : ''}>Long</option>
        <option value="-1" ${leg.side === -1 ? 'selected' : ''}>Short</option>
      </select></td>
      <td><select data-f="kind">
        <option value="call" ${leg.kind === 'call' ? 'selected' : ''}>Call</option>
        <option value="put" ${leg.kind === 'put' ? 'selected' : ''}>Put</option>
        <option value="underlying" ${isU ? 'selected' : ''}>Underlying</option>
      </select></td>
      <td><input type="number" data-f="qty" value="${leg.qty}" min="0" step="1"></td>
      <td><input type="number" data-f="strike" value="${isU ? '' : leg.strike}" ${isU ? 'disabled' : ''} step="any"></td>
      <td><input type="number" data-f="days" value="${isU ? '' : leg.days}" ${isU ? 'disabled' : ''} min="0" step="1"></td>
      <td><input type="number" data-f="vol" value="${leg.vol == null ? '' : leg.vol}" placeholder="${state.vol}" ${isU ? 'disabled' : ''} step="any"></td>
      <td><input type="number" data-f="entry" value="${leg.entry == null ? '' : leg.entry}" placeholder="${fmt(isU ? state.S : g.price, 2)}" step="any"></td>
      <td class="num">${isU ? '-' : fmt(g.price, 2)}</td>
      <td class="num">${fmt(g.delta * leg.side * leg.qty, 3)}</td>
      <td class="num">${fmt(leg.side * leg.qty * mult * (isU ? 0 : entry), 0)}</td>
      <td><button class="icon" data-f="iv" title="Solve implied volatility from the entry price" ${isU ? 'disabled' : ''}>IV</button>
          <button class="icon danger" data-f="del" title="Remove leg">x</button></td>
    </tr>`;
  }).join('');
  // Rebuilding the tbody destroys the element being edited, so remember where
  // the caret was and put it back afterwards.
  const ae = document.activeElement;
  const inTable = ae && $('legsBody').contains(ae) && ae.closest('tr');
  const focus = inTable
    ? { id: ae.closest('tr').dataset.id, f: ae.dataset.f, start: ae.selectionStart, end: ae.selectionEnd }
    : null;

  $('legsBody').innerHTML = body || '<tr><td colspan="12" class="muted">No legs. Add one or pick a strategy.</td></tr>';

  if (focus) {
    const el = $('legsBody').querySelector(
      'tr[data-id="' + focus.id + '"] [data-f="' + focus.f + '"]');
    if (el) {
      el.focus();
      try { el.setSelectionRange(focus.start, focus.end); } catch (e) { /* number inputs */ }
    }
  }
}

function renderResults() {
  const a = analyse();
  const g = netGreeks();
  const cost = netCost();
  const c = currentCommodity();

  $('summary').innerHTML = `
    <div class="kpi"><span>Net ${cost >= 0 ? 'debit (paid)' : 'credit (received)'}</span><strong>${money(Math.abs(cost))}</strong></div>
    <div class="kpi"><span>Max profit</span><strong class="pos">${money(a.maxProfit)}</strong></div>
    <div class="kpi"><span>Max loss</span><strong class="neg">${money(a.maxLoss)}</strong></div>
    <div class="kpi"><span>Breakeven${a.breakevens.length === 1 ? '' : 's'}</span><strong>${a.breakevens.length ? a.breakevens.map(b => fmt(b, 2)).join(' / ') : '-'}</strong></div>
    <div class="kpi"><span>Prob. of profit</span><strong>${(a.pop * 100).toFixed(1)}%</strong></div>
    <div class="kpi"><span>Horizon</span><strong>${a.t} days</strong></div>`;

  const mult = dollarMultiplier(c);
  $('greeks').innerHTML = `
    <table class="greeks">
      <tr><th></th><th>Per unit</th><th>Position ($)</th><th>Meaning</th></tr>
      <tr><td>Delta</td><td class="num">${fmt(g.unit.delta, 4)}</td><td class="num">${money(g.money.delta)}</td><td class="muted">$ P&L per 1 point move</td></tr>
      <tr><td>Gamma</td><td class="num">${fmt(g.unit.gamma, 6)}</td><td class="num">${money(g.money.gamma)}</td><td class="muted">delta change per 1 point move</td></tr>
      <tr><td>Vega</td><td class="num">${fmt(g.unit.vega, 4)}</td><td class="num">${money(g.money.vega)}</td><td class="muted">$ per +1 vol point</td></tr>
      <tr><td>Theta</td><td class="num">${fmt(g.unit.theta, 4)}</td><td class="num">${money(g.money.theta)}</td><td class="muted">$ per calendar day</td></tr>
      <tr><td>Rho</td><td class="num">${fmt(g.unit.rho, 4)}</td><td class="num">${money(g.money.rho)}</td><td class="muted">$ per +1 rate point</td></tr>
    </table>
    <p class="muted small">Position column = per-unit greek x quantity x $${fmt(mult, 2)} multiplier.</p>`;

  $('tDays').max = Math.max(a.t, 1);
  if (state.chart.tDays > a.t) state.chart.tDays = a.t;
  $('tDays').value = state.chart.tDays;
  $('tDaysLabel').textContent = state.chart.tDays === 0
    ? 'today' : 'in ' + state.chart.tDays + ' day' + (state.chart.tDays === 1 ? '' : 's');
  return a;
}

/* ---------------- charts ---------------- */

let chart;

const markerPlugin = {
  id: 'markers',
  afterDatasetsDraw(c) {
    const opts = c.options.plugins.markers;
    if (!opts || !opts.lines) return;
    const { ctx, chartArea, scales } = c;
    for (const m of opts.lines) {
      const x = scales.x.getPixelForValue(m.value);
      if (x < chartArea.left || x > chartArea.right) continue;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash(m.dash || [4, 4]);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1;
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = m.color;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.label, x, chartArea.top + 10);
      ctx.restore();
    }
  }
};

function themeColors() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    grid: dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.10)',
    zero: dark ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.45)',
    text: dark ? '#d9dde3' : '#333',
    net: dark ? '#7fd1ff' : '#0b6ea8',
    now: dark ? '#ffb45c' : '#d97706',
    leg: dark ? 'rgba(255,255,255,.30)' : 'rgba(0,0,0,.25)',
    spot: dark ? '#9aa4b2' : '#6b7280',
    strike: dark ? '#8f8f8f' : '#9ca3af'
  };
}

function renderChart(a) {
  const col = themeColors();
  const mult = dollarMultiplier(currentCommodity());
  const datasets = [];
  let yTitle;

  if (state.chart.mode === 'payoff') {
    yTitle = 'Profit / loss ($)';
    datasets.push({
      label: 'At horizon (' + a.t + 'd)',
      data: a.xs.map((x, i) => ({ x, y: a.ys[i] })),
      borderColor: col.net, borderWidth: 2, pointRadius: 0, tension: 0
    });
    if (state.chart.tDays < a.t) {
      datasets.push({
        label: state.chart.tDays === 0 ? 'Today (mark to market)' : 'In ' + state.chart.tDays + 'd',
        data: a.xs.map(x => ({ x, y: strategyPnl(x, state.chart.tDays) })),
        borderColor: col.now, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0
      });
    }
    if (state.chart.showLegs) {
      for (const leg of activeLegs()) {
        const entry = legEntry(leg);
        datasets.push({
          label: (leg.side === 1 ? 'Long ' : 'Short ') + leg.qty + ' ' + leg.kind +
            (leg.kind === 'underlying' ? '' : ' ' + fmt(leg.strike, 2)),
          data: a.xs.map(x => ({
            x, y: leg.side * leg.qty * mult * (legValue(leg, x, a.t) - entry)
          })),
          borderColor: col.leg, borderWidth: 1, borderDash: [2, 3], pointRadius: 0, tension: 0
        });
      }
    }
  } else {
    // Greek profile across underlying price, at the chosen evaluation date.
    const which = state.chart.mode; // delta | gamma | vega | theta
    yTitle = which.charAt(0).toUpperCase() + which.slice(1) + ' (position, $ terms)';
    const tOff = state.chart.tDays;
    const data = a.xs.map(x => {
      let v = 0;
      for (const leg of activeLegs()) {
        const w = leg.side * leg.qty;
        if (leg.kind === 'underlying') { if (which === 'delta') v += w; continue; }
        const tau = Math.max(leg.days - tOff, 0) / 365;
        const sigma = (leg.vol == null ? state.vol : leg.vol) / 100;
        const g = gbs(leg.kind, x, leg.strike, tau, state.rate / 100, carry(), sigma);
        v += w * g[which];
      }
      return { x, y: v * mult };
    });
    datasets.push({
      label: yTitle, data, borderColor: col.net, borderWidth: 2, pointRadius: 0, tension: 0
    });
  }

  const lines = activeLegs()
    .filter(l => l.kind !== 'underlying')
    .map(l => ({ value: l.strike, color: col.strike, label: 'K ' + fmt(l.strike, 0) }));
  lines.push({ value: state.S, color: col.spot, label: 'Now', dash: [2, 2] });

  const cfg = {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Underlying price at horizon', color: col.text },
          grid: { color: col.grid }, ticks: { color: col.text }
        },
        y: {
          title: { display: true, text: yTitle, color: col.text },
          grid: {
            color: ctx => ctx.tick.value === 0 ? col.zero : col.grid,
            lineWidth: ctx => ctx.tick.value === 0 ? 1.5 : 1
          },
          ticks: { color: col.text }
        }
      },
      plugins: {
        legend: { labels: { color: col.text, boxWidth: 12 } },
        markers: { lines },
        tooltip: {
          callbacks: {
            title: items => 'Price ' + fmt(items[0].parsed.x, 2),
            label: item => item.dataset.label + ': ' + money(item.parsed.y)
          }
        }
      }
    },
    plugins: [markerPlugin]
  };

  if (chart) chart.destroy();
  chart = new Chart($('payoffChart').getContext('2d'), cfg);
}

function renderAll() {
  renderInputs();
  renderLegs();
  const a = renderResults();
  renderChart(a);
  renderSources();
  persist();
}

/* ============================================================
 * 8. Persistence and sharing
 * ========================================================== */

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(snapshot())); } catch (e) { }
}

function snapshot() {
  return {
    commodity: state.commodity, model: state.model, S: state.S, vol: state.vol,
    rate: state.rate, yield: state.yield, days: state.days, size: state.size,
    quote: state.quote, chart: state.chart,
    legs: state.legs.map(l => ({
      on: l.on, side: l.side, kind: l.kind, qty: l.qty,
      strike: l.strike, days: l.days, vol: l.vol, entry: l.entry
    }))
  };
}

function restore(o) {
  if (!o) return false;
  ['commodity', 'model', 'S', 'vol', 'rate', 'yield', 'days', 'size', 'quote'].forEach(k => {
    if (o[k] != null) state[k] = o[k];
  });
  if (o.chart) Object.assign(state.chart, o.chart);
  if (Array.isArray(o.legs)) state.legs = o.legs.map(l => newLeg(l));
  return true;
}

function shareLink() {
  const json = JSON.stringify(snapshot());
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#s=' + b64;
}

function readHash() {
  const m = location.hash.match(/#s=([A-Za-z0-9\-_]+)/);
  if (!m) return null;
  try {
    let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch (e) { return null; }
}

/* ============================================================
 * 9. Market data actions
 * ========================================================== */

function setStatus(msg, kind) {
  const el = $('dataStatus');
  el.textContent = msg || '';
  el.className = 'status ' + (kind || '');
}

/* Each apply* function updates one input and returns a short description of
 * what it did, or throws with a message fit to show the user. */

async function applyRate() {
  const curve = await fetchYieldCurve();
  const years = Math.max(state.days, 1) / 365;
  const r = rateForTenor(curve, years);
  state.rate = +r.continuous.toFixed(3);
  state.sources.rate = {
    live: true,
    text: `US Treasury par curve ${curve.date}, interpolated at ${state.days}d = ` +
      `${r.par.toFixed(2)}% par -> ${r.continuous.toFixed(3)}% continuous`
  };
  return `risk-free rate ${state.rate}% (Treasury ${curve.date})`;
}

async function applyFuturesPrice() {
  const q = await proxyGet('quote', state.commodity, 5 * 60e3);
  if (!(q.price > 0)) throw new Error('no price returned');
  state.S = q.price;

  // Yahoo reports USX for cents-quoted contracts. Trust it over our table:
  // getting this wrong scales the whole position P&L by 100.
  let unitNote = '';
  const wanted = q.currency === 'USX' ? 'cents' : q.currency === 'USD' ? 'USD' : null;
  if (wanted && wanted !== state.quote) {
    state.quote = wanted;
    unitNote = `, quoting switched to ${wanted} to match the contract`;
  }

  state.sources.price = {
    live: true,
    text: `${q.name || q.symbol} last ${fmt(q.price, 2)}` +
      (q.currency ? ` ${q.currency}` : '') +
      (q.asOf ? `, ${q.asOf.slice(0, 16).replace('T', ' ')} UTC` : '') + unitNote
  };
  return `${q.name || q.symbol} at ${fmt(q.price, 2)}${unitNote}`;
}

/* Realised vol from the real futures series, falling back to Alpha Vantage's
 * ETF proxy when the futures proxy is not reachable. */
async function applyVol() {
  const win = +$('volWindow').value;
  const est = $('volEstimator').value;
  try {
    const h = await proxyGet('history', state.commodity, 60 * 60e3);
    const rv = realisedVol(h.series || [], win);
    if (!rv) throw new Error('not enough history');
    const chosen = rv[est];
    if (!(chosen > 0)) throw new Error('estimator unavailable for this series');

    state.vol = +chosen.toFixed(2);
    state.sources.vol = {
      live: true,
      text: `${est} realised vol, ${rv.days}d window on ${h.symbol} ` +
        `(front-month futures; roll gaps can inflate it slightly), last close ${rv.last}. ` +
        `close-to-close ${rv.close.toFixed(1)}% / EWMA ${rv.ewma.toFixed(1)}%` +
        (rv.parkinson ? ` / Parkinson ${rv.parkinson.toFixed(1)}%` : '')
    };
    return `volatility ${state.vol}% from ${h.symbol}`;
  } catch (proxyErr) {
    const key = $('avKey').value.trim();
    if (!key) throw proxyErr;
    return applyVolFromAlphaVantage(key, win, est);
  }
}

async function applyVolFromAlphaVantage(key, win, est) {
  const meta = COMMODITIES[state.commodity] || COMMODITIES.custom;
  const symbol = ($('volSymbol').value.trim() || meta.priceSymbol || '').toUpperCase();
  if (!symbol) throw new Error('no ticker to read prices from');
  localStorage.setItem(KEY_STORE, key);

  const series = await fetchDailySeries(symbol, key);
  const rv = realisedVol(series, win);
  if (!rv) throw new Error('not enough history');
  const chosen = rv[est];
  if (!(chosen > 0)) throw new Error('estimator unavailable for this series');

  // Only describe the built-in proxy when that is actually the symbol used.
  const isDefaultProxy = symbol === (meta.priceSymbol || '').toUpperCase();
  const proxyText = isDefaultProxy && meta.proxy ? meta.proxy : 'symbol entered by you';

  state.vol = +chosen.toFixed(2);
  state.sources.vol = {
    live: true,
    text: `${est} realised vol, ${rv.days}d window on ${symbol} (${proxyText}), ` +
      `last close ${rv.last}. close-to-close ${rv.close.toFixed(1)}% / EWMA ${rv.ewma.toFixed(1)}%` +
      (rv.parkinson ? ` / Parkinson ${rv.parkinson.toFixed(1)}%` : '')
  };
  return `volatility ${state.vol}% from ${symbol} (ETF proxy)`;
}

/* Convenience yield from the real futures curve: two listed contracts give
 * y = r - ln(F2/F1)/(T2-T1). */
async function applyCurveYield() {
  const c = await proxyGet('curve', state.commodity, 60 * 60e3);
  const near = c.contracts[0], far = c.contracts[1];
  const days = Math.round((new Date(far.expiry) - new Date(near.expiry)) / 86400e3);
  const dt = days / 365;
  if (!(dt > 0) || !(near.price > 0) || !(far.price > 0)) {
    throw new Error('the two contracts did not give a usable spread');
  }
  const y = (state.rate / 100 - Math.log(far.price / near.price) / dt) * 100;
  state.yield = +y.toFixed(3);
  state.sources.yield = {
    live: true,
    text: `implied by the futures curve: ${near.name || near.symbol} ${fmt(near.price, 2)} vs ` +
      `${far.name || far.symbol} ${fmt(far.price, 2)}, ${days}d apart (expiries approximated to ` +
      `mid-month), r=${state.rate}% -> y=${y.toFixed(3)}%`
  };
  // Show the working in the manual boxes so the number is auditable.
  $('carryS').value = near.price;
  $('carryF').value = far.price;
  $('carryDays').value = days;
  return `convenience yield ${state.yield}% from the curve`;
}

/* One button that fills everything it can, reporting each field separately. */
async function actionAutoFill() {
  setStatus('Fetching market data...', 'busy');
  const steps = [
    ['risk-free rate', applyRate],
    ['futures price', applyFuturesPrice],
    ['volatility', applyVol],
    ['convenience yield', applyCurveYield]   // uses the rate fetched above
  ];
  const done = [], failed = [];
  for (const [name, step] of steps) {
    try { done.push(await step()); }
    catch (e) { failed.push(`${name} (${e.message})`); }
  }
  renderAll();

  const parts = [];
  if (done.length) parts.push('Updated ' + done.join('; ') + '.');
  if (failed.length) parts.push('Left unchanged: ' + failed.join('; ') + '.');
  setStatus(parts.join(' '), failed.length ? (done.length ? '' : 'err') : 'ok');
}

/* Thin wrapper so every single-field button behaves the same way. */
function runAction(label, step) {
  return async () => {
    setStatus(label + '...', 'busy');
    try {
      const msg = await step();
      renderAll();
      setStatus('Updated ' + msg + '.', 'ok');
    } catch (e) {
      setStatus(label + ' failed: ' + e.message + '. The current value is unchanged.', 'err');
    }
  };
}

function actionImplyYield() {
  const F = parseFloat($('carryF').value);
  const S = parseFloat($('carryS').value);
  const d = parseFloat($('carryDays').value);
  const y = impliedConvenienceYield(S, F, d, state.rate);
  if (!isFinite(y)) {
    setStatus('Enter a spot price, a futures price and the days to the futures expiry.', 'err');
    return;
  }
  state.yield = +y.toFixed(3);
  state.sources.yield = {
    live: true,
    text: `implied by carry: F=${fmt(F, 2)}, S=${fmt(S, 2)}, ${d}d, r=${state.rate}% -> y=${y.toFixed(3)}%`
  };
  setStatus('Convenience yield implied from the spot/futures basis: ' + y.toFixed(3) + '%.', 'ok');
  renderAll();
}

function actionApplyPreset() {
  const meta = COMMODITIES[state.commodity] || COMMODITIES.custom;
  state.vol = meta.vol;
  state.yield = meta.yield;
  state.size = meta.size;
  state.quote = meta.quote;
  state.sources.vol = { live: false, text: 'preset long-run average (' + meta.vol + '%) - not market data' };
  state.sources.yield = { live: false, text: 'preset (' + meta.yield + '%) - not market data' };
  state.sources.price = null;
  $('volSymbol').value = meta.priceSymbol || '';
  $('proxyNote').textContent = meta.proxy || '';
  renderAll();
}

/* ============================================================
 * 10. Wiring
 * ========================================================== */

function num(el, fallback) {
  const v = parseFloat(el.value);
  return isFinite(v) ? v : fallback;
}

function bindInputs() {
  $('commodity').addEventListener('change', e => {
    state.commodity = e.target.value;
    actionApplyPreset();
  });

  /* Each handler keeps the previous value when the box is momentarily empty or
   * half-typed, so clearing a field does not zero out the whole model. */
  const simple = {
    model: el => { state.model = el.value; },
    spot: el => { state.S = num(el, state.S); },
    vol: el => { state.vol = num(el, state.vol); },
    rate: el => { state.rate = num(el, state.rate); },
    yield: el => { state.yield = num(el, state.yield); },
    days: el => {
      const old = state.days;
      state.days = Math.max(0, num(el, state.days));
      // Keep legs that were on the old default expiry in sync.
      state.legs.forEach(l => { if (l.days === old) l.days = state.days; });
    },
    size: el => { state.size = num(el, state.size); },
    quote: el => { state.quote = el.value; }
  };

  Object.keys(simple).forEach(id => {
    $(id).addEventListener('input', e => {
      simple[id](e.target);
      // A hand-typed value is no longer sourced from market data.
      if (id === 'vol' || id === 'rate' || id === 'yield') state.sources[id] = null;
      renderAll();
    });
  });

  $('strategy').addEventListener('change', e => {
    if (e.target.value) applyStrategy(e.target.value);
  });

  $('addLeg').addEventListener('click', () => {
    const step = strikeStep(state.S);
    state.legs.push(newLeg({
      strike: Math.round(state.S / step) * step,
      days: state.days
    }));
    renderAll();
  });

  $('clearLegs').addEventListener('click', () => {
    state.legs = [];
    renderAll();
  });

  // Delegated handling for the legs table.
  $('legsBody').addEventListener('change', onLegEvent);
  $('legsBody').addEventListener('click', e => {
    if (e.target.matches('button[data-f]')) onLegEvent(e);
  });

  $('chartMode').addEventListener('change', e => {
    state.chart.mode = e.target.value;
    renderAll();
  });
  $('showLegs').addEventListener('change', e => {
    state.chart.showLegs = e.target.checked;
    renderAll();
  });
  $('range').addEventListener('input', e => {
    state.chart.range = +e.target.value;
    $('rangeLabel').textContent = '+/-' + state.chart.range + '%';
    renderAll();
  });
  $('tDays').addEventListener('input', e => {
    state.chart.tDays = +e.target.value;
    renderAll();
  });

  $('autoFill').addEventListener('click', actionAutoFill);
  $('fetchPrice').addEventListener('click', runAction('Futures price', applyFuturesPrice));
  $('fetchRate').addEventListener('click', runAction('Risk-free rate', applyRate));
  $('fetchVol').addEventListener('click', runAction('Volatility', applyVol));
  $('fetchCurve').addEventListener('click', runAction('Convenience yield', applyCurveYield));
  $('implyYield').addEventListener('click', actionImplyYield);
  $('usePreset').addEventListener('click', actionApplyPreset);

  $('share').addEventListener('click', async () => {
    const url = shareLink();
    location.hash = url.split('#')[1];
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Shareable link copied to the clipboard.', 'ok');
    } catch (e) {
      setStatus('Link is in the address bar - copy it from there.', 'ok');
    }
  });

  $('exportJson').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'strategy.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('importJson').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        restore(JSON.parse(fr.result));
        renderAll();
        setStatus('Strategy loaded.', 'ok');
      } catch (err) {
        setStatus('That file is not a valid strategy export.', 'err');
      }
    };
    fr.readAsText(file);
    e.target.value = '';
  });

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => renderChart(analyse());
  if (mq.addEventListener) mq.addEventListener('change', onScheme);
  else if (mq.addListener) mq.addListener(onScheme); // older Safari
}

function onLegEvent(e) {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const leg = state.legs.find(l => l.id === +tr.dataset.id);
  if (!leg) return;
  const f = e.target.dataset.f;

  if (f === 'del') {
    state.legs = state.legs.filter(l => l !== leg);
    renderAll();
    return;
  }
  if (f === 'iv') {
    const target = leg.entry;
    if (target == null) {
      setStatus('Enter the market premium in the Entry column first, then press IV.', 'err');
      return;
    }
    const iv = impliedVol(leg.kind, target, state.S, leg.strike, leg.days / 365,
      state.rate / 100, carry());
    if (!isFinite(iv)) {
      setStatus('No implied volatility solves that premium (check the price and the strike).', 'err');
      return;
    }
    leg.vol = +(iv * 100).toFixed(2);
    setStatus('Implied volatility for that leg: ' + leg.vol + '%.', 'ok');
    renderAll();
    return;
  }

  const el = e.target;
  switch (f) {
    case 'on': leg.on = el.checked; break;
    case 'side': leg.side = +el.value; break;
    case 'kind': leg.kind = el.value; break;
    case 'qty': leg.qty = Math.max(0, num(el, 1)); break;
    case 'strike': leg.strike = num(el, leg.strike); break;
    case 'days': leg.days = Math.max(0, num(el, leg.days)); break;
    case 'vol': leg.vol = el.value.trim() === '' ? null : num(el, null); break;
    case 'entry': leg.entry = el.value.trim() === '' ? null : num(el, null); break;
  }
  renderAll();
}

function init() {
  // Commodity dropdown
  $('commodity').innerHTML = Object.keys(COMMODITIES)
    .map(k => `<option value="${k}">${COMMODITIES[k].label}</option>`).join('');
  // Strategy dropdown
  $('strategy').innerHTML = '<option value="">-- pick a strategy --</option>' +
    Object.keys(STRATEGIES).map(k => `<option value="${k}">${STRATEGIES[k].label}</option>`).join('');

  const saved = readHash() || (() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
  })();

  if (!restore(saved) || !state.legs.length) {
    state.legs = [newLeg({ strike: 4200, days: state.days })];
  }

  const meta = COMMODITIES[state.commodity] || COMMODITIES.custom;
  $('volSymbol').value = meta.priceSymbol || '';
  $('proxyNote').textContent = meta.proxy || '';
  $('avKey').value = localStorage.getItem(KEY_STORE) || '';
  $('range').value = state.chart.range;
  $('rangeLabel').textContent = '+/-' + state.chart.range + '%';
  $('chartMode').value = state.chart.mode;
  $('showLegs').checked = state.chart.showLegs;

  bindInputs();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
