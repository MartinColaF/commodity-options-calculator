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
- **Prices to the tick** — every price shows as many decimals as the market's option
  tick: four for copper, three for gas, silver, cattle and the grains (an eighth of a
  cent), two elsewhere. Nothing on screen is rounded past a step the market trades in.
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
  risk-neutral probability of profit, at the volatility the position is priced at (the
  summary says which). An unlimited maximum says how fast it grows, in dollars per
  point as the price rises: a naked call loses $100 a point, a European calendar a few
  cents.
- **Premium financing** — a premium is paid or received today, so every P&L at a later
  date counts it with the interest it has carried since: at the risk-free rate by
  default, at a rate of your own, or not at all for the nominal P&L. At the risk-free
  rate a fairly priced option breaks even on average; read nominally it shows a profit
  that is only the interest, 8.3% of the premium on a two-year option at 4%. Theta stays
  the options' own, with the interest per day given beside it.
- **Scenario grid** — position P&L across underlying price, volatility shift and
  elapsed time: the grid a trader reads before putting a position on. Cells are
  shaded by size so the cliff is visible without reading every figure.
- **Parametric skew** — quote a surface as three numbers per expiry (at-the-money
  volatility, 25-delta risk reversal, 25-delta butterfly) and legs with a blank
  volatility take the curve for their own strike, instead of typing one per leg.
- **Implied volatility** — type the premium you paid in the Entry column, press `IV`.
  The leg keeps the exact volatility, so it is worth its premium and a position just
  entered shows no P&L; the table shows it to two decimals and the message to four.
  A premium with no time value — what the option is worth at zero volatility, as a
  deep in-the-money option close to expiry can be — implies no volatility, and the
  button says so rather than writing one in.
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
- Responses are cached at Vercel's edge (`s-maxage`: quotes 5 min, history and the
  listed contracts 1 h) and again in the browser, so upstream sees very little traffic.
- It only exists on the deployed site. Opening the page locally, the buttons say so
  and fall back to Alpha Vantage or your manual values.
- Contract months per commodity are listed in [`commodities.js`](commodities.js). The
  `months` endpoint probes the next listed contracts and returns those that quote,
  nearest first. The month picker, the convenience yield and the per-leg fill all read
  that one answer, the last two from its first two contracts, so the page makes one
  request for the whole curve.

Notes and limitations, stated plainly in the UI as well:

- Realised volatility is **historical, not implied**. Yahoo's options chains need a
  cookie/crumb handshake and return 401 without it, so real implied vol is not
  available here.
- Volatility is measured on the front-month continuous series, where **roll gaps can
  inflate the estimate** slightly.
- Contract expiries from the function are approximated to mid-month. Both
  contracts use the same convention, so the *gap* driving the carry stays accurate.
- The skew is read once per leg, at today's price and the leg's full tenor, and held
  as the scenario price moves — sticky strike, not sticky delta. Real surfaces shift
  with spot; that is not modelled. The risk reversal and butterfly are inputs you
  supply, not market data: the tool cannot see a real option chain. A risk reversal
  or butterfly larger than the at-the-money level can take the curve below zero at a
  strike, or let it fit one strike at more than one volatility; the note under the
  skew names those strikes.
- Presets are long-run typical values, flagged in the UI as "not market data".
- Every model here is lognormal, so **a price must be above zero**. A price, strike or
  size at or below zero, or a negative volatility, is refused with the reason beside
  the field, and a quote below zero — WTI settled at −37.63 in April 2020 — is reported
  rather than used. Negative prices would need a normal (Bachelier) model.
- Per-leg prices interpolate across the listed strip when it has been loaded, and
  otherwise fall back to the slope between two contracts. Either way the points are
  real quotes and everything between them is an estimate; past the last listed month
  it is an extrapolation, and the "Leg prices" source line says so. Contract expiries are
  approximated to mid-month. The payoff chart then shifts every month in proportion,
  so each month's basis to the reference stays fixed as the price moves. The
  position's delta and gamma follow the same move: they are per point of the panel's
  contract, while the legs table gives each leg's delta against its own month.
