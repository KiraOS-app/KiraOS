// KIRA OS — local server (npm start). On Vercel you don't need this file:
// Vercel serves /public and runs the functions in /api automatically.
//   GET  /            → files from ./public
//   POST /api/studio  → one Claude call for the Studio and the home chat (needs ANTHROPIC_API_KEY)
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

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/studio' && req.method === 'POST') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await handleStudio(new Request('http://localhost/api/studio', { method: 'POST', body: Buffer.concat(chunks), headers: { origin: req.headers.origin || '' } }), req.socket.remoteAddress || 'anon');
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(await r.text());
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
    const file = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error('[server]', e);
    if (!res.headersSent) { res.writeHead(500); res.end('server error'); }
  }
}).listen(PORT, () => console.log(`KIRA OS running at http://localhost:${PORT}`));
