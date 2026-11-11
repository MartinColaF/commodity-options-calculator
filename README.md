# commodity-options-calculator

Options calculator for commodity futures. Static site, no build step, no backend:
open `index.html` or serve the folder. In Spanish at `/es/`.

## What it does

- **Pricing** — generalised Black-Scholes-Merton with a cost-of-carry term:
  - `b = 0` → **Black-76**, options on futures (the market standard here).
  - `b = r - q` → **Black-Scholes-Merton** on spot with a convenience yield.
- **American exercise** — Barone-Adesi-Whaley, selectable per scenario and the
  default. Almost every listed commodity futures option is American, and with
  `b = 0` the early-exercise premium is real on calls and puts alike.
- **Greeks** — delta, gamma, vega, theta, rho, both per unit and in dollars for the
  position (contract size and cents-vs-dollars quoting are handled).
- **Markets** — 17 and a custom contract: gold, silver and copper; WTI, Brent and
  natural gas; corn, wheat and soybeans on CBOT; sugar, coffee, cocoa and cotton on ICE;
  live cattle; and soybeans, corn and wheat in Rosario, on A3 Mercados (MATba-ROFEX), in
  dollars a metric ton. The page reads no quote for Rosario: type the price from your
  screen. A3's contracts are 100 tons, its options American with a 10-cent tick; their
  premium is paid up front, as the page values it, and the exchange also settles daily
  differences on the intrinsic value, which the page does not model. Collections and
  payments are in pesos at A3's reference rate; the page shows dollars.
- **Prices to the tick** — every price shows as many decimals as the market's option
  tick: four for copper, three for gas, silver, cattle and the grains (an eighth of a
  cent), two elsewhere. Nothing on screen is rounded past a step the market trades in.
- **Multi-leg strategies** — any mix of calls, puts and the underlying. 19 presets.
  Five hedge a physical position, listed first and named for who holds it: a seller's
  price floor, collar and fence, a buyer's price cap and collar. The rest are for
  trading: spreads, straddles, butterflies, iron condor, calendar, ratio.
- **The size of the hedge** — type the quantity to hedge, in the physical trade's unit
  where the market has one (5,000 metric tons of soybeans) or the contract's own, and the
  page says how many contracts that is: 36.74, so 37 cover 5,034.88 t, 34.88 more, and 36
  cover 4,898.80 t, 101.20 less. A button puts either on the position: the physical leg,
  or the smallest, holds that many contracts and every included leg scales with it.
- **The strike that pays for the hedge** — pick the leg that pays, usually the option
  sold, and the cost the premiums should come to ($0 for a zero-cost collar), and the page
  finds its strike: for soybeans at 1050 ¢, the call that pays a 1000 put at 60 days and
  18% is 1104.89. Each strike is priced at its own volatility, the skew's when it is on.
  Given the interval strikes are listed at, it lands on the listed strike nearest the
  exact one that costs no more (1100, a credit of 1.17 ¢/bu), and it says when no strike
  of that leg can reach the cost.
- **The net price** — type the basis and the commissions, per unit in the price's own
  quote, and the results give the price the physical fetches, or costs, at the horizon:
  the futures price there, plus the basis, plus what the options make net of their
  premiums, less the commissions; for a buyer the options' result and the commissions
  turn sign. A seller reads a floor and a ceiling, a buyer a cap and a floor, in the
  price and in USD a ton where the market trades physically in tons: the 1000 put on
  soybeans at 1050 ¢, with a basis of −40 ¢ and a cent of commissions, floors the sale at
  947.80 ¢/bu, **348.26 USD/t**, read nominally as the extension services' sheets do, and at
  947.73 once the premium carries its interest. **Net price** on the chart draws it across
  prices, the floor and the ceiling marked. The physical is the position's underlying
  leg: long for whoever sells it, short for whoever buys it.
  Per-leg volatility (skew), per-leg expiry (calendars) and **per-leg underlying
  price** are supported: in a real commodity calendar each delivery month trades
  at its own price, and one button fills each leg from the listed futures curve.
