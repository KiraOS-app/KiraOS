// Tiny key-value store on Upstash Redis (REST API). Works with either variable pair:
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (Upstash)
//   KV_REST_API_URL + KV_REST_API_TOKEN                 (Vercel Marketplace → Upstash)
// Without them it falls back to memory, which is only good for local testing.
const URL_ = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
export const storeReady = () => !!(URL_ && TOKEN) || process.env.NODE_ENV !== 'production' && !process.env.VERCEL;

const mem = new Map(); // key -> { v, exp }
async function cmd(args){
  if (URL_ && TOKEN){
    const r = await fetch(URL_, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('store_error: ' + (j.error || r.status));
    return j.result;
  }
  const [op, key, val, ...rest] = args, now = Date.now(), e = mem.get(key);
  const live = e && (!e.exp || e.exp > now) ? e : null; if (e && !live) mem.delete(key);
  switch (op){
    case 'GET': return live ? live.v : null;
    case 'SET': { const i = rest.indexOf('EX'); mem.set(key, { v: String(val), exp: i >= 0 ? now + Number(rest[i+1])*1000 : 0 }); return 'OK'; }
    case 'DEL': mem.delete(key); return 1;
    case 'INCR': { const n = (live ? Number(live.v) : 0) + 1; mem.set(key, { v: String(n), exp: live ? live.exp : 0 }); return n; }
    case 'EXPIRE': if (live) live.exp = now + Number(val)*1000; return 1;
    case 'LPUSH': { const l = live ? JSON.parse(live.v) : []; l.unshift(String(val)); mem.set(key, { v: JSON.stringify(l), exp: 0 }); return l.length; }
    case 'LRANGE': { const l = live ? JSON.parse(live.v) : []; const a = Number(val), b = Number(rest[0]); return l.slice(a, b < 0 ? l.length + b + 1 : b + 1); }
    case 'LTRIM': { const l = live ? JSON.parse(live.v) : []; const a = Number(val), b = Number(rest[0]); mem.set(key, { v: JSON.stringify(l.slice(a, b < 0 ? l.length + b + 1 : b + 1)), exp: 0 }); return 'OK'; }
    case 'LREM': { const l = live ? JSON.parse(live.v) : []; const out = l.filter(x => x !== String(rest[0])); mem.set(key, { v: JSON.stringify(out), exp: 0 }); return l.length - out.length; }
    case 'MGET': return [key, val, ...rest].map(k => { const x = mem.get(k); return x && (!x.exp || x.exp > now) ? x.v : null; });
    default: throw new Error('unsupported');
  }
}
export const get = k => cmd(['GET', k]);
export const set = (k, v, ttlSec) => cmd(ttlSec ? ['SET', k, v, 'EX', String(ttlSec)] : ['SET', k, v]);
export const del = k => cmd(['DEL', k]);
export async function incr(k, ttlSec){ const n = await cmd(['INCR', k]); if (n === 1 && ttlSec) await cmd(['EXPIRE', k, String(ttlSec)]); return n; }
export const lpush = (k, v) => cmd(['LPUSH', k, v]);
export const lrange = (k, a, b) => cmd(['LRANGE', k, String(a), String(b)]);
export const ltrim = (k, a, b) => cmd(['LTRIM', k, String(a), String(b)]);
export const lrem = (k, v) => cmd(['LREM', k, '0', v]);
export const mget = keys => keys.length ? cmd(['MGET', ...keys]) : Promise.resolve([]);
