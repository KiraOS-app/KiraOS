// Vercel function: /api/share → create or read an agent share link (lib/agents.js)
import { handleShare } from '../lib/agents.js';
const ip = r => (r.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon';
export const GET = r => handleShare(r, ip(r));
export const POST = r => handleShare(r, ip(r));
