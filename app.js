/* Commodity Options Calculator
 * Generalised Black-Scholes-Merton (cost of carry) pricer, multi-leg strategy
 * builder and market data helpers. No build step: plain script, works from a
 * file:// path as well as on its Vercel deployment.
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

/* An option on a price with no volatility, or no time, left: the forward is
 * known, so the option is one cash flow - its payoff at the date t it is
 * exercised, discounted - and so are its greeks, in gbs()'s units. Delta is the
 * forward's, and there is no gamma or vega. Held to expiry (t = T) it drifts
 * as expiry nears, which is its theta; exercised sooner, expiry no longer moves
 * it. rho is per point, the carry following the rate under cost of carry. Its
 * theta and rho used to be 0: a 30-day call on a 100 future struck at 95, at
 * 4%, carries +0.000546 a day and -0.004096 a point. */
function deterministicOption(kind, S, K, T, r, b, t, bTracksRate) {
  const sign = kind === 'call' ? 1 : -1;
  const fwd = S * Math.exp(b * t), disc = Math.exp(-r * t);
  if (!(sign * (fwd - K) > 0)) return { price: 0, delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0, d1: NaN, d2: NaN };
  const price = sign * (fwd - K) * disc;
  // How fast the payoff's value drifts as expiry nears, while it is held to it.
  // At no rate and no carry it does not, and then a plain 0: -0 reads "-0.0000".
  const drift = t === T && T > 0 ? (b - r) * fwd + r * K : 0;
  return {
    price,
    delta: sign * Math.exp((b - r) * t),
    gamma: 0,
    vega: 0,
    theta: drift === 0 ? 0 : -sign * drift * disc / 365,
    // Nothing left to discount at t = 0, and a plain 0 there too.
    rho: t > 0 ? (bTracksRate === true ? sign * K * t * disc : -t * price) / 100 : 0,
    d1: NaN, d2: NaN
  };
}

/* Generalised Black-Scholes-Merton.
 *   b = r - q  -> Black-Scholes-Merton on a spot underlying with carry
 *   b = 0      -> Black-76 on a futures price (discounting at r)
 * Returns price plus greeks in "natural" units:
 *   vega  per 1 vol point (1%)
 *   theta per calendar day
 *   rho   per 1 rate point (1%)
 * bTracksRate says whether b moves with r, as b = r - q does, which only rho
 * depends on - the same flag americanGreeks() takes. It used to be guessed
 * from b, and b = 0 is also what BSM gives when the yield equals the rate:
 * such a call got Black-76's rho, -0.0414 instead of +0.2244.
 */
function gbs(kind, S, K, T, r, b, sigma, bTracksRate) {
  const isCall = kind === 'call';
  if (!(T > 0) || !(sigma > 0) || !(S > 0) || !(K > 0)) {
    // A European option cannot be exercised sooner: held to expiry.
    const t = Math.max(T, 0);
    return deterministicOption(kind, S, K, t, r, b, t, bTracksRate);
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

  // With b fixed - Black-76, or any carry that does not follow the rate - r
  // only discounts, and the rate bump moves nothing else.
  const rho = bTracksRate === true
    ? (isCall ? K * T * er * nd2 : -K * T * er * normCdf(-d2)) / 100
    : -T * price / 100;

  return { price, delta, gamma, vega, theta, rho, d1, d2 };
}

/* ------------------------------------------------------------
 * American exercise: Barone-Adesi & Whaley (1987) quadratic
 * approximation, in the generalised cost-of-carry form.
 *
 * Almost every listed commodity futures option is American, and with
 * b = 0 the early-exercise premium is real on both sides: the futures
 * margin account earns nothing, so deep in-the-money options are worth
 * exercising to free the cash. BAW is used rather than a lattice
 * because the payoff curve prices ~1200 grid points per leg, and the
 * critical price - the only expensive part - does not depend on the
 * underlying, so it is solved once and reused across the whole grid.
 * ---------------------------------------------------------- */

/* Cache the whole exercise boundary per (kind, K, T, r, b, sigma). The payoff
 * grid sweeps S with everything else fixed, and neither the critical price nor
 * the BAW coefficient depends on S, so the entire expensive half of the
 * formula is solved once and reused across the grid. Leaving the coefficient
 * out of the cache costs an extra closed-form evaluation per grid point, which
 * is most of the run time of a redraw. */
const critCache = new Map();
const CRIT_CACHE_MAX = 512;

/* One-slot memo in front of the Map. A grid sweep varies only S, so this hits
 * on nearly every call and skips building a string key out of six floats -
 * which, once the boundary itself was cached, was the dominant cost. */
const critLast = { kind: null, K: 0, T: 0, r: 0, b: 0, sigma: 0, val: null };

function bawRoots(T, r, b, sigma) {
  const v2 = sigma * sigma;
  const M = 2 * r / v2;
  const N = 2 * b / v2;
  // 4M/K with K = 1 - e^(-rT). Both go to zero as r -> 0, so use the limit
  // 8/(sigma^2 T) there instead of dividing 0 by 0.
  const MK = Math.abs(r) < 1e-10
    ? 8 / (v2 * T)
    : 4 * M / (1 - Math.exp(-r * T));
  const nm1 = N - 1;
  const disc = Math.sqrt(nm1 * nm1 + MK);
  const discInf = Math.sqrt(nm1 * nm1 + 4 * M);
  return {
    q1: (-nm1 - disc) / 2,
    q2: (-nm1 + disc) / 2,
    q1inf: (-nm1 - discInf) / 2,
    q2inf: (-nm1 + discInf) / 2
  };
}

/* Exercise boundary: the underlying price at which early exercise becomes
 * optimal, plus the power and coefficient of the BAW premium term. Newton on
 * the value-matching condition, seeded the way Haug recommends. */
function americanBoundary(kind, K, T, r, b, sigma) {
  if (critLast.kind === kind && critLast.K === K && critLast.T === T
    && critLast.r === r && critLast.b === b && critLast.sigma === sigma) {
    return critLast.val;
  }
  const remember = v => {
    critLast.kind = kind; critLast.K = K; critLast.T = T;
    critLast.r = r; critLast.b = b; critLast.sigma = sigma; critLast.val = v;
    return v;
  };

  const ck = kind + '|' + K + '|' + T + '|' + r + '|' + b + '|' + sigma;
  const hit = critCache.get(ck);
  if (hit !== undefined) return remember(hit);

  const { q1, q2, q1inf, q2inf } = bawRoots(T, r, b, sigma);
  const sqT = Math.sqrt(T);
  const eb = Math.exp((b - r) * T);
  const isCall = kind === 'call';
  const q = isCall ? q2 : q1;
  const qInf = isCall ? q2inf : q1inf;

  let Si;
  if (!isFinite(qInf) || Math.abs(qInf - 1) < 1e-12) {
    Si = K;
  } else {
    const Su = K / (1 - 1 / qInf);
    if (isCall) {
      const h = -(b * T + 2 * sigma * sqT) * (K / (Su - K));
      Si = K + (Su - K) * (1 - Math.exp(h));
    } else {
      const h = (b * T - 2 * sigma * sqT) * (K / (K - Su));
      Si = Su + (K - Su) * Math.exp(h);
    }
  }
  if (!(Si > 0) || !isFinite(Si)) Si = K;

  for (let i = 0; i < 100; i++) {
    const g = gbs(kind, Si, K, T, r, b, sigma);
    const nd = normCdf(isCall ? g.d1 : -g.d1);
    const pdf = normPdf(g.d1);
    const lhs = isCall ? Si - K : K - Si;
    const rhs = isCall
      ? g.price + (1 - eb * nd) * Si / q
      : g.price - (1 - eb * nd) * Si / q;
    if (Math.abs(lhs - rhs) / K < 1e-9) break;
    const bi = isCall
      ? eb * nd * (1 - 1 / q) + (1 - eb * pdf / (sigma * sqT)) / q
      : -eb * nd * (1 - 1 / q) - (1 + eb * pdf / (sigma * sqT)) / q;
    const next = isCall
      ? (K + rhs - bi * Si) / (1 - bi)
      : (K - rhs + bi * Si) / (1 + bi);
    if (!isFinite(next) || next <= 0) break;
    if (Math.abs(next - Si) < 1e-10 * K) { Si = next; break; }
    Si = next;
  }

  // Coefficient of the (S/Si)^q premium term, evaluated at the boundary.
  const gb = gbs(kind, Si, K, T, r, b, sigma);
  const nb = normCdf(isCall ? gb.d1 : -gb.d1);
  const A = (isCall ? 1 : -1) * (Si / q) * (1 - eb * nb);

  // A boundary must match value: exercising there is worth what BAW's formula
  // says holding is. At negative rates the equation can have no root - for a
  // put with carry above zero, or a call with carry below it, it can stay below
  // zero across the whole range - and Newton then wandered and stopped
  // anywhere. A third of those contracts got a boundary that matched nothing,
  // and now and then one whose premium does not exist: a one-year put at 45%
  // vol, r -1% and carry +1.5% read 24.60 where the binomial tree gives 20.42.
  // No boundary means BAW adds no premium, so americanPrice() takes the
  // European price, floored at intrinsic: of 201 contracts where this fails,
  // none lies further than 0.15% of the underlying from the tree.
  const matched = isCall ? Si - K - (gb.price + (1 - eb * nb) * Si / q) : K - Si - (gb.price - (1 - eb * nb) * Si / q);
  if (!(Math.abs(matched) / K < 1e-6)) Si = NaN;

  const out = { Si, q, A };
  if (critCache.size >= CRIT_CACHE_MAX) critCache.clear();
  critCache.set(ck, out);
  return remember(out);
}

/* The exercise boundary alone. */
function americanCritical(kind, K, T, r, b, sigma) {
  return americanBoundary(kind, K, T, r, b, sigma).Si;
}

/* An American option on a price with no volatility left, exercised on its
 * best date: now, at expiry, or the one date in between at which its payoff's
 * discounted value can turn, where S e^(bt) = rK / (r - b). Its value and
 * greeks are deterministicOption()'s on that date. It used to be its intrinsic
 * value always, as if exercised now, which is right only when holding it is
 * worth less: with carry at 5% over a 4% rate, a six-month call on 4,500 struck
 * at 4,000 is worth 601.76 held, and read 500 - jumping to 601.76 at the
 * smallest volatility above zero. */
function deterministicAmerican(kind, S, K, T, r, b, bTracksRate) {
  let best = deterministicOption(kind, S, K, T, r, b, 0, bTracksRate);
  const dates = [T];
  if (b !== 0 && r !== b) {
    const turn = Math.log(r * K / ((r - b) * S)) / b;
    if (turn > 0 && turn < T) dates.push(turn);
  }
  for (const t of dates) {
    const o = deterministicOption(kind, S, K, T, r, b, t, bTracksRate);
    if (o.price > best.price) best = o;
  }
  return best;
}

/* American price. Falls back to the European value whenever early exercise
 * cannot be worth anything, and is floored at intrinsic and at the European
 * price so a non-converged solve can never produce an arbitrageable number. */
function americanPrice(kind, S, K, T, r, b, sigma) {
  const isCall = kind === 'call';
  const intrinsic = Math.max(isCall ? S - K : K - S, 0);
  if (!(T > 0) || !(sigma > 0) || !(S > 0) || !(K > 0)) {
    return deterministicAmerican(kind, S, K, Math.max(T, 0), r, b).price;
  }

  const euro = gbs(kind, S, K, T, r, b, sigma).price;
  // Early exercise is worth nothing - and BAW, which would add a premium
  // anyway, must not be asked - when the European price beats exercising at
  // every price: for a call whose carry is at least both the rate and zero,
  // and, by put-call symmetry, for a put whose rate and carry are both at most
  // zero. Above zero the call's rule is the familiar b >= r. At negative rates
  // the put's rule was missing, so a put on a 100 future at r = -1% carried a
  // premium the binomial tree does not find, and the call's stopped at b >= r,
  // pricing a two-year call at r = b = -2% at its European value, 0.82 short.
  if (isCall ? b >= r && b >= 0 : r <= 0 && b <= 0) return Math.max(euro, intrinsic);

  const { Si, q, A } = americanBoundary(kind, K, T, r, b, sigma);
  if (!(Si > 0) || !isFinite(Si)) return Math.max(euro, intrinsic);
  // Past the boundary BAW says exercise, which is worth the intrinsic value -
  // unless the boundary is wrong, as it can be at negative rates, where this
  // returned 0 for a put the European formula values at 15.18.
  if (isCall ? S >= Si : S <= Si) return Math.max(euro, intrinsic);

  const price = euro + A * Math.pow(S / Si, q);
  return isFinite(price) ? Math.max(price, euro, intrinsic) : Math.max(euro, intrinsic);
}

/* Greeks of an American option by central differences on the BAW price.
 * There is no closed form, and the bumps are cheap because the critical
 * price for each bumped parameter set is cached. Units match gbs(). */
function americanGreeks(kind, S, K, T, r, b, sigma, bTracksRate) {
  const P = (s, t, rr, bb, sig) => americanPrice(kind, s, K, t, rr, bb, sig);
  if (!(T > 0) || !(sigma > 0) || !(S > 0) || !(K > 0)) {
    return deterministicAmerican(kind, S, K, Math.max(T, 0), r, b, bTracksRate);
  }
  const price = P(S, T, r, b, sigma);

  const hS = Math.max(S * 1e-4, 1e-8);
  const up = P(S + hS, T, r, b, sigma);
  const dn = P(S - hS, T, r, b, sigma);

  const hV = 5e-4;
  // Theta is the price's rate of change, quoted per day, as gbs() gives it -
  // so the step in time is a thousandth of a day. It was a day, which read a
  // short option's decay off a curve bending under it: 3.5% off for a two-day
  // put at the money, and a decay for an option already worth exercising, whose
  // value expiry no longer moves, wherever the step crossed the boundary.
  const hT = Math.min(T / 2, 1e-3 / 365);
  const hR = 1e-5;

  // Under Black-76 the carry is 0 by construction and a rate bump must not
  // move it; under cost-of-carry b = r - q, so it moves with the rate. The
  // caller states which, because b = 0 is also a legitimate carry value.
  const carries = bTracksRate === true;

  return {
    price,
    delta: (up - dn) / (2 * hS),
    gamma: (up - 2 * price + dn) / (hS * hS),
    vega: (P(S, T, r, b, sigma + hV) - P(S, T, r, b, sigma - hV)) / (2 * hV) / 100,
    theta: (P(S, T - hT, r, b, sigma) - P(S, T + hT, r, b, sigma)) / (2 * hT) / 365,
    rho: (P(S, T, r + hR, carries ? b + hR : b, sigma)
      - P(S, T, r - hR, carries ? b - hR : b, sigma)) / (2 * hR) / 100,
    d1: NaN, d2: NaN
  };
}

/* Single entry point for both exercise styles. */
function priceOption(kind, S, K, T, r, b, sigma, style, bTracksRate) {
  return style === 'american'
    ? americanGreeks(kind, S, K, T, r, b, sigma, bTracksRate)
    : gbs(kind, S, K, T, r, b, sigma, bTracksRate);
}

/* The time value, as a share of the underlying, at or below which a premium
 * implies no volatility. Below about a hundred-millionth the solver returned
 * wherever it happened to stop; a millionth leaves room, and is still far
 * under a tick of time value in every market here - silver's, the smallest,
 * is two hundred-thousandths of its price. */
const NO_TIME_VALUE = 1e-6;

/* Implied volatility: Newton with vega, bisection fallback. Inverts whichever
 * exercise style priced the option, so an American entry price does not come
 * back as an inflated European volatility. NaN when no volatility gives the
 * premium, and when the premium has no time value to give one from: every
 * volatility up to some level prices it the same, and the solver used to
 * return its 30% starting point or its 0.01% floor for it. */
function impliedVol(kind, target, S, K, T, r, b, style) {
  if (!(target > 0) || !(T > 0)) return NaN;
  const px = sigma => style === 'american'
    ? americanPrice(kind, S, K, T, r, b, sigma)
    : gbs(kind, S, K, T, r, b, sigma).price;

  if (!(target - px(1e-8) > NO_TIME_VALUE * S)) return NaN;

  if (style !== 'american') {
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
      if (sigma > 10) break;
    }
  }
  // Bisection fallback, and the only path for American: the BAW price has no
  // closed-form vega, so a bracketed search is both simpler and safer.
  let lo = 1e-4, hi = 10;
  if (px(hi) < target) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (px(mid) < target) lo = mid; else hi = mid;
  }
  const out = (lo + hi) / 2;
  return Math.abs(px(out) - target) < 1e-4 ? out : NaN;
}

