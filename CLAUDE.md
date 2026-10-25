# Commodity Options Calculator

Static, dependency-free options calculator for commodity futures, plus one Vercel
serverless function for market data. No build step. `README.md` documents the tool
for users; this file covers what is easy to get wrong when changing it.

## Layout

| File | Role |
|---|---|
| `index.html` | markup only; every input has a stable `id` that `app.js` binds by hand |
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

**`npm test` must not name a directory.** `node --test test/` breaks on Node 22:
the runner resolves `test/` as a module and aborts before running anything. The
script is bare `node --test`, which uses the runner's own discovery. CI runs
Node 20 and 22 for exactly this reason.

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
path. Do not convert it to ESM or CommonJS, and do not wrap it in an IIFE. The tests
load it into a `vm` with a DOM stub and capture its `const` bindings through an
appended epilogue; if you add a top-level binding the tests need, add it to the
epilogue in `test/helpers/load-app.js`, or it will be invisible to the suite.

**One pricer, parameterised by cost of carry.** `gbs(kind, S, K, T, r, b, sigma)` is
generalised Black-Scholes-Merton: `b = 0` gives Black-76 on a futures price, `b = r - q`
gives BSM on spot. There is no separate Black-76 code path — an earlier version had
one and it was mispriced. Greek units are deliberate: vega per 1 vol point, theta per
calendar day, rho per 1 rate point. Keep any new pricer consistent with that.

**American exercise goes through Barone-Adesi-Whaley, not a lattice**, because the
payoff curve prices ~1200 grid points per leg. The exercise boundary and the premium
coefficient do not depend on the underlying, so `americanBoundary()` caches them per
`(kind, K, T, r, b, sigma)` and the grid sweep reuses them. BAW is an approximation:
`test/american.test.js` carries an independent CRR binomial tree and pins the two
together — reach for that tree when a price looks wrong. Accuracy is worst for
long-dated high-volatility contracts; the measured envelope is in that file.

`carryTracksRate()` exists because `b = 0` is both "Black-76" and a legitimate carry
value, and the rho bump has to tell them apart.

`legVolPct()` is the single place that decides what volatility a leg prices at: an
explicit per-leg number, else the skew curve, else the global figure. Anything that
needs a leg's volatility goes through it — the greek-profile chart drifted off it
once and silently ignored the skew.

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

**Legs may price off their own delivery month.** `leg.under` is that leg's own contract
price; `null` means the panel price. The chart sweeps **one** axis, so `legScenario()`
moves each month in proportion and `strikeOnAxis()` converts a strike into a point on
that shared axis. Anything that reasons about strikes against the price axis — grid
kinks, the stats range, the chart's strike marks — must use `strikeOnAxis()`, not
`leg.strike`. Getting this wrong puts the payoff kink in the wrong place and lets
`statsGrid()` miss a bound.

**Hoist per-leg work out of grid sweeps.** `legEntry()` prices an option, and under
American exercise that is eleven valuations. Calling it inside a 1200-point sweep once
made a redraw ~8× slower than it needed to be. Use `pnlEvaluator()`, which prepares the
legs once and returns the curve function. `strategyPnl()` is the un-prepared
convenience wrapper — fine for a single point, wrong inside a loop.

**`.grid` is the page layout class, not a table class.** `index.html` wraps the two
columns in `<div class="grid">` and `styles.css` gives it `display: grid` with fixed
template columns. Giving a table `class="grid"` makes it inherit that and splits
`thead` from `tbody` into separate blocks. The scenario table uses
`class="scenario"`. Check `styles.css` before reusing a short class name.

**Chart.js is the only CDN dependency and the only thing that can fail at load.**
`renderChartSafely()` isolates it: an ad blocker or CDN outage used to take out
everything after `renderChart()` in the render order — the scenario grid, the source
list and `persist()`, so the user also silently lost their saved state. Keep the chart
last-but-one and keep it wrapped.

**Table lookups from user-controlled keys must use `hasOwnProperty`.** State can arrive
from a shared link, and `CONTRACTS['__proto__']` resolves to `Object.prototype`, which
is truthy and slipped past the commodity whitelist once already.

**The API function takes a commodity key, never a raw symbol.** Symbols are built from
the `CONTRACTS` table inside the function. Keep it that way or the endpoint becomes an
open proxy. The curve endpoint also skips the current (delivery) month and any contract
that has not traded in seven days — both were real bugs that poisoned the implied carry.

