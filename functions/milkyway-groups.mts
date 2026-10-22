import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chatGroups, chatGroupBans, chatGroupMembers, chatGroupMessages } from '../db/schema.js';
import { supabaseConfig } from '../lib/supabase.js';
import { assertActive } from '../lib/suspensions.js';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export default async function handler(request: Request) {
  if (!['GET', 'POST'].includes(request.method)) return Response.json({ error: 'Method not allowed.' }, { status: 405, headers });
  try {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) fail('Sign in first.', 401);
    const { base, apiKey } = supabaseConfig(request);
    if (!base || !apiKey) fail('Group service is not configured.', 503);
    const authHeaders = { Authorization: authorization, apikey: apiKey! };
    const query = async (path: string) => {
      const response = await fetch(`${base}/${path}`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!response.ok) fail('Account could not be verified.', response.status === 401 ? 401 : 503);
      return response.json();
    };
    const account = await query('auth/v1/user');
    if (!uuid.test(account.id)) fail('Sign in again.', 401);
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';
    const membership = async (group: string) => {
      if (!uuid.test(group)) fail('Invalid group.', 400);
      const [member] = await db.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, group), eq(chatGroupMembers.userId, account.id)));
      if (!member) fail('Group unavailable.', 404);
      return member;
    };

    const requireAdmin = async (group: string) => {
      const member = await membership(group);
      if (member.role !== 'admin') fail('Only group admins can do that.', 403);
      return member;
    };
    const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
    const people = (value: unknown) => [...new Set((Array.isArray(value) ? value : [value]).map(item => String(item || '')).filter(item => uuid.test(item) && item !== account.id))].slice(0, 100);
    const existingProfiles = async (ids: string[]) => ids.length ? new Set((await query(`rest/v1/mw_profiles?id=in.(${ids.join(',')})&select=id`) as { id: string }[]).map(row => row.id)) : new Set<string>();
    const summary = (record: typeof chatGroups.$inferSelect, role: string) => ({ id: record.id, name: record.name, description: record.description, caption: record.caption, created_by: record.createdBy, created_at: record.createdAt, updated_at: record.updatedAt, role });
    const admins = async (group: string) => (await db.select({ total: count() }).from(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, group), eq(chatGroupMembers.role, 'admin'))))[0].total;
    // Keeps every non-empty group with at least one admin: the longest-standing member takes over.
    const ensureAdmin = async (group: string) => {
      if (await admins(group)) return;
      const [next] = await db.select({ userId: chatGroupMembers.userId }).from(chatGroupMembers).where(eq(chatGroupMembers.groupId, group)).orderBy(asc(chatGroupMembers.joinedAt)).limit(1);
      if (next) await db.update(chatGroupMembers).set({ role: 'admin' }).where(and(eq(chatGroupMembers.groupId, group), eq(chatGroupMembers.userId, next.userId)));
    };

    if (request.method === 'GET') {
      if (action === 'list') {
        const rows = await db.select({ id: chatGroups.id, name: chatGroups.name, caption: chatGroups.caption, created_at: chatGroups.createdAt, role: chatGroupMembers.role })
          .from(chatGroupMembers).innerJoin(chatGroups, eq(chatGroups.id, chatGroupMembers.groupId))
          .where(eq(chatGroupMembers.userId, account.id)).orderBy(desc(chatGroups.createdAt)).limit(200);
        return Response.json({ groups: rows }, { headers });
      }
      if (action === 'group') {
        const group = url.searchParams.get('id') || '';
        const member = await membership(group);
        const [record] = await db.select().from(chatGroups).where(eq(chatGroups.id, group));
        const members = await db.select({ user_id: chatGroupMembers.userId, role: chatGroupMembers.role, joined_at: chatGroupMembers.joinedAt }).from(chatGroupMembers).where(eq(chatGroupMembers.groupId, group)).orderBy(asc(chatGroupMembers.joinedAt));
        const blocked = member.role === 'admin' ? await db.select({ user_id: chatGroupBans.userId, created_at: chatGroupBans.createdAt }).from(chatGroupBans).where(eq(chatGroupBans.groupId, group)).orderBy(desc(chatGroupBans.createdAt)) : [];
        return Response.json({ group: summary(record, member.role), members, blocked }, { headers });
      }
      if (action === 'messages') {
        const group = url.searchParams.get('group') || '';
        await membership(group);
        const rows = await db.select().from(chatGroupMessages).where(eq(chatGroupMessages.groupId, group)).orderBy(desc(chatGroupMessages.createdAt), desc(chatGroupMessages.id)).limit(150);
        return Response.json({ messages: rows.reverse().map(row => ({ id: row.id, group_id: row.groupId, sender_id: row.senderId, body: row.body, created_at: row.createdAt })) }, { headers });
      }
      fail('Unknown group action.', 400);
    }

    await assertActive(account.id);
    const raw = await request.text();
    if (raw.length > 16384) fail('Request too large.', 413);
    const body = JSON.parse(raw || '{}');

    if (action === 'create') {
      const name = text(body.name, 70);
      if (!name) fail('Give the group a name.', 400);
      const invited = people(body.members);
      const found = await existingProfiles(invited);
      const [group] = await db.insert(chatGroups).values({ name, description: text(body.description, 500), caption: text(body.caption, 140), createdBy: account.id }).returning();
      try {
        await db.insert(chatGroupMembers).values([{ groupId: group.id, userId: account.id, role: 'admin' }, ...invited.filter(id => found.has(id)).map(userId => ({ groupId: group.id, userId, role: 'member' }))]);
      } catch (error) { await db.delete(chatGroups).where(eq(chatGroups.id, group.id)).catch(() => {});throw error; }
      return Response.json({ group: summary(group, 'admin'), added: invited.filter(id => found.has(id)).length }, { status: 201, headers });
    }
    if (action === 'update') {
      const group = String(body.group || '');
      await requireAdmin(group);
      const changes: Partial<typeof chatGroups.$inferInsert> = { updatedAt: new Date() };
      if ('name' in body) { const name = text(body.name, 70);if (!name) fail('Give the group a name.', 400);changes.name = name; }
      if ('description' in body) changes.description = text(body.description, 500);
      if ('caption' in body) changes.caption = text(body.caption, 140);
      const [record] = await db.update(chatGroups).set(changes).where(eq(chatGroups.id, group)).returning();
      return Response.json({ group: summary(record, 'admin') }, { headers });
    }
    if (action === 'add-member') {
      const group = String(body.group || '');
      await requireAdmin(group);
      const invited = people(body.userIds ?? body.userId);
      if (!invited.length) fail('Choose someone to add.', 400);
      const banned = new Set((await db.select({ userId: chatGroupBans.userId }).from(chatGroupBans).where(and(eq(chatGroupBans.groupId, group), inArray(chatGroupBans.userId, invited)))).map(row => row.userId));
      const found = await existingProfiles(invited.filter(id => !banned.has(id)));
      const eligible = invited.filter(id => found.has(id));
      if (!eligible.length) fail(banned.size ? 'That account is blocked from this group. Unblock it first.' : 'That account was not found.', banned.size ? 409 : 404);
      const [{ total }] = await db.select({ total: count() }).from(chatGroupMembers).where(eq(chatGroupMembers.groupId, group));
      if (total + eligible.length > 256) fail('This group is full.', 409);
      const added = await db.insert(chatGroupMembers).values(eligible.map(userId => ({ groupId: group, userId, role: 'member' }))).onConflictDoNothing().returning();
      return Response.json({ added: added.length, blocked: banned.size }, { headers });
    }
    if (action === 'set-role') {
      const group = String(body.group || ''), person = String(body.userId || ''), role = body.role === 'admin' ? 'admin' : 'member';
      await requireAdmin(group);
      if (!uuid.test(person)) fail('Choose a member.', 400);
      const [target] = await db.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, group), eq(chatGroupMembers.userId, person)));
      if (!target) fail('That person is not in this group.', 404);
      if (role === 'member' && target.role === 'admin' && await admins(group) <= 1) fail('A group needs at least one admin. Make someone else admin first.', 409);
      await db.update(chatGroupMembers).set({ role }).where(and(eq(chatGroupMembers.groupId, group), eq(chatGroupMembers.userId, person)));
      return Response.json({ ok: true, role }, { headers });
    }
    if (action === 'remove-member') {
      const group = String(body.group || ''), person = String(body.userId || '');
      await requireAdmin(group);
      if (!uuid.test(person) || person === account.id) fail('Choose a member to remove. Use Leave group to remove yourself.', 400);
      const [record] = await db.select({ createdBy: chatGroups.createdBy }).from(chatGroups).where(eq(chatGroups.id, group));
      if (person === record.createdBy && account.id !== record.createdBy) fail('Only the group creator can remove themselves, by leaving the group.', 403);
      const removed = await db.delete(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, group), eq(chatGroupMembers.userId, person))).returning();
      if (!removed.length && !body.block) fail('That person is not in this group.', 404);
      if (body.block) await db.insert(chatGroupBans).values({ groupId: group, userId: person, bannedBy: account.id }).onConflictDoNothing();
      await ensureAdmin(group);
      return Response.json({ ok: true, removed: removed.length > 0, blocked: !!body.block }, { headers });
    }
    if (action === 'unblock') {
      const group = String(body.group || ''), person = String(body.userId || '');
      await requireAdmin(group);
      if (!uuid.test(person)) fail('Choose an account.', 400);
      await db.delete(chatGroupBans).where(and(eq(chatGroupBans.groupId, group), eq(chatGroupBans.userId, person)));
      return Response.json({ ok: true }, { headers });
    }
    if (action === 'delete') {
      const group = String(body.group || '');
      await requireAdmin(group);
      await db.delete(chatGroups).where(eq(chatGroups.id, group));
      return Response.json({ ok: true }, { headers });
    }
    if (action === 'send') {
      const group = String(body.group || ''), message = typeof body.body === 'string' ? body.body.trim() : '';
      await membership(group);
      if (!uuid.test(body.id || '')) fail('Invalid message reference.', 400);
      if (!message || message.length > 4000) fail('Use 1–4000 characters.', 400);
      const [stored] = await db.insert(chatGroupMessages).values({ id: body.id, groupId: group, senderId: account.id, body: message }).onConflictDoNothing().returning();
      if (!stored) {
        const [existing] = await db.select().from(chatGroupMessages).where(and(eq(chatGroupMessages.id, body.id), eq(chatGroupMessages.senderId, account.id)));
        if (!existing) fail('Message reference already used.', 409);
      }
      return Response.json({ ok: true }, { status: stored ? 201 : 200, headers });
    }
    if (action === 'leave') {
      const group = String(body.group || '');
      await membership(group);
      await db.delete(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, group), eq(chatGroupMembers.userId, account.id)));
      const remaining = await db.select({ userId: chatGroupMembers.userId }).from(chatGroupMembers).where(eq(chatGroupMembers.groupId, group)).limit(1);
      if (!remaining.length) await db.delete(chatGroups).where(eq(chatGroups.id, group));
      else await ensureAdmin(group);
      return Response.json({ ok: true }, { headers });
    }
    return fail('Unknown group action.', 400);
  } catch (error) {
    const known = error as { status?: number; message?: string };
    return Response.json({ error: known.status ? known.message : 'Group service unavailable. Reconnect and retry.' }, { status: known.status || 503, headers });
  }
}

