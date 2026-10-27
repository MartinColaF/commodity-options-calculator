# Commodity Options Calculator

Static, dependency-free options calculator for commodity futures, plus one Vercel
serverless function for market data. No build step. `README.md` documents the tool
for users; this file covers what is easy to get wrong when changing it.

## Layout

| File | Role |
|---|---|
| `index.html` | markup only; every input has a stable `id` that `app.js` binds by hand |
| `styles.css` | light/dark theming via CSS variables, the chart's colours included |
| `commodities.js` | the one table of markets, read by the page and by the function |
| `app.js` | pricing engine, strategy analytics, data providers, rendering |
| `api/market.js` | serverless futures-data proxy (Vercel) |
| `test/` | `node --test` suite, no framework |
| `scripts/serve.js` | dependency-free dev server |

## Commands

```bash
npm test        # full suite
npm run dev     # static server on :3000 (UI only, no /api)
npx vercel dev  # also serves the /api functions

# lint: the versions CI pins, installed without touching package.json
npm install --no-save --no-package-lock eslint@10.12.0 @eslint/js@10.0.1 globals@17.13.0
npx eslint .
```

**ESLint runs in CI, not from `package.json`.** The `lint` job installs exact versions
itself, because the project has no dependencies on purpose (see Deployment). The rules
are ESLint's recommended set, which looks for mistakes, not style; nothing formats the
code. `eslint.config.mjs` is kept off the site by `.vercelignore`.

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

`.vercelignore` keeps the notes, tests and tooling (`CLAUDE.md`, `test/`, `scripts/`,
`.github/`, `eslint.config.mjs`) off the public site, which served all of them. It lists root-anchored paths
only; `test/deploy.test.js` fails if it ever drops a file `index.html` loads or the
market function needs, so a new top-level file the site uses cannot vanish from
production unnoticed.

No server-side environment variables are needed. The optional Alpha Vantage key is
the user's own and lives only in their browser's local storage — never commit a key.

## Things that are easy to break

**The page's scripts are ES2017.** `eslint.config.mjs` parses `app.js` and
`commodities.js` at that level, so newer syntax — `?.`, `??`, `catch` without a binding —
fails the lint. A script that fails to parse takes the whole calculator down on a
browser that lacks the syntax, not just one feature. Raising the level is a decision
about which browsers to drop; make it on purpose, in the config.

**`app.js` has no module system on purpose** so the page still works from a `file://`
path. Do not convert it to ESM or CommonJS, and do not wrap it in an IIFE. The tests
load it into a `vm` with a DOM stub. Every top-level `function` reaches them on its
own: a function declaration becomes a property of the `vm`'s global object, and the
loader hands over all of them. `const` and `let` do not, so the few the tests read are
captured through an appended epilogue in `test/helpers/load-app.js`; a test that needs
another one adds it there, or it will be invisible to the suite. The epilogue used to
list every function too, 81 names by hand. `test/loader.test.js` checks that every
function `app.js` declares arrives.

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
**BAW is not asked where early exercise is worth nothing**, because it adds a premium
anyway: a call with carry at least both the rate and zero, and a put with rate and carry
both at most zero, return the European price — one rule, mapped across by put-call
symmetry. The zeros only matter at negative rates, where the put's half was missing and
the call's stopped at `b >= r`. Below zero BAW can also put its boundary on the wrong
side of the price, so past the boundary the price is floored at the European one as well
as the intrinsic; it once returned 0 for a put the European formula values at 15.18.

`carryTracksRate()` exists because `b = 0` is both "Black-76" and a legitimate carry
value, and rho has to tell them apart. Both rhos take it as `bTracksRate`: the American
bump and `gbs()`'s closed form, which `priceOption()` hands it to. `gbs()` used to guess
from `b`, and a BSM call whose yield equalled its rate got Black-76's rho, −0.0414
instead of +0.2244. Left out, the flag means the carry is fixed.

