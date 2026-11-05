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
 * The calendar runs out. USDA publishes the next year's dates in the autumn:
 * add them here when it does, with the date they were checked. The page says
 * how far the calendar goes when a horizon reaches past it, and the tests never
 * depend on today's date.
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
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = REPORTS;
