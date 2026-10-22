import { RoomServiceClient } from 'livekit-server-sdk';
import { supabaseConfig } from './supabase.js';
import { livekitConfig } from './livekit.js';
import { livekitDirect } from './livekit-direct.js';

// Answers a room action with the site's own LiveKit credentials when they are configured, otherwise relays to the Supabase livekit-token function.
export async function livekitExchange(request: Request, body?: Record<string, unknown>): Promise<{ status: number; result: any }> {
  if (livekitConfig()) return livekitDirect(request, body);
  const { base, apiKey } = supabaseConfig(request);
  if (!base) throw Object.assign(new Error('The Live account service is unavailable.'), { safe: true, status: 503 });
  let response: Response;
  try { response = await fetch(`${base}/functions/v1/livekit-token`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { apikey: apiKey } : {}), ...(request.headers.get('Authorization') ? { Authorization: request.headers.get('Authorization')! } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000),
  }); } catch { throw Object.assign(new Error('The Live service request timed out or could not connect. Retry after reconnecting.'), { safe: true, status: 503, reason: 'network_error' }); }
  return { status: response.status, result: await response.json().catch(() => null) };
}

export async function livekitRequest(request: Request, body?: Record<string, unknown>) {
  const { status, result } = await livekitExchange(request, body);
  const response = { status, ok: status >= 200 && status < 300 };
  if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) {
    const reason = response.status === 401 ? 'authentication_required' : response.status === 403 ? 'access_denied' : [402, 429].includes(response.status) ? 'platform_restricted' : response.status === 404 ? 'endpoint_missing' : response.status === 405 || response.status === 400 && body && ['discovery', 'participants', 'sync', 'end'].includes(String(body.action)) ? 'endpoint_incompatible' : response.ok ? 'invalid_response' : 'service_error';
    const message = reason === 'authentication_required' ? body ? 'Your session expired. Sign in again.' : 'Live health checks require authentication at the deployed gateway. Sign in or deploy the reviewed livekit-token gateway configuration.' : reason === 'access_denied' ? 'Live access was denied.' : reason === 'platform_restricted' ? 'Supabase has limited Live requests. Retry after the platform restriction is resolved.' : reason === 'endpoint_missing' ? 'The livekit-token endpoint is not deployed.' : 'The Supabase livekit-token service is unavailable or incompatible. Check its deployment.';
    throw Object.assign(new Error(message), { safe: true, status: response.ok ? 503 : response.status, reason });
  }
  const incompatible = () => { throw Object.assign(new Error('The deployed livekit-token function returned the wrong response for this room action. Publish the reviewed existing Supabase function; do not reset credentials.'), { safe: true, status: 503, reason: 'endpoint_incompatible' }); };
  if (!body && (typeof result.available !== 'boolean' || !['supabase', 'netlify'].includes(result.service))) incompatible();
  if (body?.action === 'participants' && (!Array.isArray(result.participants) || result.participants.some((participant: any) => !participant || typeof participant.identity !== 'string' || !participant.identity))) incompatible();
  if (body?.action === 'discovery' && (!Array.isArray(result.sessions) || result.sessions.some((record: any) => !record || typeof record.room_name !== 'string' || typeof record.host_id !== 'string'))) incompatible();
  if (['sync', 'end'].includes(String(body?.action)) && result.ok !== true) incompatible();
  return result;
}

const ignoreMissing = (error: unknown) => { if ((error as { code?: string }).code !== 'not_found') throw error; };

// Room controls for a caller that has already authorized the action. With the site's own LiveKit credentials they go straight
// to LiveKit; re-authorizing every permission change and participant list through the token relay is what made joining lag.
export function livekitService(request: Request, pending: (() => Promise<unknown>)[]) {
  const config = livekitConfig();
  if (config) {
    const client = new RoomServiceClient(config.serviceUrl, config.apiKey, config.apiSecret, { requestTimeout: 8, failover: false });
    return {
      listParticipants: async (room: string): Promise<{ identity: string; permission?: { canPublish?: boolean; canPublishData?: boolean; canPublishSources?: number[] }; tracks?: { source: number }[] }[]> => {
        try { return (await client.listParticipants(room)) as any; } catch (error) { ignoreMissing(error); return []; }
      },
      updateParticipant: async (room: string, target: string, options: { permission?: Record<string, unknown> }) => { pending.push(() => client.updateParticipant(room, target, { permission: options.permission as any }).catch(ignoreMissing)); },
      removeParticipant: async (room: string, target: string, options?: { revokeTokenTs?: bigint }) => { pending.push(() => client.removeParticipant(room, target, { revokeTokenTs: options?.revokeTokenTs ?? BigInt(Math.ceil(Date.now() / 1000)) }).catch(ignoreMissing)); },
      deleteRoom: async (room: string) => client.deleteRoom(room),
    };
  }
  return {
    listParticipants: async (room: string): Promise<{ identity: string; permission?: { canPublish?: boolean; canPublishData?: boolean; canPublishSources?: number[] } }[]> => {
      const result = await livekitRequest(request, { action: 'participants', roomName: room });
      return result.participants;
    },
    updateParticipant: async (room: string, target: string, _options: unknown) => { pending.push(() => livekitRequest(request, { action: 'sync', roomName: room, target })); },
    removeParticipant: async (room: string, target: string, _options?: unknown) => { pending.push(() => livekitRequest(request, { action: 'sync', roomName: room, target })); },
    deleteRoom: async (room: string) => livekitRequest(request, { action: 'end', roomName: room }),
  };
}
