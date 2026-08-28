# Commodity Options Calculator

Static, dependency-free options calculator for commodity futures, plus one Vercel
serverless function for market data. No build step. `README.md` documents the tool
for users; this file covers what is easy to get wrong when changing it.

## Layout

| File | Role |
|---|---|
| `index.html` | markup only |
| `styles.css` | light/dark theming via CSS variables |
| `app.js` | pricing engine, strategy analytics, data providers, rendering |
| `api/market.js` | serverless futures-data proxy (Vercel) |
| `test/` | `node --test` suite, no framework |
| `scripts/serve.js` | dependency-free dev server |

## Commands

```bash
npm test        # full suite
npm run dev     # static server on :3000 (UI only, no /api)
npx vercel dev  # also serves the /api functions
```

## Deployment

Vercel is wired to this GitHub repo through its dashboard — there is no `vercel.json`
and no `.vercel/` in the tree. **A push to `main` deploys production** in under a
minute, at https://commodity-options-calculator.vercel.app.

`package.json` deliberately has **no dependencies and no build script**: that is what
keeps Vercel treating this as a static site with functions. Adding a `build` script
changes how Vercel deploys it, so do not add one casually.

No server-side environment variables are needed. The optional Alpha Vantage key is
the user's own and lives only in their browser's local storage — never commit a key.

## Things that are easy to break

**`app.js` has no module system on purpose** so the page still works from a `file://`
path. Do not convert it to ESM or CommonJS. The tests load it into a `vm` with a DOM
stub and capture its `const` bindings through an appended epilogue; if you add a
top-level binding the tests need, add it to the epilogue in
`test/helpers/load-app.js`.

**One pricer, parameterised by cost of carry.** `gbs(kind, S, K, T, r, b, sigma)` is
generalised Black-Scholes-Merton: `b = 0` gives Black-76 on a futures price, `b = r - q`
gives BSM on spot. There is no separate Black-76 code path — an earlier version had
one and it was mispriced. Greek units are deliberate: vega per 1 vol point, theta per
calendar day, rho per 1 rate point.

**Dollar multiplier = `size × (quote === 'cents' ? 0.01 : 1)`.** Getting the quoting
convention wrong rescales the whole position P&L by 100. Grains and softs quote in
cents; **copper quotes in USD per pound**, which is a trap because CME describes it in
cents. Yahoo reports `USX` for cents-quoted contracts and the client trusts that over
the local table.

**Strategy statistics use an economic price grid, not the chart window.** `analyse()`
scans from a price near zero to well past the highest strike. That is why a long put
reports a bounded maximum profit and a short put a bounded loss: the underlying cannot
go below zero. Only the upside is ever "unlimited". Reusing the chart's zoom range
here silently produces wrong maxima.

**The horizon is the nearest expiry among active legs**, which is what makes calendar
spreads read correctly — the far leg still holds time value there.

**Table lookups from user-controlled keys must use `hasOwnProperty`.** State can arrive
from a shared link, and `CONTRACTS['__proto__']` resolves to `Object.prototype`, which
is truthy and slipped past the commodity whitelist once already.

**The API function takes a commodity key, never a raw symbol.** Symbols are built from
the `CONTRACTS` table inside the function. Keep it that way or the endpoint becomes an
open proxy. The curve endpoint also skips the current (delivery) month and any contract
that has not traded in seven days — both were real bugs that poisoned the implied carry.

## Verifying without a local toolchain

The owner's Windows machine has no working node, npx or python, so `npm test` cannot
run there. CI (`.github/workflows/test.yml`) runs the suite on every push. The repo is
public, so the Actions API is readable unauthenticated, but **log downloads require
admin rights (403)** — the workflow therefore re-emits failures as `::error::`
annotations, readable at `/repos/{owner}/{repo}/check-runs/{job_id}/annotations`.
Note the API returns pretty-printed JSON: patterns without spaces (`"status":"x"`)
will not match.

In a cloud environment with node, none of that applies — just run `npm test`.

## Data sources and their limits

- **Risk-free rate**: US Treasury daily par yield curve, CORS-enabled, no key.
- **Futures prices and history**: Yahoo via `api/market.js`. Undocumented endpoint;
  its terms do not grant redistribution rights. If it breaks, the app degrades to
  Alpha Vantage and manual entry — keep that fallback working.
- **Implied volatility is not available**: Yahoo's option chains need a cookie/crumb
  handshake and return 401. Everything labelled volatility here is realised
  (historical) volatility, and the UI says so. Do not present it as implied.
- Realised vol is measured on the front-month continuous series, so roll gaps can
  inflate it. Check whether a surprising number is a roll artefact or a real move
  before "fixing" it.

## Known modelling limitations

- **European exercise only.** Most commodity futures options are American, so early
  exercise value is not captured. Adding a binomial or Barone-Adesi-Whaley pricer is
  the largest accuracy gap left.
- **All legs share one underlying price.** For a real commodity calendar spread each
  expiry has its own futures price, so that case is approximated.
- Contract expiries in the curve endpoint are approximated to mid-month. Both
  contracts use the same convention, so the gap driving the carry stays accurate.

## Tone of the UI

Every market-data value shows its source and as-of date, and preset values are
labelled "not market data". Keep that honesty when adding inputs: this is a public
tool that people may price real positions against, and it carries a not-investment-
advice disclaimer.
