// Vercel function: /api/gallery → public agent gallery (lib/gallery.js)
import { handleGallery } from '../lib/gallery.js';
const run = request => handleGallery(request, (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon');
export const GET = run, POST = run, DELETE = run;
