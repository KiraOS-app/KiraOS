// KIRA OS accounts: sign in with X, with a wallet, or with an email code.
// The session is a signed, HTTP-only cookie. Agents are saved per account in the store (lib/store.js).
//
// Routes (see api/):
//   GET  /api/auth/me              → { user, methods }
//   POST /api/auth/logout
//   GET  /api/auth/x-login         → redirect to X            (X_CLIENT_ID, X_CLIENT_SECRET)
//   GET  /api/auth/x-callback      → back from X
//   GET  /api/auth/wallet-nonce    → { message } to sign
//   POST /api/auth/wallet-verify   { address, signature }
//   POST /api/auth/email-start     { email }                   (RESEND_API_KEY, EMAIL_FROM)
//   POST /api/auth/email-verify    { email, code }
//   GET  /api/data                 → { state, updatedAt }
//   PUT  /api/data                 { state }
import crypto from 'node:crypto';
import { get, set, del, incr, storeReady } from './store.js';
import { verifyPersonalSign } from './eth.js';

const DAY = 86400;
const SESSION = 'kira_s', FLOW = 'kira_xf', NONCE = 'kira_wn';
const MAX_STATE = 400_000; // characters
let devSecret = null;
function secret(){
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is not set');
  return devSecret ||= crypto.randomBytes(32).toString('hex');
}
const b64u = b => Buffer.from(b).toString('base64url');
function sign(obj, ttl){ const body = b64u(JSON.stringify({ ...obj, exp: Math.floor(Date.now()/1000) + ttl }));
  return body + '.' + crypto.createHmac('sha256', secret()).update(body).digest('base64url'); }
