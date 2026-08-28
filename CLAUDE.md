# Commodity Options Calculator

A static site plus one serverless function. It prices options on commodity
futures, builds multi-leg strategies and pulls real market data. **There is no
build step, and adding one would change how the site deploys.**

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The whole UI. Every input has a stable `id` that `app.js` binds by hand. |
| `app.js` | Pricing engine, strategies, market-data providers, rendering. One file, no modules. |
| `api/market.js` | Vercel function proxying Yahoo futures data. No dependencies. |
| `styles.css` | Responsive, with a dark-mode block. |
| `test/` | `node --test`, no framework. `test/helpers/load-app.js` runs `app.js` in a VM. |

## Traps

These have all bitten before. They are not hypothetical.

### `app.js` has no module system, on purpose

It is a plain browser script so the page still works from a `file://` path.
Do not add `import`/`export`, and do not wrap it in an IIFE — the test helper
reaches in through a VM epilogue that captures top-level `const` bindings by
name. **If you add a function the tests need, add it to the `EPILOGUE` list in
`test/helpers/load-app.js`,** or it will be invisible to the suite.

### Cents-quoted contracts

Corn, wheat, soybeans, sugar, coffee and cotton quote in **cents**, not
dollars. `dollarMultiplier()` applies the `0.01`. Copper quotes in USD per
pound despite the folklore — getting this wrong moved P&L by 100×, and it
shipped that way once. When adding a commodity, check the exchange's contract
spec for the quote unit, not just the contract size.

### `npm test` must not name a directory

`node --test test/` breaks on Node 22: the runner resolves `test/` as a module
and aborts before running anything. The script is bare `node --test`, which
uses the runner's own discovery. CI runs Node 20 and 22 for exactly this
reason.

### Do not add a `build` script to `package.json`

The absence of dependencies and of a build is what keeps Vercel treating this
as a static site with functions. Adding a `build` changes the deploy.

### The whitelist is checked with `hasOwnProperty`

State arrives from shared links, so keys like `__proto__` and `constructor`
would otherwise resolve to inherited objects and pass a truthiness check. See
`commodityMeta()` and the `STRATEGIES` lookup. The serverless function does
the same for its commodity table. Keep it that way.

### The stats grid is not the chart grid

`displayGrid()` is what you see; `statsGrid()` spans from ~0 to well past the
highest strike. Max profit, max loss and breakevens are computed on the
**stats** grid, because a long put's profit is capped at a price of zero and
that point is usually off the chart. Only the upside counts as unbounded.

### A price of zero must not reach `Math.log10`

`strikeStep()` guards it. A half-typed price field used to make every derived
strike `NaN` and poison the whole curve.

### Never overwrite the field being typed in

`setField()` skips `document.activeElement`. Without it, typing `4000.` ate the
decimal point and moved the caret. `renderLegs()` rebuilds the table body, so
it saves and restores focus and selection by leg id and field name.

### Hoist per-leg work out of grid sweeps

`legEntry()` prices an option, and under American exercise that is eleven
valuations. Calling it inside a 1200-point sweep once made a redraw ~8× slower
than it needed to be. Use `pnlEvaluator()`, which prepares the legs once and
returns the curve function. `strategyPnl()` is the un-prepared convenience
wrapper — fine for a single point, wrong inside a loop.

## Pricing

One generalised Black-Scholes-Merton pricer, parameterised by cost of carry:

- `b = 0` → Black-76 on a futures price (the default, and the market standard)
- `b = r − q` → Black-Scholes-Merton on spot with a convenience yield

American exercise uses **Barone-Adesi-Whaley**, not a lattice, because the
payoff curve prices ~1200 grid points per leg. The exercise boundary and the
premium coefficient do not depend on the underlying, so `americanBoundary()`
caches them per `(kind, K, T, r, b, sigma)` and the grid sweep reuses them.

BAW is an approximation. `test/american.test.js` carries an independent CRR
binomial tree and checks the two agree; that tree is the reference to reach for
when a price looks wrong. Accuracy degrades for long-dated near-the-money
options — see the tolerance and the comment in that file.

`carryTracksRate()` exists because `b = 0` is both "Black-76" and a legitimate
carry value, and the rho bump needs to tell them apart.

## Market data

- **Rate**: US Treasury daily par yield curve, interpolated to the expiry. No key.
- **Price / history / curve**: `/api/market`, which proxies Yahoo. The client
  sends a **commodity key, never a free-form symbol** — the function maps keys
  to symbols itself.
- **Volatility**: realised (historical), measured on the front-month futures.
  It is **not implied volatility**; Yahoo's option chains need a cookie/crumb
  handshake and return 401. Do not label it implied.
- **Convenience yield**: implied from two real contracts on the curve.

Realised volatility is measured on a continuous series, so **rollover gaps can
inflate it**. Before "fixing" a surprising number, check whether dropping the
single largest move collapses the estimate — that distinguishes a roll artefact
from a real move.

Yahoo is an undocumented endpoint. It can break without notice, and its terms
do not permit redistribution. The app degrades to Alpha Vantage or manual
entry; keep that fallback path alive.

## Commands

```bash
npm test        # the full suite
npm run dev     # static server on :3000, UI only
npx vercel dev  # also serves /api
```

## Conventions

- Greeks are returned in "natural" units: vega per 1 vol point, theta per
  calendar day, rho per 1 rate point. Keep any new pricer consistent with that.
- Saved scenarios and share links go through `snapshot()` / `restore()`. When
  adding a state field, add it to **both**, and decide explicitly what an old
  saved scenario without the field should mean — `restore()` defaults the
  exercise style to European for exactly that reason.
- User-visible text says what a number actually is. The privacy policy and the
  disclaimer are load-bearing, not decoration.
