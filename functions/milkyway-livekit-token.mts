import { livekitExchange } from '../lib/livekit-service.js';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

// Same-origin LiveKit token, room and health endpoint for the app. GET is the public health check.
export default async function handler(request: Request) {
  if (!['GET', 'POST'].includes(request.method)) return Response.json({ error: 'Method not allowed.' }, { status: 405, headers });
  try {
    let body: Record<string, unknown> | undefined;
    if (request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 4096) return Response.json({ error: 'Request too large.' }, { status: 413, headers });
      try { body = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400, headers }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Invalid request.' }, { status: 400, headers });
    }
    const { status, result } = await livekitExchange(request, body);
    if (!result || typeof result !== 'object') return Response.json(body ? { error: 'The Live token service returned an invalid response.' } : { available: false, reason: 'invalid_response', service: 'netlify' }, { status: body ? 503 : 200, headers });
    return Response.json(result, { status, headers });
  } catch (error) {
    const known = error as { safe?: boolean; message?: string; status?: number; reason?: string };
    if (request.method === 'GET') return Response.json({ available: false, reason: known.reason || 'network_error', service: 'netlify' }, { headers });
    return Response.json({ error: known.safe ? known.message : 'The Live token service is unavailable. Retry.' }, { status: known.status || 503, headers });
  }
}
