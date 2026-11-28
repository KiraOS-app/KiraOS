// Vercel function: POST /api/studio → one Claude call for KIRA OS (public/)
import { handleStudio } from '../lib/studio.js';
export function POST(request) {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon';
  return handleStudio(request, ip);
}