function verify(tok){
  if (!tok || typeof tok !== 'string') return null; const [body, mac] = tok.split('.'); if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try { const o = JSON.parse(Buffer.from(body, 'base64url').toString()); return o.exp > Date.now()/1000 ? o : null; } catch { return null; }
}
function cookies(request){ const out = {}; for (const p of (request.headers.get('cookie') || '').split(';')){ const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i+1).trim()); } return out; }
const isSecure = request => new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
const cookie = (name, val, maxAge, secure) => `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
function json(body, status = 200, setCookies = []){ const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' }); setCookies.forEach(c => h.append('set-cookie', c)); return new Response(JSON.stringify(body), { status, headers: h }); }
function redirect(to, setCookies = []){ const h = new Headers({ location: to, 'cache-control': 'no-store' }); setCookies.forEach(c => h.append('set-cookie', c)); return new Response(null, { status: 302, headers: h }); }
const siteUrl = request => (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
function sameOrigin(request){ const o = request.headers.get('origin'); if (!o) return false; try { return new URL(o).host === new URL(siteUrl(request)).host || new URL(o).host === new URL(request.url).host; } catch { return false; } }
const accountsOn = () => storeReady() && !!(process.env.SESSION_SECRET || !(process.env.VERCEL || process.env.NODE_ENV === 'production'));
const methods = () => ({ on: accountsOn(), x: !!process.env.X_CLIENT_ID, wallet: true, email: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) });
async function limited(key, max, ttl){ try { return (await incr('kira:rl:' + key, ttl)) > max; } catch { return false; } }
async function login(request, user){
  await set('kira:user:' + user.id, JSON.stringify({ ...user, lastLogin: new Date().toISOString() }));
  return cookie(SESSION, sign({ user }, 30*DAY), 30*DAY, isSecure(request));
}
export function currentUser(request){ const s = verify(cookies(request)[SESSION]); return s ? s.user : null; }

/* ---------- X (OAuth 2.0 + PKCE) ---------- */
const X_AUTH = 'https://x.com/i/oauth2/authorize', X_TOKEN = 'https://api.x.com/2/oauth2/token', X_ME = 'https://api.x.com/2/users/me?user.fields=profile_image_url';
const xCallback = request => process.env.X_CALLBACK_URL || siteUrl(request) + '/api/auth/x-callback';
async function xLogin(request){
  if (!process.env.X_CLIENT_ID) return redirect('/studio.html#auth-x-off');
  const verifier = b64u(crypto.randomBytes(32)), challenge = b64u(crypto.createHash('sha256').update(verifier).digest()), state = b64u(crypto.randomBytes(16));
  const p = new URLSearchParams({ response_type: 'code', client_id: process.env.X_CLIENT_ID, redirect_uri: xCallback(request), scope: 'users.read tweet.read', state, code_challenge: challenge, code_challenge_method: 'S256' });
  return redirect(`${X_AUTH}?${p}`, [cookie(FLOW, sign({ verifier, state }, 600), 600, isSecure(request))]);
}
async function xCallbackH(request){
  const u = new URL(request.url), secure = isSecure(request), clear = cookie(FLOW, '', 0, secure);
  const flow = verify(cookies(request)[FLOW]);
  if (u.searchParams.get('error')) return redirect('/studio.html#auth-cancelled', [clear]);
  if (!flow || flow.state !== u.searchParams.get('state') || !u.searchParams.get('code')) return redirect('/studio.html#auth-failed', [clear]);
  try {
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (process.env.X_CLIENT_SECRET) headers.authorization = 'Basic ' + Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64');
    const tr = await fetch(X_TOKEN, { method: 'POST', headers, body: new URLSearchParams({ grant_type: 'authorization_code', code: u.searchParams.get('code'), redirect_uri: xCallback(request), code_verifier: flow.verifier, client_id: process.env.X_CLIENT_ID }), signal: AbortSignal.timeout(10000) });
    const tj = await tr.json(); if (!tr.ok || !tj.access_token) throw new Error('token ' + tr.status);
    const mr = await fetch(X_ME, { headers: { authorization: `Bearer ${tj.access_token}` }, signal: AbortSignal.timeout(10000) });
    const mj = await mr.json(); const d = mj.data; if (!d?.id) throw new Error('me ' + mr.status);
    const user = { id: 'x:' + d.id, method: 'x', name: '@' + d.username, avatar: d.profile_image_url || '' };
    return redirect('/studio.html#signed-in', [clear, await login(request, user)]);
  } catch (e) { console.error('[auth x]', e.message); return redirect('/studio.html#auth-failed', [clear]); }
}

/* ---------- Wallet (EIP-191 personal_sign) ---------- */
async function walletNonce(request){
  const host = new URL(siteUrl(request)).host, nonce = b64u(crypto.randomBytes(12)), issued = new Date().toISOString();
  const message = `${host} wants you to sign in to KIRA OS.\n\nThis only proves you own this wallet. It does not send a transaction or cost gas.\n\nNonce: ${nonce}\nIssued At: ${issued}`;
  return json({ message }, 200, [cookie(NONCE, sign({ message }, 600), 600, isSecure(request))]);
}
async function walletVerify(request){
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const n = verify(cookies(request)[NONCE]); if (!n) return json({ error: 'nonce_expired', reply: 'The sign-in request expired. Try again.' }, 400);
  const address = String(b?.address || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return json({ error: 'bad_address' }, 400);
  let signer; try { signer = verifyPersonalSign(n.message, String(b?.signature || '')); } catch { return json({ error: 'bad_signature', reply: 'That signature could not be checked.' }, 400); }
  if (signer !== address) return json({ error: 'wrong_signer', reply: 'The signature does not match this wallet.' }, 401);
  const user = { id: 'w:' + address, method: 'wallet', name: address.slice(0, 6) + '…' + address.slice(-4), avatar: '' };
  return json({ ok: true, user }, 200, [cookie(NONCE, '', 0, isSecure(request)), await login(request, user)]);
}

/* ---------- Email (6-digit code via Resend) ---------- */
const emailOk = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(e);
const emailKey = e => crypto.createHash('sha256').update(e).digest('hex').slice(0, 32);
async function emailStart(request, ip){
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  if (!methods().email) return json({ error: 'email_off', reply: 'Email sign-in is not switched on for this site yet.' }, 503);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const email = String(b?.email || '').trim().toLowerCase(); if (!emailOk(email)) return json({ error: 'bad_email', reply: 'Please enter a valid email address.' }, 400);
  const k = emailKey(email);
  if (await limited('es:' + k, 5, 3600) || await limited('esip:' + ip, 20, 3600)) return json({ error: 'rate_limited', reply: 'Too many codes requested. Try again later.' }, 429);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await set('kira:ec:' + k, JSON.stringify({ h: crypto.createHash('sha256').update(code + k).digest('hex'), tries: 0 }), 600);
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: `Your KIRA OS code: ${code}`,
      text: `Your KIRA OS sign-in code is ${code}\n\nIt expires in 10 minutes. If you did not ask for it, ignore this email.`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#111"><p>Your KIRA OS sign-in code:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</p><p style="color:#666">It expires in 10 minutes. If you did not ask for it, ignore this email.</p></div>` }),
    signal: AbortSignal.timeout(10000) });
  if (!r.ok){ console.error('[auth email]', r.status, await r.text().catch(() => '')); return json({ error: 'send_failed', reply: 'The email could not be sent. Try again in a moment.' }, 502); }
  return json({ ok: true });
}
async function emailVerify(request){
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const email = String(b?.email || '').trim().toLowerCase(), code = String(b?.code || '').trim(), k = emailKey(email);
  const raw = await get('kira:ec:' + k); if (!raw) return json({ error: 'code_expired', reply: 'That code has expired. Request a new one.' }, 400);
  const rec = JSON.parse(raw);
  if (rec.tries >= 5){ await del('kira:ec:' + k); return json({ error: 'too_many_tries', reply: 'Too many wrong codes. Request a new one.' }, 429); }
  const h = crypto.createHash('sha256').update(code + k).digest('hex');
  if (!/^\d{6}$/.test(code) || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(rec.h))){ rec.tries++; await set('kira:ec:' + k, JSON.stringify(rec), 600); return json({ error: 'wrong_code', reply: 'That code is not right.' }, 401); }
  await del('kira:ec:' + k);
  const [local, domain] = email.split('@');
  const user = { id: 'e:' + k, method: 'email', name: local.slice(0, 2) + '…@' + domain, avatar: '' };
  return json({ ok: true, user }, 200, [await login(request, user)]);
}

