// ponytail: stdlib-only static server, one file, no deps
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url;
  file = file.split('?')[0]; // strip query
  const fp = path.join(__dirname, file);

  try {
    const data = fs.readFileSync(fp);
    const ext = path.extname(fp);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('404');
  }
}).listen(PORT, () => console.log(`web → http://localhost:${PORT}`));
