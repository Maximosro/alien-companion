const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let t = html;
  // Extract main content first
  const art = t.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const main = t.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (art) t = art[1];
  else if (main) t = main[1];
  // Remove noise blocks
  t = t.replace(/<(script|style|noscript|iframe|nav|footer|header|aside|form|svg|figure)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Block elements → newline
  t = t.replace(/<\/(div|p|h[1-6]|li|tr|article|section|blockquote|pre|table|ul|ol|dl|details|summary|hr|fieldset|legend|main|td|th)[^>]*>/gi, '\n');
  t = t.replace(/<br[^>]*>/gi, '\n');
  t = t.replace(/<h[1-6][^>]*>/gi, '\n');
  // Strip all tags
  t = t.replace(/<[^>]+>/g, ' ');
  // Entities
  t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  t = t.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ');
  t = t.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d)));
  // Normalize whitespace
  t = t.replace(/[ \t]+/g, ' ');
  // Remove short lines (menu noise)
  t = t.split('\n').filter(l => l.trim().length > 3).join('\n');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t.slice(0, 8000);
}

function fetchUrl(url, depth) {
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      },
      timeout: 8000
    }, (res) => {
      // Seguir redirecciones
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (depth >= 5) return reject(new Error('too many redirects'));
        return fetchUrl(new URL(res.headers.location, url).href, depth + 1).then(resolve).catch(reject);
      }
      // Rechazar errores del upstream (404, 403, 500…) → el cliente lo trata como URL fallida
      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Búsqueda real en DuckDuckGo (versión HTML, sin API key).
// Devuelve un array de URLs reales que existen (extraídas de los redirects uddg=).
// Búsqueda real en Bing (formato RSS, sin API key). Mucho más estable server-side
// que el HTML de DuckDuckGo (que cae en captcha al primer request).
// Devuelve [{u:url, t:título, s:snippet}].
// ponytail: garbage-TLD blacklist, add more if Bing leaks non-Spanish junk
const GARBAGE_TLDS = /\.(zh|cn|jp|kr|ru|tr|pl|cz|hu|ro|rs|ua|ar|th|vn|id|tw|hk)$/i;
const GARBAGE_HOSTS = /(zhihu\.com|donanimhaber\.com|baidu\.com|yandex\.|rambler\.|mail\.ru|naver\.com|daum\.net)$/i;

function webSearch(query, n) {
  n = n || 8;
  // ponytail: cc=es + mkt=es-ES forces Spain-region results
  const target = 'https://www.bing.com/search?format=rss&q=' + encodeURIComponent(query) + '&cc=es&mkt=es-ES';
  return fetchUrl(target).then(xml => {
    const dec = s => (s || '')
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const out = [];
    const seen = Object.create(null);
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const it of items) {
      if (out.length >= n) break;
      const link = (it.match(/<link>([^<]*)<\/link>/) || [])[1];
      const title = (it.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const desc = (it.match(/<description>([^<]*)<\/description>/) || [])[1] || '';
      if (!link || !/^https?:\/\//i.test(link)) continue;
      let host;
      try { host = new URL(link).hostname; } catch (e) { continue; }
      if (host.endsWith('bing.com')) continue;
      if (GARBAGE_TLDS.test(host) || GARBAGE_HOSTS.test(host)) continue; // ponytail: non-Spanish junk
      if (seen[link]) continue;
      seen[link] = 1;
      out.push({ u: link, t: dec(title), s: dec(desc) });
    }
    return out;
  }).catch(() => []);
}

http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  const reqUrl = new URL(req.url, 'http://localhost');

  // Endpoint de búsqueda: /search?q=...  →  [{u,t,s}, ...]
  if (reqUrl.pathname === '/search') {
    const q = reqUrl.searchParams.get('q');
    if (!q) { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('falta ?q='); }
    const results = await webSearch(q);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(results));
  }

  // Endpoint de fetch: /?url=...  →  texto limpio (o JSON verbatim)
  const targetUrl = reqUrl.searchParams.get('url');
  if (!targetUrl) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ALIEN proxy OK');
  }

  try {
    const raw = await fetchUrl(targetUrl);
    const ct = (raw || '').slice(0, 200);
    if (ct.trim().startsWith('{') || ct.trim().startsWith('[')) {
      // JSON → verbatim
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(raw);
    } else {
      const clean = stripHtml(raw);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(clean);
    }
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('ERROR: ' + e.message);
  }
}).listen(PORT, () => console.log('ALIEN proxy on port ' + PORT));
