import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { getStore } from '@netlify/blobs';
import { db } from '../db/index.js';
import { messageEdits, mediaAssets, conversationArchives, messageHides, chatGroupMembers, chatGroupMessages } from '../db/schema.js';
import { supabaseConfig } from '../lib/supabase.js';
import { assertActive } from '../lib/suspensions.js';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export default async function handler(request: Request) {
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return Response.json({ error: 'Method not allowed.' }, { status: 405, headers });
  try {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) fail('Sign in first.', 401);
    const { base, apiKey } = supabaseConfig(request);
    if (!base || !apiKey) fail('Message service is not configured.', 503);
    const authHeaders = { Authorization: authorization, apikey: apiKey! };
    const query = async (path: string) => {
      const response = await fetch(`${base}/${path}`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!response.ok) fail('Message access could not be verified.', response.status === 401 ? 401 : 503);
      return response.json();
    };
    const account = await query('auth/v1/user');
    if (!uuid.test(account.id)) fail('Sign in again.', 401);
    if (request.method === 'POST') await assertActive(account.id);
    const params = new URL(request.url).searchParams;
    const action = params.get('action');
    // Group chats are stored in Netlify Database; rows use the same snake_case shape as direct messages.
    const groupRow = (row: typeof chatGroupMessages.$inferSelect) => ({ id: row.id, group_id: row.groupId, sender_id: row.senderId, body: row.body, created_at: row.createdAt.toISOString() });
    const groupMember = async (group: string) => (await db.select({ userId: chatGroupMembers.userId }).from(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, group), eq(chatGroupMembers.userId, account.id)))).length > 0;
    const ownGroupMessage = async (id: string, group: string) => (await db.select().from(chatGroupMessages).where(and(eq(chatGroupMessages.id, id), eq(chatGroupMessages.senderId, account.id), eq(chatGroupMessages.groupId, group))))[0];
    if (action === 'archives') {
      if (request.method !== 'GET') fail('Method not allowed.', 405);
      const archives = await db.select().from(conversationArchives).where(eq(conversationArchives.ownerId, account.id));
      return Response.json({ archives }, { headers });
    }
    if (action === 'conversation') {
      const peer = params.get('peer') || '';
      if (!uuid.test(peer) || peer === account.id) fail('Choose a valid conversation.', 400);
      if (request.method === 'DELETE') {
        await db.delete(conversationArchives).where(and(eq(conversationArchives.ownerId, account.id), eq(conversationArchives.peerId, peer)));
      } else if (request.method === 'POST') {
        const messages = await query(`rest/v1/mw_messages?or=(and(sender_id.eq.${account.id},receiver_id.eq.${peer}),and(sender_id.eq.${peer},receiver_id.eq.${account.id}))&select=id&limit=1`);
        if (!messages.length) fail('Conversation unavailable.', 404);
        const archivedAt = new Date();
        await db.insert(conversationArchives).values({ ownerId: account.id, peerId: peer, archivedAt }).onConflictDoUpdate({ target: [conversationArchives.ownerId, conversationArchives.peerId], set: { archivedAt } });
      } else fail('Method not allowed.', 405);
      return Response.json({ ok: true }, { headers });
    }
    if (action === 'hide') {
      if (request.method !== 'POST') fail('Method not allowed.', 405);
      const raw = await request.text();
      if (raw.length > 8192) fail('Request too large.', 413);
      const body = JSON.parse(raw || '{}');
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
      if (!ids.length || ids.length > 100 || !ids.every(id => typeof id === 'string' && uuid.test(id))) fail('Invalid message reference.', 400);
      if (body.group && !uuid.test(body.group)) fail('Invalid group.', 400);
      let visible: { id: string }[];
      if (body.group) {
        if (!await groupMember(body.group)) fail('Conversation unavailable.', 404);
        visible = await db.select({ id: chatGroupMessages.id }).from(chatGroupMessages).where(and(eq(chatGroupMessages.groupId, body.group), inArray(chatGroupMessages.id, ids as string[])));
      } else {
        visible = await query(`rest/v1/mw_messages?id=in.(${ids.join(',')})&or=(sender_id.eq.${account.id},receiver_id.eq.${account.id})&select=id`);
      }
      if (!visible.length) fail('Message unavailable.', 404);
      await db.insert(messageHides).values(visible.map(record => ({ ownerId: account.id, messageId: record.id }))).onConflictDoNothing();
      return Response.json({ hidden: visible.map(record => record.id) }, { headers });
    }
    if (action === 'message' && request.method === 'DELETE') {
      const id = params.get('id') || '', group = params.get('group');
      if (!uuid.test(id) || group && !uuid.test(group)) fail('Invalid message reference.', 400);
      let original;
      if (group) {
        original = await ownGroupMessage(id, group);
        if (!original) fail('Only the sender can delete this message.', 403);
        await db.delete(chatGroupMessages).where(and(eq(chatGroupMessages.id, id), eq(chatGroupMessages.senderId, account.id)));
      } else {
        const filter = `id=eq.${id}&sender_id=eq.${account.id}`;
        [original] = await query(`rest/v1/mw_messages?${filter}&select=*&limit=1`);
        if (!original) fail('Only the sender can delete this message.', 403);
        const deletion = await fetch(`${base}/rest/v1/mw_messages?${filter}&select=id`, { method: 'DELETE', headers: { ...authHeaders, Prefer: 'return=representation' }, signal: AbortSignal.timeout(10000) });
        if (!deletion.ok) fail('Message deletion was denied or unavailable. Nothing was confirmed deleted.', [401, 403].includes(deletion.status) ? deletion.status : 503);
        const removed = await deletion.json();
        if (!removed.some((record: { id: string }) => record.id === id)) fail('Message deletion was not confirmed. Check the sender deletion policy.', 403);
      }
      let revisionCleanupPending = false;
      await db.delete(messageEdits).where(and(eq(messageEdits.id, id), eq(messageEdits.senderId, account.id))).catch(() => { revisionCleanupPending = true; });
      let attachmentState = 'none';
      let attachment;
      if (!group && original.encryption_version !== 1) { try { attachment = JSON.parse(original.body); } catch {} }
      if (attachment?.mwAttachment === 1 && typeof attachment.key === 'string') {
        attachmentState = 'pending';
        try {
          const [asset] = await db.select().from(mediaAssets).where(and(eq(mediaAssets.key, attachment.key), eq(mediaAssets.ownerId, account.id), eq(mediaAssets.purpose, 'dm'), eq(mediaAssets.recipientId, original.receiver_id)));
          if (asset?.retained) attachmentState = 'retained';
          else if (asset?.deleted) attachmentState = 'deleted';
          else if (asset && asset.key.startsWith(`${account.id}/${original.receiver_id}/`)) {
            const references = await query(`rest/v1/mw_messages?sender_id=eq.${account.id}&body=like.*${encodeURIComponent(asset.key)}*&select=id&limit=1`);
            if (references.length) attachmentState = 'shared';
            else {
              await getStore('milkyway-private-dm-files').delete(asset.key);
              await db.update(mediaAssets).set({ deleted: true }).where(and(eq(mediaAssets.key, asset.key), eq(mediaAssets.ownerId, account.id)));
              attachmentState = 'deleted';
            }
          }
        } catch {}
      }
      return Response.json({ messageDeleted: true, attachmentState, revisionCleanupPending }, { headers });
    }
    if (request.method === 'DELETE') {
      const params = new URL(request.url).searchParams;
      const id = params.get('id') || '';
      const group = params.get('group');
      if (!uuid.test(id) || group && !uuid.test(group)) fail('Invalid message reference.', 400);
      const records = group ? (await ownGroupMessage(id, group) ? [id] : []) : await query(`rest/v1/mw_messages?id=eq.${id}&sender_id=eq.${account.id}&select=id&limit=1`);
      if (records.length) fail('Delete the original message before clearing its revision.', 409);
      await db.delete(messageEdits).where(and(eq(messageEdits.id, id), eq(messageEdits.senderId, account.id)));
      return new Response(null, { status: 204, headers });
    }
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const group = url.searchParams.get('group');
      const peer = group || url.searchParams.get('peer') || '';
      const inbox = action === 'inbox';
      if (!inbox && (!uuid.test(peer) || !group && peer === account.id)) fail('Choose a valid conversation.', 400);
      let cursor = '';
      const before = params.get('before'), beforeId = params.get('beforeId');
      if (before || beforeId) {
        if (!before || !beforeId || !uuid.test(beforeId) || !Number.isFinite(Date.parse(before)) || new Date(before).toISOString() !== before) fail('Invalid history cursor.', 400);
        cursor = `&or=(created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId}))`;
      }
      const condition = inbox ? `or(sender_id.eq.${account.id},receiver_id.eq.${account.id})` : `or(and(sender_id.eq.${account.id},receiver_id.eq.${peer}),and(sender_id.eq.${peer},receiver_id.eq.${account.id}))`;
      const limit = inbox ? 200 : 100;
      if (group && !await groupMember(group)) fail('Conversation unavailable.', 404);
      const messages = group ? (await db.select().from(chatGroupMessages).where(and(eq(chatGroupMessages.groupId, group), before && beforeId ? or(lt(chatGroupMessages.createdAt, new Date(before)), and(eq(chatGroupMessages.createdAt, new Date(before)), lt(chatGroupMessages.id, beforeId))) : undefined)).orderBy(desc(chatGroupMessages.createdAt), desc(chatGroupMessages.id)).limit(limit)).map(groupRow) : await query(`rest/v1/mw_messages?and=(${condition}${cursor ? `,${cursor.slice(1).replace('or=', 'or')}` : ''})&select=*&order=created_at.desc,id.desc&limit=${limit}`);
      const ids = messages.map((message: { id: string }) => message.id);
      const edits = ids.length ? await db.select().from(messageEdits).where(inArray(messageEdits.id, ids)) : [];
      const hides = ids.length ? await db.select({ id: messageHides.messageId }).from(messageHides).where(and(eq(messageHides.ownerId, account.id), inArray(messageHides.messageId, ids))) : [];
      const hidden = new Set(hides.map(hide => hide.id));
      const revisions = new Map(edits.map(edit => [edit.id, edit]));
      const last = messages.at(-1);
      return Response.json({ nextCursor: messages.length === limit ? { at: last.created_at, id: last.id } : null, messages: messages.filter((message: { id: string }) => !hidden.has(message.id)).map((message: { id: string; sender_id: string; receiver_id?: string; group_id?: string }) => {
        const edit = revisions.get(message.id);
        return edit && edit.senderId === message.sender_id && edit.receiverId === (message.receiver_id || message.group_id) ? { ...message, body: edit.body, edited_at: edit.updatedAt } : message;
      }) }, { headers });
    }
    const raw = await request.text();
    if (raw.length > 8192) fail('Request too large.', 413);
    const body = JSON.parse(raw);
    if (!uuid.test(body.id) || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1000) fail('Use 1–1000 characters.', 400);
    if (body.group && !uuid.test(body.group)) fail('Invalid group.', 400);
    const [original] = body.group ? [await ownGroupMessage(body.id, body.group)].filter(Boolean).map(row => groupRow(row!)) : await query(`rest/v1/mw_messages?id=eq.${body.id}&sender_id=eq.${account.id}&select=id,sender_id,receiver_id,body,encryption_version&limit=1`);
    if (!original) fail('Only the sender can edit this message.', 403);
    let attachment = false;
    try { attachment = JSON.parse(original.body)?.mwAttachment === 1; } catch {}
    if (original.encryption_version === 1 || attachment) fail('Legacy encrypted messages and attachments cannot be edited.', 409);
    await db.insert(messageEdits).values({ id: original.id, senderId: account.id, receiverId: original.receiver_id || original.group_id, body: body.message.trim() }).onConflictDoUpdate({ target: messageEdits.id, set: { body: body.message.trim(), updatedAt: new Date() } });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const known = error as { status?: number; message?: string };
    return Response.json({ error: known.status ? known.message : 'Message service unavailable. Reconnect and retry.' }, { status: known.status || 503, headers });
  }
}