- **Contract months** — load the listed strip for a commodity and price against one
  specific delivery month, which is what an option quote on a broker's screen refers
  to. The continuous front-month series stays the default. With the strip loaded, the
  per-leg fill interpolates between real quotes instead of extrapolating a single
  slope measured at the front of the curve. Picking a month of corn, wheat, soybeans,
  sugar, coffee, cocoa or cotton sets the days to expiry to its options' own, which stop
  trading before the future: December 2026 corn options on Nov 20, the future on Dec 14.
  Priced to mid-December, an at-the-money call on corn at 430 ¢ read 14.49 ¢ for 9.24,
  $262.38 a contract too dear. The note under the days says the date and whose word it is.
- **Payoff chart** — P&L at the nearest expiry plus a mark-to-market curve for any
  date in between, individual leg overlays, strike and spot markers. The same chart
  also plots the net price and delta / gamma / vega / theta profiles across underlying
  prices.
- **In physical terms** — under the price, grains, sugar, cotton and copper read in USD
  a ton, coffee in USD a 60-kg bag and cattle in USD a kilo of live weight, with the
  contract in the same unit: 5,000 bushels of soybeans are 136.08 tons. The greeks say
  the position's delta in futures contracts, and how many offset it.
- **Printed report** — Print or save as PDF gives the position, results, chart and
  scenarios with the assumptions, sources and disclaimer, light on paper whatever the
  screen's scheme, dated and linking back to the scenario.
- **Chart image** — a 1200×627 picture of the position for a post: the chart in the
  light palette beside the numbers the results card gives, each with what it rests on
  (the probability's volatility, an unlimited maximum's rate), and the site and date.
  On a phone it goes to the share sheet; elsewhere it is saved as a PNG.
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

The results also say how many scheduled reports come out by the horizon, and when, from
the calendar in `events.js`: USDA's WASDE for corn, wheat, soybeans and cotton; EIA's
Weekly Petroleum Status Report for WTI and Brent, and its Weekly Natural Gas Storage
Report for natural gas. Past the calendar's last date, the line says it ends there rather
than count none.

When the options on a listed month stop trading comes from `expiries.js`: ICE Futures
U.S. lists the dates for sugar, coffee, cocoa and cotton on each option's expiry page,
and they are as it lists them; CME's calendar pages refuse automated reading, so the
CBOT grains are worked out from their rule (the last Friday at least two business days
before the last business day of the month before) on the US exchange holidays NYSE
published for 2026 to 2028. Gold, silver, copper, crude, natural gas and cattle have no
calendar here yet, and keep the days you type.

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
  The days to an option's expiry are its own only where `expiries.js` has its market,
  and only for the regular option on each month: weekly, short-dated and serial options
  keep their own calendars.
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
- The net price holds the basis fixed, while in the market it moves too. It reads the
  physical off the underlying legs, so with underlying legs on both sides, a physical
  against a futures hedge, the page cannot tell which is which and shows no net price.
- Yahoo's quote endpoint is undocumented: it can change without notice, and their
  terms do not grant redistribution rights. If it breaks, the app degrades to the
  Alpha Vantage path and manual entry.

## Files

- `index.html` — markup
- `styles.css` — styling, light and dark
- `commodities.js` — the table of markets: contract specs and ticks, presets and
  futures symbols. The page and the function both read it, so adding a market is one
  entry.
- `sitemap.xml`, `robots.txt` — every page for search engines, at its canonical address
  with its translation, and the crawl rules that name the sitemap
- `expiries.js` — when the options on each listed month stop trading: ICE's published
  dates for its softs, and CBOT's rule for the grains with the US exchange holidays to
  2028. ICE lists new months as they open; add them, and each new year's holidays.