/* ============================================================
 * 2. Commodity reference data
 * ========================================================== */

/* COMMODITIES, the table of markets, lives in commodities.js: index.html loads it
 * before this file, and api/market.js reads the same table, so the page and the
 * function cannot disagree about which markets exist. */

function dollarMultiplier(c) {
  return c.size * (c.quote === 'cents' ? 0.01 : 1);
}

/* Own-property lookup on purpose: state can come from a shared link, and keys
 * such as "__proto__" or "constructor" would otherwise resolve to inherited
 * objects and pass a plain truthiness check. */
function commodityMeta(key) {
  return Object.prototype.hasOwnProperty.call(COMMODITIES, key)
    ? COMMODITIES[key] : COMMODITIES.custom;
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
  style: 'american',
  contractMonth: '',   // '' = the continuous front-month series
  S: 4000,
  vol: 15,
  rate: 4.0,
  yield: 0.3,
  // The premium paid or received today, carried to the date the P&L is read
  // at: 'rate' at the risk-free rate above, the one that discounts the price;
  // 'custom' at `rate`, the user's own, in % continuous; 'none' not at all,
  // which is the nominal P&L.
  financing: { mode: 'rate', rate: 4.0 },
  days: 30,
  size: 100,
  quote: 'USD',
  legs: [],
  skew: { on: false, rr: 0, bf: 0 },
  scenario: { volShift: 5, pricePct: 20 },
  chart: { mode: 'payoff', tDays: 0, showLegs: true, range: 40 },
  // Where each market input came from; null = typed or preset. `legs` is the
  // fill from the curve, shown on its own line only while legs carry it.
  sources: { price: null, rate: null, vol: null, yield: null, legs: null },
  // This visit only, never saved or shared: `strip` is the listed contracts
  // last loaded for this commodity. Live quotes, and a stale strip in a shared
  // link would be worse than none.
  session: { strip: [] }
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
    under: null,      // null -> use the global price; set it for a real curve
    entry: null       // null -> use the theoretical price as the entry cost
  }, over || {});
}

/* ============================================================
 * 4. Strategy presets
 * ========================================================== */

/* k = at-the-money reference, w = strike step */
const STRATEGIES = {
  'long-call': { label: 'Long call', legs: k => [{ side: 1, kind: 'call', strike: k }] },
  'long-put': { label: 'Long put', legs: k => [{ side: 1, kind: 'put', strike: k }] },
  'short-call': { label: 'Short call (naked)', legs: (k, w) => [{ side: -1, kind: 'call', strike: k + w }] },
  'short-put': { label: 'Short put (naked)', legs: (k, w) => [{ side: -1, kind: 'put', strike: k - w }] },
  'covered-call': { label: 'Covered call', legs: (k, w) => [{ side: 1, kind: 'underlying', strike: 0 }, { side: -1, kind: 'call', strike: k + w }] },
  'protective-put': { label: 'Protective put', legs: (k, w) => [{ side: 1, kind: 'underlying', strike: 0 }, { side: 1, kind: 'put', strike: k - w }] },
  'bull-call': { label: 'Bull call spread', legs: (k, w) => [{ side: 1, kind: 'call', strike: k }, { side: -1, kind: 'call', strike: k + 2 * w }] },
  'bear-put': { label: 'Bear put spread', legs: (k, w) => [{ side: 1, kind: 'put', strike: k }, { side: -1, kind: 'put', strike: k - 2 * w }] },
  'straddle': { label: 'Long straddle', legs: k => [{ side: 1, kind: 'call', strike: k }, { side: 1, kind: 'put', strike: k }] },
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
  const def = Object.prototype.hasOwnProperty.call(STRATEGIES, name) ? STRATEGIES[name] : null;
  if (!def || typeof def.legs !== 'function') return;
  const step = strikeStep(state.S);
  const k = Math.round(state.S / step) * step;
  state.legs = def.legs(k, step, state.days).map(l => newLeg(Object.assign({ days: state.days }, l)));
}

function strikeStep(S) {
  // A price of zero or a half-typed field would make log10 return -Infinity and
  // every derived strike NaN, which poisons the whole payoff curve.
  if (!(S > 0) || !isFinite(S)) return 1;
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

/* Only the cost-of-carry model ties b to the rate; under Black-76 b is pinned
 * at 0. The rho bump needs to know which, since b = 0 is a valid carry too. */
function carryTracksRate() {
  return state.model !== 'b76';
}

/* Today's underlying price for one leg. In a real commodity calendar each
 * delivery month trades at its own price, so a leg may carry its own; null
 * means "the contract in the Contract panel". */
function legUnder(leg) {
  return leg.under == null || !(leg.under > 0) ? state.S : leg.under;
}

/* How a leg's own contract moves when the reference contract moves. The chart
 * sweeps one price axis, so the curve is shifted in proportion - a parallel
 * move in logs. That keeps every month's basis to the reference constant,
 * which is the standard first-order assumption and is exact when all the legs
 * share one contract. */
function legRatio(leg) {
  return state.S > 0 ? legUnder(leg) / state.S : 1;
}

/* A leg's own underlying price when the reference contract is at P. */
function legScenario(leg, P) {
  return P * legRatio(leg);
}

/* ------------------------------------------------------------
 * Parametric skew (Malz 1997)
 *
 * Desks quote a surface as three numbers per expiry: at-the-money
 * volatility, the 25-delta risk reversal (the call's vol minus the
 * put's) and the 25-delta butterfly (how far the wings sit above the
 * middle). This interpolates them into a volatility per strike:
 *
 *   sigma(d) = atm - 2*rr*(d - 0.5) + 16*bf*(d - 0.5)^2
 *
 * where d is the call's forward delta. The coefficients are what make
 * it reproduce the quotes exactly: at d = 0.25 it returns
 * atm + rr/2 + bf, and at d = 0.75, atm - rr/2 + bf - which are the
 * 25-delta call and put vols those quotes define.
 * ---------------------------------------------------------- */

/* Forward delta of a call, N(d1). Undiscounted on purpose: skew is quoted
 * against this, and it stays inside (0, 1) for every input. */
function forwardDelta(S, K, T, b, sigma) {
  if (!(T > 0) || !(sigma > 0) || !(S > 0) || !(K > 0)) {
    return S * Math.exp(b * Math.max(T, 0)) > K ? 1 : 0;
  }
  const vt = sigma * Math.sqrt(T);
  return normCdf((Math.log(S / K) + (b + sigma * sigma / 2) * T) / vt);
}

/* The lowest volatility the curve hands the pricer. A risk reversal wider
 * than the at-the-money level takes a wing below zero, and the pricer cannot
 * take that. */
const SKEW_FLOOR = 1e-4;

const skewCache = new Map();
const SKEW_CACHE_MAX = 256;

/* The curve at forward delta d, floored. */
function skewCurve(d, atm, rr, bf) {
  const x = d - 0.5;
  return Math.max(atm - 2 * rr * x + 16 * bf * x * x, SKEW_FLOOR);
}

/* Volatility for one strike off the skew curve. The delta that picks the point
 * depends on the volatility being read, so the point is where the two agree:
 * the delta d whose volatility on the curve, put back into forwardDelta(),
 * gives d again. That difference starts at or above zero at d = 0 and ends at
 * or below it at d = 1, so bisection on d always finds such a point. A
 * fixed-point iteration from the at-the-money level used to look for it, and on
 * a wing steeper than half the at-the-money level it could spend its 40 steps
 * oscillating and return wherever it stopped - over a tenth of a point off in
 * 180 of 40,000 surfaces, with nothing said. */
function skewVol(S, K, T, b, atm, rr, bf) {
  if (!(atm > 0)) return atm;
  // A leg reads the curve at today's price and its full tenor, so every point
  // of a sweep asks the same question; sixty bisection steps for each of them
  // made working out a chart with the skew on two to four times slower.
  const key = S + '|' + K + '|' + T + '|' + b + '|' + atm + '|' + rr + '|' + bf;
  const hit = skewCache.get(key);
  if (hit !== undefined) return hit;

  const gap = d => forwardDelta(S, K, T, b, skewCurve(d, atm, rr, bf)) - d;
  let sigma;
  if (gap(1) >= 0) {
    // The delta rounds to 1 at d = 1 itself - deep in the money, or with the
    // wing on the floor there - so that end fits, and it is the one taken.
    sigma = skewCurve(1, atm, rr, bf);
  } else {
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (gap(mid) >= 0) lo = mid; else hi = mid;
    }
    sigma = skewCurve((lo + hi) / 2, atm, rr, bf);
  }
  if (skewCache.size >= SKEW_CACHE_MAX) skewCache.clear();
  skewCache.set(key, sigma);
  return sigma;
}

/* Why the curve gives a strike no one volatility, or '' when it does: 'floor'
 * when the point it lands on is below zero, so the strike prices at
 * SKEW_FLOOR, and otherwise 'several' when more than one delta agrees with its
 * own volatility, so the strike could be read at either. Both take a wing
 * steeper than the at-the-money level, which no real surface has: of 40,000
 * surfaces drawn at random, 127 and 3 respectively, all past that line. */
function skewProblem(S, K, T, b, atm, rr, bf) {
  if (!(atm > 0)) return '';
  if (skewVol(S, K, T, b, atm, rr, bf) <= SKEW_FLOOR) return 'floor';
  const above = d => forwardDelta(S, K, T, b, skewCurve(d, atm, rr, bf)) - d >= 0;
  let crossings = 0, was = above(0);
  for (let i = 1; i <= 200; i++) {
    const is = above(i / 200);
    if (is !== was) crossings++;
    was = is;
  }
  return crossings > 1 ? 'several' : '';
}

/* The volatility one leg prices at, in percent.
 *
 * An explicit per-leg volatility always wins. Otherwise, with the skew on,
 * the leg takes the curve's value for its own strike and expiry; with it off,
 * the single global number. The surface is read once, at today's price and
 * the leg's full tenor - sticky strike, so a leg keeps its volatility as the
 * scenario price moves rather than sliding along the curve. */
function legVolPct(leg) {
  if (leg.vol != null) return leg.vol;
  if (!state.skew.on) return state.vol;
  return skewVol(...legSkewInputs(leg)) * 100;
}

/* Where a leg reads the skew curve: its own month's price today, its strike
 * and its full tenor, against the panel's three quotes. */
function legSkewInputs(leg) {
  return [legUnder(leg), leg.strike, leg.days / 365, carry(),
    state.vol / 100, state.skew.rr / 100, state.skew.bf / 100];
}

/* skewProblem() for a leg that takes its volatility from the curve, or ''. */
function legSkewProblem(leg) {
  if (!state.skew.on || leg.vol != null || leg.kind === 'underlying') return '';
  return skewProblem(...legSkewInputs(leg));
}

/* Everything a pricer needs for one leg, assembled in one place.
 *
 * Every path that prices a leg - its value, its greeks, the chart's greek
 * profile, the P&L sweep and the implied-volatility solver - goes through
 * here, so they cannot disagree about which underlying, which volatility or
 * which exercise style a leg has. They used to assemble these by hand in four
 * places, and the IV button drifted: it solved against the panel price
 * instead of the leg's own delivery month, returning 52.74% for a leg priced
 * at 30% and writing that back into the leg.
 *
 * opts.P is a scenario price for the reference contract. Without it the leg
 * is priced today, at its own month's price - legUnder(), not
 * legScenario(leg, state.S), which differ when the panel price is zero.
 * opts.tDays is time elapsed from today; opts.volShift moves the surface, in
 * vol points. */
function legPricingInputs(leg, opts) {
  const o = opts || {};
  return {
    kind: leg.kind,
    S: o.P === undefined ? legUnder(leg) : legScenario(leg, o.P),
    K: leg.strike,
    T: Math.max(leg.days - (o.tDays || 0), 0) / 365,
    r: state.rate / 100,
    b: carry(),
    sigma: Math.max(legVolPct(leg) + (o.volShift || 0), 0) / 100,
    style: state.style,
    bTracksRate: carryTracksRate()
  };
}

