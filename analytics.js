/* Visits are counted by Vercel Web Analytics, as privacy.html describes: page
 * views only, with no cookies and nothing about a position. The counting
 * script is Vercel's own, served by this site under /_vercel/insights/ once Web
 * Analytics is enabled for the project. This file loads it the way Vercel's
 * package does, so no page names a path that only exists on Vercel.
 *
 * It first hands the script one rule. What it sends never includes the part of
 * the address after "#": that is where a shared link carries its whole
 * scenario (shareLink()), and the script reads location.href, which keeps it.
 * The script applies the rules queued in window.vaq before its first page
 * view.
 *
 * Nothing loads from a file: path or over plain http, the dev server, since
 * there is no Vercel there to answer. A file of its own because the CSP allows
 * no inline script. ES2017, like the page's other scripts. */
(function () {
  if (location.protocol !== 'https:') return;
  window.vaq = window.vaq || [];
  window.vaq.push(['beforeSend', event => Object.assign({}, event, { url: String(event.url).split('#')[0] })]);
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.appendChild(script);
})();
