/* The scheduled reports that move a market's options, and when each comes out.
 * A grain option priced across a WASDE report holds that report's risk, and how
 * many fall before the horizon is what a desk asks first; no generic calculator
 * says it. The page names them under the results; nothing is priced from them.
 *
 * Each report has its publisher's calendar as published, every release an
 * instant with its own offset from UTC, so a release on the far side of a
 * daylight-saving change still reads 12:00 in Washington. A market lists the
 * reports it follows in commodities.js (`reports`).
 *
 * The calendar runs out. USDA publishes the next year's WASDE dates in the
 * autumn, and EIA the next year's holiday changes to its weekly reports late
 * in the year: add them here when they do, with the date they were checked.
 * The page says how far the calendar goes when a horizon reaches past it, and
 * the tests never depend on today's date.
 *
 * A plain script with a guarded module.exports, like commodities.js: a browser
 * global, from file:// too, and a Node module for the tests. index.html loads it
 * before app.js. */
'use strict';

const REPORTS = {
  wasde: {
    // World Agricultural Supply and Demand Estimates: the balance sheets for
    // grains, oilseeds and cotton, released at 12:00 ET.
    // https://www.usda.gov/about-usda/general-information/staff-offices/office-chief-economist/commodity-markets/wasde-report
    // 2026 and 2027 as listed there, checked 2026-11-05.
    name: 'WASDE',
    publisher: 'USDA',
    releases: [
      '2026-01-12T12:00:00-05:00', '2026-02-10T12:00:00-05:00', '2026-03-10T12:00:00-04:00',
      '2026-04-09T12:00:00-04:00', '2026-05-12T12:00:00-04:00', '2026-06-11T12:00:00-04:00',
      '2026-07-10T12:00:00-04:00', '2026-08-12T12:00:00-04:00', '2026-09-11T12:00:00-04:00',
      '2026-10-09T12:00:00-04:00', '2026-11-10T12:00:00-05:00', '2026-12-10T12:00:00-05:00',
      '2027-01-12T12:00:00-05:00', '2027-02-10T12:00:00-05:00', '2027-03-10T12:00:00-05:00',
      '2027-04-09T12:00:00-04:00', '2027-05-12T12:00:00-04:00', '2027-06-11T12:00:00-04:00',
      '2027-07-09T12:00:00-04:00', '2027-08-12T12:00:00-04:00', '2027-09-10T12:00:00-04:00',
      '2027-10-08T12:00:00-04:00', '2027-11-10T12:00:00-05:00', '2027-12-10T12:00:00-05:00'
    ]
  },
  wpsr: {
    // The Weekly Petroleum Status Report: US crude and product inventories,
    // Wednesdays at 10:30 ET, a day later at 12:00 in a week with a Monday
    // holiday.
    // https://www.eia.gov/petroleum/supply/weekly/schedule.php
    // 2026 by that rule and its listed exceptions, checked 2026-11-09. EIA
    // has not yet listed 2027's.
    name: 'Weekly Petroleum Status',
    publisher: 'EIA',
    releases: [
      '2026-01-07T10:30:00-05:00', '2026-01-14T10:30:00-05:00', '2026-01-22T12:00:00-05:00',
      '2026-01-28T10:30:00-05:00', '2026-02-04T10:30:00-05:00', '2026-02-11T10:30:00-05:00',
      '2026-02-19T12:00:00-05:00', '2026-02-25T10:30:00-05:00', '2026-03-04T10:30:00-05:00',
      '2026-03-11T10:30:00-04:00', '2026-03-18T10:30:00-04:00', '2026-03-25T10:30:00-04:00',
      '2026-04-01T10:30:00-04:00', '2026-04-08T10:30:00-04:00', '2026-04-15T10:30:00-04:00',
      '2026-04-22T10:30:00-04:00', '2026-04-29T10:30:00-04:00', '2026-05-06T10:30:00-04:00',
      '2026-05-13T10:30:00-04:00', '2026-05-20T10:30:00-04:00', '2026-05-28T12:00:00-04:00',
      '2026-06-03T10:30:00-04:00', '2026-06-10T10:30:00-04:00', '2026-06-17T10:30:00-04:00',
      '2026-06-24T10:30:00-04:00', '2026-07-01T10:30:00-04:00', '2026-07-08T10:30:00-04:00',
      '2026-07-15T10:30:00-04:00', '2026-07-22T10:30:00-04:00', '2026-07-29T10:30:00-04:00',
      '2026-08-05T10:30:00-04:00', '2026-08-12T10:30:00-04:00', '2026-08-19T10:30:00-04:00',
      '2026-08-26T10:30:00-04:00', '2026-09-02T10:30:00-04:00', '2026-09-10T12:00:00-04:00',
      '2026-09-16T10:30:00-04:00', '2026-09-23T10:30:00-04:00', '2026-09-30T10:30:00-04:00',
      '2026-10-07T10:30:00-04:00', '2026-10-15T12:00:00-04:00', '2026-10-21T10:30:00-04:00',
      '2026-10-28T10:30:00-04:00', '2026-11-04T10:30:00-05:00', '2026-11-12T12:00:00-05:00',
      '2026-11-18T10:30:00-05:00', '2026-11-25T10:30:00-05:00', '2026-12-02T10:30:00-05:00',
      '2026-12-09T10:30:00-05:00', '2026-12-16T10:30:00-05:00', '2026-12-23T10:30:00-05:00',
      '2026-12-30T10:30:00-05:00'
    ]
  },
  wngsr: {
    // The Weekly Natural Gas Storage Report: working gas in storage,
    // Thursdays at 10:30 ET, with the holiday exceptions listed.
    // https://ir.eia.gov/ngs/schedule.html
    // 2026 by that rule and its listed exceptions, checked 2026-11-09: none on
    // New Year's Day (it came out on Dec 31, 2025), Friday Nov 13 for Veterans
    // Day, Wednesday Nov 25 at 12:00 for Thanksgiving. EIA has not yet listed
    // 2027's.
    name: 'Weekly Natural Gas Storage',
    publisher: 'EIA',
    releases: [
      '2026-01-08T10:30:00-05:00', '2026-01-15T10:30:00-05:00', '2026-01-22T10:30:00-05:00',
      '2026-01-29T10:30:00-05:00', '2026-02-05T10:30:00-05:00', '2026-02-12T10:30:00-05:00',
      '2026-02-19T10:30:00-05:00', '2026-02-26T10:30:00-05:00', '2026-03-05T10:30:00-05:00',
      '2026-03-12T10:30:00-04:00', '2026-03-19T10:30:00-04:00', '2026-03-26T10:30:00-04:00',
      '2026-04-02T10:30:00-04:00', '2026-04-09T10:30:00-04:00', '2026-04-16T10:30:00-04:00',
      '2026-04-23T10:30:00-04:00', '2026-04-30T10:30:00-04:00', '2026-05-07T10:30:00-04:00',
      '2026-05-14T10:30:00-04:00', '2026-05-21T10:30:00-04:00', '2026-05-28T10:30:00-04:00',
      '2026-06-04T10:30:00-04:00', '2026-06-11T10:30:00-04:00', '2026-06-18T10:30:00-04:00',
      '2026-06-25T10:30:00-04:00', '2026-07-02T10:30:00-04:00', '2026-07-09T10:30:00-04:00',
      '2026-07-16T10:30:00-04:00', '2026-07-23T10:30:00-04:00', '2026-07-30T10:30:00-04:00',
      '2026-08-06T10:30:00-04:00', '2026-08-13T10:30:00-04:00', '2026-08-20T10:30:00-04:00',
      '2026-08-27T10:30:00-04:00', '2026-09-03T10:30:00-04:00', '2026-09-10T10:30:00-04:00',
      '2026-09-17T10:30:00-04:00', '2026-09-24T10:30:00-04:00', '2026-10-01T10:30:00-04:00',
      '2026-10-08T10:30:00-04:00', '2026-10-15T10:30:00-04:00', '2026-10-22T10:30:00-04:00',
      '2026-10-29T10:30:00-04:00', '2026-11-05T10:30:00-05:00', '2026-11-13T10:30:00-05:00',
      '2026-11-19T10:30:00-05:00', '2026-11-25T12:00:00-05:00', '2026-12-03T10:30:00-05:00',
      '2026-12-10T10:30:00-05:00', '2026-12-17T10:30:00-05:00', '2026-12-24T10:30:00-05:00',
      '2026-12-31T10:30:00-05:00'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = REPORTS;