/* Value of one unit, from resolved inputs. */
function valueFromInputs(p) {
  if (p.kind === 'underlying') return p.S;
  return p.style === 'american'
    ? americanPrice(p.kind, p.S, p.K, p.T, p.r, p.b, p.sigma)
    : gbs(p.kind, p.S, p.K, p.T, p.r, p.b, p.sigma).price;
}

/* Price and greeks of one unit, from resolved inputs. */
function greeksFromInputs(p) {
  return priceOption(p.kind, p.S, p.K, p.T, p.r, p.b, p.sigma, p.style, p.bTracksRate);
}

/* Value of one unit of a leg when the reference contract is at P, tDays after
 * today. volShift moves the whole surface, in vol points. */
function legValue(leg, P, tDays, volShift) {
  return valueFromInputs(legPricingInputs(leg, { P: P, tDays: tDays, volShift: volShift }));
}

/* Greeks of one unit of a leg today. Delta and gamma are quoted against the
 * leg's own contract, which is what a desk hedges with. */
function legGreeks(leg) {
  if (leg.kind === 'underlying') {
    return { price: legUnder(leg), delta: 1, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }
  return greeksFromInputs(legPricingInputs(leg));
}

/* Greeks of one unit of a leg against the reference contract - the one price
 * axis the chart, the scenario grid and the statistics sweep - at the
 * scenario in `opts`, as legPricingInputs() takes it. The leg's own month
 * moves `ratio` points for each point of the reference (legScenario()), so
 * its delta counts ratio times and its gamma ratio squared; vega, theta and
 * rho do not depend on the price. Anything that adds deltas or gammas across
 * legs adds these. Adding legGreeks() assumed every month moves the same
 * dollars: a call calendar whose far month sat 2.5% above the near one showed
 * $0.49 of delta beside a chart sloping $1.78 per $1. */
function legAxisGreeks(leg, opts) {
  const g = leg.kind === 'underlying'
    ? { delta: 1, gamma: 0, vega: 0, theta: 0, rho: 0 }
    : greeksFromInputs(legPricingInputs(leg, opts));
  const ratio = legRatio(leg);
  return { delta: g.delta * ratio, gamma: g.gamma * ratio * ratio, vega: g.vega, theta: g.theta, rho: g.rho };
}

/* The volatility, as a decimal, at which this leg is worth `premium` - or NaN
 * when none is. Solved against the leg's own inputs, so a volatility found
 * here reprices the leg to the premium it came from. */
function legImpliedVol(leg, premium) {
  const p = legPricingInputs(leg);
  return impliedVol(p.kind, premium, p.S, p.K, p.T, p.r, p.b, p.style);
}

/* Whether `premium` is this leg's value at zero volatility, give or take
 * NO_TIME_VALUE of its underlying: a premium with no time value, from which
 * impliedVol() can find no volatility. */
function legNoTimeValue(leg, premium) {
  const p = legPricingInputs(leg);
  p.sigma = 1e-8;
  return Math.abs(premium - valueFromInputs(p)) <= NO_TIME_VALUE * p.S;
}

function activeLegs() {
  return state.legs.filter(l => l.on);
}

function legEntry(leg) {
  if (leg.entry != null) return leg.entry;
  return leg.kind === 'underlying' ? legUnder(leg) : legGreeks(leg).price;
}

/* The rate a premium is carried at, continuously compounded, as a decimal: the
 * risk-free rate, the user's own, or 0 for the nominal P&L. At the risk-free
 * rate - the one that discounts the price - a fairly priced option is worth on
 * average, at any later date, what its premium has grown to by then, so it
 * breaks even. Read nominally it shows a profit of premium x (e^(rT) - 1) it
 * never had: 8.3% of the premium on a two-year option at 4%. */
function premiumRate() {
  const f = state.financing;
  if (f.mode === 'none') return 0;
  return (f.mode === 'custom' ? f.rate : state.rate) / 100;
}

/* Prepared P&L function. The entry cost, the multiplier, the set of active
 * legs and each leg's volatility are all fixed while a curve is swept, but
 * legEntry() prices an option to get the theoretical entry - under American
 * exercise that is eleven valuations - and the skew curve needs an iterative
 * solve per strike. Recomputing either per grid point dominated every redraw,
 * so resolve them once and then evaluate the curve.
 *
 * volShift moves the whole surface, in vol points, for the scenario table.
 * `legs` is the active legs unless given: the chart draws each leg's own curve
 * through here too, so the legs add up to the position.
 *
 * An option's entry is a premium paid or received today, so at tDays it counts
 * with the interest it has carried since, at premiumRate(): a debit pays it and
 * a credit earns it. A futures leg has no premium and carries nothing. */
function pnlEvaluator(volShift, legs) {
  const mult = dollarMultiplier(currentCommodity());
  const rate = premiumRate();
  const prepared = (legs || activeLegs()).map(leg => ({
    leg,
    weight: leg.side * leg.qty * mult,
    entry: legEntry(leg),
    premium: leg.kind !== 'underlying',
    ratio: legRatio(leg),
    // Resolved once per sweep - the volatility, rate, carry and style. Only
    // the price and the time move from point to point, and they are written
    // straight onto this object, which belongs to this closure alone.
    inputs: legPricingInputs(leg, { volShift: volShift })
  }));
  return function (P, tDays) {
    const grown = Math.exp(rate * tDays / 365);
    let pnl = 0;
    for (const p of prepared) {
      p.inputs.S = P * p.ratio;
      p.inputs.T = Math.max(p.leg.days - tDays, 0) / 365;
      pnl += p.weight * (valueFromInputs(p.inputs) - (p.premium ? p.entry * grown : p.entry));
    }
    return pnl;
  };
}

/* Net P&L in currency at underlying price P, tDays from today, the premium's
 * interest included. */
function strategyPnl(P, tDays) {
  return pnlEvaluator()(P, tDays);
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

/* The interest the position's premiums carry from today to tDays, in dollars:
 * what a net debit costs, or, below zero, what a net credit earns. It is what
 * separates the P&L at that date from the nominal one. */
function premiumInterest(tDays) {
  return netCost() * Math.expm1(premiumRate() * tDays / 365);
}

/* How fast that interest grows at tDays, in dollars a day. It is the part of
 * the P&L's daily change that is not the options' theta, which stays their
 * own: what other tools quote, and what a desk compares. */
function premiumInterestPerDay(tDays) {
  const r = premiumRate();
  return netCost() * r / 365 * Math.exp(r * tDays / 365);
}

/* The position's greeks today, delta and gamma per point of the reference
 * contract - the slope and the curvature of the chart's mark-to-market curve
 * at today's price. */
function netGreeks() {
  const mult = dollarMultiplier(currentCommodity());
  const acc = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  for (const leg of activeLegs()) {
    const g = legAxisGreeks(leg);
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

/* The volatility the probability of profit is measured at, as a decimal: the
 * explicit volatility of the option nearest the money among those expiring at
 * the horizon - an implied one the IV button wrote there, say - and otherwise
 * the panel's, which is also the skew's at-the-money level. It used to be the
 * panel's always, so a call priced at its own 40% reported the probability of
 * a 20% market: 14.5% instead of 28.7%. */
function horizonVol() {
  const t = horizonDays();
  let best = null, dist = Infinity;
  for (const leg of activeLegs()) {
    if (leg.kind === 'underlying' || leg.days !== t) continue;
    const d = Math.abs(Math.log(leg.strike / legUnder(leg)));
    if (d < dist) { dist = d; best = leg; }
  }
  return Math.max(best && best.vol != null ? best.vol : state.vol, 0) / 100;
}

/* Put back whatever a change left out of bounds: the chart's evaluation date
 * cannot pass the horizon, which moves whenever a leg's expiry does. Runs
 * before every render, so drawing never has to correct the state it draws -
 * renderResults() used to clip this itself. */
function normalizeState() {
  const t = horizonDays();
  if (state.chart.tDays > t) state.chart.tDays = t;
}

/* Where a leg's strike falls on the reference price axis. A leg on its own
 * delivery month kinks when *its* contract reaches the strike, which happens
 * at a different point on the shared axis. */
function strikeOnAxis(leg) {
  const ratio = legRatio(leg);
  return ratio > 0 ? leg.strike / ratio : leg.strike;
}

/* Grid builder. Strikes are inserted exactly so the payoff kinks stay sharp. */
function gridBetween(lo, hi, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(lo + (hi - lo) * i / (n - 1));
  for (const leg of activeLegs()) {
    if (leg.kind === 'underlying') continue;
    const k = strikeOnAxis(leg);
    if (k > lo && k < hi) {
      const eps = (hi - lo) * 1e-7;
      out.push(k - eps, k, k + eps);
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
  const strikes = activeLegs()
    .filter(l => l.kind !== 'underlying').map(strikeOnAxis);
  const hi = Math.max(state.S * 4, ...strikes.map(k => k * 2.5));
  return gridBetween(state.S * 1e-6, hi, 1200);
}

/* How many points one unit of a leg moves per point of its own contract once
 * that price has risen without bound, tDays from today: the slope of the
 * straight line its value tends to, read off the pricers' own limits. A put is
 * worth nothing up there. A European call is worth its forward's intrinsic,
 * discounted - gbs()'s line. An American call is worth the larger of that and
 * exercising, which is what americanPrice() returns past its exercise
 * boundary, and with no volatility left too, held or exercised on its best
 * date. */
function legFarDelta(leg, tDays) {
  if (leg.kind === 'underlying') return 1;
  if (leg.kind === 'put') return 0;
  const p = legPricingInputs(leg, { tDays: tDays });
  const forward = Math.exp((p.b - p.r) * p.T);
  return p.style === 'american' ? Math.max(forward, 1) : forward;
}

/* The slope the position's P&L at tDays tends to as the reference contract
 * rises without bound, in dollars per point, or 0 when it is zero but for
 * rounding. It says whether a maximum is unlimited, and how fast it grows. Read
 * at the top of the statistics grid instead, it was only where the curve
 * happened to be heading there: of 2,000 random American calendars, 196 read
 * Unlimited though bounded, 30 read it with the sign reversed and one read
 * bounded though it was not. */
function farSlope(tDays) {
  const mult = dollarMultiplier(currentCommodity());
  let slope = 0, gross = 0;
  for (const leg of activeLegs()) {
    const s = leg.side * leg.qty * mult * legRatio(leg) * legFarDelta(leg, tDays);
    slope += s;
    gross += Math.abs(s);
  }
  return Math.abs(slope) > 1e-12 * gross ? slope : 0;
}

/* Prices past `top`, the end of statsGrid(), out to where every leg has
 * settled on its far line, for the statistics to search as well. There are
 * none unless an option outlives the horizon: past the highest strike an
 * expired one is a straight line already. One still alive has settled once its
 * delta stops moving, ten standard deviations of its remaining time into the
 * money, and an American call also once it is past where it is exercised and
 * past where its forward's line and exercising cross. Under Black-Scholes with
 * a small yield that can be many times the price: 63,372 on a 4,000 contract at
 * a 0.3% yield, where the grid stops at 16,000. */
function tailGrid(tDays, top) {
  let far = 0;
  for (const leg of activeLegs()) {
    if (leg.kind === 'underlying' || !(leg.days > tDays)) continue;
    const p = legPricingInputs(leg, { tDays: tDays });
    let settled = p.K * Math.exp(10 * p.sigma * Math.sqrt(p.T) + Math.abs(p.b) * p.T + 1);
    if (p.style === 'american' && p.kind === 'call') {
      // Without a boundary BAW has none to pass: the price is the European
      // one floored at intrinsic, which settles where the two cross, below.
      const exercised = p.sigma > 0 && !(p.b >= p.r && p.b >= 0)
        ? americanCritical('call', p.K, p.T, p.r, p.b, p.sigma) : NaN;
      if (exercised > 0) settled = Math.max(settled, 2 * exercised);
      const fs = Math.exp((p.b - p.r) * p.T);
      const cross = fs !== 1 ? (p.K * Math.exp(-p.r * p.T) - p.K) / (fs - 1) : 0;
      if (cross > 0) settled = Math.max(settled, 2 * cross);
    }
    far = Math.max(far, settled / legRatio(leg));
  }
  far = Math.min(far, top * 1e9);
  if (!(far > top)) return [];
  const out = [], step = Math.pow(far / top, 1 / 240);
  for (let i = 1, x = top; i <= 240; i++) out.push(x *= step);
  return out;
}

/* Scenario table: position P&L across price, volatility and elapsed time.
 *
 * This is the grid a trader reads before putting a position on, so the three
 * axes are the three things that actually move: where the underlying goes,
 * what happens to volatility, and how much time passes. Rows are prices,
 * columns are dates between today and the horizon, and the whole grid is
 * repeated once per volatility shift.
 *
 * One prepared evaluator per volatility shift, because the shift is the only
 * thing that changes each leg's volatility and therefore its cached exercise
 * boundary. */
function scenarioTable() {
  const t = horizonDays();
  const pct = Math.max(state.scenario.pricePct, 0) / 100;
  const shift = Math.abs(state.scenario.volShift);

  const prices = [];
  for (let i = -3; i <= 3; i++) {
    prices.push(Math.max(state.S * (1 + pct * i / 3), 0));
  }

  const days = [];
  for (let i = 0; i < 5; i++) days.push(Math.round(t * i / 4));

  // Deduplicate: a zero shift, or a horizon of zero days, would otherwise
  // repeat identical panels and columns.
  const shifts = shift > 0 ? [-shift, 0, shift] : [0];
  const cols = days.filter((d, i) => days.indexOf(d) === i);

  const panels = shifts.map(vs => {
    const pnl = pnlEvaluator(vs);
    return {
      volShift: vs,
      rows: prices.map(p => ({
        price: p,
        pct: state.S > 0 ? p / state.S - 1 : 0,
        cells: cols.map(d => pnl(p, d))
      }))
    };
  });

  let worst = 0;
  for (const panel of panels) {
    for (const row of panel.rows) {
      for (const c of row.cells) if (Math.abs(c) > worst) worst = Math.abs(c);
    }
  }

  return { horizon: t, days: cols, panels, worst };
}

function analyse() {
  const t = horizonDays();
  const pnl = pnlEvaluator();
  const xs = displayGrid();
  const ys = xs.map(p => pnl(p, t));

  const wx = statsGrid();
  // Past its top, a leg that outlives the horizon may still be bending, so the
  // search goes on to where every leg has settled.
  const tail = tailGrid(t, wx[wx.length - 1]);
  for (const x of tail) wx.push(x);
  const wy = wx.map(p => pnl(p, t));
  // Past that the P&L is a straight line at the far slope. Where the line has
  // yet to cross zero - a profit at the last point and the P&L falling away, or
  // a loss and it rising - one more point, as far past the crossing as the
  // crossing is past the last one, lets the breakevens and the probability
  // below find it. They used to carry the last point's sign to infinity: three
  // long futures against three calls on a month 13% dearer, at 77% vol over 480
  // days, lost the breakeven at 556.41, just past the grid's 552.03, and showed
  // a 59.27% chance of profit for 57.07%.
  const upSlope = farSlope(t);
  const last = wx.length - 1;
  if (upSlope !== 0 && wy[last] !== 0 && (wy[last] > 0) !== (upSlope > 0)) {
    const x = wx[last] - 2 * wy[last] / upSlope;
    wx.push(x);
    wy.push(pnl(x, t));
  }
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
  // whatever the payoff is at a price of ~0 is a real, attainable bound. Above,
  // the slope the P&L tends to decides, in dollars per point of the reference
  // contract - which also says how fast an unlimited maximum grows. "Unlimited"
  // alone said the same of a naked call, losing $100 a point, and a European
  // call calendar, whose far leg is worth its discounted intrinsic up there and
  // so bleeds $0.33 a point.
  const unlimitedProfit = upSlope > 0;
  const unlimitedLoss = upSlope < 0;

  // Risk-neutral probability of profit at the horizon: the reference contract
  // lognormal at the position's own volatility, integrated between the points
  // where the P&L crosses zero - interpolated as the breakevens are, so exact
  // on a payoff that is linear between grid points. Cell by cell, the cell
  // holding a breakeven counted whole or not at all: 0.75 points off on a
  // bull call spread.
  const sigma = horizonVol(), T = t / 365, b = carry();
  let pop = 0;
  if (T > 0 && sigma > 0) {
    const mu = Math.log(state.S) + (b - sigma * sigma / 2) * T;
    const sd = sigma * Math.sqrt(T);
    const lnCdf = x => (x > 0 ? normCdf((Math.log(x) - mu) / sd) : 0);
    let from = wy[0] > 0 ? 0 : null;   // where the current profitable stretch began
    for (let i = 1; i < n; i++) {
      if ((wy[i - 1] > 0) === (wy[i] > 0)) continue;
      const x = wx[i - 1] + (wx[i] - wx[i - 1]) * (0 - wy[i - 1]) / (wy[i] - wy[i - 1]);
      if (from === null) {
        from = x;
      } else {
        pop += lnCdf(x) - lnCdf(from);
        from = null;
      }
    }
    if (from !== null) pop += 1 - lnCdf(from);
  }

  return {
    t, xs, ys,
    maxProfit: unlimitedProfit ? Infinity : maxP,
    maxLoss: unlimitedLoss ? -Infinity : minP,
    upSlope, breakevens: bes, pop, popVol: sigma
  };
}

/* ============================================================
 * 6. Market data providers
 * ========================================================== */

/* Market data responses are cached in localStorage under coc.cache.*. An entry
 * found expired is removed, and init() prunes anything older than the longest
 * time any caller keeps one. They used to be left to pile up - one per Alpha
 * Vantage ticker ever typed - and a full storage quota makes persist() fail,
 * which would silently stop the user's scenario from being saved. */
const CACHE_PREFIX = 'coc.cache.';
const CACHE_MAX_AGE = 12 * 3600e3;   // the Alpha Vantage series; nothing is kept longer

function cacheGet(key, ttlMs) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (Date.now() - o.ts > ttlMs) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return o.v;
  } catch (e) { return null; }
}

function cacheSet(key, v) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), v: v }));
  } catch (e) { /* quota or private mode - not fatal */ }
}