`legPricingInputs()` is the single place that assembles what a pricer needs for one
leg — its own underlying, strike, time, rate, carry, volatility and exercise style.
**Every path that prices a leg goes through it**: `legValue`, `legGreeks`, the P&L
sweep in `pnlEvaluator`, the chart's greek profile and the IV solver
(`legImpliedVol`). Never assemble `(S, K, T, r, b, sigma, style)` by hand. They used to
be assembled in four places, and the IV button drifted: it solved against the panel
price instead of the leg's own delivery month, returning 52.74% for a leg priced at 30%
and writing that back into the leg. `test/leg-pricing.test.js` pins the paths together.

Without a scenario price it prices the leg **today**, at `legUnder(leg)` — not
`legScenario(leg, state.S)`, which differs when the panel price is zero. In
`pnlEvaluator` the inputs are resolved once per leg and only `S` and `T` are written per
grid point, which keeps the sweep hoisted.

`legVolPct()` is the single place that decides what volatility a leg prices at: an
explicit per-leg number, else the skew curve, else the global figure.
`legPricingInputs()` calls it, so nothing else needs to — the greek-profile chart once
bypassed it and silently ignored the skew.

**The skew is read by bisection on delta, and cached.** `skewVol()` finds the delta whose
volatility on the curve gives that same delta back. That difference starts at or above
zero and ends at or below it, so bisection always finds such a point; the fixed-point
iteration it replaced could stop over a tenth of a point off on steep wings — 180 of
40,000 surfaces — and say nothing. Sixty steps cost several times the old solve, and the
chart's leg curves read each leg's skew at every grid point, so `skewVol()` caches by its
inputs (`skewCache`): skew-on redraws got faster, not slower. A curve steeper than its
at-the-money level can go below zero at a strike or fit it at more than one volatility;
`skewProblem()` says which, and `skewWarning()` names those strikes under the skew note.

**No volatility is implied from a premium without time value.** Within `NO_TIME_VALUE` —
a millionth of the underlying — of the option's value at zero volatility, every
volatility up to some level gives the same premium, so `impliedVol()` returns NaN. It
used to return wherever the solver stopped, its 30% starting point or its 0.01% floor,
and the IV button wrote that into the leg as implied. The button now writes nothing and
says why, telling that apart from a premium no volatility reaches with
`legNoTimeValue()`. The line sits a hundred times above where the solver was measured to
go wrong, and far under one tick of time value in every market here.

**Dollar multiplier = `size × (quote === 'cents' ? 0.01 : 1)`.** Getting the quoting
convention wrong rescales the whole position P&L by 100. Grains and softs quote in
cents; **copper quotes in USD per pound**, which is a trap because CME describes it in
cents. Yahoo reports `USX` for cents-quoted contracts and the client trusts that over
the local table.

**A price shows as many decimals as its market's tick.** `priceDp()` takes them from the
`tick` in `commodities.js` — the smallest step an option premium moves in, 1/8 of a cent
for the grains — two more when a cent-quoted market is switched to dollars, two fewer the
other way, and never fewer than two; a custom contract shows five significant figures of
its price. Every price on the page goes through `fmtPrice()`: the legs table, the
breakevens, the scenario grid, the chart's labels and every source line. They all used to
show two decimals, so a 30-day copper call worth 0.04204 read 0.04, $50.98 a contract
short, and a 4.70 strike was marked "K 5". A new market needs its tick, and a new place
that shows a price uses `fmtPrice()`; `test/prices.test.js` pins both.

**Strategy statistics use an economic price grid, not the chart window.** `analyse()`
scans from a price near zero to well past the highest strike. That is why a long put
reports a bounded maximum profit and a short put a bounded loss: the underlying cannot
go below zero. Only the upside is ever "unlimited". Reusing the chart's zoom range
here silently produces wrong maxima.

**The horizon is the nearest expiry among active legs**, which is what makes calendar
spreads read correctly — the far leg still holds time value there.

