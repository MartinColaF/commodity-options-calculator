# commodity-options-calculator

Options calculator for commodity futures. Static site, no build step, no backend:
open `index.html` or serve the folder.

## What it does

- **Pricing** — generalised Black-Scholes-Merton with a cost-of-carry term:
  - `b = 0` → **Black-76**, options on futures (the market standard here).
  - `b = r - q` → **Black-Scholes-Merton** on spot with a convenience yield.
- **Greeks** — delta, gamma, vega, theta, rho, both per unit and in dollars for the
  position (contract size and cents-vs-dollars quoting are handled).
- **Multi-leg strategies** — any mix of calls, puts and the underlying. 16 presets
  (spreads, straddles, butterflies, iron condor, collar, calendar, ratio).
  Per-leg volatility (skew) and per-leg expiry (calendars) are supported.
- **Payoff chart** — P&L at the nearest expiry plus a mark-to-market curve for any
  date in between, individual leg overlays, strike and spot markers. The same chart
  also plots delta / gamma / vega / theta profiles across underlying prices.
- **Analytics** — net debit or credit, max profit, max loss, all breakevens, and the
  risk-neutral probability of profit.
- **Implied volatility** — type the premium you paid in the Entry column, press `IV`.
- **Share and save** — inputs persist in local storage, plus a shareable URL and
  JSON export/import.

## Market data

One button fills all four inputs for the selected commodity; each field reports its
own source and anything that fails is left untouched.

| Input | Source | Key needed |
|---|---|---|
| Futures price | Front-month contract (`GC=F`, `CL=F`, `ZC=F`…) via `/api/market` | no |
| Risk-free rate | US Treasury daily par yield curve, interpolated to your expiry and converted to a continuously compounded rate | no |
| Volatility | Realised volatility (close-to-close, EWMA, Parkinson) on the futures series itself | no |
| Convenience yield | Implied by the real curve from two listed contracts: `y = r − ln(F2/F1)/(T2−T1)` | no |
| *Fallback* | Alpha Vantage ETF proxies, for custom tickers or if the function is down | free key |

### The `/api/market` function

Yahoo Finance sends no CORS headers, so the browser cannot read it directly. The
serverless function in [`api/market.js`](api/market.js) makes that request instead.

- The client sends a **commodity key, never a raw symbol**; every symbol is built
  from a table inside the function. That keeps it from being usable as an open proxy.
- Responses are cached at Vercel's edge (`s-maxage`: quotes 5 min, history and curve
  1 h) and again in the browser, so upstream sees very little traffic.
- It only exists on the deployed site. Opening the page locally, the buttons say so
  and fall back to Alpha Vantage or your manual values.
- Contract months per commodity are listed in `CONTRACTS`; the curve endpoint probes
  the next listed contracts and keeps the first two that quote.

Notes and limitations, stated plainly in the UI as well:

- Realised volatility is **historical, not implied**. Yahoo's options chains need a
  cookie/crumb handshake and return 401 without it, so real implied vol is not
  available here.
- Volatility is measured on the front-month continuous series, where **roll gaps can
  inflate the estimate** slightly.
- Contract expiries in the curve endpoint are approximated to mid-month. Both
  contracts use the same convention, so the *gap* driving the carry stays accurate.
- Presets are long-run typical values, flagged in the UI as "not market data".
- Models assume European exercise; most commodity futures options are American, so
  early exercise value is not captured.
- Yahoo's quote endpoint is undocumented: it can change without notice, and their
  terms do not grant redistribution rights. If it breaks, the app degrades to the
  Alpha Vantage path and manual entry.

## Files

- `index.html` — markup
- `styles.css` — styling, light and dark
- `app.js` — pricing engine, strategy analytics, data providers, rendering
- `api/market.js` — serverless futures data proxy (Vercel)
- `privacy.html` — privacy policy

## Development

There is nothing to install. To run it locally with the market-data buttons working,
serve the folder over HTTP (opening the file directly also works, but some browsers
restrict cross-origin requests from `file://`):

```bash
npx serve .
```