/* Remove cached responses older than maxAge, and any that cannot be read. Only
 * the cache: the saved scenario and the Alpha Vantage key are left alone. */
function pruneCache(maxAge) {
  try {
    const now = Date.now();
    // List the keys first: removing an item can reorder the rest, so walking
    // localStorage by index while removing skipped entries in Chrome.
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) {
      if (!k || k.indexOf(CACHE_PREFIX) !== 0) continue;
      let ts = NaN;
      try { ts = JSON.parse(localStorage.getItem(k)).ts; } catch (e) { /* unreadable */ }
      if (!(now - ts < maxAge)) localStorage.removeItem(k);
    }
  } catch (e) { /* storage unavailable - nothing to prune */ }
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

    const curve = parseTreasuryXml(text);
    if (!curve) continue;
    cacheSet('treasury', curve);
    return curve;
  }
  throw new Error('Treasury yield curve unavailable');
}

/* The last day in one month of the Treasury's yield curve feed, or null when
 * the text holds no usable day.
 *
 * Read with patterns rather than DOMParser so that it runs under Node as well
 * as in the browser, which is what lets the tests feed it a real response. The
 * feed is flat: one <m:properties> block per day, in date order, and one
 * element per tenor inside it. A tenor with no quote that day is an empty,
 * self-closing element marked m:null="true", and is skipped. */
function parseTreasuryXml(text) {
  const days = String(text).match(/<(?:\w+:)?properties\b[^>]*>[\s\S]*?<\/(?:\w+:)?properties>/g);
  if (!days) return null;
  const last = days[days.length - 1];
  // The text of one element, matched on its local name so the prefix does not
  // matter; \b keeps BC_30YEAR from matching BC_30YEARDISPLAY.
  const field = tag => {
    const m = last.match(new RegExp('<(?:\\w+:)?' + tag + '\\b[^>]*?(/?)>([^<]*)'));
    return m && !m[1] ? m[2] : '';
  };
  const points = TENORS
    .map(([t, y]) => ({ years: y, yield: parseFloat(field(t)) }))
    .filter(p => isFinite(p.yield));
  if (!points.length) return null;
  return { date: field('NEW_DATE').slice(0, 10), points };
}

/* Linear interpolation on the par curve, then to a continuously compounded rate.
 *
 * The Treasury quotes the par curve on a bond-equivalent basis, compounded
 * semi-annually, so (1 + y/2)^2 = e^r and r = 2 ln(1 + y/2). Treating it as
 * annual, ln(1 + y), which this once did, understates r by about y^2/4: 3.8
 * basis points at 4%, 6 at 5%. */
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
  return { par: y, continuous: 2 * Math.log(1 + y / 200) * 100 };
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
/* The markets the function serves: exactly those with futures data in the table,
 * which is also what the function itself reads. */
const PROXY_COMMODITIES = Object.keys(COMMODITIES).filter(k => COMMODITIES[k].futures);

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

/* Every listed contract that quotes, nearest first. This one answer is the whole
 * curve: the month picker lists it, and the Yield button and the leg fill take
 * their two contracts off its front, so all three share one request, one cache
 * entry and one set of quotes. They used to ask for `curve` and `months`
 * separately - up to 19 overlapping contracts probed upstream, cached under two
 * keys, and a carry measured on other quotes than the ones the picker showed. */
async function listedContracts(commodity) {
  const c = await proxyGet('months', commodity, 60 * 60e3);
  return (c && c.contracts) || [];
}

/* The two nearest listed contracts: what the carry is measured on. */
async function nearestContracts(commodity) {
  const list = await listedContracts(commodity);
  if (list.length < 2) throw new Error('fewer than two listed contracts quote for this commodity');
  return { near: list[0], far: list[1] };
}

/* The curve between two listed contracts. These are the only copies of the two
 * formulas: the Yield button and the leg fill both read the curve through them,
 * so the carry one reports is the slope the other prices along. */

/* Whole days between two contracts' expiries. Both are approximated to
 * mid-month, so the gap - which is what the carry depends on - stays accurate. */
function contractGapDays(near, far) {
  return Math.round((new Date(far.expiry) - new Date(near.expiry)) / 86400e3);
}

/* The log slope from F1 to F2, `days` apart, as a continuously compounded
 * annual rate. Under cost of carry it is r - y. */
function logSlope(F1, F2, days) {
  return Math.log(F2 / F1) / (days / 365);
}

/* Convenience yield implied by the cost-of-carry relation F = S e^{(r+u-y)T}. */
function impliedConvenienceYield(spot, futures, days, ratePct) {
  const T = days / 365;
  if (!(spot > 0) || !(futures > 0) || !(T > 0)) return NaN;
  return (ratePct / 100 - logSlope(spot, futures, days)) * 100;
}

/* ============================================================
 * 7. Rendering
 * ========================================================== */

const $ = id => document.getElementById(id);

function currentCommodity() {
  const c = Object.assign({}, commodityMeta(state.commodity));
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

/* How many decimals a price of the selected market is shown with: as many as
 * its tick, so the screen never rounds away a step the market trades in, and
 * never fewer than two. The table gives the tick in the market's own quoting
 * unit; a price quoted in dollars rather than cents takes two decimals more,
 * one in cents rather than dollars two fewer. A custom contract has no tick, so
 * it shows five significant figures of the panel's price. Every price used to
 * show two decimals, and a 30-day copper call worth 0.04204 read 0.04 - $50.98
 * a contract short. */
function priceDp() {
  const meta = commodityMeta(state.commodity);
  let dp;
  if (meta.tick > 0) {
    dp = decimalsOf(meta.tick);
    if (state.quote !== meta.quote) dp += state.quote === 'USD' ? 2 : -2;
  } else {
    dp = state.S > 0 ? 4 - Math.floor(Math.log10(state.S)) : 2;
  }
  return Math.min(Math.max(dp, 2), 8);
}

/* The decimal places in a tick such as 0.0005 or 0.125. */
function decimalsOf(x) {
  let d = 0;
  while (d < 8 && Math.abs(x * Math.pow(10, d) - Math.round(x * Math.pow(10, d))) > 1e-9) d++;
  return d;
}

/* A price of the selected market, with priceDp() decimals. `trim` drops the
 * trailing zeros, for a strike in a label: "K 4,100" rather than "K 4,100.00". */
function fmtPrice(x, trim) {
  const dp = priceDp();
  if (!trim || !isFinite(x)) return fmt(x, dp);
  return x.toLocaleString(undefined, { maximumFractionDigits: dp });
}

/* A volatility as its input field shows it: rounded to `dp` decimals, without
 * trailing zeros. The number in use stays exact - what the IV button solves,
 * what a realised estimator measures - so a leg priced at its own implied
 * volatility is worth its premium. Both were stored rounded to 0.01, and a
 * 30-day gold call implied at 20.031317% was revalued $0.60 a contract under
 * its premium. The legs table's Vol column holds two decimals; the panel's
 * field has room for four, so a number typed there with three shows as typed. */
function volField(v, dp) {
  return typeof v === 'number' ? String(+v.toFixed(dp)) : v;
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
  setField('style', state.style);
  setField('spot', state.S);
  // The picker shows the month the price belongs to, so it follows the price
  // when the front month or a typed number replaces it.
  setField('contractMonth', state.contractMonth);
  setField('vol', volField(state.vol, 4));
  setField('rate', state.rate);
  setField('yield', state.yield);
  setField('financing', state.financing.mode);
  setField('financingRate', state.financing.rate);
  setField('days', state.days);
  setField('size', state.size);
  setField('quote', state.quote);
  setField('skewRr', state.skew.rr);
  setField('skewBf', state.skew.bf);
  setField('scenPct', state.scenario.pricePct);
  setField('scenVol', state.scenario.volShift);
  if ($('skewOn') !== document.activeElement) $('skewOn').checked = state.skew.on;

  $('skewRr').disabled = !state.skew.on;
  $('skewBf').disabled = !state.skew.on;
  $('skewNote').textContent = state.skew.on
    ? 'Malz interpolation: legs with a blank Vol take the curve for their own strike, ' +
      'read at today\'s price and held as the scenario moves (sticky strike). ' +
      'Risk reversal is the 25-delta call\'s volatility minus the put\'s; butterfly is ' +
      'how far both wings sit above the at-the-money level, which is the Volatility field.'
    : 'Off: every leg with a blank Vol uses the single Volatility number above. Turn it on ' +
      'to quote a surface as three points instead of typing a volatility per leg.';
  const warning = skewWarning();
  // Written only when it changes: it is a live region, re-read on every change.
  if ($('skewWarning').textContent !== warning) $('skewWarning').textContent = warning;

  const isB76 = state.model === 'b76';
  $('yield').disabled = isB76;
  $('yieldNote').textContent = isB76
    ? 'Not used in Black-76: the futures price already embeds carry and convenience yield.'
    : 'Net convenience yield (benefit of holding the physical, minus storage).';

  const fin = state.financing.mode;
  $('financingRate').disabled = fin !== 'custom';
  $('financingNote').textContent = fin === 'none'
    ? 'Nominal P&L: measured from the entry price alone, with no interest on the premium.'
    : 'The premium paid today carries interest from today to the date the P&L is read, at ' +
      (fin === 'custom'
        ? 'your own rate, continuously compounded like the risk-free rate.'
        : 'the risk-free rate above - the one that discounts the price - so a fairly priced ' +
          'option breaks even on average.') +
      ' A debit pays the interest and a credit earns it; a futures leg has no premium to carry.';

  $('styleNote').textContent = state.style === 'american'
    ? 'Barone-Adesi-Whaley approximation. Most listed commodity futures options are American, and on futures the early-exercise premium shows up on calls and puts alike.'
    : 'Closed-form Black-76 / Black-Scholes-Merton. Exact for European exercise, but it prices the right to exercise early at zero - worth up to ~2.6% of the underlying on a deep in-the-money contract.';

  const c = currentCommodity();
  $('spotLabel').textContent = isB76 ? 'Futures price' : 'Spot price';
  $('multInfo').textContent = '1 contract = ' + fmt(c.size, 0) + ' ' + c.unit +
    (c.quote === 'cents' ? ' (quoted in cents)' : '') +
    ' - P&L multiplier $' + fmt(dollarMultiplier(c), 2) + ' per point';
  // On a phone the Strategy card comes first, above the contract it prices, so
  // it says which contract that is.
  $('legsContext').textContent = c.label + ' · ' + (isB76 ? 'futures ' : 'spot ') +
    fmtPrice(state.S, true) + ' · vol ' + volField(state.vol, 4) + '% · ' +
    (state.style === 'american' ? 'American' : 'European');
}

/* The strikes the skew curve gives no one volatility, as a sentence, or ''
 * when every leg that reads the curve gets one. */
function skewWarning() {
  const floor = [], several = [];
  for (const leg of activeLegs()) {
    const problem = legSkewProblem(leg);
    const list = problem === 'floor' ? floor : problem === 'several' ? several : null;
    const strike = fmtPrice(leg.strike, true);
    if (list && list.indexOf(strike) === -1) list.push(strike);
  }
  if (!floor.length && !several.length) return '';
  const at = list => 'At the ' +
    (list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] + ' strikes' : list[0] + ' strike');
  return 'This curve is steeper than its at-the-money level allows. ' +
    (floor.length ? at(floor) + ' it goes below zero, so the leg prices at the 0.01% floor. ' : '') +
    (several.length ? at(several) + ' more than one volatility fits it. ' : '') +
    'Narrow the risk reversal or the butterfly, or type a Vol for those legs.';
}

