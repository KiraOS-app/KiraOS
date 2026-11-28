// Vercel function: POST /api/agent-chat → talk to a shared agent (lib/agents.js)
import { handleAgentChat } from '../lib/agents.js';
export const POST = r => handleAgentChat(r, (r.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon');