/* ---------- Saved agents ---------- */
async function data(request){
  const user = currentUser(request); if (!user) return json({ error: 'login_required' }, 401);
  const key = 'kira:data:' + user.id;
  if (request.method === 'GET'){ const raw = await get(key); return json(raw ? JSON.parse(raw) : { state: null, updatedAt: null }); }
  if (request.method === 'PUT'){
    if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
    const raw = await request.text(); if (raw.length > MAX_STATE + 2000) return json({ error: 'too_large', reply: 'Your workspace is too large to save. Remove some knowledge docs or chats.' }, 413);
    let b; try { b = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
    if (typeof b?.state !== 'string' || b.state.length > MAX_STATE) return json({ error: 'bad_state' }, 400);
    try { const s = JSON.parse(b.state); if (!Array.isArray(s.agents)) throw 0; } catch { return json({ error: 'bad_state' }, 400); }
    const updatedAt = new Date().toISOString();
    await set(key, JSON.stringify({ state: b.state, updatedAt }));
    return json({ ok: true, updatedAt });
  }
  return json({ error: 'method' }, 405);
}

export async function handleAuth(request, action, ip = 'anon'){
  try {
    switch (action){
      case 'me': { let user = null; try { user = currentUser(request); } catch {} return json({ user, methods: methods() }); }
    }
    if (!storeReady() || (!process.env.SESSION_SECRET && (process.env.VERCEL || process.env.NODE_ENV === 'production'))) return json({ error: 'accounts_off', reply: 'Accounts are not set up on this site yet.' }, 503);
    switch (action){
      case 'logout': return json({ ok: true }, 200, [cookie(SESSION, '', 0, isSecure(request))]);
      case 'x-login': return await xLogin(request);
      case 'x-callback': return await xCallbackH(request);
      case 'wallet-nonce': return await walletNonce(request);
      case 'wallet-verify': return await walletVerify(request);
      case 'email-start': return await emailStart(request, ip);
      case 'email-verify': return await emailVerify(request);
      case 'data': return await data(request);
      default: return json({ error: 'not_found' }, 404);
    }
  } catch (e) {
    console.error('[auth]', action, e.message);
    return json({ error: 'server_error', reply: /SESSION_SECRET|store_error/.test(e.message) ? 'Accounts are not set up on this site yet.' : 'Something went wrong. Try again.' }, 500);
  }
}
