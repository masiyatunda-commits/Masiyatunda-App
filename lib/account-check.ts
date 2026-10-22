import { supabaseConfig } from './supabase.js';
import { administratorAccess } from './admin.js';

// Resolves the Supabase account behind a Bearer token, and whether it is an administrator.
// Returns null when no valid session is presented.
export async function verifiedAccount(request: Request) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const { base, apiKey } = supabaseConfig(request);
  if (!base || !apiKey) return null;
  const authHeaders = { Authorization: authorization, apikey: apiKey };
  const response = await fetch(`${base}/auth/v1/user`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const account = await response.json();
  if (!/^[a-f0-9-]{36}$/i.test(account.id || '')) return null;
  return { id: account.id as string, isAdmin: async () => administratorAccess(account, base, authHeaders) };
}
