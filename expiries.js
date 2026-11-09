/* When the options on each listed futures month stop trading. The futures
 * month a hedger picks is not the option's: a December corn option stops
 * trading on Nov 20, 2026, the future on Dec 14, and priced to mid-December a
 * call at the money read 57% dearer. Picking a listed month sets the days to
 * expiry from here.
 *
 * Each entry is the regular option on a futures month, the last one to expire
 * on it, keyed by its futures month code and year ('Z26'). A market names its
 * calendar in commodities.js (`optionExpiry`); one without a calendar here
 * keeps the days the user types. Weekly, short-dated and serial options keep
 * calendars of their own and are not here.
 *
 * Two kinds of calendar:
 * - `dates`: the exchange's own list, as published, with the date it was
 *   checked. ICE Futures U.S. lists every option month on each product's
 *   expiry page.
 * - `rule`: the exchange's rule, worked out on its business days, which are
 *   the weekdays outside `holidays`. CME's calendar pages refuse automated
 *   reading, so the CBOT grains are worked out from their rule.
 *
 * The calendars run out: ICE lists new months as they open, and the holidays
 * go as far as published. Add them here when they do, with the date checked.
 * The page says when a month lies past a calendar's end.
 *
 * A plain script with a guarded module.exports, like events.js: a browser
 * global, from file:// too, and a Node module for the tests. index.html loads
 * it before app.js. */
'use strict';

/* US exchange holidays, as NYSE published them on Dec 23, 2025 for 2026 to
 * 2028. ICE's own 2026 calendar closes its softs on the same ten days; New
 * Year's Day 2028 falls on a Saturday and is not observed. */
const US_EXCHANGE_HOLIDAYS = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19',
  '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25'
];

const EXPIRIES = {
  'cbot-grains': {
    // CBOT Rule 10A01.I for corn, and the same rule for soybeans and wheat:
    // the last Friday that precedes by at least two business days the last
    // business day of the month before the futures month; if that Friday is
    // not a business day, the business day before it. December 2026 corn
    // options: Nov 20, 2026.
    exchange: 'CBOT',
    zone: 'America/Chicago',
    rule: 'cbot-grains',
    holidays: US_EXCHANGE_HOLIDAYS,
    // Business days are known to the end of the last year listed.
    through: '2028-12-31'
  },
  'ice-sugar-11': {
    // Sugar No. 11 Rule 11.23: the 15th of the month before the futures
    // month, or the next business day.
    // https://www.ice.com/products/22/Sugar-No-11-Options/expiry, checked 2026-11-09.
    exchange: 'ICE Futures U.S.',
    zone: 'America/New_York',
    dates: {
      H27: '2027-02-16', K27: '2027-04-15', N27: '2027-06-15', V27: '2027-09-15',
      H28: '2028-02-15', K28: '2028-04-17', N28: '2028-06-15', V28: '2028-09-15',
      H29: '2029-02-15', K29: '2029-04-16', N29: '2029-06-15', V29: '2029-09-17'
    }
  },
  'ice-coffee-c': {
    // Coffee Rule 8.52: the second Friday of the month before, at least four
    // trading days ahead of the future's first notice day, or else the fifth
    // business day before it.
    // https://www.ice.com/products/14/Coffee-C-Options/expiry, checked 2026-11-09.
    exchange: 'ICE Futures U.S.',
    zone: 'America/New_York',
    dates: {
      Z26: '2026-11-12', H27: '2027-02-10', K27: '2027-04-09', N27: '2027-06-11',
      U27: '2027-08-13', Z27: '2027-11-12', H28: '2028-02-11'
    }
  },
  'ice-cocoa': {
    // Cocoa Rule 9.42, worded as coffee's.
    // https://www.ice.com/products/8/Cocoa-Options/expiry, checked 2026-11-09.
    exchange: 'ICE Futures U.S.',
    zone: 'America/New_York',
    dates: {
      Z26: '2026-11-13', H27: '2027-02-12', K27: '2027-04-09', N27: '2027-06-11',
      U27: '2027-08-13', Z27: '2027-11-12', H28: '2028-02-11', K28: '2028-04-13',
      N28: '2028-06-09', U28: '2028-08-11'
    }
  },
  'ice-cotton-2': {
    // Cotton Rule 10.54: the last Friday preceding the future's first notice
    // day by at least five business days.
    // https://www.ice.com/products/1027/Cotton-No-2-Options/expiry, checked 2026-11-09.
    exchange: 'ICE Futures U.S.',
    zone: 'America/New_York',
    dates: {
      Z26: '2026-11-13', H27: '2027-02-05', K27: '2027-04-16', N27: '2027-06-11',
      V27: '2027-09-10', Z27: '2027-11-12', H28: '2028-02-11', K28: '2028-04-13',
      N28: '2028-06-09', V28: '2028-09-15', Z28: '2028-11-10', H29: '2029-02-09',
      K29: '2029-04-13', N29: '2029-06-08', V29: '2029-09-14'
    }
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = EXPIRIES;
