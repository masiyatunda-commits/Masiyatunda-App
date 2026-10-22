import { authorizeLiveRoom } from '../lib/live-authorize.js';

export default async function handler(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const fail = (status: number) => Response.json({ error: 'Live authorization denied.' }, { status, headers });
  if (request.method !== 'POST') return fail(405);
  if (!(request.headers.get('Authorization') || '').startsWith('Bearer ')) return fail(401);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return fail(413);
    return Response.json(await authorizeLiveRoom(request, JSON.parse(raw)), { headers });
  } catch (error) { return fail((error as { status?: number }).status || 503); }
}
