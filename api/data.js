// Vercel function: /api/data → the signed-in user's saved agents (lib/auth.js)
import { handleAuth } from '../lib/auth.js';
const run = request => handleAuth(request, 'data');
export const GET = run, PUT = run;
