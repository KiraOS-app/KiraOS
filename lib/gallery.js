// KIRA OS public agent gallery.
//   GET    /api/gallery            → { items }          newest first
//   POST   /api/gallery { agent }  → { item }           signed-in users only
//   DELETE /api/gallery?id=…                            author (or ADMIN_IDS) only
import crypto from 'node:crypto';
import { get, set, del, incr, lpush, lrange, ltrim, lrem, mget } from './store.js';
import { currentUser } from './auth.js';

const INDEX = 'kira:g:index', ITEM = id => 'kira:g:' + id, MAX_ITEMS = 500;
const json = (body, status = 200, cache = 'no-store') => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const PLUGIN = /^[a-z0-9-]{2,40}$/;
const admins = () => (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
function sameOrigin(request){ const o = request.headers.get('origin'); if (!o) return false; try { return new URL(o).host === new URL(request.url).host || (process.env.SITE_URL && new URL(o).host === new URL(process.env.SITE_URL).host); } catch { return false; } }

function clean(a){
  const avatar = typeof a?.avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.avatar) && a.avatar.length <= 40_000 ? a.avatar : '';
  const knowledge = (Array.isArray(a?.knowledge) ? a.knowledge : []).slice(0, 5).map(d => ({ title: str(d?.title, 80), text: str(d?.text, 4000) })).filter(d => d.text);
  return {
    name: str(a?.name, 40), role: str(a?.role, 120), bio: str(a?.bio, 600), traits: str(a?.traits, 160), style: str(a?.style, 800),
    tier: ['quick', 'default', 'complex'].includes(a?.tier) ? a.tier : 'default',
    plugins: (Array.isArray(a?.plugins) ? a.plugins : []).map(String).filter(p => PLUGIN.test(p)).slice(0, 20),
    knowledge, avatar
  };
}

export async function handleGallery(request, ip = 'anon'){
  try {
    if (request.method === 'GET'){
      const ids = await lrange(INDEX, 0, 119);
      const raws = await mget(ids.map(ITEM));
      const items = raws.filter(Boolean).map(r => JSON.parse(r));
      return json({ items }, 200, 'public, max-age=20');
    }
    if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
    let user = null; try { user = currentUser(request); } catch {}
    if (!user) return json({ error: 'login_required', reply: 'Sign in to share agents.' }, 401);

    if (request.method === 'POST'){
      if (await incr('kira:rl:gp:' + user.id, 3600) > 10) return json({ error: 'rate_limited', reply: 'You shared a lot this hour. Try again later.' }, 429);
      const raw = await request.text(); if (raw.length > 80_000) return json({ error: 'too_large', reply: 'This agent is too large to share. Remove some knowledge docs.' }, 413);
      let b; try { b = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
      const agent = clean(b?.agent);
      if (agent.name.length < 2 || agent.bio.length < 10) return json({ error: 'incomplete', reply: 'Give the agent a name and a bio of at least 10 characters before sharing.' }, 400);
      const item = { id: crypto.randomBytes(8).toString('hex'), agent, author: { id: user.id, name: user.name }, createdAt: new Date().toISOString() };
      await set(ITEM(item.id), JSON.stringify(item));
      await lpush(INDEX, item.id); await ltrim(INDEX, 0, MAX_ITEMS - 1);
      return json({ item });
    }
    if (request.method === 'DELETE'){
      const id = new URL(request.url).searchParams.get('id') || '';
      if (!/^[0-9a-f]{16}$/.test(id)) return json({ error: 'bad_id' }, 400);
      const raw = await get(ITEM(id)); if (!raw) return json({ error: 'not_found' }, 404);
      const item = JSON.parse(raw);
      if (item.author.id !== user.id && !admins().includes(user.id)) return json({ error: 'forbidden', reply: 'Only the author can remove this agent.' }, 403);
      await del(ITEM(id)); await lrem(INDEX, id);
      return json({ ok: true });
    }
    return json({ error: 'method' }, 405);
  } catch (e) {
    console.error('[gallery]', e.message);
    return json({ error: 'server_error', reply: 'The gallery is not available right now.' }, 500);
  }
}
