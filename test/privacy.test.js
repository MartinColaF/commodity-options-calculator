'use strict';

/* The privacy policy is load-bearing: it must not promise anything the site
 * does not do. It once promised a cookie banner that never existed, said there
 * was no server while the market data function ran on one, and described
 * AdSense cookies on a page that loads no ads. These tests tie each claim to
 * the file that makes it true, so changing one without the other fails here. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
// The policy as a reader sees it: its text, without the markup or the script
// that reveals the contact address.
const policy = read('privacy.html')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');
const page = read('index.html');
const code = read('app.js') + read('commodities.js');

test('no cookie banner is promised while the site has none', () => {
  if (!/consent|cookie.?banner/i.test(page + code)) {
    assert.doesNotMatch(policy, /cookie (banner|preferences)/i);
  }
});

test('"no cookies" stays true: the page\'s own code sets none', () => {
  assert.match(policy, /sets no cookies/i);
  assert.doesNotMatch(code, /document\.cookie/);
});

test('ads are described as not active for as long as no ad script loads', () => {
  const loadsAds = /googlesyndication\.com|adsbygoogle/i.test(page);
  // When this fails, ads have been switched on. Before shipping: update
  // sections 1 to 3 of privacy.html, add the certified consent banner that
  // visitors from the EEA, the UK and Switzerland need, and allow the script
  // in index.html's Content-Security-Policy.
  assert.strictEqual(/not active yet/i.test(policy), !loadsAds,
    loadsAds ? 'the page loads ads but the policy says they are not active'
      : 'the policy describes ads as active but the page loads none');
});

test('the policy does not deny the server function that exists', () => {
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', 'api', 'market.js')));
  assert.doesNotMatch(policy, /no server of our own/i);
  assert.match(policy, /\/api\/market/);
});

test('every third party the page may contact is named in the policy', () => {
  // The Content-Security-Policy is the list of origins the browser may reach,
  // so a new one there needs a line in the policy too.
  const csp = page.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i)[1];
  const hosts = Array.from(new Set(csp.match(/https:\/\/[^\s;/]+/g) || []))
    .map(u => u.replace('https://', ''));
  const named = {
    'cdn.jsdelivr.net': /jsDelivr/,
    'home.treasury.gov': /home\.treasury\.gov/,
    'www.alphavantage.co': /alphavantage\.co/
  };
  assert.ok(hosts.length > 0, 'the CSP names some origins');
  for (const h of hosts) {
    assert.ok(Object.prototype.hasOwnProperty.call(named, h),
      `${h} is in the CSP: add it to privacy.html and to this list`);
    assert.match(policy, named[h], `${h} is contacted but the policy does not name it`);
  }
});
