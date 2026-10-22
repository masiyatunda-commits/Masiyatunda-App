import { getStore } from '@netlify/blobs';
import { db } from '../db/index.js';
import { mediaAssets } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { supabaseConfig } from '../lib/supabase.js';

export default async function handler(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  const json = (error: string, status: number) => Response.json({ error }, { status, headers });
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json('Method not allowed.', 405);
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json('Sign in to access DM files.', 401);
  const { base: supabaseUrl, apiKey } = supabaseConfig(request);
  if (!supabaseUrl || !apiKey) return json('Private DM uploads require SUPABASE_URL and SUPABASE_ANON_KEY in the Netlify Functions environment.', 503);
  try {
    const authHeaders = { Authorization: authorization, apikey: apiKey };
    const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
    if (!authResponse.ok) return json('Your session expired. Sign in again.', 401);
    const user = await authResponse.json();
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (!uuid.test(user.id)) return json('Invalid account.', 401);
    const url = new URL(request.url);
    const store = getStore({ name: 'milkyway-private-dm-files', consistency: 'strong' });
    const types: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', heic: 'image/heic', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip' };
    if (request.method === 'POST') {
      const recipient = url.searchParams.get('recipient') || '';
      if (!uuid.test(recipient) || recipient === user.id) return json('Choose a valid DM recipient.', 400);
      const recipientResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/mw_profiles?id=eq.${recipient}&select=id`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!recipientResponse.ok || !(await recipientResponse.json()).length) return json('The recipient could not be verified.', 403);
      const length = Number(request.headers.get('Content-Length'));
      if (length > 4 * 1024 * 1024 + 65536) return json('Private attachments are limited to 4 MB per file.', 413);
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File) || !file.size) return json('Choose a non-empty file.', 400);
      if (file.size > 4 * 1024 * 1024) return json('Private attachments are limited to 4 MB per file.', 413);
      const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
      const extension = name.split('.').pop()?.toLowerCase() || '';
      if (!types[extension]) return json('Unsupported file type. Use an image, video, audio, PDF or common document.', 415);
      const key = `${user.id}/${recipient}/${crypto.randomUUID()}/${name}`;
      await store.set(key, await file.arrayBuffer());
      try { await db.insert(mediaAssets).values({ key, ownerId: user.id, recipientId: recipient, purpose: 'dm', name: file.name.slice(0, 120), mime: types[extension] }); }
      catch { await store.delete(key); throw new Error('File registration failed'); }
      return Response.json({ key, name: file.name.slice(0, 120), type: types[extension] }, { status: 201, headers });
    }
    const key = url.searchParams.get('key') || '';
    const parts = key.split('/');
    if (parts.length !== 4 || !parts.slice(0, 3).every(part => uuid.test(part)) || !/^[a-zA-Z0-9._-]{1,120}$/.test(parts[3])) return json('Invalid file reference.', 400);
    if (![parts[0], parts[1]].includes(user.id)) return json('This DM file is private.', 403);
    if (request.method === 'DELETE') {
      if (parts[0] !== user.id) return json('Only the uploader can remove an unsent file.', 403);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.key, key));
      if (asset?.retained) return json('This file is retained for moderation or legal review.', 409);
      const messages = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/mw_messages?sender_id=eq.${user.id}&body=like.*${encodeURIComponent(key)}*&select=id&limit=1`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!messages.ok || (await messages.json()).length) return json('Sent attachments are preserved. Delete the message instead.', 409);
      await store.delete(key);
      await db.update(mediaAssets).set({ deleted: true }).where(eq(mediaAssets.key, key));
      return new Response(null, { status: 204, headers });
    }
    const file = await store.get(key, { type: 'arrayBuffer' });
    if (!file) return json('The file is unavailable.', 404);
    const extension = parts[3].split('.').pop()?.toLowerCase() || '';
    const contentType = types[extension] || 'application/octet-stream';
    return new Response(file as ArrayBuffer, { headers: { ...headers, 'Content-Type': contentType, 'Content-Disposition': `${/^(image|audio|video)\//.test(contentType) ? 'inline' : 'attachment'}; filename="${parts[3]}"`, 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  } catch { return json('The private file service is unavailable. Retry or check the server configuration.', 503); }
}
