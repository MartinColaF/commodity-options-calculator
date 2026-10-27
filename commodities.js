/* The commodity table: one entry per market, and the only place a market is
 * defined. The page (app.js) and the market-data function (api/market.js) both
 * read it, so adding a commodity is one entry here.
 *
 * It is a plain script, not a module, so the page still works from a file://
 * path: in the browser COMMODITIES is a global that app.js reads, and under
 * Node the same object is exported for the function and the tests.
 *
 * size/quote drive the dollar multiplier: cents-quoted grains and softs need
 * the 0.01 factor or P&L comes out 100x too big.
 * tick is the smallest step an option premium on the market moves in, in the
 * unit the market is quoted in - 1/8 of a cent for the grains - and sets how
 * many decimals the page shows a price with. The futures tick is never finer.
 * From the exchanges' specifications; custom has none.
 * vol/yield are long-run typical values used only as a fallback - they are
 * NOT live market data and the UI labels them as such.
 * priceSymbol is a liquid ETF used to estimate realised volatility. Its price
 * level is unrelated to the futures price, only its returns are used.
 * futures is how Yahoo names the contracts, and null for a market with none:
 *   root   = continuous front-month symbol prefix (root + "=F")
 *   suffix = exchange code used by month contracts
 *   months = listed contract months, as CME month codes
 * The function builds every symbol from it, which is what keeps a request
 * from ever naming its own. */
'use strict';

const COMMODITIES = {
  gold: {
    label: 'Gold (COMEX GC)', size: 100, unit: 'troy oz', quote: 'USD', tick: 0.1, vol: 15, yield: 0.3,
    priceSymbol: 'GLD', proxy: 'SPDR Gold Shares - tracks spot gold closely',
    futures: { root: 'GC', suffix: 'CMX', months: 'GJMQVZ' }
  },
  silver: {
    label: 'Silver (COMEX SI)', size: 5000, unit: 'troy oz', quote: 'USD', tick: 0.001, vol: 28, yield: 0.3,
    priceSymbol: 'SLV', proxy: 'iShares Silver Trust',
    futures: { root: 'SI', suffix: 'CMX', months: 'FHKNUZ' }
  },
  copper: {
    label: 'Copper (COMEX HG)', size: 25000, unit: 'lb', quote: 'USD', tick: 0.0005, vol: 25, yield: 1.5,
    priceSymbol: 'CPER', proxy: 'US Copper Index Fund',
    futures: { root: 'HG', suffix: 'CMX', months: 'HKNUZ' }
  },
  wti: {
    label: 'Crude Oil WTI (NYMEX CL)', size: 1000, unit: 'barrels', quote: 'USD', tick: 0.01, vol: 35, yield: 4,
    priceSymbol: 'USO', proxy: 'US Oil Fund - rolls front-month WTI',
    futures: { root: 'CL', suffix: 'NYM', months: 'FGHJKMNQUVXZ' }
  },
  brent: {
    label: 'Crude Oil Brent (ICE B)', size: 1000, unit: 'barrels', quote: 'USD', tick: 0.01, vol: 33, yield: 3.5,
    priceSymbol: 'BNO', proxy: 'US Brent Oil Fund',
    futures: { root: 'BZ', suffix: 'NYM', months: 'FGHJKMNQUVXZ' }
  },
  natgas: {
    label: 'Natural Gas (NYMEX NG)', size: 10000, unit: 'MMBtu', quote: 'USD', tick: 0.001, vol: 60, yield: 5,
    priceSymbol: 'UNG', proxy: 'US Natural Gas Fund',
    futures: { root: 'NG', suffix: 'NYM', months: 'FGHJKMNQUVXZ' }
  },
  corn: {
    label: 'Corn (CBOT ZC)', size: 5000, unit: 'bushels', quote: 'cents', tick: 0.125, vol: 28, yield: 2.5,
    priceSymbol: 'CORN', proxy: 'Teucrium Corn Fund',
    futures: { root: 'ZC', suffix: 'CBT', months: 'HKNUZ' }
  },
  wheat: {
    label: 'Wheat (CBOT ZW)', size: 5000, unit: 'bushels', quote: 'cents', tick: 0.125, vol: 30, yield: 3,
    priceSymbol: 'WEAT', proxy: 'Teucrium Wheat Fund',
    futures: { root: 'ZW', suffix: 'CBT', months: 'HKNUZ' }
  },
  soybean: {
    label: 'Soybeans (CBOT ZS)', size: 5000, unit: 'bushels', quote: 'cents', tick: 0.125, vol: 25, yield: 2.5,
    priceSymbol: 'SOYB', proxy: 'Teucrium Soybean Fund',
    futures: { root: 'ZS', suffix: 'CBT', months: 'FHKNQUX' }
  },
  sugar: {
    label: 'Sugar #11 (ICE SB)', size: 112000, unit: 'lb', quote: 'cents', tick: 0.01, vol: 40, yield: 2,
    priceSymbol: 'CANE', proxy: 'Teucrium Sugar Fund',
    futures: { root: 'SB', suffix: 'NYB', months: 'HKNV' }
  },
  coffee: {
    label: 'Coffee C (ICE KC)', size: 37500, unit: 'lb', quote: 'cents', tick: 0.01, vol: 45, yield: 1.5,
    priceSymbol: 'JO', proxy: 'iPath Coffee ETN - thin, treat vol with care',
    futures: { root: 'KC', suffix: 'NYB', months: 'HKNUZ' }
  },
  cocoa: {
    label: 'Cocoa (ICE CC)', size: 10, unit: 'metric tons', quote: 'USD', tick: 1, vol: 40, yield: 1,
    priceSymbol: '', proxy: 'No ETF proxy - use the futures buttons above',
    futures: { root: 'CC', suffix: 'NYB', months: 'HKNUZ' }
  },
  cotton: {
    label: 'Cotton #2 (ICE CT)', size: 50000, unit: 'lb', quote: 'cents', tick: 0.01, vol: 25, yield: 1.5,
    priceSymbol: 'BAL', proxy: 'iPath Cotton ETN - thin',
    futures: { root: 'CT', suffix: 'NYB', months: 'HKNVZ' }
  },
  cattle: {
    label: 'Live Cattle (CME LE)', size: 40000, unit: 'lb', quote: 'cents', tick: 0.025, vol: 15, yield: 1,
    priceSymbol: '', proxy: 'No ETF proxy - use the futures buttons above',
    futures: { root: 'LE', suffix: 'CME', months: 'GJMQVZ' }
  },
  custom: {
    label: 'Custom / other', size: 1, unit: 'units', quote: 'USD', tick: null, vol: 30, yield: 0,
    priceSymbol: '', proxy: 'Set the contract size and symbol yourself',
    futures: null
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = COMMODITIES;