- `events.js` — the calendar of scheduled reports: USDA's WASDE dates for 2026 and
  2027, and EIA's two weekly reports for 2026. USDA publishes each next year's dates in
  the autumn, and EIA its holiday changes late in the year; add them when they do.
- `app.js` — pricing engine, strategy analytics, data providers, rendering
- `api/market.js` — serverless futures data proxy (Vercel)
- `privacy.html` — privacy policy
- `analytics.js` — visit counting with Vercel Web Analytics: page views only, no
  cookies, and never the scenario a shared link carries after `#`
- `i18n.js` — `t()`, through which `app.js` writes every word, keyed by its English text
- `es/` — the Spanish page, its words (`words.js`), the policy in Spanish and its
  preview image

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
- `test/print.test.js` — the printed report: no controls, the light palette in step
  with the screen's, and the date and the scenario's link at the top.
- `test/expiry.test.js` — the options' expiries: ICE's dates as it lists them, sugar's
  against its rule, the holidays against NYSE's and ICE's calendars, the CBOT rule on
  the review's December corn and the dates StoneX reports, Christmas on a Friday and a
  leap February, the days counted in the exchange's time zone, the legs that follow, the
  note when a month has no date, and Spanish.
- `test/seo.test.js` — what search engines read: the Search Console tag on both home
  pages, the sitemap against each page's canonical and translation tags, and the
  crawl rules.
- `test/latam.test.js` — Rosario's grains: A3's contract size, unit and tick, no feed
  and no month to look up, a hedge in tons in whole contracts, Auto-fill taking the rate
  and saying once why the rest stays typed, and Spanish.
- `test/reports.test.js` — the reports line: USDA's WASDE dates at 12:00 in
  Washington, EIA's weekly reports by its rule and its holiday changes, which markets
  follow which, a report counted until the minute it comes out, and the line past the
  end of the calendar, all at a date the test sets.
- `test/share-image.test.js` — the chart image: the numbers the results card shows,
  laid out clear of the chart at its own proportions, the chart drawn in the light
  palette at once even while an animation runs, and the share sheet, the download and
  the reasons there is no picture.
- `test/hedging.test.js` — the hedging presets: listed first under their heading,
  the physical held by a seller and to be bought by a buyer, and a floor or a cap
  bounding what each can lose.
- `test/hedge-size.test.js` — the size of the hedge: each market's unit and contract,
  the product review's 5,000 tons of soybeans, a whole number of contracts and less than
  one, the legs scaled with a ratio's shape, the field refused and cleared, the quantity
  kept across markets in the same unit, saved and shared, in both languages.
- `test/net-price.test.js` — the net price: the product review's soybean floor, nominal
  and financed, a collar's band and a buyer's cap, the curve against its sum, the reasons
  there is none, the results and the chart with its floor and ceiling, the fields refused
  and cleared, the basis dropped with the market and absent from an older scenario, in
  both languages.
- `test/pay-strike.test.js` — the strike that pays for the hedge: the product review's
  soybean collar exactly and on a 5 ¢ grid, a target other than zero, the skew moving the
  strike, the entries kept and dropped, the reason when no strike reaches the cost, the
  leg choice and the button's refusals, in both languages.
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
  option, the exercise boundary, greeks by finite difference, theta as the price's
  rate of change, the style-aware implied-volatility solver, negative rates: European
  exactly where the tree finds no early-exercise value, never below the European price
  anywhere, no premium where BAW finds no exercise boundary, and with no volatility,
  exercise on the best date — now, at expiry or in between — with that date's greeks.
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
  inactive for as long as none load, every third party the page may contact
  named, and visit counting described as every page does it.
- `test/physical.test.js` — the physical units: each factor from the legal weights,
  the line under the price in both languages, and the delta in futures contracts.
- `test/analytics.test.js` — visit counting: the address sent without what follows
  `#`, Vercel's own script loaded from the site, and nothing loaded from a file or
  the dev server.
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