**The probability of profit is measured at the position's own volatility.**
`horizonVol()` takes the explicit volatility of the option nearest the money among those
expiring at the horizon — what the IV button writes — and otherwise the panel's, which is
also the skew's at-the-money level. It used to be the panel's always, so a call priced at
its own 40% reported 14.5% instead of 28.7%. `analyse()` integrates the lognormal
between the exact points where the P&L crosses zero, interpolated as the breakevens are;
cell by cell, a bull call spread read 37.01% against an exact 37.76%. The summary says
which volatility it used. `test/probability.test.js` pins both against closed forms.

**Legs may price off their own delivery month.** `leg.under` is that leg's own contract
price; `null` means the panel price. The chart sweeps **one** axis, so `legScenario()`
moves each month in proportion and `strikeOnAxis()` converts a strike into a point on
that shared axis. Anything that reasons about strikes against the price axis — grid
kinks, the stats range, the chart's strike marks — must use `strikeOnAxis()`, not
`leg.strike`. Getting this wrong puts the payoff kink in the wrong place and lets
`statsGrid()` miss a bound. **Greeks follow the same axis.** A leg's month moves
`legRatio()` points per point of the reference, so anything that adds deltas or gammas
across legs — the greeks table, the chart's greek profiles — adds `legAxisGreeks()`,
which scales delta by the ratio and gamma by its square. `legGreeks()` stays on the leg's
own month: that is the legs table's Delta column, and what a desk hedges that leg with.
Added unscaled, a call calendar with its months 2.5% apart showed $0.49 of delta beside a
chart sloping $1.78 per $1. `test/leg-pricing.test.js` pins every net greek and every
profile to the matching derivative of the chart's P&L.

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
last-but-one and keep it wrapped — including the theme-change listener, which once called
`renderChart()` bare and threw on every switch between light and dark.

**The chart is created once and updated in place.** `chartConfig(a)` builds everything
Chart.js is given and is pure, so `test/chart.test.js` checks the series without a
canvas. `renderChart()` makes the chart on the first render and afterwards swaps in the
new datasets and options and calls `update('none')`. Destroying and re-creating it on
every render cost 75–85% of each render — 25 to 45 ms a keystroke — and replayed the
entry animation; the in-place update draws pixel-identical charts. Input events
(typing, the sliders) call `scheduleRender()`, which draws once per animation frame
however many events arrived; clicks and selects still call `renderAll()` directly. Time
renders before and after anything that touches this path: the pricing is 1–2 ms of
it, so a slow redraw is nearly always Chart.js work.

**The chart's colours live in `styles.css`**, as the `--chart-*` variables, set once in
`:root` and again in the dark block. `themeColors()` reads them with `getComputedStyle`;
the test loader serves the same variables from `styles.css`, for either scheme
(`loadApp({ scheme: 'dark' })`). A new chart colour goes in **both** blocks, or the dark
chart quietly takes the light one — `test/chart.test.js` fails when it does. They used
to be written out in `app.js` as well, where nothing kept them in step with the page.

**Chart.js is pinned by Subresource Integrity, and the CSP names that one file.** The
script runs on the origin that holds the user's Alpha Vantage key, so the browser
refuses it unless its bytes match the `integrity` hash; a mismatch looks like a CDN
outage and `renderChartSafely()` handles it. Load the file the package **publishes**
(`dist/chart.umd.js`, already minified), never `chart.umd.min.js`: Chart.js does not
ship that one, so jsDelivr generates it on request, and its header says not to pin a
hash on it. `script-src` lists the exact URL rather than `https://cdn.jsdelivr.net`,
because jsDelivr serves every package on npm and the bare host would allow anyone's
script. `test/page.test.js` pins all of this. To upgrade:

