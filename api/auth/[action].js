// Vercel function: /api/auth/<action> → sign in with X, wallet or email (lib/auth.js)
import { handleAuth } from '../../lib/auth.js';
const run = request => {
  const action = new URL(request.url).pathname.split('/').pop();
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon';
  return handleAuth(request, action, ip);
};
export const GET = run, POST = run;
