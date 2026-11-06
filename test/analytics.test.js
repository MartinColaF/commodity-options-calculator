'use strict';

/* Visit counting (analytics.js). Vercel's counting script reads location.href,
 * and a shared link carries its whole scenario after "#", a position someone
 * may hold for real. The page hands the script a rule that drops it before
 * anything is sent, and loads the script only where Vercel serves it. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'analytics.js'), 'utf8');

/* Runs analytics.js on a page at `href`, and returns what it queued for the
 * counter and the scripts it added. */
function run(href) {
  const added = [];
  const window = {};
  const sandbox = {
    window,
    location: new URL(href),
    document: {
      createElement: tag => ({ tag }),
      head: { appendChild: el => added.push(el) }
    }
  };
  vm.runInNewContext(SOURCE, sandbox);
  return { queue: window.vaq, added };
}

test('the address it sends never carries the scenario of a shared link', () => {
  const { queue } = run('https://commodity-options-calculator.vercel.app/es/?ref=share#s=eyJTIjo0MDAwfQ');
  const rule = queue.find(([name]) => name === 'beforeSend');
  assert.ok(rule, 'a rule for what is sent');
  const sent = rule[1]({ type: 'pageview', url: 'https://commodity-options-calculator.vercel.app/es/?ref=share#s=eyJTIjo0MDAwfQ' });
  assert.strictEqual(sent.url, 'https://commodity-options-calculator.vercel.app/es/?ref=share', 'the visit, its source, no scenario');
  assert.strictEqual(sent.type, 'pageview');
  const plain = rule[1]({ type: 'pageview', url: 'https://commodity-options-calculator.vercel.app/methodology.html' });
  assert.strictEqual(plain.url, 'https://commodity-options-calculator.vercel.app/methodology.html', 'an address without one is left alone');
});

test('the counter is Vercel\'s own script, from this site, deferred', () => {
  const { added } = run('https://commodity-options-calculator.vercel.app/');
  assert.strictEqual(added.length, 1);
  assert.strictEqual(added[0].tag, 'script');
  assert.strictEqual(added[0].src, '/_vercel/insights/script.js', 'same origin, which the CSP already allows');
  assert.strictEqual(added[0].defer, true);
});

test('nothing is counted from a file or the dev server, where there is no Vercel', () => {
  for (const href of ['file:///home/me/commodity-options-calculator/index.html', 'http://localhost:3000/']) {
    const { queue, added } = run(href);
    assert.strictEqual(queue, undefined, href);
    assert.strictEqual(added.length, 0, href);
  }
});
