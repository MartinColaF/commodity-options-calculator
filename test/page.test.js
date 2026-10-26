'use strict';

/* index.html loads one script from another origin, Chart.js, and it runs on the
 * origin that holds the user's Alpha Vantage key. These tests pin what keeps that
 * safe: the browser checks the file's hash, the version is exact, and the
 * Content-Security-Policy allows that file and nothing broader. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function attributes(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) out[m[1].toLowerCase()] = m[2];
  return out;
}

const externalScripts = Array.from(html.matchAll(/<script\b([^>]*)>/gi), m => attributes(m[1]))
  .filter(a => /^(https?:)?\/\//i.test(a.src || ''));

function scriptSrc() {
  const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
  assert.ok(meta, 'index.html has a Content-Security-Policy meta tag');
  const directive = meta[1].split(';').map(d => d.trim().split(/\s+/))
    .find(tokens => tokens[0] === 'script-src');
  assert.ok(directive, 'the policy has a script-src directive');
  return directive.slice(1);
}

test('the page still loads Chart.js from the CDN', () => {
  // Without this the tests below would pass vacuously on a page that had
  // stopped loading it, or that had moved it somewhere they do not look.
  assert.ok(externalScripts.some(a => /chart\.js@/.test(a.src)), 'a Chart.js script tag');
});

test('every script from another origin is pinned by its hash', () => {
  for (const a of externalScripts) {
    assert.match(a.integrity || '', /^sha(384|512)-[A-Za-z0-9+/]+={0,2}$/, `integrity on ${a.src}`);
    // Without crossorigin the browser cannot read the response to hash it,
    // and refuses the script outright.
    assert.strictEqual(a.crossorigin, 'anonymous', `crossorigin on ${a.src}`);
  }
});

test('every CDN script names an exact version of a file the package ships', () => {
  for (const a of externalScripts) {
    assert.match(a.src, /^https:\/\/cdn\.jsdelivr\.net\/npm\/[^/@]+@\d+\.\d+\.\d+\//,
      `an exact version, not a range or "latest": ${a.src}`);
    // jsDelivr answers a request for a .min.js the package does not ship by
    // generating one, and a generated file can change under the hash. Chart.js
    // 4.x ships no .min.js; if a future version does, check it is in the npm
    // tarball before relaxing this.
    assert.doesNotMatch(a.src, /\.min\.js$/, `a published file, not one the CDN generates: ${a.src}`);
  }
});

test('script-src allows exactly the scripts the page loads, nothing broader', () => {
  const sources = scriptSrc();
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'http:', 'data:']) {
    assert.ok(!sources.includes(bad), `script-src must not allow ${bad}`);
  }
  // A bare host or a path prefix on jsDelivr would allow any package on npm.
  for (const s of sources.filter(t => /^https?:/i.test(t))) {
    assert.ok(externalScripts.some(a => a.src === s),
      `${s} in script-src is not the exact URL of a script the page loads`);
  }
  // And the reverse: a script missing from the policy is blocked silently.
  for (const a of externalScripts) {
    assert.ok(sources.includes(a.src), `${a.src} is allowed by script-src`);
  }
});