**A price of zero must not reach `Math.log10`.** `strikeStep()` guards it. A half-typed
price field used to make every derived strike `NaN` and poison the whole curve.

**Never overwrite the field being typed in.** `setField()` skips
`document.activeElement`; without it, typing `4000.` ate the decimal point and moved
the caret. `renderLegs()` rebuilds the table body, so it saves and restores focus and
selection by leg id and field name.

**The legs table commits on blur, not per keystroke.** `legsBody` listens for `change`,
while the left-hand panel listens for `input`. That is deliberate: `renderLegs()`
rebuilds the whole tbody, so updating per keystroke fights with typing. A test that
types into a leg field and reads the result without blurring sees a stale value — that
is the design, not a bug.

**Saved scenarios and share links go through `snapshot()` / `restore()`.** When adding
a state field, add it to **both**, and decide explicitly what an old saved scenario
without the field should mean — `restore()` defaults the exercise style to European for
exactly that reason, so nobody's recorded numbers move under them.

## Verifying without a local toolchain

The owner's Windows machine has no working node, npx or python, so `npm test` cannot
run there. CI (`.github/workflows/test.yml`) runs the suite on every push. The repo is
public, so the Actions API is readable unauthenticated, but **log downloads require
admin rights (403)** — the workflow therefore re-emits failures as `::error::`
annotations, readable at `/repos/{owner}/{repo}/check-runs/{job_id}/annotations`.
Note the API returns pretty-printed JSON: patterns without spaces (`"status":"x"`)
will not match.

In a cloud environment with node, none of that applies — just run `npm test`.

**The tests run `app.js` in a `vm`, so its arrays are cross-realm.** They carry the
VM's `Array.prototype`, and `assert.deepStrictEqual` compares prototypes, so a
returned array never equals a literal. Wrap it: `Array.from(x)`.

**Fetch before trusting a local ref.** A cloud session's clone can be behind `origin`,
and `git log` then shows a stale head while `git cat-file` reports a perfectly real
commit as "not a valid object name". Run `git fetch --all` before concluding that
something is missing from the repo.

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
  before "fixing" it — dropping the single largest move and seeing how far the
  estimate falls distinguishes the two.
- **The listed strip** (`fn=months`) is the whole set of contracts that quote,
  nearest first. It lives in the module-level `contractMonths`, is **not persisted**
  (a stale strip in a shared link is worse than none), and is dropped whenever the
  commodity changes — otherwise the picker offers cocoa months while pricing gold.
- **Per-leg prices** interpolate log-linearly across that strip when it is loaded,
  and fall back to the two-contract slope (`fn=curve`) when it is not. Logs are the
  right space: the curve's shape is a carry rate, so the midpoint of a segment is the
  geometric mean of its ends. Outside the strip the nearest segment's slope is
  extended, which is still extrapolation but anchored on the two closest real quotes.
  The source line says which path ran and when it went past the last listed month.

## Known modelling limitations

- **American exercise is approximate.** BAW is a closed form, not an exact lattice.
  Measured against a 3000-step CRR tree over 300 contracts, the error is a median
  0.008% of the underlying and 0.58% at its worst, on two-year 60%-vol contracts.
  Switching to European prices early exercise at zero, which is wrong by up to 2.6%
  over the same set.
- **The curve moves in parallel.** Each leg can hold its own price, but the payoff
  chart shifts every month in proportion, so each month's basis to the reference stays
  fixed as the price moves. Real curves also change shape; that is not modelled.
- Volatility is a single number per leg unless the skew is on, in which case legs
  with a blank Vol take `skewVol()` — Malz's quadratic in the call's forward delta,
  fixed by the at-the-money level, the 25-delta risk reversal and the 25-delta
  butterfly. The curve is read **once**, at today's price and the leg's full tenor,
  and held as the scenario moves: sticky strike, not sticky delta. Real surfaces also
  move with spot; that is not modelled.
- Contract expiries in the curve endpoint are approximated to mid-month. Both
  contracts use the same convention, so the gap driving the carry stays accurate.

## Tone of the UI

Every market-data value shows its source and as-of date, and preset values are
labelled "not market data". Keep that honesty when adding inputs: this is a public
tool that people may price real positions against, and it carries a not-investment-
advice disclaimer. Say what a number actually is — the privacy policy and the
disclaimer are load-bearing, not decoration.