1. Change the version in the `<script src>` **and** in `script-src`.
2. Fetch the file from the npm tarball (`registry.npmjs.org/chart.js/-/chart.js-X.Y.Z.tgz`,
   checked against the registry's `dist.integrity`) and confirm the CDN copy is
   byte-identical — the hash should come from what the package published, not from
   whatever the CDN served.
3. `openssl dgst -sha384 -binary chart.umd.js | base64` gives the new `integrity`.
4. Load the page and check that the chart draws. A wrong hash raises no error on the
   page; the chart is simply replaced by the "chart unavailable" note.

**Table lookups from user-controlled keys must use `hasOwnProperty`.** State can arrive
from a shared link, and `CONTRACTS['__proto__']` resolves to `Object.prototype`, which
is truthy and slipped past the commodity whitelist once already.

**`restore()` is the trust boundary.** It takes state from a shared link, from
`localStorage` and from an imported file, all of which someone other than the user can
write. Nothing is copied across as-is: every field is rebuilt from a whitelist with its
type checked (`isNum`, `pick`, `sanitizeLeg`), and a leg's `id` is **never** taken from
the input. This was a live XSS: a link carried a strike of `"><img onerror=…>` into the
legs table, on the same origin that holds the user's Alpha Vantage key. The checks are
strict on purpose — `snapshot()` only ever writes numbers, so a numeric-looking string
can only come from a tampered link.

**`legRowHtml()` escapes every value it interpolates**, even though `restore()` already
guarantees numbers: it is where the markup is built, and it should not depend on every
source of a leg getting its types right. It is a pure function so the escaping is tested.
Any new `innerHTML` that interpolates state needs the same `escapeHtml` treatment.

**`index.html` carries a Content-Security-Policy.** No inline script runs, so an
`onerror=` that slipped past escaping is refused. **Update it whenever an external script
or `fetch` origin is added** — the AdSense script the privacy policy mentions, say —
or the browser blocks it silently and the feature just doesn't work. `style-src` allows
`'unsafe-inline'` because the markup and the scenario shading use `style=` attributes.
`file:` keeps the page working when opened from disk, and is inert on https.

**The API function takes a commodity key, never a raw symbol.** Symbols are built from
each market's `futures` entry in `commodities.js`. Keep it that way or the endpoint
becomes an open proxy. The contract probe behind `months` and `curve` also skips the
current (delivery) month and any contract that has not traded in seven days — both were
real bugs that poisoned the implied carry.

**`commodities.js` is the only place a market is defined.** It used to be three lists in
two shapes — the page's table, the page's list of markets the function serves, and the
function's contracts — and the second one was a literal: forgetting to extend it made the
data buttons fail with "no futures contract mapped", and no test noticed. Now the page
derives that list from the table, the function `require`s the same file, and adding a
market is **one entry**. The file is a plain script with a guarded `module.exports`, so
it works as a browser global (from `file://` too) and as a Node module. Keep it that
way, not ESM. `index.html` must load it **before** `app.js`, which reads it at load
time, and the test loader does the same. Vercel's file tracer bundles it with the
function because of the `require`, so do not read it with `fs`, which the tracer may
miss. `test/commodities.test.js` pins the page and the function to the table.

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

**`inputProblem()` is the one rule for what a number may be.** A price, strike or size
must be above zero and a volatility not below it; any other key only has to be a number,
since a rate or a yield may be negative. The panel, the legs table, `restore()` and the
quote all ask it. Nothing checked before, and a price of −100 valued a 4000 put at
4086.54. A refused number never reaches `state`: the field goes back to the value in use
and the reason appears beside it, in `spotProblem`, `volProblem`, `sizeProblem` or
`legProblem` — not on the status line, which sits a card away, out of sight. The reason
lasts until the user's next edit, choice or button anywhere: a capture-phase listener on
the document clears it before that action's own handler runs, so a refusal can set it
again. Kept any longer, it would say "Still using 100" under the 1000 a new market set.
A new input with a range goes through `inputProblem()` and gets its own reason element.
`test/inputs.test.js` drives the page through `wired()` in the test loader, which runs
listeners in the page's capture and bubble order.

**Three layers, one direction.** The calculations (§1–§6) and the actions (§9) change
`state` and never touch the page or ask for a redraw; the rendering (§7) draws `state` and
never changes it; only the wiring (§10) reads the page, calls an action and then renders.
Anything a change leaves out of bounds — the chart date past a horizon that moved — is put
back by `normalizeState()`, which `renderAll()` runs first. All three rules were broken
once: `renderResults()` clipped the chart date, `renderMonths()` dropped the picked month,
and `applyStrategy()` redrew the page. `test/layers.test.js` scans the sections for both
rules, and the test loader no longer stubs `renderAll`, so a calculation that tried to
draw would throw in its own test.

**The market-data actions never touch the page.** Each `apply*` in §9 takes what it
needs as arguments, updates `state` and returns `{ message, … }`. Only the wiring in §10
reads the page's inputs (`volInputs()`) and writes back what an action returned:
`showResult()` puts the curve's two contracts into the manual carry boxes, and
`renderMonths()` draws the picker after `loadContractMonths()`. They used to read and
write the DOM directly, so none of them could run under the tests and none had one;
`test/actions.test.js` now runs every one against a fake network (`loadApp({ fetch })`).
For the same reason the Treasury feed is read by `parseTreasuryXml()` with patterns, not
`DOMParser`, which Node lacks; `test/fixtures/` holds a real response. When an action
needs a new input, pass it in; when it shows something outside `state`, return it.

**A source line must describe the number on screen.** The reference price changes only
through `setReferencePrice(S, source, month)`, so the price, the listed month it belongs
to and its source line move together. Fetching the front month used to leave "Cocoa Mar
27" picked, and a price typed by hand kept that month's quote as its source. A number
typed into price, rate, volatility or yield goes through `typeMarketInput()` and becomes
the user's own (`null` source); `renderInputs()` keeps the picker on `state.contractMonth`.
Leg prices from the curve have **their own** line, `state.sources.legs`, shown only while
the fill is on the legs, so `clearLegPrices()` has nothing to restore. When one line
served both, undoing a fill restored whatever the price line said before it, even after
the price had changed. A leg price typed over a fill marks that line "edited by hand
since" (`typeLegPrice()`). Any new market input needs the same treatment.

**localStorage holds three things: the saved scenario, the Alpha Vantage key and the
response cache (`coc.cache.*`).** The cache must not crowd out the scenario: an entry read
past its TTL is removed, `init()` prunes everything older than `CACHE_MAX_AGE` (keep that
at least the longest TTL any caller uses), and if `persist()` hits the quota it clears
the cache and tries again. The Alpha Vantage key goes through `storeAvKey()` alone: kept once it is used,
removed when the field is emptied. It used to be written and never removed, so a cleared
field filled itself in again on the next visit. `snapshot()` leaves it out, so it is never
in a share link or an export. `pruneCache()` lists the keys before removing any, because in
Chrome removing an item reorders the rest and an index walk skipped entries.
`test/storage.test.js` simulates that reordering.

**Saved scenarios and share links go through `snapshot()` / `restore()`.** When adding
a state field, add it to **both** — in `restore()` with its type checked, never copied
raw — and decide explicitly what an old saved scenario without the field should mean.
`restore()` defaults the exercise style to European for exactly that reason, so nobody's
recorded numbers move under them. `test/restore.test.js` round-trips a full scenario;
extend it when the field is new.

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

- **Risk-free rate**: US Treasury daily par yield curve, CORS-enabled, no key. The curve
  is quoted on a **semi-annual bond-equivalent** basis, so `rateForTenor()` converts with
  `r = 2 ln(1 + y/2)`. It used to read it as annual, `ln(1 + y)`, which understated every
  rate by about y²/4 — 4 bp at 4% — and `test/pricing.test.js` pinned the wrong formula.
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
  nearest first. It lives in `state.session.strip`, is **not persisted** — `snapshot()`
  leaves `state.session` out and `restore()` never reads it, since a stale strip in a
  shared link is worse than none — and `changeCommodity()` drops it, otherwise the
  picker offers cocoa months while pricing gold. Reloading it drops a picked month the
  new strip no longer lists, in `loadContractMonths()`.
- **One request for the whole curve.** The picker, the Yield button and the
  two-contract leg fill all read `fn=months`, through `listedContracts()`; the last two
  take its two nearest contracts from `nearestContracts()`. They share one request, one
  cache entry and one set of quotes, so the carry is measured on the months the picker
  lists. Asking for `curve` and `months` separately probed up to 19 overlapping
  contracts upstream under two cache keys. The function still answers `fn=curve`, as the
  first two contracts of the same probe, for a page loaded before the change; the page
  itself never asks for it.
- **Per-leg prices** interpolate log-linearly across that strip when it is loaded,
  and fall back to the slope between its two nearest contracts when it is not. Logs
  are the right space: the curve's shape is a carry rate, so the midpoint of a segment
  is the geometric mean of its ends. Outside the strip the nearest segment's slope is
  extended, which is still extrapolation but anchored on the two closest real quotes.
  The "Leg prices" source line says which path ran and when it went past the last
  listed month.
- **Two contracts are read through `contractGapDays()` and `logSlope()` only.** The
  Yield button (via `impliedConvenienceYield()`) and the two-contract leg fill each used
  to carry their own copy of both formulas. Now the carry one reports is the slope the
  other prices along; `test/actions.test.js` checks `slope = r − y` across the two.
  Moving to real expiry dates is a change to `contractGapDays()` alone.

## Known modelling limitations

- **American exercise is approximate.** BAW is a closed form, not an exact lattice.
  Measured against a 3000-step CRR tree over 300 contracts, the error is a median
  0.008% of the underlying and 0.58% at its worst, on two-year 60%-vol contracts.
  Switching to European prices early exercise at zero, which is wrong by up to 2.6%
  over the same set. At negative rates, where early exercise is still worth something
  (a put with positive carry, a call with carry below zero), BAW is off the tree by up
  to 0.39% of the underlying on two-year contracts.
- **The curve moves in parallel.** Each leg can hold its own price, but the payoff
  chart shifts every month in proportion, so each month's basis to the reference stays
  fixed as the price moves. Real curves also change shape; that is not modelled.
- Volatility is a single number per leg unless the skew is on, in which case legs
  with a blank Vol take `skewVol()` — Malz's quadratic in the call's forward delta,
  fixed by the at-the-money level, the 25-delta risk reversal and the 25-delta
  butterfly. The curve is read **once**, at today's price and the leg's full tenor,
  and held as the scenario moves: sticky strike, not sticky delta. Real surfaces also
  move with spot; that is not modelled. A wing steeper than the at-the-money level is
  outside what the curve can read; the page says so rather than guessing.
- Contract expiries from the function are approximated to mid-month. Both
  contracts use the same convention, so the gap driving the carry stays accurate.
- **Prices must be above zero.** Black-76, Black-Scholes-Merton and BAW are all
  lognormal, so a price at or below zero cannot be priced: it is refused, a quote
  included — WTI settled at −37.63 in April 2020. Pricing one would take a normal
  (Bachelier) model.

## Before switching on ads

The owner plans to show Google AdSense ads. Today `index.html` carries only the
account's verification meta tag: no ad script loads, the site sets no cookies, and
`privacy.html` says so in sections 1 to 3. `test/privacy.test.js` fails the moment an
AdSense script appears without the policy changing. Switching ads on takes all of this:

1. **A certified consent banner (CMP)** for visitors from the EEA, the UK and
   Switzerland. Google requires one there before it serves ads.
2. **The Content-Security-Policy** in `index.html`: AdSense needs script, frame and
   connect origins that `test/page.test.js` will flag. Its scripts cannot carry an
   `integrity` hash because Google changes them, so that test needs a deliberate,
   commented exception, not a loosened rule.
3. **`privacy.html`, sections 1 to 3**, rewritten to say ads are on, with a new
   effective date. The policy once promised a cookie banner the site never had.

## Tone of the UI

Every market-data value shows its source and as-of date, and preset values are
labelled "not market data". Keep that honesty when adding inputs: this is a public
tool that people may price real positions against, and it carries a not-investment-
advice disclaimer. Say what a number actually is — the privacy policy and the
disclaimer are load-bearing, not decoration.
