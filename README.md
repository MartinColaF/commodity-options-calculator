# commodity-options-calculator

Options calculator for commodity futures. Static site, no build step, no backend:
open `index.html` or serve the folder.

## What it does

- **Pricing** — generalised Black-Scholes-Merton with a cost-of-carry term:
  - `b = 0` → **Black-76**, options on futures (the market standard here).
  - `b = r - q` → **Black-Scholes-Merton** on spot with a convenience yield.
- **American exercise** — Barone-Adesi-Whaley, selectable per scenario and the
  default. Almost every listed commodity futures option is American, and with
  `b = 0` the early-exercise premium is real on calls and puts alike.
- **Greeks** — delta, gamma, vega, theta, rho, both per unit and in dollars for the
  position (contract size and cents-vs-dollars quoting are handled).
- **Multi-leg strategies** — any mix of calls, puts and the underlying. 16 presets
  (spreads, straddles, butterflies, iron condor, collar, calendar, ratio).
  Per-leg volatility (skew), per-leg expiry (calendars) and **per-leg underlying
  price** are supported: in a real commodity calendar each delivery month trades
  at its own price, and one button fills each leg from the listed futures curve.
- **Contract months** — load the listed strip for a commodity and price against one
  specific delivery month, which is what an option quote on a broker's screen refers
  to. The continuous front-month series stays the default. With the strip loaded, the
  per-leg fill interpolates between real quotes instead of extrapolating a single
  slope measured at the front of the curve.
- **Payoff chart** — P&L at the nearest expiry plus a mark-to-market curve for any
  date in between, individual leg overlays, strike and spot markers. The same chart
  also plots delta / gamma / vega / theta profiles across underlying prices.
- **Analytics** — net debit or credit, max profit, max loss, all breakevens, and the
  risk-neutral probability of profit.
- **Scenario grid** — position P&L across underlying price, volatility shift and
  elapsed time: the grid a trader reads before putting a position on. Cells are
  shaded by size so the cliff is visible without reading every figure.
- **Parametric skew** — quote a surface as three numbers per expiry (at-the-money
  volatility, 25-delta risk reversal, 25-delta butterfly) and legs with a blank
  volatility take the curve for their own strike, instead of typing one per leg.
- **Implied volatility** — type the premium you paid in the Entry column, press `IV`.
- **Share and save** — inputs persist in local storage, plus a shareable URL and
  JSON export/import.

## Market data

One button fills all four inputs for the selected commodity; each field reports its
own source and anything that fails is left untouched.

| Input | Source | Key needed |
|---|---|---|
| Futures price | Front-month contract (`GC=F`, `CL=F`, `ZC=F`…) via `/api/market` | no |
| Risk-free rate | US Treasury daily par yield curve, interpolated to your expiry and converted from its semi-annual bond-equivalent basis to a continuously compounded rate | no |
| Volatility | Realised volatility (close-to-close, EWMA, Parkinson) on the futures series itself | no |
| Convenience yield | Implied by the real curve from two listed contracts: `y = r − ln(F2/F1)/(T2−T1)` | no |
| *Fallback* | Alpha Vantage ETF proxies, for custom tickers or if the function is down | free key |

### The `/api/market` function

Yahoo Finance sends no CORS headers, so the browser cannot read it directly. The
serverless function in [`api/market.js`](api/market.js) makes that request instead.

- The client sends a **commodity key, never a raw symbol**; every symbol is built
  from the commodity table. That keeps it from being usable as an open proxy.
- Responses are cached at Vercel's edge (`s-maxage`: quotes 5 min, history and curve
  1 h) and again in the browser, so upstream sees very little traffic.
- It only exists on the deployed site. Opening the page locally, the buttons say so
  and fall back to Alpha Vantage or your manual values.
- Contract months per commodity are listed in [`commodities.js`](commodities.js); the
  curve endpoint probes the next listed contracts and keeps the first two that quote.

Notes and limitations, stated plainly in the UI as well:

- Realised volatility is **historical, not implied**. Yahoo's options chains need a
  cookie/crumb handshake and return 401 without it, so real implied vol is not
  available here.
- Volatility is measured on the front-month continuous series, where **roll gaps can
  inflate the estimate** slightly.
- Contract expiries in the curve endpoint are approximated to mid-month. Both
  contracts use the same convention, so the *gap* driving the carry stays accurate.
- The skew is read once per leg, at today's price and the leg's full tenor, and held
  as the scenario price moves — sticky strike, not sticky delta. Real surfaces shift
  with spot; that is not modelled. The risk reversal and butterfly are inputs you
  supply, not market data: the tool cannot see a real option chain.
- Presets are long-run typical values, flagged in the UI as "not market data".
- Per-leg prices interpolate across the listed strip when it has been loaded, and
  otherwise fall back to the slope between two contracts. Either way the points are
  real quotes and everything between them is an estimate; past the last listed month
  it is an extrapolation, and the "Leg prices" source line says so. Contract expiries are
  approximated to mid-month. The payoff chart then shifts every month in proportion,
  so each month's basis to the reference stays fixed as the price moves.
