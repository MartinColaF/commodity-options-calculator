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

| Input | Source | Key needed |
|---|---|---|
| Risk-free rate | US Treasury daily par yield curve, interpolated to your expiry and converted to a continuously compounded rate | no |
| Volatility | Realised volatility (close-to-close, EWMA, Parkinson) from Alpha Vantage daily prices | free key |
| Convenience yield | Implied from the spot/futures basis by inverting `F = S·e^(r−y)T` | no |

Notes and limitations, stated plainly in the UI as well:

- Realised volatility is **historical, not implied**. It is a starting point, not the
  market's vol.
- The volatility proxies are ETFs (GLD, USO, CORN…). Only their **returns** are used;
  their price level is not the futures price, and roll effects mean they are proxies.
- Cocoa and live cattle have no reliable free proxy and fall back to preset values.
- Presets are long-run typical values, flagged in the UI as "not market data".
- Models assume European exercise; most commodity futures options are American, so
  early exercise value is not captured.

Responses are cached in local storage (Treasury 6 h, Alpha Vantage 12 h) — the free
Alpha Vantage tier allows 25 requests a day.

## Files

- `index.html` — markup
- `styles.css` — styling, light and dark
- `app.js` — pricing engine, strategy analytics, data providers, rendering
- `privacy.html` — privacy policy

## Development

There is nothing to install. To run it locally with the market-data buttons working,
serve the folder over HTTP (opening the file directly also works, but some browsers
restrict cross-origin requests from `file://`):

```bash
npx serve .
```
