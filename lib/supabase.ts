// Public project endpoint used when SUPABASE_URL is not configured in the Functions environment.
// Trust is anchored to this URL: a client-supplied publishable key is only forwarded to it, never used to pick the project.
const projectUrl = 'https://wpclkhgizbvxuvbhbwzs.supabase.co';

export function supabaseConfig(request: Request) {
  let base = '';
  try {
    const address = new URL(process.env.SUPABASE_URL || projectUrl);
    if (address.protocol === 'https:' && !address.username && !address.password && !address.search && !address.hash && address.pathname === '/') base = address.origin;
  } catch {}
  const supplied = request.headers.get('apikey') || '';
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || (/^[A-Za-z0-9._-]{20,1000}$/.test(supplied) ? supplied : '');
  return { base, apiKey };
}
