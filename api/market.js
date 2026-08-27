/* Vercel serverless function: read-only market data proxy.
 *
 * The browser cannot call Yahoo Finance directly because it sends no CORS
 * headers, so the request is made from here instead.
 *
 * Security note: the client sends a *commodity key*, never a raw symbol, and
 * every symbol is built from the table below. That keeps this from becoming an
 * open proxy that anyone could point at arbitrary hosts.
 *
 * Endpoints (all GET):
 *   /api/market?fn=quote&commodity=gold      front-month price
 *   /api/market?fn=history&commodity=gold    daily OHLC series for realised vol
 *   /api/market?fn=curve&commodity=gold      two listed contracts, for carry
 */
'use strict';

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* root = Yahoo continuous front-month symbol prefix (root + "=F")
 * suffix = exchange code used by month contracts
 * months = listed contract months, as CME month codes */
const CONTRACTS = {
  gold: { root: 'GC', suffix: 'CMX', months: 'GJMQVZ' },
  silver: { root: 'SI', suffix: 'CMX', months: 'FHKNUZ' },
  copper: { root: 'HG', suffix: 'CMX', months: 'HKNUZ' },
  wti: { root: 'CL', suffix: 'NYM', months: 'FGHJKMNQUVXZ' },
  brent: { root: 'BZ', suffix: 'NYM', months: 'FGHJKMNQUVXZ' },
  natgas: { root: 'NG', suffix: 'NYM', months: 'FGHJKMNQUVXZ' },
  corn: { root: 'ZC', suffix: 'CBT', months: 'HKNUZ' },
  wheat: { root: 'ZW', suffix: 'CBT', months: 'HKNUZ' },
  soybean: { root: 'ZS', suffix: 'CBT', months: 'FHKNQUX' },
  sugar: { root: 'SB', suffix: 'NYB', months: 'HKNV' },
  coffee: { root: 'KC', suffix: 'NYB', months: 'HKNUZ' },
  cocoa: { root: 'CC', suffix: 'NYB', months: 'HKNUZ' },
  cotton: { root: 'CT', suffix: 'NYB', months: 'HKNVZ' },
  cattle: { root: 'LE', suffix: 'CME', months: 'GJMQVZ' }
};

const MONTH_CODES = { F: 1, G: 2, H: 3, J: 4, K: 5, M: 6, N: 7, Q: 8, U: 9, V: 10, X: 11, Z: 12 };

async function yahoo(symbol, range, interval) {
  const url = YAHOO + encodeURIComponent(symbol) +
    '?range=' + (range || '1d') + '&interval=' + (interval || '1d');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const json = await res.json();
    const r = json && json.chart && json.chart.result && json.chart.result[0];
    return r && r.meta ? r : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* Listed contracts, oldest first, starting the month *after* the current one.
 * The current month is skipped on purpose: for most of these markets it is a
 * delivery month whose quote is stale and illiquid, which would poison the
 * carry calculation. */
function candidates(spec, count) {
  const now = new Date();
  const out = [];
  for (let i = 1; i < 24 && out.length < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const month = d.getUTCMonth() + 1;
    const code = Object.keys(MONTH_CODES).find(k => MONTH_CODES[k] === month);
    if (spec.months.indexOf(code) === -1) continue;
    const yy = String(d.getUTCFullYear()).slice(2);
    out.push({
      symbol: spec.root + code + yy + '.' + spec.suffix,
      // Mid-month stands in for the real expiry. Both contracts use the same
      // convention, so the *gap* between them - the only thing the carry
      // calculation needs - stays accurate to a few days.
      expiry: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15))
        .toISOString().slice(0, 10)
    });
  }
  return out;
}

function seriesFrom(result) {
  const ts = result.timestamp || [];
  const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close && q.close[i];
    if (c == null) continue;
    out.push({
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      o: q.open && q.open[i] != null ? q.open[i] : c,
      h: q.high && q.high[i] != null ? q.high[i] : c,
      l: q.low && q.low[i] != null ? q.low[i] : c,
      c: c
    });
  }
  return out;
}

function fail(res, code, message) {
  res.status(code).json({ error: message });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Only GET is supported');

  const fn = String(req.query.fn || 'quote');
  const key = String(req.query.commodity || '');
  const spec = CONTRACTS[key];
  if (!spec) {
    return fail(res, 400, 'Unknown commodity. Supported: ' + Object.keys(CONTRACTS).join(', '));
  }

  try {
    if (fn === 'quote' || fn === 'history') {
      const range = fn === 'history' ? '1y' : '5d';
      const r = await yahoo(spec.root + '=F', range, '1d');
      if (!r) return fail(res, 502, 'Upstream quote unavailable');

      const body = {
        commodity: key,
        symbol: r.meta.symbol,
        name: r.meta.shortName || '',
        currency: r.meta.currency || '',
        price: r.meta.regularMarketPrice,
        asOf: r.meta.regularMarketTime
          ? new Date(r.meta.regularMarketTime * 1000).toISOString() : null
      };
      if (fn === 'history') body.series = seriesFrom(r);

      res.setHeader('Cache-Control', fn === 'history'
        ? 'public, s-maxage=3600, stale-while-revalidate=86400'
        : 'public, s-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json(body);
    }

    if (fn === 'curve') {
      // Probe the next few listed contracts in parallel and keep the first two
      // that actually return a price.
      const cands = candidates(spec, 5);
      const results = await Promise.all(cands.map(c => yahoo(c.symbol, '5d', '1d')));
      const staleAfter = 7 * 86400; // seconds; tolerates weekends and holidays
      const nowSec = Date.now() / 1000;
      const found = [];
      for (let i = 0; i < cands.length && found.length < 2; i++) {
        const r = results[i];
        if (!r || !r.meta || !(r.meta.regularMarketPrice > 0)) continue;
        // Drop contracts that have not traded recently: an untraded month
        // carries a stale price that would distort the implied carry.
        const t = r.meta.regularMarketTime;
        if (t && nowSec - t > staleAfter) continue;
        found.push({
          symbol: cands[i].symbol,
          name: r.meta.shortName || '',
          price: r.meta.regularMarketPrice,
          currency: r.meta.currency || '',
          expiry: cands[i].expiry,
          expiryIsApproximate: true,
          asOf: t ? new Date(t * 1000).toISOString() : null
        });
      }
      if (found.length < 2) return fail(res, 502, 'Could not read two contracts for this commodity');

      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json({ commodity: key, contracts: found });
    }

    return fail(res, 400, 'Unknown fn. Use quote, history or curve.');
  } catch (e) {
    return fail(res, 502, 'Market data request failed');
  }
};
