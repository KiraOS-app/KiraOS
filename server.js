// BLACKCAT — local server (npm start). On Vercel you don't need this file:
// Vercel serves /public and runs the functions in /api automatically.
//   GET  /            → files from ./public
//   POST /api/studio  → one Claude call for the Studio and the home chat (needs ANTHROPIC_API_KEY)
//   /api/auth/*, /api/data → accounts (X, wallet, email) and saved agents
//   GET  /api/status  → owner-only usage stats (ADMIN_IDS)
// Zero dependencies. Requires Node.js 18 or newer.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env file */ }
const { handleStudio } = await import('./lib/studio.js');
const { handleAuth } = await import('./lib/auth.js');
const { handleStatus } = await import('./lib/status.js');
const { handleShare, handleAgentChat, handleTelegram } = await import('./lib/agents.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml', '.jpg': 'image/jpeg' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/studio' && req.method === 'POST') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await handleStudio(new Request('http://localhost/api/studio', { method: 'POST', body: Buffer.concat(chunks), headers: { origin: req.headers.origin || '' } }), req.socket.remoteAddress || 'anon');
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(await r.text());
    }
    if (url.pathname === '/api/status' && req.method === 'GET') {
      const headers = new Headers(); if (req.headers.cookie) headers.set('cookie', req.headers.cookie);
      const r = await handleStatus(new Request('http://localhost/api/status', { headers }));
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(await r.text());
    }
    if (url.pathname === '/api/share' || url.pathname === '/api/agent-chat' || url.pathname.startsWith('/api/tg/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const r2 = new Request('http://localhost' + req.url, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks) });
      const ip = req.socket.remoteAddress || 'anon';
      const r = url.pathname === '/api/share' ? await handleShare(r2, ip) : url.pathname === '/api/agent-chat' ? await handleAgentChat(r2, ip) : await handleTelegram(r2, url.pathname.split('/').pop(), ip);
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'text/plain', 'Cache-Control': 'no-store' }); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    const am = url.pathname.match(/^\/api\/auth\/([a-z-]+)$/), isData = url.pathname === '/api/data';
    if (am || isData) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = new Headers(); for (const h of ['cookie', 'origin', 'content-type']) if (req.headers[h]) headers.set(h, req.headers[h]);
      const rq = new Request('http://localhost:' + PORT + url.pathname + url.search, { method: req.method, headers, body: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const r = await handleAuth(rq, isData ? 'data' : am[1], req.socket.remoteAddress || 'anon');
      const out = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) out['set-cookie'] = sc;
      res.writeHead(r.status, out); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
    if (/^\/a\/[A-Za-z0-9]+$/.test(p)) p = '/a.html'; // share links
    if (!path.extname(p)) p += '.html'; // clean URLs, like Vercel: /studio -> studio.html
    const file = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': MIME['.html'] }); return fs.createReadStream(path.join(PUBLIC, '404.html')).pipe(res); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error('[server]', e);
    if (!res.headersSent) { res.writeHead(500); res.end('server error'); }
  }
}).listen(PORT, () => console.log(`BLACKCAT running at http://localhost:${PORT}`));