function monthLabel(c) {
  const name = c.name || c.symbol;
  return name + ' - ' + fmtPrice(c.price);
}

/* Fill the picker from whatever the strip holds. The empty value is the
 * continuous front-month series, which stays the default. */
function renderMonths() {
  const sel = $('contractMonth');
  const current = state.contractMonth || '';
  const opts = ['<option value="">Front month (continuous)</option>'].concat(
    state.session.strip.map(c =>
      '<option value="' + escapeHtml(c.symbol) + '">' + escapeHtml(monthLabel(c)) + '</option>')
  );
  sel.innerHTML = opts.join('');
  // loadContractMonths() drops a picked month the strip no longer lists, so
  // the selection is always one of these options.
  sel.value = current;
}

function renderSources() {
  const rows = [
    ['Underlying price', state.sources.price],
    ['Risk-free rate', state.sources.rate],
    ['Volatility', state.sources.vol],
    ['Convenience yield', state.sources.yield]
  ];
  // Only while legs carry prices from the curve: with none, every leg is on
  // the panel price, which the first line already describes.
  if (state.sources.legs) rows.push(['Leg prices', state.sources.legs]);
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

/* One row of the legs table, as markup. Pure - no DOM - so the escaping can be
 * tested. Every interpolated value goes through escapeHtml even though
 * restore() already guarantees numbers: this is where the markup is built,
 * and it should not depend on every source of a leg getting its types right.
 * Only literal attribute words (selected, checked, disabled) skip it. */
function legRowHtml(leg, mult, n) {
  const g = legGreeks(leg);
  const entry = legEntry(leg);
  const isU = leg.kind === 'underlying';
  const a = v => escapeHtml(v == null ? '' : v);
  // A screen reader hears the column and the leg, not "edit text": the header
  // row does not name an input. n is the leg's place in the table.
  const name = what => `aria-label="${a(what + (n ? ', leg ' + n : ''))}"`;
  // data-label heads each cell where a phone shows the leg as a card.
  return `<tr data-id="${a(leg.id)}" class="${leg.on ? '' : 'off'}">
      <td data-label="Include"><input type="checkbox" data-f="on" ${leg.on ? 'checked' : ''} title="Include in the strategy" ${name('Include')}></td>
      <td data-label="Side"><select data-f="side" ${name('Side')}>
        <option value="1" ${leg.side === 1 ? 'selected' : ''}>Long</option>
        <option value="-1" ${leg.side === -1 ? 'selected' : ''}>Short</option>
      </select></td>
      <td data-label="Type"><select data-f="kind" ${name('Type')}>
        <option value="call" ${leg.kind === 'call' ? 'selected' : ''}>Call</option>
        <option value="put" ${leg.kind === 'put' ? 'selected' : ''}>Put</option>
        <option value="underlying" ${isU ? 'selected' : ''}>Underlying</option>
      </select></td>
      <td data-label="Qty"><input type="number" data-f="qty" value="${a(leg.qty)}" min="0" step="1" ${name('Quantity')}></td>
      <td data-label="Strike"><input type="number" data-f="strike" value="${isU ? '' : a(leg.strike)}" ${isU ? 'disabled' : ''} step="any" ${name('Strike')}></td>
      <td data-label="Days"><input type="number" data-f="days" value="${isU ? '' : a(leg.days)}" ${isU ? 'disabled' : ''} min="0" step="1" ${name('Days to expiry')}></td>
      <td data-label="Vol %"><input type="number" data-f="vol" value="${a(volField(leg.vol, 2))}" placeholder="${a(fmt(legVolPct(leg), 1))}" ${isU ? 'disabled' : ''} step="any" ${name('Volatility %')}></td>
      <td data-label="Under"><input type="number" data-f="under" value="${a(leg.under)}" placeholder="${a(fmtPrice(state.S))}" step="any" title="This leg's own contract price today. Blank uses the contract in the left panel." ${name('Underlying price')}></td>
      <td data-label="Entry"><input type="number" data-f="entry" value="${a(leg.entry)}" placeholder="${a(fmtPrice(isU ? state.S : g.price))}" step="any" ${name('Entry price')}></td>
      <td class="num" data-label="Theo.">${isU ? '-' : a(fmtPrice(g.price))}</td>
      <td class="num" data-label="Delta">${a(fmt(g.delta * leg.side * leg.qty, 3))}</td>
      <td class="num" data-label="Cost $">${a(fmt(leg.side * leg.qty * mult * (isU ? 0 : entry), 0))}</td>
      <td><button class="icon" data-f="iv" title="Solve implied volatility from the entry price" ${isU ? 'disabled' : ''} ${name('Implied volatility from the entry price')}>IV</button>
          <button class="icon danger" data-f="del" title="Remove leg" ${name('Remove')}>×</button></td>
    </tr>`;
}

function renderLegs() {
  const mult = dollarMultiplier(currentCommodity());
  const body = state.legs.map((leg, i) => legRowHtml(leg, mult, i + 1)).join('');
  // Rebuilding the tbody destroys the element being edited, so remember where
  // the caret was and put it back afterwards.
  const ae = document.activeElement;
  const inTable = ae && $('legsBody').contains(ae) && ae.closest('tr');
  const focus = inTable
    ? { id: ae.closest('tr').dataset.id, f: ae.dataset.f, start: ae.selectionStart, end: ae.selectionEnd }
    : null;

  $('legsBody').innerHTML = body || '<tr><td colspan="13" class="muted">No legs. Add one or pick a strategy.</td></tr>';

  // Show the way out before it is needed: the button sits there greyed until a
  // leg actually carries its own price, then lights up.
  $('clearLegPrices').disabled = !state.legs.some(l => l.under != null);
  $('monthNote').textContent = state.session.strip.length
    ? (state.contractMonth
      ? 'Pricing against one listed contract. "Fill leg prices" now interpolates between these ' +
        state.session.strip.length + ' real quotes instead of extrapolating a single slope.'
      : 'Listed months loaded. Pick one to price against that specific contract, which is what ' +
        'an option quote on a broker\'s screen refers to.')
    : 'The continuous front-month series by default. Load the listed months to price against one ' +
      'specific delivery month - which is what an option quote on a broker\'s screen refers to.';

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
  // What the premium carries, which every P&L below a future date includes.
  const carried = state.financing.mode !== 'none';
  const ratePct = escapeHtml(fmt(premiumRate() * 100, 2));
  const interest = carried
    ? `<strong>${money(-premiumInterest(a.t))}</strong><small>to the horizon, at ${ratePct}%, ${state.financing.mode === 'custom' ? 'your rate' : 'the risk-free rate'}</small>`
    : '<strong>Not charged</strong><small>nominal P&amp;L</small>';
  // An unlimited maximum says how fast it grows: that is what tells a naked call
  // from a calendar bleeding cents a point. A rate that rounds to no cents keeps
  // two significant figures rather than read $0.00.
  const perPoint = Math.abs(a.upSlope) >= 0.005
    ? money(a.upSlope)
    : (a.upSlope < 0 ? '-$' : '$') + Math.abs(a.upSlope).toPrecision(2);
  const rising = `<small>${perPoint} per point as the price rises</small>`;

  // Nothing to measure. Zeros in green and red, and a 0.0% chance of profit,
  // read as a position that makes and loses nothing.
  if (!activeLegs().length) {
    $('summary').innerHTML = '<p class="empty">' + (state.legs.length
      ? 'Every leg is switched off. Tick <strong>Include</strong> on one in the table above to see its results.'
      : 'No legs yet. <a href="#strategy">Choose a strategy</a> or add a leg above to see its results.') + '</p>';
    $('greeks').innerHTML = '';
  } else {
    $('summary').innerHTML = `
      <div class="kpi"><span>Net ${cost >= 0 ? 'debit (paid)' : 'credit (received)'}</span><strong>${money(Math.abs(cost))}</strong></div>
      <div class="kpi"><span>Max profit</span><strong class="pos">${money(a.maxProfit)}</strong>${a.maxProfit === Infinity ? rising : ''}</div>
      <div class="kpi"><span>Max loss</span><strong class="neg">${money(a.maxLoss)}</strong>${a.maxLoss === -Infinity ? rising : ''}</div>
      <div class="kpi"><span>Breakeven${a.breakevens.length === 1 ? '' : 's'}</span><strong>${a.breakevens.length ? a.breakevens.map(b => fmtPrice(b)).join(' / ') : '-'}</strong></div>
      <div class="kpi"><span>Prob. of profit</span><strong>${(a.pop * 100).toFixed(1)}%</strong><small>risk-neutral, at ${escapeHtml(fmt(a.popVol * 100, 1))}% vol</small></div>
      <div class="kpi"><span>Horizon</span><strong>${escapeHtml(a.t)} days</strong></div>
      <div class="kpi"><span>Premium interest</span>${interest}</div>`;

    const mult = dollarMultiplier(c);
    // Once a leg prices off its own month, "a point" needs saying: a point of
    // the panel's contract, every month moving in proportion, as on the chart.
    const ownMonth = activeLegs().some(l => legRatio(l) !== 1);
    // Theta stays the options' own; the interest is the rest of the P&L's change
    // from one day to the next, so it is given beside it.
    const perDay = carried ? premiumInterestPerDay(0) : 0;
    $('greeks').innerHTML = `
      <table class="greeks">
        <tr><th><span class="sr-only">Greek</span></th><th>Per unit</th><th>Position ($)</th><th>Meaning</th></tr>
        <tr><td>Delta</td><td class="num">${fmt(g.unit.delta, 4)}</td><td class="num">${money(g.money.delta)}</td><td class="muted">$ P&L per 1 point move</td></tr>
        <tr><td>Gamma</td><td class="num">${fmt(g.unit.gamma, 6)}</td><td class="num">${money(g.money.gamma)}</td><td class="muted">delta change per 1 point move</td></tr>
        <tr><td>Vega</td><td class="num">${fmt(g.unit.vega, 4)}</td><td class="num">${money(g.money.vega)}</td><td class="muted">$ per +1 vol point</td></tr>
        <tr><td>Theta</td><td class="num">${fmt(g.unit.theta, 4)}</td><td class="num">${money(g.money.theta)}</td><td class="muted">$ per calendar day</td></tr>
        <tr><td>Rho</td><td class="num">${fmt(g.unit.rho, 4)}</td><td class="num">${money(g.money.rho)}</td><td class="muted">$ per +1 rate point</td></tr>
      </table>
      <p class="muted small">Position column = per-unit greek x quantity x $${fmt(mult, 2)} multiplier.${ownMonth
        ? ' Delta and gamma are per point of the contract in the left panel, with each leg\'s own month ' +
          'moving in proportion, as on the chart; the Delta column in the legs table is against each ' +
          'leg\'s own month.'
        : ''}${perDay
        ? ' Theta is the options\' own decay. The P&amp;L also carries the premium\'s interest: ' +
          money(-perDay) + ' a day at ' + ratePct + '%.'
        : ''}</p>`;
  }

  $('tDays').max = Math.max(a.t, 1);
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

/* The chart's colours are the --chart-* variables in styles.css, which also
 * switches them for the dark scheme, so the page and the chart keep their
 * palette in one place. They used to be written out here too, for both schemes. */
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const col = {};
  for (const k of ['grid', 'zero', 'text', 'net', 'now', 'leg', 'spot', 'strike']) {
    col[k] = css.getPropertyValue('--chart-' + k).trim();
  }
  return col;
}

/* Everything Chart.js is given for the current state: the series, the axes, the
 * strike and spot marks and the colours. Pure apart from reading the colours off
 * the stylesheet, so what the chart shows can be tested without a canvas. */
function chartConfig(a) {
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
      const mtm = pnlEvaluator();
      datasets.push({
        label: state.chart.tDays === 0 ? 'Today (mark to market)' : 'In ' + state.chart.tDays + 'd',
        data: a.xs.map(x => ({ x, y: mtm(x, state.chart.tDays) })),
        borderColor: col.now, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0
      });
    }
    if (state.chart.showLegs) {
      for (const leg of activeLegs()) {
        // The position's own P&L for this leg alone, the premium's interest
        // included, so the legs add up to the solid line.
        const pnl = pnlEvaluator(undefined, [leg]);
        datasets.push({
          label: (leg.side === 1 ? 'Long ' : 'Short ') + leg.qty + ' ' + leg.kind +
            (leg.kind === 'underlying' ? '' : ' ' + fmtPrice(leg.strike, true)),
          data: a.xs.map(x => ({ x, y: pnl(x, a.t) })),
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
        v += leg.side * leg.qty * legAxisGreeks(leg, { P: x, tDays: tOff })[which];
      }
      return { x, y: v * mult };
    });
    datasets.push({
      label: yTitle, data, borderColor: col.net, borderWidth: 2, pointRadius: 0, tension: 0
    });
  }
  // No legs, no curves: the page says so in the chart's place (renderChartSafely).
  if (!activeLegs().length) datasets.length = 0;

  // Marks sit where the leg's payoff actually kinks on the shared axis, which
  // is not the strike itself once a leg trades on its own delivery month.
  const lines = activeLegs()
    .filter(l => l.kind !== 'underlying')
    .map(l => ({ value: strikeOnAxis(l), color: col.strike, label: 'K ' + fmtPrice(l.strike, true) }));
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
            title: items => 'Price ' + fmtPrice(items[0].parsed.x),
            label: item => item.dataset.label + ': ' + money(item.parsed.y)
          }
        }
      }
    },
    plugins: [markerPlugin]
  };
  return cfg;
}

