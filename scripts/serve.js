/* Zero-dependency static server for local UI work: `npm run dev`.
 * It does NOT run the /api functions - use `npx vercel dev` for those. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';

  const file = path.join(ROOT, rel);
  // Keep requests inside the project directory.
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (rel.startsWith('/api/')) {
    res.writeHead(501, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: 'Run `npx vercel dev` to serve the API functions locally' }));
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log('Serving ' + ROOT + ' on http://localhost:' + PORT);
});
