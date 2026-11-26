// Vercel function: GET /api/status → owner-only usage stats (lib/status.js)
import { handleStatus } from '../lib/status.js';
export function GET(request){ return handleStatus(request); }