/* The chart is created once and updated in place after that. Destroying and
 * re-creating it on every render was 75-85% of a render's cost - 25 to 45 ms a
 * keystroke - and replayed Chart.js's entry animation every time. Replacing
 * the datasets and the options and updating without animation draws the same
 * picture. */
function renderChart(a) {
  const cfg = chartConfig(a);
  if (!chart) {
    chart = new Chart($('payoffChart').getContext('2d'), cfg);
    return;
  }
  chart.data.datasets = cfg.data.datasets;
  chart.options = cfg.options;
  chart.update('none');
}

/* Scenario grid. Cells are shaded by size relative to the biggest absolute
 * number in the whole table, so the eye finds the cliff without reading every
 * figure. */
function renderScenarios() {
  const s = scenarioTable();
  const legs = activeLegs().filter(l => l.kind !== 'underlying');
  if (!activeLegs().length) {
    $('scenarios').innerHTML = '<p class="note">Add a leg to see the scenario grid.</p>';
    return;
  }

  const shade = v => {
    if (!isFinite(v) || !s.worst) return '';
    const a = (Math.abs(v) / s.worst * 0.5).toFixed(3);
    return ' style="background:rgba(' + (v >= 0 ? '32,140,96' : '190,60,48') + ',' + a + ')"';
  };

  const panels = s.panels.map(panel => {
    const head = s.days.map(d =>
      '<th class="num">' + (d === 0 ? 'Today' : d + 'd') + '</th>').join('');
    const rows = panel.rows.slice().reverse().map(r => {
      const label = fmtPrice(r.price) +
        ' <span class="muted">(' + (r.pct >= 0 ? '+' : '') + fmt(r.pct * 100, 0) + '%)</span>';
      const cells = r.cells.map(c =>
        '<td class="num"' + shade(c) + '>' + money(c) + '</td>').join('');
      return '<tr><th class="rowhead">' + label + '</th>' + cells + '</tr>';
    }).join('');

    const title = panel.volShift === 0
      ? 'Volatility unchanged'
      : 'Volatility ' + (panel.volShift > 0 ? '+' : '') + panel.volShift + ' points';
    return '<div class="scenario-panel"><h3>' + title + '</h3>' +
      '<div class="table-scroll"><table class="scenario"><thead><tr>' +
      '<th>Underlying</th>' + head + '</tr></thead><tbody>' + rows +
      '</tbody></table></div></div>';
  }).join('');

  const note = legs.length
    ? 'P&L at each date assumes the volatility shift happens immediately and holds. ' +
      'The last column is the nearest expiry among your legs (' + s.horizon + ' days). ' +
      (state.financing.mode === 'none'
        ? 'The P&L is nominal: the premium carries no interest.'
        : 'Each date includes the premium\'s interest up to it, at ' + fmt(premiumRate() * 100, 2) + '%.')
    : 'Only the underlying is in the position, so volatility and time do nothing.';

  $('scenarios').innerHTML = panels + '<p class="note">' + escapeHtml(note) + '</p>';
}

/* Chart.js is the one thing on the page loaded from a CDN. An ad blocker, a CDN
 * outage or a file that fails its integrity check leaves `Chart` undefined, and
 * that must not take the rest of the page down with it: the results, the
 * scenario grid and the saved state all live after the chart in the render
 * order and are worth more than the picture. */
let chartBroken = false;

function renderChartSafely(a) {
  // With nothing to chart, the box says so in its place.
  const empty = $('chartEmpty');
  if (empty) empty.hidden = activeLegs().length > 0;
  if (chartBroken) return;
  try {
    renderChart(a);
  } catch (e) {
    chartBroken = true;
    const box = $('payoffChart') && $('payoffChart').closest('.chart-box');
    if (box) {
      box.innerHTML = '<p class="note">The chart library could not be loaded, so the ' +
        'payoff graph is unavailable. Everything else on this page still works - the ' +
        'numbers below and the scenario grid are computed locally.</p>';
    }
  }
}

/* Typing and dragging a slider fire an event for every keystroke or pixel. The
 * state changes at once; the drawing waits for the next frame and happens once
 * for however many events arrived in it. */
let renderQueued = false;

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderAll();
  });
}

/* Drawing is a projection of the state: nothing below changes it. Whatever a
 * change left out of bounds is put back first, in normalizeState(). */
function renderAll() {
  normalizeState();
  renderInputs();
  renderLegs();
  const a = renderResults();
  renderChartSafely(a);
  renderScenarios();
  renderSources();
  persist();
}

/* ============================================================
 * 8. Persistence and sharing
 * ========================================================== */

function persist() {
  const json = JSON.stringify(snapshot());
  try {
    localStorage.setItem(STORE_KEY, json);
  } catch (e) {
    // Most likely the storage quota. Cached responses can be fetched again and
    // the scenario cannot, so make room and try once more.
    try {
      pruneCache(0);
      localStorage.setItem(STORE_KEY, json);
    } catch (e2) { /* private mode or still full - nothing more to do */ }
  }
}

/* The Alpha Vantage key, kept in this browser and nowhere else. An empty key
 * removes it, which is how emptying the field takes it out of the browser: it
 * used to be written on use and never removed, so a cleared field filled
 * itself in again on the next visit. */
function storeAvKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORE, key);
    else localStorage.removeItem(KEY_STORE);
  } catch (e) { /* private mode - the key is just not remembered */ }
}

function snapshot() {
  return {
    commodity: state.commodity, model: state.model, style: state.style,
    S: state.S, vol: state.vol,
    rate: state.rate, yield: state.yield, days: state.days, size: state.size,
    quote: state.quote, chart: state.chart,
    skew: { on: state.skew.on, rr: state.skew.rr, bf: state.skew.bf },
    scenario: { volShift: state.scenario.volShift, pricePct: state.scenario.pricePct },
    financing: { mode: state.financing.mode, rate: state.financing.rate },
    legs: state.legs.map(l => ({
      on: l.on, side: l.side, kind: l.kind, qty: l.qty,
      strike: l.strike, days: l.days, vol: l.vol, under: l.under, entry: l.entry
    }))
  };
}

/* ------------------------------------------------------------
 * Trust boundary.
 *
 * restore() takes state from a shared link, from localStorage and from an
 * imported file - all of which someone other than the user can write. So
 * nothing is copied across as-is: every field is rebuilt from a whitelist
 * with its type checked. A crafted link once carried a strike of
 * '"><img onerror=...>' straight into renderLegs(), where it ran as script
 * on this origin - the same origin that holds the user's Alpha Vantage key.
 *
 * The checks are strict on purpose. snapshot() only ever writes numbers, so
 * a string in a numeric field cannot come from a genuine saved scenario.
 * ---------------------------------------------------------- */

const LEG_KINDS = ['call', 'put', 'underlying'];
const MODELS = ['b76', 'bs'];
const QUOTES = ['USD', 'cents'];
const CHART_MODES = ['payoff', 'delta', 'gamma', 'vega', 'theta'];
const FINANCING = ['rate', 'custom', 'none'];

function isNum(x) {
  return typeof x === 'number' && isFinite(x);
}

function pick(x, allowed, fallback) {
  return allowed.indexOf(x) !== -1 ? x : fallback;
}

/* What a number may be: '' when `v` will do for `key`, otherwise the reason,
 * as a sentence to show beside the field. One rule for the panel, the legs
 * table, a restored scenario and a quote. A price, strike or size at or below
 * zero, or a negative volatility, used to go straight into the pricer: a
 * negative price valued a put above its strike, and a negative size swapped
 * profit and loss. Any other key only has to be a number - a rate or a yield
 * may well be negative. */
function inputProblem(key, v) {
  if (!isNum(v)) return 'Enter a number.';
  switch (key) {
    case 'S':
    case 'under':
      return v > 0 ? '' : 'A price must be above zero: these models are lognormal and cannot price a contract at or below zero.';
    case 'strike':
      return v > 0 ? '' : 'A strike must be above zero.';
    case 'size':
      return v > 0 ? '' : 'Units per contract must be above zero.';
    case 'vol':
      return v >= 0 ? '' : 'Volatility cannot be negative.';
    default:
      return '';
  }
}

/* One leg from untrusted input, or null when it cannot be a leg. The id is
 * never taken from the input: newLeg() assigns a fresh one, and an id from a
 * link would otherwise land in a data attribute. */
function sanitizeLeg(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = pick(raw.kind, LEG_KINDS, 'call');
  // An option with no valid strike is not a leg. Inventing one would put a
  // position on the screen that nobody chose.
  if (kind !== 'underlying' && inputProblem('strike', raw.strike)) return null;
  const optional = (x, key) => (inputProblem(key, x) ? null : x);
  return newLeg({
    on: raw.on !== false,
    side: raw.side === -1 ? -1 : 1,
    kind: kind,
    qty: isNum(raw.qty) && raw.qty >= 0 ? raw.qty : 1,
    strike: isNum(raw.strike) ? raw.strike : 0,
    days: isNum(raw.days) && raw.days >= 0 ? raw.days : state.days,
    vol: optional(raw.vol, 'vol'),
    under: optional(raw.under, 'under'),
    entry: optional(raw.entry, 'entry')
  });
}

/* A field that is missing or invalid keeps its current value rather than
 * being reset, so an old saved scenario that predates a field still loads. */