- American prices are a closed-form approximation, not an exact lattice. Measured
  against a 3000-step binomial tree over 300 contracts (both types, one month to
  two years, strikes 0.8–1.25 of spot, vol 15–60%, rates 2–8%), the error is a
  median of **0.008%** of the underlying and **0.58%** at its worst, on two-year
  60%-vol contracts. Ignoring early exercise entirely — the European setting —
  is wrong by up to **2.6%** over the same set. At zero or negative rates a put is never
  worth exercising early unless its carry is positive, nor a call unless its carry is
  negative, and both price exactly as European; where early exercise still pays at
  negative rates, the error stays under **0.4%** on two-year contracts.
- Max profit and max loss are searched on a grid up to four times the price, and further
  while an option outlives the horizon; whether one is unlimited is decided by how the
  position behaves as the price rises without bound. Between two grid points a curved
  P&L, as in a ratio calendar, can dip a little further than the grid finds: $12.84 at
  most on a −$24,768 loss, in 1,000 random American diagonals.
- The premium's interest runs from today, continuously compounded, since the tool has
  no trade date: a position opened earlier carries only what is still to come. A futures
  leg has no premium and carries none; under Black-Scholes an underlying leg stands for
  the physical, and the cost of funding it is not modelled. A scenario saved before
  financing existed opens with it set to None, so its numbers stay as they were.
- Yahoo's quote endpoint is undocumented: it can change without notice, and their
  terms do not grant redistribution rights. If it breaks, the app degrades to the
  Alpha Vantage path and manual entry.

## Files

- `index.html` — markup
- `styles.css` — styling, light and dark
- `commodities.js` — the table of markets: contract specs and ticks, presets and
  futures symbols. The page and the function both read it, so adding a market is one
  entry.
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

CI also runs ESLint's recommended rules over the code, at versions it installs itself so
that `package.json` stays free of dependencies; `CLAUDE.md` has the command to run it
by hand.

Opening `index.html` directly works too, but the `/api` buttons need a server, and
some browsers restrict cross-origin requests from `file://`.

### Tests

`node --test`, no framework:

- `test/pricing.test.js` — put-call parity in both models, a textbook reference
  value, all five greeks against finite differences, rho in each model's own
  convention even when BSM's carry is zero, theta and rho with no volatility left,
  equal to their limits just above it, implied-volatility round trips and none from a
  premium with no time value, the volatility estimators against a series of known
  volatility, curve interpolation and the carry inversion.
- `test/strategies.test.js` — closed-form limits for spreads, straddles, condors and
  butterflies, financed and nominal; bounded put payoffs; the rate an unlimited maximum
  grows at, a European calendar's against an American one's and a naked call's; the
  verdict decided where the price has no bound, in calendars whose far call is
  exercised far past the grid or never, a diagonal doing its worst past the grid, a far
  call with no exercise boundary searched past it all the same, legs on their own
  months and random American calendars against their own P&L; contract
  multipliers including cents-quoted markets; every preset and every commodity.
