// Vercel function: /api/tg/connect | list | disconnect | hook → live Telegram bots (lib/agents.js)
import { handleTelegram } from '../../lib/agents.js';
const run = r => handleTelegram(r, new URL(r.url).pathname.split('/').pop(), (r.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon');
export const GET = run, POST = run;