function restore(o) {
  if (!o || typeof o !== 'object') return false;
  if (typeof o.commodity === 'string' &&
    Object.prototype.hasOwnProperty.call(COMMODITIES, o.commodity)) {
    state.commodity = o.commodity;
  }
  state.model = pick(o.model, MODELS, state.model);
  state.quote = pick(o.quote, QUOTES, state.quote);
  ['S', 'vol', 'rate', 'yield', 'size'].forEach(k => {
    if (!inputProblem(k, o[k])) state[k] = o[k];
  });
  if (isNum(o.days) && o.days >= 0) state.days = o.days;
  // Scenarios saved before American exercise existed were priced as European,
  // so restore them that way rather than silently repricing someone's numbers.
  state.style = o.style === 'american' || o.style === 'european' ? o.style : 'european';
  if (o.chart && typeof o.chart === 'object') {
    state.chart.mode = pick(o.chart.mode, CHART_MODES, state.chart.mode);
    if (isNum(o.chart.tDays) && o.chart.tDays >= 0) state.chart.tDays = o.chart.tDays;
    if (isNum(o.chart.range)) state.chart.range = o.chart.range;
    if (typeof o.chart.showLegs === 'boolean') state.chart.showLegs = o.chart.showLegs;
  }
  // Like the exercise style: a scenario saved before the surface existed was
  // priced on one flat volatility, so restore it that way instead of applying
  // a skew it never had.
  state.skew.on = !!(o.skew && o.skew.on === true);
  if (o.skew) {
    if (isNum(o.skew.rr)) state.skew.rr = o.skew.rr;
    if (isNum(o.skew.bf)) state.skew.bf = o.skew.bf;
  }
  if (o.scenario) {
    if (isNum(o.scenario.volShift)) state.scenario.volShift = o.scenario.volShift;
    if (isNum(o.scenario.pricePct)) state.scenario.pricePct = o.scenario.pricePct;
  }
  // Like the exercise style and the skew: a scenario saved before the premium
  // carried interest was read nominally, so restore it that way rather than move
  // someone's recorded P&L. A first visit has nothing to restore and keeps the
  // default, the risk-free rate.
  const fin = o.financing && typeof o.financing === 'object' ? o.financing : {};
  state.financing.mode = pick(fin.mode, FINANCING, 'none');
  if (!inputProblem('financingRate', fin.rate)) state.financing.rate = fin.rate;
  if (Array.isArray(o.legs)) state.legs = o.legs.map(sanitizeLeg).filter(Boolean);
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

/* Each apply* function fills one input from market data. It takes what it
 * needs as arguments, updates `state`, and resolves to a result for the wiring
 * to show: always a `message`, plus anything the page displays that is not
 * part of the state. It never reads or writes the page, which is what lets the
 * tests run it. When it cannot fill its input it throws with a message fit to
 * show the user, and the input keeps its value. */

async function applyRate() {
  const curve = await fetchYieldCurve();
  const years = Math.max(state.days, 1) / 365;
  const r = rateForTenor(curve, years);
  state.rate = +r.continuous.toFixed(3);
  state.sources.rate = {
    live: true,
    text: `US Treasury par curve ${curve.date}, interpolated at ${state.days}d = ` +
      `${r.par.toFixed(2)}% par (semi-annual) -> ${r.continuous.toFixed(3)}% continuous`
  };
  return { message: `risk-free rate ${state.rate}% (Treasury ${curve.date})` };
}

/* The one way the reference price changes, so the price, the listed contract
 * it belongs to and the line saying where it came from cannot disagree. No
 * `source` means the user's own number; `month` is the listed contract's
 * symbol, or '' for the continuous front month. The picker and the price used
 * to drift apart: fetching the front month left "Cocoa Mar 27" selected, and a
 * price typed by hand kept the month's quote as its source. */
function setReferencePrice(S, source, month) {
  state.S = S;
  state.sources.price = source || null;
  state.contractMonth = month || '';
}

/* A number typed into one of the market inputs is the user's own: whatever
 * source filled that box no longer describes it. For the price that also means
 * it is no longer a listed month's quote - it used to keep the month's source
 * and leave the month picked. */
const TYPED_INPUTS = ['vol', 'rate', 'yield'];

function typeMarketInput(key, v) {
  if (key === 'S') {
    setReferencePrice(v, null, '');
    return;
  }
  if (TYPED_INPUTS.indexOf(key) === -1) return;
  state[key] = v;
  state.sources[key] = null;
}

async function applyFuturesPrice() {
  const q = await proxyGet('quote', state.commodity, 5 * 60e3);
  if (!isNum(q.price) || q.price === 0) throw new Error('no price returned');
  // A real quote can be below zero - WTI settled at -37.63 in April 2020 - and
  // no model here can price one, so say that rather than "no price".
  if (inputProblem('S', q.price)) {
    throw new Error(`${q.name || q.symbol || 'the contract'} last ${fmtPrice(q.price)}, ` +
      'below zero, which these lognormal models cannot price');
  }

  // Yahoo reports USX for cents-quoted contracts. Trust it over our table:
  // getting this wrong scales the whole position P&L by 100.
  let unitNote = '';
  const wanted = q.currency === 'USX' ? 'cents' : q.currency === 'USD' ? 'USD' : null;
  if (wanted && wanted !== state.quote) {
    state.quote = wanted;
    unitNote = `, quoting switched to ${wanted} to match the contract`;
  }

  // The continuous front month, so no listed month is picked any more.
  setReferencePrice(q.price, {
    live: true,
    text: `${q.name || q.symbol} last ${fmtPrice(q.price)}` +
      (q.currency ? ` ${q.currency}` : '') +
      (q.asOf ? `, ${q.asOf.slice(0, 16).replace('T', ' ')} UTC` : '') + unitNote
  }, '');
  return { message: `${q.name || q.symbol} at ${fmtPrice(q.price)}${unitNote}` };
}

/* Realised vol from the real futures series, falling back to Alpha Vantage's
 * ETF proxy when the futures proxy is not reachable. `opts` is what the
 * volatility panel holds: the `window` in days, the `estimator`, the Alpha
 * Vantage `avKey` and any `symbol` typed in place of the preset ETF. */
async function applyVol(opts) {
  const win = opts.window;
  const est = opts.estimator;
  try {
    const h = await proxyGet('history', state.commodity, 60 * 60e3);
    const rv = realisedVol(h.series || [], win);
    if (!rv) throw new Error('not enough history');
    const chosen = rv[est];
    if (!(chosen > 0)) throw new Error('estimator unavailable for this series');

    state.vol = chosen;
    state.sources.vol = {
      live: true,
      text: `${est} realised vol, ${rv.days}d window on ${h.symbol} ` +
        `(front-month futures; roll gaps can inflate it slightly), last close ${rv.last}. ` +
        `close-to-close ${rv.close.toFixed(1)}% / EWMA ${rv.ewma.toFixed(1)}%` +
        (rv.parkinson ? ` / Parkinson ${rv.parkinson.toFixed(1)}%` : '')
    };
    return { message: `volatility ${volField(state.vol, 4)}% from ${h.symbol}` };
  } catch (proxyErr) {
    if (!opts.avKey) throw proxyErr;
    return applyVolFromAlphaVantage(opts);
  }
}

async function applyVolFromAlphaVantage(opts) {
  const win = opts.window;
  const est = opts.estimator;
  const meta = commodityMeta(state.commodity);
  const symbol = (opts.symbol || meta.priceSymbol || '').toUpperCase();
  if (!symbol) throw new Error('no ticker to read prices from');
  storeAvKey(opts.avKey);

  const series = await fetchDailySeries(symbol, opts.avKey);
  const rv = realisedVol(series, win);
  if (!rv) throw new Error('not enough history');
  const chosen = rv[est];
  if (!(chosen > 0)) throw new Error('estimator unavailable for this series');

  // Only describe the built-in proxy when that is actually the symbol used.
  const isDefaultProxy = symbol === (meta.priceSymbol || '').toUpperCase();
  const proxyText = isDefaultProxy && meta.proxy ? meta.proxy : 'symbol entered by you';

  state.vol = chosen;
  state.sources.vol = {
    live: true,
    text: `${est} realised vol, ${rv.days}d window on ${symbol} (${proxyText}), ` +
      `last close ${rv.last}. close-to-close ${rv.close.toFixed(1)}% / EWMA ${rv.ewma.toFixed(1)}%` +
      (rv.parkinson ? ` / Parkinson ${rv.parkinson.toFixed(1)}%` : '')
  };
  return { message: `volatility ${volField(state.vol, 4)}% from ${symbol} (ETF proxy)` };
}

/* Convenience yield from the real futures curve: two listed contracts give
 * y = r - ln(F2/F1)/(T2-T1). */
async function applyCurveYield() {
  const { near, far } = await nearestContracts(state.commodity);
  const days = contractGapDays(near, far);
  const y = impliedConvenienceYield(near.price, far.price, days, state.rate);
  if (!isFinite(y)) throw new Error('the two contracts did not give a usable spread');
  state.yield = +y.toFixed(3);
  state.sources.yield = {
    live: true,
    text: `implied by the futures curve: ${near.name || near.symbol} ${fmtPrice(near.price)} vs ` +
      `${far.name || far.symbol} ${fmtPrice(far.price)}, ${days}d apart (expiries approximated to ` +
      `mid-month), r=${state.rate}% -> y=${y.toFixed(3)}%`
  };
  // The working, for the manual carry boxes, so the number is auditable.
  return {
    message: `convenience yield ${state.yield}% from the curve`,
    carry: { near: near.price, far: far.price, days: days }
  };
}

/* The listed strip for the selected commodity, newest fetch wins; it lives in
 * state.session.strip. A month picked from an earlier strip that this one no
 * longer lists stops being the picked month - its price and source stay, still
 * true about where the number came from. That used to happen inside
 * renderMonths(), which changed the state it was drawing. The wiring draws the
 * picker once this resolves. */
async function loadContractMonths() {
  const contracts = await listedContracts(state.commodity);
  if (!contracts.length) throw new Error('no listed contract quoted');
  state.session.strip = contracts;
  if (state.contractMonth && !contracts.some(m => m.symbol === state.contractMonth)) {
    state.contractMonth = '';
  }
  return { message: contracts.length + ' listed months loaded' };
}

/* Another market: its strip is not this one's, and presets reset the rest -
 * keeping the old strip would offer cocoa months while pricing gold. */
function changeCommodity(key) {
  if (!Object.prototype.hasOwnProperty.call(COMMODITIES, key)) return;
  state.commodity = key;
  state.session.strip = [];
  applyPreset();
}

/* Price the panel against one specific delivery month. */
function useContractMonth(symbol) {
  const hit = state.session.strip.find(c => c.symbol === symbol);
  if (!hit) {
    // Back to the continuous series: leave the price alone, since we have no
    // front-month quote in hand, but stop claiming it belongs to a month.
    setReferencePrice(state.S, null, '');
    return;
  }
  setReferencePrice(hit.price, {
    live: true,
    text: `${hit.name || hit.symbol} ${fmtPrice(hit.price)} ${hit.currency || ''}`.trim() +
      (hit.asOf ? `, ${hit.asOf.slice(0, 10)}` : '') +
      ' - one listed contract, not the continuous series'
  }, hit.symbol);
}

/* Undo for applyLegPrices(). The fill rewrites every option leg at once, so it
 * needs a matching one-click way back - clearing seven legs by hand is not an
 * undo. A blank leg price means "use the contract in the panel", which is
 * exactly the state the fill replaced. The fill has its own source line, so
 * undoing it leaves the panel price's line alone: there is nothing to restore,
 * which is what used to go wrong when one line served both. */
function clearLegPrices() {
  for (const leg of state.legs) leg.under = null;
  state.sources.legs = null;
}

/* A leg price typed by hand. After a fill the curve's line stops vouching for
 * every leg, and once no leg carries a price of its own it goes. */
function typeLegPrice(leg, v) {
  if (v === leg.under) return;
  leg.under = v;
  const s = state.sources.legs;
  if (!state.legs.some(l => l.under != null)) state.sources.legs = null;
  else if (s && !s.edited) {
    state.sources.legs = { live: s.live, text: s.text + '; edited by hand since', edited: true };
  }
}

/* Days from now to a contract's (mid-month approximated) expiry.
 *
 * `nowMs` is explicit so one pass over the strip measures every contract
 * against the same instant. Letting each call read its own clock put the
 * anchors microseconds apart, which is harmless in price terms but makes the
 * curve subtly non-reproducible for the same inputs. */
function daysUntil(isoDate, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  return (new Date(isoDate + 'T00:00:00Z') - now) / 86400e3;
}

/* The forward price `days` out, read off the loaded strip.
 *
 * Log-linear between the two contracts that bracket the date, which is the
 * right space for a curve whose shape is a carry rate. Past either end it
 * extends the nearest segment's slope - still an extrapolation, but anchored
 * on the two closest real quotes rather than on one slope measured at the
 * front of the curve. Returns null when the strip is too thin to say
 * anything. */
function forwardFromStrip(days) {
  const now = Date.now();
  const pts = state.session.strip
    .filter(c => c.price > 0)
    .map(c => ({ t: daysUntil(c.expiry, now), p: c.price }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return pts.length === 1 ? pts[0].p : null;

  // The segment bracketing the date, clamped to the end segments outside the
  // strip so those extend the nearest real slope.
  let lo = 0;
  if (days >= pts[pts.length - 1].t) {
    lo = pts.length - 2;
  } else {
    while (lo < pts.length - 2 && days > pts[lo + 1].t) lo++;
  }
  const a = pts[lo], b = pts[lo + 1];
  if (!(b.t - a.t)) return a.p;
  const w = (days - a.t) / (b.t - a.t);
  return Math.exp(Math.log(a.p) + w * (Math.log(b.p) - Math.log(a.p)));
}

/* Price every leg from the loaded strip of listed contracts. Used in place of
 * the two-contract slope whenever the strip is in hand, because interpolating
 * between real quotes beats extrapolating one slope measured at the front. */
function fillLegsFromStrip(opts) {
  const strip = state.session.strip;
  const now = Date.now();
  const pts = strip.filter(c => c.price > 0).map(c => daysUntil(c.expiry, now));
  // Expiries are approximated to mid-month, so a leg within a couple of weeks
  // of the last contract is effectively on it. Flagging those as extrapolated
  // would cry wolf on the common case of a leg expiring at the last listed
  // month.
  const furthestQuote = Math.max.apply(null, pts) + 15;
  let beyond = 0;
  for (const leg of opts) {
    const f = forwardFromStrip(leg.days);
    if (f == null || !(f > 0)) continue;
    leg.under = +f.toFixed(4);
    if (leg.days > furthestQuote && leg.days > beyond) beyond = leg.days;
  }
  const first = strip[0], last = strip[strip.length - 1];
  const tail = beyond
    ? `, extrapolated past the last listed month for the ${beyond}d leg`
    : '';
  return {
    live: true,
    text: `legs interpolated across ${strip.length} listed contracts, ` +
      `${first.name || first.symbol} ${fmtPrice(first.price)} to ` +
      `${last.name || last.symbol} ${fmtPrice(last.price)}${tail}`
  };
}

/* Price every leg at its own delivery month, from the listed curve: across the
 * loaded strip when there is one, otherwise along the slope between two
 * contracts, which is an extrapolation of one observed slope rather than a
 * fitted term structure - honest for the two- or three-month span a calendar
 * usually covers, and increasingly rough beyond the far contract. The fill
 * reports on its own source line; the panel price's line is left alone. */
async function applyLegPrices() {
  const opts = state.legs.filter(l => l.kind !== 'underlying');
  if (!opts.length) throw new Error('add an option leg first');

  // With the listed strip in hand, interpolate between real quotes.
  if (state.session.strip.length >= 2) {
    state.sources.legs = fillLegsFromStrip(opts);
    return { message: `leg prices from ${state.session.strip.length} listed contracts` };
  }

  const { near, far } = await nearestContracts(state.commodity);
  const gapDays = contractGapDays(near, far);
  if (!(gapDays > 0) || !(near.price > 0) || !(far.price > 0)) {
    throw new Error('the two contracts did not give a usable spread');
  }
  const slope = logSlope(near.price, far.price, gapDays);

  let furthest = 0;
  for (const leg of opts) {
    leg.under = +(state.S * Math.exp(slope * leg.days / 365)).toFixed(4);
    if (leg.days > furthest) furthest = leg.days;
  }

  const pct = (slope * 100).toFixed(2);
  const beyond = furthest > gapDays
    ? `, extrapolated past the ${gapDays}d observed span for the ${furthest}d leg`
    : '';
  state.sources.legs = {
    live: true,
    text: `from ${fmtPrice(state.S)} in the panel, priced along the curve at ` +
      `${pct}%/yr from ${near.name || near.symbol} ${fmtPrice(near.price)} vs ` +
      `${far.name || far.symbol} ${fmtPrice(far.price)}${beyond}`
  };
  return { message: `leg prices from a ${pct}%/yr curve` };
}

/* Every input it can fill, each on its own: one that fails never stops the
 * rest. `vol` is what applyVol() takes. Resolves to every step's result and
 * two lists for the status line, what was updated and what was left as it was. */
async function autoFill(vol) {
  const steps = [
    ['risk-free rate', () => applyRate()],
    ['futures price', () => applyFuturesPrice()],
    ['volatility', () => applyVol(vol)],
    ['convenience yield', () => applyCurveYield()]   // uses the rate fetched above
  ];
  const results = [], done = [], failed = [];
  for (const [name, step] of steps) {
    try {
      const r = await step();
      results.push(r);
      done.push(r.message);
    } catch (e) { failed.push(`${name} (${e.message})`); }
  }
  return { results: results, done: done, failed: failed };
}

/* The convenience yield implied by two prices typed into the carry boxes: the
 * manual check beside the Yield button. */
function applyCarryYield(S, F, days) {
  const y = impliedConvenienceYield(S, F, days, state.rate);
  if (!isFinite(y)) {
    throw new Error('Enter a spot price, a futures price and the days to the futures expiry.');
  }
  state.yield = +y.toFixed(3);
  state.sources.yield = {
    live: true,
    text: `implied by carry: F=${fmtPrice(F)}, S=${fmtPrice(S)}, ${days}d, r=${state.rate}% -> y=${y.toFixed(3)}%`
  };
  return { message: 'Convenience yield implied from the spot/futures basis: ' + y.toFixed(3) + '%.' };
}

/* Back to the commodity's long-run typical values, labelled as not market data. */
function applyPreset() {
  const meta = commodityMeta(state.commodity);
  state.vol = meta.vol;
  state.yield = meta.yield;
  state.size = meta.size;
  state.quote = meta.quote;
  // Leg prices are market data too. Clearing the price source but leaving the
  // curve's prices on the legs left the sources panel claiming "not market
  // data" while every leg still priced off a live curve.
  clearLegPrices();
  state.sources.vol = { live: false, text: 'preset long-run average (' + meta.vol + '%) - not market data' };
  state.sources.yield = { live: false, text: 'preset (' + meta.yield + '%) - not market data' };
  // The price is kept but no longer vouched for: presets also run when the
  // commodity changes, and the old market's quote must not describe it.
  setReferencePrice(state.S, null, '');
}

/* ============================================================
 * 10. Wiring
 *
 * The only code that reads the page's inputs for an action or writes what it
 * returned. The actions above get their inputs as arguments and hand back
 * their results.
 * ========================================================== */

/* Each action reports under its own buttons: the market data's, the month
 * picker's, the carry check's, the legs table's. They all wrote to the market
 * data's line once, which on a phone sat 948px below Auto-fill and further from
 * the rest. One message shows at a time, as it did then. */
const STATUS_LINES = ['dataStatus', 'monthStatus', 'carryStatus', 'legStatus'];

function setStatus(msg, kind, where) {
  const line = where || 'dataStatus';
  for (const id of STATUS_LINES) {
    const el = $(id);
    el.textContent = id === line ? msg || '' : '';
    el.className = 'status ' + (id === line ? kind || '' : '');
  }
}

/* While an action waits on the network its button says so and cannot be pressed
 * again: it used to stay as it was for the nine seconds a failing fetch took.
 * Returns what puts the button back. */
function holdButton(button) {
  if (!button) return () => { };
  const text = button.textContent, was = button.disabled;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Fetching…';
  return () => {
    button.disabled = was;
    button.removeAttribute('aria-busy');
    button.textContent = text;
  };
}

/* What a share or an import did, under the buttons that did it. On a phone the
 * market-data status line is 3,400px above them, out of sight. */
function setSaveStatus(msg, kind) {
  const el = $('saveStatus');
  el.textContent = msg || '';
  el.className = kind === 'err' ? 'problem' : kind === 'ok' ? 'note pos' : 'note';
}

/* What the volatility panel holds, as applyVol() takes it. */
function volInputs() {
  return {
    window: +$('volWindow').value,
    estimator: $('volEstimator').value,
    avKey: $('avKey').value.trim(),
    symbol: $('volSymbol').value.trim()
  };
}

/* The part of an action's result that the page shows outside `state`: the
 * curve's two contracts behind a convenience yield, written into the manual
 * carry boxes so the number can be checked by hand. */
function showResult(r) {
  if (r && r.carry) {
    $('carryS').value = r.carry.near;
    $('carryF').value = r.carry.far;
    $('carryDays').value = r.carry.days;
  }
}

/* The commodity's preset ETF and what it is, beside the Alpha Vantage fallback. */
function resetProxyFields() {
  const meta = commodityMeta(state.commodity);
  $('volSymbol').value = meta.priceSymbol || '';
  $('proxyNote').textContent = meta.proxy || '';
}

/* Thin wrapper so every single-field button behaves the same way. `where` is
 * the status line under it, the market data's unless given. */
function runAction(label, step, where) {
  return async e => {
    const release = holdButton(e && (e.currentTarget || e.target));
    setStatus(label + '...', 'busy', where);
    try {
      const r = await step();
      showResult(r);
      renderAll();
      setStatus('Updated ' + r.message + '.', 'ok', where);
    } catch (err) {
      setStatus(label + ' failed: ' + err.message + '. The current value is unchanged.', 'err', where);
    } finally {
      release();
    }
  };
}

/* One button that fills everything it can, reporting each field separately. */
async function actionAutoFill(e) {
  const release = holdButton(e && (e.currentTarget || e.target));
  setStatus('Fetching market data...', 'busy');
  try {
    const r = await autoFill(volInputs());
    r.results.forEach(showResult);
    renderAll();

    const parts = [];
    if (r.done.length) parts.push('Updated ' + r.done.join('; ') + '.');
    if (r.failed.length) parts.push('Left unchanged: ' + r.failed.join('; ') + '.');
    setStatus(parts.join(' '), r.failed.length ? (r.done.length ? '' : 'err') : 'ok');
  } finally {
    release();
  }
}

function actionImplyYield() {
  let r;
  try {
    r = applyCarryYield(parseFloat($('carryS').value), parseFloat($('carryF').value),
      parseFloat($('carryDays').value));
  } catch (e) {
    setStatus(e.message, 'err', 'carryStatus');
    return;
  }
  setStatus(r.message, 'ok', 'carryStatus');
  renderAll();
}

function actionApplyPreset() {
  applyPreset();
  resetProxyFields();
  renderAll();
}

function num(el, fallback) {
  const v = parseFloat(el.value);
  return isFinite(v) ? v : fallback;
}

function bindInputs() {
  $('commodity').addEventListener('change', e => {
    changeCommodity(e.target.value);
    renderMonths();
    resetProxyFields();
    renderAll();
  });

  $('loadMonths').addEventListener('click', runAction('Contract months', async () => {
    const r = await loadContractMonths();
    renderMonths();
    return r;
  }, 'monthStatus'));
  $('contractMonth').addEventListener('change', e => {
    useContractMonth(e.target.value);
    renderAll();
  });

  /* Each handler keeps the previous value when the box is momentarily empty or
   * half-typed, so clearing a field does not zero out the whole model. The four
   * market inputs go through typeMarketInput(): a number typed there is no
   * longer the market's. */
  const simple = {
    model: el => { state.model = el.value; },
    style: el => { state.style = el.value; },
    spot: el => {
      const v = num(el, state.S);
      if (!inputProblem('S', v)) typeMarketInput('S', v);
    },
    vol: el => {
      const v = num(el, state.vol);
      if (!inputProblem('vol', v)) typeMarketInput('vol', v);
    },
    rate: el => { typeMarketInput('rate', num(el, state.rate)); },
    yield: el => { typeMarketInput('yield', num(el, state.yield)); },
    // The financing rate is the user's own, not a market input, and like any
    // rate it may be negative.
    financing: el => { state.financing.mode = el.value; },
    financingRate: el => { state.financing.rate = num(el, state.financing.rate); },
    skewRr: el => { state.skew.rr = num(el, state.skew.rr); },
    skewBf: el => { state.skew.bf = num(el, state.skew.bf); },
    scenPct: el => { state.scenario.pricePct = num(el, state.scenario.pricePct); },
    scenVol: el => { state.scenario.volShift = num(el, state.scenario.volShift); },
    days: el => {
      const old = state.days;
      state.days = Math.max(0, num(el, state.days));
      // Keep legs that were on the old default expiry in sync.
      state.legs.forEach(l => { if (l.days === old) l.days = state.days; });
    },
    size: el => {
      const v = num(el, state.size);
      if (!inputProblem('size', v)) state.size = v;
    },
    quote: el => { state.quote = el.value; }
  };

  Object.keys(simple).forEach(id => {
    $(id).addEventListener('input', e => {
      simple[id](e.target);
      scheduleRender();
    });
  });

  // Why a number was refused is shown beside its field, not on the status
  // line, which is a card away. It lasts until the next thing the user does -
  // an edit, a choice or a button anywhere - since that may change the field
  // it is about: a size refused at 100 must not still say so once a new
  // market has set 1000. Listening on the document, in the capture phase,
  // clears it before that action's own handler runs, so a refusal can say
  // why again.
  const clearProblems = () => {
    ['spotProblem', 'volProblem', 'sizeProblem', 'legProblem'].forEach(id => { $(id).textContent = ''; });
  };
  document.addEventListener('input', clearProblems, true);
  document.addEventListener('change', clearProblems, true);
  document.addEventListener('click', e => { if (e.target.closest('button')) clearProblems(); }, true);

  // A number inputProblem() refuses never reaches the state while it is being
  // typed - "0.45" passes through "0" on the way - so the reason is given once
  // the field is committed, and the field goes back to the value in use.
  [['spot', 'S', ''], ['vol', 'vol', '%'], ['size', 'size', '']].forEach(([id, key, unit]) => {
    $(id).addEventListener('change', e => {
      const problem = inputProblem(key, num(e.target, state[key]));
      if (!problem) return;
      // The value in use, as renderInputs() shows it.
      const shown = key === 'vol' ? volField(state.vol, 4) : state[key];
      $(id + 'Problem').textContent = problem + ' Still using ' + shown + unit + '.';
      e.target.value = shown;
    });
  });

  $('strategy').addEventListener('change', e => {
    if (!e.target.value) return;
    applyStrategy(e.target.value);
    renderAll();
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
    scheduleRender();
  });
  $('tDays').addEventListener('input', e => {
    state.chart.tDays = +e.target.value;
    scheduleRender();
  });

  $('autoFill').addEventListener('click', actionAutoFill);
  $('fetchPrice').addEventListener('click', runAction('Futures price', applyFuturesPrice));
  $('fetchRate').addEventListener('click', runAction('Risk-free rate', applyRate));
  $('fetchVol').addEventListener('click', runAction('Volatility', () => applyVol(volInputs())));
  // Emptying the key field forgets the key; a new one is kept once it is used.
  $('avKey').addEventListener('input', e => {
    if (!e.target.value.trim()) storeAvKey('');
  });
  $('fetchCurve').addEventListener('click', runAction('Convenience yield', applyCurveYield));
  $('fillLegPrices').addEventListener('click', runAction('Leg prices', applyLegPrices, 'legStatus'));
  $('clearLegPrices').addEventListener('click', () => {
    clearLegPrices();
    setStatus('Every leg is back on the contract in the left panel.', 'ok', 'legStatus');
    renderAll();
  });
  $('skewOn').addEventListener('change', e => {
    state.skew.on = e.target.checked;
    renderAll();
  });
  $('implyYield').addEventListener('click', actionImplyYield);
  $('usePreset').addEventListener('click', actionApplyPreset);

  // Where the system share sheet exists - phones, and some desktops - it reaches
  // LinkedIn, WhatsApp or mail in one tap; elsewhere the link is copied.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  if (canShare) $('share').textContent = 'Share link';
  $('share').addEventListener('click', async () => {
    const url = shareLink();
    location.hash = url.split('#')[1];
    setSaveStatus('');
    if (canShare) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch (e) {
        // Closing the sheet is not a failure. Anything else falls back to the
        // clipboard, which needs no sheet.
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setSaveStatus('Shareable link copied to the clipboard.', 'ok');
    } catch (e) {
      setSaveStatus('Link is in the address bar - copy it from there.');
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
        setSaveStatus('Strategy loaded.', 'ok');
      } catch (err) {
        setSaveStatus('That file is not a valid strategy export.', 'err');
      }
    };
    fr.readAsText(file);
    e.target.value = '';
  });

  // Through renderChartSafely like every other render: called bare, it threw
  // on every theme change once Chart.js had failed to load.
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => renderChartSafely(analyse());
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
      setStatus('Enter the market premium in the Entry column first, then press IV.', 'err', 'legStatus');
      return;
    }
    const iv = legImpliedVol(leg, target);
    if (!isFinite(iv)) {
      setStatus(legNoTimeValue(leg, target)
        ? 'That premium has no time value - it is what the option is worth at zero volatility - so ' +
          'every volatility up to some level prices it alike and none can be implied. The leg keeps ' +
          'its volatility.'
        : 'No implied volatility solves that premium (check the price and the strike).', 'err', 'legStatus');
      return;
    }
    // Kept exact, so the leg is worth its premium; the table shows two decimals.
    leg.vol = iv * 100;
    setStatus('Implied volatility for that leg: ' + volField(leg.vol, 4) + '%. The table shows it ' +
      'to two decimals; the leg is priced at the exact figure, so it is worth its premium.', 'ok', 'legStatus');
    renderAll();
    return;
  }

  const el = e.target;
  // A number the pricer cannot take is refused, with the reason under the
  // table, and drawing the table again puts the leg's value back in the field.
  if (f === 'strike' || f === 'vol' || f === 'under') {
    const v = parseFloat(el.value);
    const problem = isFinite(v) ? inputProblem(f, v) : '';
    if (problem) {
      $('legProblem').textContent = problem + ' The leg keeps its previous value.';
      renderAll();
      return;
    }
  }
  switch (f) {
    case 'on': leg.on = el.checked; break;
    case 'side': leg.side = +el.value; break;
    case 'kind': leg.kind = el.value; break;
    case 'qty': leg.qty = Math.max(0, num(el, 1)); break;
    case 'strike': leg.strike = num(el, leg.strike); break;
    case 'days': leg.days = Math.max(0, num(el, leg.days)); break;
    case 'vol': leg.vol = el.value.trim() === '' ? null : num(el, null); break;
    case 'under': typeLegPrice(leg, el.value.trim() === '' ? null : num(el, null)); break;
    case 'entry': leg.entry = el.value.trim() === '' ? null : num(el, null); break;
  }
  renderAll();
}

function init() {
  pruneCache(CACHE_MAX_AGE);
  // Commodity dropdown
  $('commodity').innerHTML = Object.keys(COMMODITIES)
    .map(k => `<option value="${k}">${COMMODITIES[k].label}</option>`).join('');
  // Strategy dropdown
  $('strategy').innerHTML = '<option value="">Choose a strategy…</option>' +
    Object.keys(STRATEGIES).map(k => `<option value="${k}">${STRATEGIES[k].label}</option>`).join('');

  const saved = readHash() || (() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
  })();

  if (!restore(saved) || !state.legs.length) {
    state.legs = [newLeg({ strike: 4200, days: state.days })];
  }

  resetProxyFields();
  $('avKey').value = localStorage.getItem(KEY_STORE) || '';
  $('range').value = state.chart.range;
  $('rangeLabel').textContent = '+/-' + state.chart.range + '%';
  $('chartMode').value = state.chart.mode;
  $('showLegs').checked = state.chart.showLegs;

  bindInputs();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
