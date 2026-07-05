const http = require('http');
const https = require('https');
const { URL } = require('url');

const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, '..', 'proxy.log');

// ── Logging (con rate-limit para EPIPE) ──────────────────
function ts() { return new Date().toISOString(); }
let _lastEpipeLog = 0;
function log(tag, msg) {
  const line = `[${ts()}] ${tag} ${msg}`;
  // Rate-limit EPIPE logs: max 1 por segundo
  if (tag === 'CRASH' && msg.includes('EPIPE')) {
    const now = Date.now();
    if (now - _lastEpipeLog < 1000) return;
    _lastEpipeLog = now;
  }
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

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
  return t.slice(0, 16000);
}

function fetchUrl(url, depth, signal) {
  depth = depth || 0;
  const t0 = Date.now();
  log('FETCH', url.slice(0, 120));
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(new Error('bad url: ' + e.message)); }
    const mod = u.protocol === 'https:' ? https : http;
    const upstreamReq = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      },
      timeout: 12000
    }, (res) => {
      // Seguir redirecciones
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (depth >= 5) return reject(new Error('too many redirects'));
        return fetchUrl(new URL(res.headers.location, url).href, depth + 1, signal).then(resolve).catch(reject);
      }
      // Rechazar errores del upstream (404, 403, 500…) → el cliente lo trata como URL fallida
      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        log('FETCH', `OK ${res.statusCode} · ${(data.length/1024).toFixed(1)}KB · ${Date.now()-t0}ms · ${url.slice(0,80)}`);
        resolve(data);
      });
    });
    upstreamReq.on('error', e => { log('FETCH', `ERR ${e.message} · ${Date.now()-t0}ms · ${url.slice(0,80)}`); reject(e); });
    upstreamReq.on('timeout', () => { upstreamReq.destroy(); log('FETCH', `TIMEOUT · ${Date.now()-t0}ms · ${url.slice(0,80)}`); reject(new Error('timeout')); });
    // Abort upstream request if client disconnects (signal from browser-side req)
    if (signal) {
      if (signal.aborted) { upstreamReq.destroy(); return reject(new Error('client disconnected')); }
      signal.addEventListener('abort', () => { upstreamReq.destroy(); reject(new Error('client disconnected')); }, { once: true });
    }
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

function webSearch(query, n, signal) {
  n = n || 8;
  // ponytail: cc=es + mkt=es-ES forces Spain-region results
  const target = 'https://www.bing.com/search?format=rss&q=' + encodeURIComponent(query) + '&cc=es&mkt=es-ES';
  return fetchUrl(target, 0, signal).then(xml => {
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

// ponytail: safeEnd evita EPIPE cuando el cliente ya desconectó
function safeEnd(res, code, body) {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.writeHead(code);
    res.end(body);
  } catch {
    // cliente se fue — destruir socket para evitar EPIPE residuales
    try { res.destroy(); } catch {}
  }
}

http.createServer((req, res) => {
  req.on('error', () => {}); // ignorar disconnect del cliente
  res.on('error', () => {}); // ignorar EPIPE
  // AbortController: cuando el cliente cuelga, abortamos el fetch upstream
  const ac = new AbortController();
  req.on('close', () => ac.abort());
  handleRequest(req, res, ac.signal).catch(e => {
    if (e.message === 'client disconnected') return; // silencioso
    log('PANIC', e.message);
    if (!res.headersSent && !res.destroyed) {
      try { res.writeHead(500); res.end('internal error'); } catch {}
    }
  });
}).listen(PORT, () => console.log('ALIEN proxy on port ' + PORT));

async function handleRequest(req, res, signal) {
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
    log('IN', `/search?q=${(q||'').slice(0,60)}`);
    if (!q) { log('OUT', '400 — falta ?q='); safeEnd(res, 400, 'falta ?q='); return; }
    const t0 = Date.now();
    const results = await webSearch(q, 8, signal);
    log('OUT', `/search → ${results.length} results · ${Date.now()-t0}ms`);
    safeEnd(res, 200, JSON.stringify(results));
    return;
  }

  // Endpoint de fetch: /?url=...  →  texto limpio (o JSON verbatim)
  const targetUrl = reqUrl.searchParams.get('url');
  if (!targetUrl) {
    log('IN', '/ (health check)');
    safeEnd(res, 200, 'ALIEN proxy OK');
    return;
  }

  log('IN', `/?url=${targetUrl.slice(0,100)}`);
  try {
    const raw = await fetchUrl(targetUrl, 0, signal);
    const ct = (raw || '').slice(0, 200);
    if (ct.trim().startsWith('{') || ct.trim().startsWith('[')) {
      // JSON → verbatim
      log('OUT', `JSON · ${raw.length} chars`);
      safeEnd(res, 200, raw);
    } else {
      const clean = stripHtml(raw);
      log('OUT', `HTML → ${clean.length} chars (raw ${raw.length})`);
      safeEnd(res, 200, clean);
    }
  } catch (e) {
    log('OUT', `ERROR ${e.message}`);
    safeEnd(res, 502, 'ERROR: ' + e.message);
  }
}

// ── Crash guards (log + keep alive) ─────────────────────
process.on('uncaughtException', e => {
  log('CRASH', e.message);
  if (e.code === 'EPIPE' || e.code === 'ECONNRESET') return; // inofensivo
  // eslint-disable-next-line no-console
  console.error(e);
});
process.on('unhandledRejection', (reason, p) => {
  log('CRASH', 'unhandledRejection: ' + (reason?.message || reason));
  // eslint-disable-next-line no-console
  console.error(reason);
});
