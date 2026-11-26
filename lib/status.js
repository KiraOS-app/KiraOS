// Owner-only usage page data: GET /api/status. Only accounts listed in ADMIN_IDS can read it.
// ADMIN_IDS is a comma list of X handles (@name), wallet addresses (0x…) or account ids (x:123, w:0x…, e:…).
import { currentUser } from './auth.js';
import { mget, lrange } from './store.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function isAdmin(user){
  if (!user) return false;
  const list = String(process.env.ADMIN_IDS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const mine = [user.id, user.name, user.id.replace(/^w:/, '')].map(x => String(x || '').toLowerCase());
  return list.some(x => mine.includes(x) || mine.includes('@' + x.replace(/^@/, '')));
}

export async function handleStatus(request){
  let user = null; try { user = currentUser(request); } catch {}
  if (!user) return json({ error: 'sign_in', reply: 'Sign in first (Studio → Sign in), then open this page again.' }, 401);
  if (!isAdmin(user)) return json({ error: 'not_admin', reply: `This page is for the site owner. Add ${user.name} to ADMIN_IDS in Vercel to see it.` }, 403);
  const days = [...Array(14)].map((_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  try {
    const [ok, err, cap] = await Promise.all([mget(days.map(d => 'stat:ok:' + d)), mget(days.map(d => 'stat:err:' + d)), mget(days.map(d => 'cap:' + d))]);
    const log = (await lrange('log:ai', 0, 49) || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
    return json({
      user: user.name,
      cap: Number(process.env.STUDIO_DAILY_CAP) || 3000,
      days: days.map((d, i) => ({ day: d, ok: +(ok?.[i] || 0), err: +(err?.[i] || 0), calls: +(cap?.[i] || 0) })),
      log,
    });
  } catch (e) {
    return json({ error: 'store', reply: 'Could not read stats. Check the Upstash variables in Vercel.' }, 500);
  }
}