- `test/financing.test.js` — the premium's interest: a debit paying it and a credit
  earning it up to the date the P&L is read, a fairly priced option breaking even on
  average at the risk-free rate (by quadrature, a calendar's far leg included), a rate
  of your own or none, a futures leg carrying nothing, the chart's leg curves adding up
  to the position, what the page says in each mode, and old scenarios restoring nominal.
- `test/probability.test.js` — the probability of profit against closed forms, on
  either tail and between breakevens, a breakeven past the top of the statistics grid
  included, measured at the volatility of the option nearest the money at the
  horizon, and the summary naming that volatility.
- `test/skew.test.js` — the skew curve reproducing the 25-delta quotes it was built
  from, the wings under a butterfly, the clamp on an extreme risk reversal, every
  strike read where the curve and its delta agree, the note naming strikes a curve too
  steep to read, and the scenario grid's shape, ordering and response to volatility
  and time.
- `test/curve.test.js` — per-leg underlying prices: a flat curve reproducing the
  shared-price behaviour exactly, the payoff kink landing on the shared axis,
  contango raising a calendar spread, and the zero-price guards.
- `test/american.test.js` — an independent CRR binomial tree, and the
  Barone-Adesi-Whaley pricer checked against it: the approximation envelope, the
  no-arbitrage bounds, the early-exercise premium on both sides of a futures
  option, the exercise boundary, greeks by finite difference, the
  style-aware implied-volatility solver, negative rates: European exactly where the
  tree finds no early-exercise value, never below the European price anywhere, no
  premium where BAW finds no exercise boundary, and with no volatility, exercise on
  the best date — now, at expiry or in between — with that date's greeks.
- `test/leg-pricing.test.js` — every path that prices a leg agreeing with the others:
  the implied volatility of a leg's own premium is its own volatility, a position marked
  today at today's price shows no P&L, value and greeks report the same price,
  every net greek and greek profile is the matching derivative of the chart's P&L,
  with legs on other months and theta beside the premium's interest per day, the IV
  button writing nothing for a premium with no time value and the exact volatility
  for one with it, and volatility fields rounding what they show, not what is used.
- `test/restore.test.js` — the trust boundary for shared links, saved state and
  imported files: hostile fields rejected or retyped, ids never taken from the input,
  a legitimate scenario, its financing included, round-tripping unchanged, and the legs
  table escaping every value it renders.
- `test/inputs.test.js` — what a number may be: a price, strike or size above zero and
  a volatility not below it, refused in the panel, the legs table and a restored
  scenario, with the reason beside the field until the user's next action.
- `test/actions.test.js` — every market-data action against a fake network: the rate
  read off a real Treasury response, the price switching to cents on a `USX` quote, a
  quote below zero refused with the reason,
  the Alpha Vantage fallback, realised volatility kept as measured, the curve's
  convenience yield, leg prices from the slope
  and from the listed strip with their undo, all three reading one request for the
  curve, auto-fill carrying on past a failure, the
  presets, and every source line staying true: a price, rate, volatility or yield typed
  by hand is the user's own, and the month picker follows the price.
- `test/commodities.test.js` — the page and the function reading one table: the
  markets the page sends to the function are exactly those with futures data, every
  contract entry is in a form the function can build symbols from, and every market but
  custom gives its tick.
- `test/prices.test.js` — every price shown to its market's tick: the decimals per
  market and per quoting unit, the review's copper, gas, silver and gold premiums within
  half a tick, and the same decimals in the breakevens, the strike marks, the scenario
  grid, the month picker and every source line.
- `test/page.test.js` — the page's one third-party script: pinned by its hash, an
  exact version of a file the package publishes, and a Content-Security-Policy that
  allows that file and nothing broader.
- `test/chart.test.js` — what the payoff chart is given in every mode (the horizon,
  today and each leg; one series per greek profile; strike marks on the shared axis),
  the chart created once and updated in place, its colours read from the stylesheet
  in both schemes, and the page carrying on without Chart.js.
- `test/layers.test.js` — the calculations and actions never touching the page, the
  rendering never changing the state, the chart date kept within the horizon, and the
  listed strip: dropped with the commodity, never saved or shared.
- `test/storage.test.js` — the local-storage cache: expired entries removed, pruning
  that touches nothing but the cache, a full quota making room for the saved
  scenario instead of losing it, and the Alpha Vantage key forgotten when its field
  is emptied.
- `test/deploy.test.js` — `.vercelignore` keeping the notes, tests and tooling off the
  site without ever dropping a file the page or the market function needs.
- `test/privacy.test.js` — the privacy policy promising nothing the site does not do:
  no cookie banner it lacks, no "no cookies" while code sets one, ads described as
  inactive for as long as none load, and every third party the page may contact
  named.
- `test/api.test.js` — the serverless function with a mocked upstream: rejected
  commodities, method and action validation, series parsing, the two rules of the
  contract probe (skip the delivery month, skip contracts that have not traded
  recently), and `curve` being the first two contracts of that same probe.
- `test/loader.test.js` — the test loader handing over every top-level function in
  `app.js` without a list to keep, and the `const` bindings the tests read.

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
