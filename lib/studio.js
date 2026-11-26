// KIRA OS — POST /api/studio
// One Claude call for the KIRA OS Studio and home chat (public/).
// The page runs the agent runtime and its tools itself; this endpoint only forwards a
// bounded request to Claude with the site's key and returns the response content.
// Body: { messages: [{ role, content }], tools?: [{ name, description, input_schema }], tier?: 'quick'|'default'|'complex' }
const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
const aiModel = () => process.env.AI_MODEL || 'claude-haiku-5-5';

const API = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '') + '/v1/messages';
const PER_MIN = Number(process.env.STUDIO_PER_MINUTE) || 20;
const PER_DAY = Number(process.env.STUDIO_PER_DAY) || 300;
const DAILY_CAP = Number(process.env.STUDIO_DAILY_CAP) || 3000; // all visitors together, per server instance
const MAX_BODY = 90_000;   // characters of JSON per request
// Only pages on these origins may call the endpoint (comma-separated). *.vercel.app previews of this project and
// localhost are allowed too. Set ALLOWED_ORIGINS to override.
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://getkira.xyz,https://www.getkira.xyz').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
function originOk(origin){
  if (!origin) return false;
  if (ORIGINS.includes(origin)) return true;
  try { const u = new URL(origin);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.protocol === 'https:' && /^kira-os(-[a-z0-9-]+)?\.vercel\.app$/.test(u.hostname)) return true;
  } catch {}
  return false;
}
let total = { day: '', n: 0 };
const MAX_TOKENS = 1024;

const hits = new Map();
function allowed(ip){
  const now = Date.now(), day = new Date().toISOString().slice(0, 10);
  const h = hits.get(ip) || { day, n: 0, recent: [] };
  if (h.day !== day){ h.day = day; h.n = 0; }
  h.recent = h.recent.filter(t => now - t < 60_000);
  if (h.recent.length >= PER_MIN || h.n >= PER_DAY) return false;
  h.recent.push(now); h.n++; hits.set(ip, h);
  if (hits.size > 20_000) hits.delete(hits.keys().next().value);
  return true;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function modelFor(tier){
  if (tier === 'complex') return process.env.STUDIO_MODEL_REASONING || process.env.STUDIO_MODEL || aiModel();
  if (tier === 'default') return process.env.STUDIO_MODEL || aiModel();
  return aiModel();
}

const BLOCK_TYPES = new Set(['text', 'tool_use', 'tool_result']);
function cleanContent(c){
  if (typeof c === 'string') return c.trim() ? c : null;
  if (!Array.isArray(c) || !c.length || c.length > 30) return null;
  const out = [];
  for (const b of c){
    if (!b || !BLOCK_TYPES.has(b.type)) return null;
    if (b.type === 'text'){ if (typeof b.text !== 'string') return null; if (b.text) out.push({ type: 'text', text: b.text }); }
    else if (b.type === 'tool_use'){ if (typeof b.id !== 'string' || typeof b.name !== 'string') return null; out.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input && typeof b.input === 'object' ? b.input : {} }); }
    else { if (typeof b.tool_use_id !== 'string') return null; out.push({ type: 'tool_result', tool_use_id: b.tool_use_id, content: String(b.content ?? '').slice(0, 8000), is_error: !!b.is_error }); }
  }
  return out.length ? out : null;
}

function explain(status, msg){
  if (status === 401 || status === 403) return 'The AI key on this site is not valid. The site owner needs to check ANTHROPIC_API_KEY in Vercel.';
  if (/credit|billing|balance/i.test(msg)) return 'The AI account for this site is out of credit. The site owner needs to add credit in the Anthropic Console.';
  if (status === 404 || /model/i.test(msg) && status === 400) return 'The AI model name on this site is not valid. The site owner needs to check AI_MODEL in Vercel.';
  if (status === 429) return 'Too many AI requests right now. Please wait a minute and try again.';
  if (status === 529 || status >= 500) return 'The model is busy right now. Please try again in a moment.';
  return 'The AI could not answer this message (error ' + status + '). Please try again.';
}

export async function handleStudio(request, ip = 'anon'){
  if (process.env.STUDIO_DISABLED === '1') return json({ error: 'studio_disabled', reply: 'Agent Studio is switched off on this site.' }, 503);
  if (!aiEnabled()) return json({ error: 'ai_not_configured', reply: 'The AI is not switched on for this site yet (ANTHROPIC_API_KEY is missing).' }, 503);
  if (!originOk(request.headers.get('origin'))) return json({ error: 'forbidden_origin', reply: 'This endpoint only answers the KIRA OS website.' }, 403);
  let raw; try { raw = await request.text(); } catch { return json({ error: 'bad_body' }, 400); }
  if (raw.length > MAX_BODY) return json({ error: 'too_large', reply: 'That conversation is too long. Clear the chat or shorten the knowledge docs.' }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
  if (!allowed(ip)) return json({ error: 'rate_limited', reply: 'Too many requests in a short time — please wait a minute.' }, 429);
  const today = new Date().toISOString().slice(0, 10);
  if (total.day !== today) total = { day: today, n: 0 };
  if (total.n >= DAILY_CAP) return json({ error: 'daily_cap', reply: 'KIRA OS has reached today\'s usage limit. Please come back tomorrow.' }, 429);
  total.n++;

  const msgs = [];
  for (const m of (Array.isArray(body?.messages) ? body.messages : []).slice(-40)){
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = cleanContent(m.content); if (!content) continue;
    msgs.push({ role: m.role, content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json({ error: 'no_question' }, 400);

  const tools = (Array.isArray(body?.tools) ? body.tools : []).slice(0, 24)
    .filter(t => t && /^[A-Za-z0-9_-]{1,64}$/.test(t.name || '') && t.input_schema && typeof t.input_schema === 'object')
    .map(t => ({ name: t.name, description: String(t.description || '').slice(0, 1000), input_schema: t.input_schema }));

  const payload = JSON.stringify({ model: modelFor(body?.tier), max_tokens: MAX_TOKENS, messages: msgs, tools: tools.length ? tools : undefined });
  const call = () => fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: payload,
    signal: AbortSignal.timeout(50_000),
  });
  try {
    let r = await call();
    for (let i = 0; i < 2 && (r.status === 429 || r.status === 529 || r.status >= 500); i++){
      await new Promise(ok => setTimeout(ok, 1500 * (i + 1)));
      r = await call();
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok){
      const msg = String(j?.error?.message || '');
      console.error('[studio]', r.status, msg);
      return json({ error: 'model_error', status: r.status, reply: explain(r.status, msg) }, 502);
    }
    return json({ content: j.content || [], stop_reason: j.stop_reason || 'end_turn' });
  } catch (e) {
    console.error('[studio]', e.message);
    const slow = /timeout|abort/i.test(e.message);
    return json({ error: 'model_error', reply: slow ? 'The model took too long to answer. Please try again.' : 'Could not reach the model. Please try again in a moment.' }, 502);
  }
}