- American prices are a closed-form approximation, not an exact lattice. Measured
  against a 3000-step binomial tree over 300 contracts (both types, one month to
  two years, strikes 0.8–1.25 of spot, vol 15–60%, rates 2–8%), the error is a
  median of **0.008%** of the underlying and **0.58%** at its worst, on two-year
  60%-vol contracts. Ignoring early exercise entirely — the European setting —
  is wrong by up to **2.6%** over the same set.
- Yahoo's quote endpoint is undocumented: it can change without notice, and their
  terms do not grant redistribution rights. If it breaks, the app degrades to the
  Alpha Vantage path and manual entry.

## Files

- `index.html` — markup
- `styles.css` — styling, light and dark
- `commodities.js` — the table of markets: contract specs, presets and futures
  symbols. The page and the function both read it, so adding a market is one entry.
- `app.js` — pricing engine, strategy analytics, data providers, rendering
- `api/market.js` — serverless futures data proxy (Vercel)
- `privacy.html` — privacy policy

## Development

No dependencies, nothing to install. Node 20+ is the only requirement (CI runs 20 and 22).

```bash
npm run dev     # static server on http://localhost:3000 (UI only)
npx vercel dev  # also runs the /api functions locally
npm test        # the full test suite
```

Opening `index.html` directly works too, but the `/api` buttons need a server, and
some browsers restrict cross-origin requests from `file://`.

### Tests

`node --test`, no framework:

- `test/pricing.test.js` — put-call parity in both models, a textbook reference
  value, all five greeks against finite differences, implied-volatility round trips,
  the volatility estimators against a series of known volatility, curve
  interpolation and the carry inversion.
- `test/strategies.test.js` — closed-form limits for spreads, straddles, condors and
  butterflies; bounded put payoffs; contract multipliers including cents-quoted
  markets; every preset and every commodity.
- `test/skew.test.js` — the skew curve reproducing the 25-delta quotes it was built
  from, the wings under a butterfly, the clamp on an extreme risk reversal, and the
  scenario grid's shape, ordering and response to volatility and time.
- `test/curve.test.js` — per-leg underlying prices: a flat curve reproducing the
  shared-price behaviour exactly, the payoff kink landing on the shared axis,
  contango raising a calendar spread, and the zero-price guards.
- `test/american.test.js` — an independent CRR binomial tree, and the
  Barone-Adesi-Whaley pricer checked against it: the approximation envelope, the
  no-arbitrage bounds, the early-exercise premium on both sides of a futures
  option, the exercise boundary, greeks by finite difference, and the
  style-aware implied-volatility solver.
- `test/leg-pricing.test.js` — every path that prices a leg agreeing with the others:
  the implied volatility of a leg's own premium is its own volatility, a position marked
  today at today's price shows no P&L, and value and greeks report the same price.
- `test/restore.test.js` — the trust boundary for shared links, saved state and
  imported files: hostile fields rejected or retyped, ids never taken from the input,
  a legitimate scenario round-tripping unchanged, and the legs table escaping every
  value it renders.
- `test/actions.test.js` — every market-data action against a fake network: the rate
  read off a real Treasury response, the price switching to cents on a `USX` quote,
  the Alpha Vantage fallback, the curve's convenience yield, leg prices from the slope
  and from the listed strip with their undo, auto-fill carrying on past a failure, the
  presets, and every source line staying true: a price, rate, volatility or yield typed
  by hand is the user's own, and the month picker follows the price.
- `test/commodities.test.js` — the page and the function reading one table: the
  markets the page sends to the function are exactly those with futures data, and
  every contract entry is in a form the function can build symbols from.
- `test/page.test.js` — the page's one third-party script: pinned by its hash, an
  exact version of a file the package publishes, and a Content-Security-Policy that
  allows that file and nothing broader.
- `test/chart.test.js` — what the payoff chart is given in every mode (the horizon,
  today and each leg; one series per greek profile; strike marks on the shared axis),
  the chart created once and updated in place, and the page carrying on without
  Chart.js.
- `test/layers.test.js` — the calculations and actions never touching the page, the
  rendering never changing the state, the chart date kept within the horizon, and the
  listed strip: dropped with the commodity, never saved or shared.
- `test/storage.test.js` — the local-storage cache: expired entries removed, pruning
  that touches nothing but the cache, and a full quota making room for the saved
  scenario instead of losing it.
- `test/deploy.test.js` — `.vercelignore` keeping the notes, tests and tooling off the
  site without ever dropping a file the page or the market function needs.
- `test/privacy.test.js` — the privacy policy promising nothing the site does not do:
  no cookie banner it lacks, no "no cookies" while code sets one, ads described as
  inactive for as long as none load, and every third party the page may contact
  named.
- `test/api.test.js` — the serverless function with a mocked upstream: rejected
  commodities, method and action validation, series parsing, and the two curve rules
  (skip the delivery month, skip contracts that have not traded recently).

`app.js` has no module system on purpose, so the page still runs from a `file://`
path. The tests load it into a VM with a small DOM stub — see
`test/helpers/load-app.js`.

CI runs the suite on every push (`.github/workflows/test.yml`).

### Working on this in the cloud

The repo is self-contained and dependency-free, so any cloud dev environment works
with no setup step: point it at the GitHub repo and `npm test` runs immediately.
This matters because the serverless function cannot be exercised without a Node
toolchain — locally that meant deploying to find out, which is what the test suite
now replaces.
