import { getStore } from '@netlify/blobs';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { postAudiences, postFiles, postReposts } from '../db/schema.js';
import { supabaseConfig } from '../lib/supabase.js';
import { assertActive } from '../lib/suspensions.js';

// Profile gallery: per-post audience (Everyone / Followers only / Only me) and post documents.
// Post rows stay in Supabase; this service only stores who may see a post and the documents attached to it.
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const idList = (value: string | null) => [...new Set((value || '').split(','))].filter(id => uuid.test(id)).slice(0, 100);
const audiences = ['everyone', 'followers', 'only_me'];
const maxBytes = 4 * 1024 * 1024;
const documentTypes: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const fileView = (file: typeof postFiles.$inferSelect) => ({ key: file.key, postId: file.postId, ownerId: file.ownerId, name: file.name, mime: file.mime, size: file.size, createdAt: file.createdAt });

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  try {
    const { base, apiKey } = supabaseConfig(request);
    const authorization = request.headers.get('Authorization') || '';
    const supabase = async (path: string, withCaller = true) => {
      if (!base || !apiKey) fail('Service is not configured.', 503);
      const response = await fetch(`${base}/${path}`, { headers: { apikey: apiKey!, ...(withCaller && authorization.startsWith('Bearer ') ? { Authorization: authorization } : {}) }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) fail('Ownership could not be verified.', response.status === 401 ? 401 : 503);
      return response.json();
    };
    // Reads work signed out; a valid token only adds the caller's own private posts.
    let caller: string | null | undefined;
    const identify = async (required: boolean) => {
      if (caller !== undefined) return caller;
      caller = null;
      if (authorization.startsWith('Bearer ')) {
        try { const account = await supabase('auth/v1/user'); if (uuid.test(account?.id)) caller = account.id; }
        catch (error) { if (required) throw error; }
      }
      if (required && !caller) fail('Sign in first.', 401);
      return caller;
    };
    // Accounts the caller follows, so "Followers only" posts open for them. If this cannot be checked, they stay hidden.
    const followed = async (owners: string[]) => {
      const me = await identify(false);
      if (!me || !owners.length) return new Set<string>();
      try {
        const rows: { following_id: string }[] = await supabase(`rest/v1/mw_follows?follower_id=eq.${me}&following_id=in.(${owners.join(',')})&select=following_id`);
        return new Set(rows.map(row => row.following_id));
      } catch { return new Set<string>(); }
    };
    // Posts the caller may not see: "Only me" posts, and "Followers only" posts of accounts the caller does not follow.
    // The owner is returned with each row, and owners always see their own posts.
    const privateRows = async (ids: string[]) => {
      if (!ids.length) return [];
      const rows = await db.select({ postId: postAudiences.postId, ownerId: postAudiences.ownerId, audience: postAudiences.audience }).from(postAudiences).where(and(inArray(postAudiences.postId, ids), inArray(postAudiences.audience, ['only_me', 'followers'])));
      const followerRows = rows.filter(row => row.audience === 'followers');
      const me = followerRows.length ? await identify(false) : null;
      const follows = await followed([...new Set(followerRows.map(row => row.ownerId).filter(owner => owner !== me))]);
      return rows.filter(row => row.audience === 'only_me' || (row.ownerId !== me && !follows.has(row.ownerId))).map(({ postId, ownerId }) => ({ postId, ownerId }));
    };

    if (request.method === 'GET' && action === 'audiences') {
      const ids = idList(url.searchParams.get('ids'));
      const rows: { postId: string; ownerId: string }[] = [...await privateRows(ids)];
      // A repost of a post its author later made "Only me" is hidden from everyone except the reposter.
      const reposts = ids.length ? await db.select().from(postReposts).where(inArray(postReposts.repostId, ids)) : [];
      if (reposts.length) {
        const hiddenOriginals = new Set((await privateRows([...new Set(reposts.map(row => row.originalId))])).map(row => row.postId));
        for (const row of reposts) if (hiddenOriginals.has(row.originalId)) rows.push({ postId: row.repostId, ownerId: row.userId });
      }
      // The owner also learns the audience of their own posts, so the feed can label them.
      const me = await identify(false);
      const own = me && ids.length ? await db.select({ postId: postAudiences.postId, audience: postAudiences.audience }).from(postAudiences).where(and(inArray(postAudiences.postId, ids), eq(postAudiences.ownerId, me))) : [];
      return Response.json({ private: rows, own: Object.fromEntries(own.map(row => [row.postId, row.audience])) }, { headers });
    }
    if (request.method === 'GET' && action === 'gallery') {
      const owner = url.searchParams.get('owner') || '';
      if (!uuid.test(owner)) fail('Invalid profile.', 400);
      const mine = (await identify(false)) === owner;
      const rows = await db.select().from(postAudiences).where(eq(postAudiences.ownerId, owner));
      const follows = !mine && rows.some(row => row.audience === 'followers') ? await followed([owner]) : new Set<string>();
      const hidden = new Set(rows.filter(row => row.audience === 'only_me' || (row.audience === 'followers' && !mine && !follows.has(owner))).map(row => row.postId));
      const files = (await db.select().from(postFiles).where(eq(postFiles.ownerId, owner)).limit(300)).filter(file => mine || !hidden.has(file.postId));
      return Response.json({ mine, private: [...hidden], audiences: mine ? Object.fromEntries(rows.map(row => [row.postId, row.audience])) : {}, files: files.map(fileView) }, { headers });
    }
    if (request.method === 'GET' && action === 'files') {
      const ids = idList(url.searchParams.get('ids'));
      if (!ids.length) return Response.json({ files: [] }, { headers });
      const hidden = await privateRows(ids);
      const me = hidden.length ? await identify(false) : null;
      const blocked = new Set(hidden.filter(row => row.ownerId !== me).map(row => row.postId));
      const files = (await db.select().from(postFiles).where(inArray(postFiles.postId, ids))).filter(file => !blocked.has(file.postId));
      return Response.json({ files: files.map(fileView) }, { headers });
    }
    if (request.method === 'GET' && action === 'file') {
      const key = url.searchParams.get('key') || '';
      const [file] = await db.select().from(postFiles).where(eq(postFiles.key, key));
      if (!file) fail('The file is unavailable.', 404);
      const [audience] = await db.select().from(postAudiences).where(eq(postAudiences.postId, file.postId));
      const me = await identify(false);
      if (audience?.audience === 'only_me' && me !== file.ownerId) fail('This file is private.', 403);
      if (audience?.audience === 'followers' && me !== file.ownerId && !(await followed([file.ownerId])).has(file.ownerId)) fail('This file is only for followers.', 403);
      // The post itself must still exist and be readable by the caller (Supabase applies private-account and block rules).
      const [post] = await supabase(`rest/v1/mw_posts?id=eq.${file.postId}&author_id=eq.${file.ownerId}&select=id&limit=1`, !!me);
      if (!post) fail('The file is unavailable.', 404);
      const bytes = await getStore({ name: 'milkyway-post-files', consistency: 'strong' }).get(file.key, { type: 'arrayBuffer' });
      if (!bytes) fail('The file is unavailable.', 404);
      const download = url.searchParams.get('download') === '1';
      return new Response(bytes, { headers: { ...headers, 'Cache-Control': 'private, no-store', 'Content-Type': file.mime, 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, '_')}"`, 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:" } });
    }

    if (!['POST', 'DELETE'].includes(request.method)) fail('Method not allowed.', 405);
    const account = await identify(true) as string;
    if (request.method === 'POST') await assertActive(account);
    const id = url.searchParams.get('id') || url.searchParams.get('post') || '';
    if (!uuid.test(id)) fail('Invalid post.', 400);
    // A post id is either still unused (the composer reserves it before publishing) or must belong to the caller.
    const [post] = await supabase(`rest/v1/mw_posts?id=eq.${id}&select=id,author_id&limit=1`);
    if (post && post.author_id !== account) fail('Only the author can change this post.', 403);
    const [claimed] = await db.select().from(postAudiences).where(eq(postAudiences.postId, id));
    if (claimed && claimed.ownerId !== account) fail('Only the author can change this post.', 403);
    const [otherFile] = await db.select({ ownerId: postFiles.ownerId }).from(postFiles).where(eq(postFiles.postId, id)).limit(1);
    if (otherFile && otherFile.ownerId !== account) fail('Only the author can change this post.', 403);

    if (request.method === 'POST' && action === 'audience') {
      const raw = await request.text();
      if (raw.length > 1024) fail('Request too large.', 413);
      const audience = JSON.parse(raw || '{}').audience;
      if (!audiences.includes(audience)) fail('Choose Everyone, Followers only or Only me.', 400);
      await db.insert(postAudiences).values({ postId: id, ownerId: account, audience }).onConflictDoUpdate({ target: postAudiences.postId, set: { audience, updatedAt: new Date() }, where: eq(postAudiences.ownerId, account) });
      return Response.json({ ok: true, postId: id, audience }, { headers });
    }
    if (request.method === 'POST' && action === 'upload') {
      if (Number(request.headers.get('Content-Length')) > maxBytes + 65536) fail('Documents are limited to 4 MB each.', 413);
      const existing = await db.select({ key: postFiles.key }).from(postFiles).where(eq(postFiles.postId, id));
      if (existing.length >= 10) fail('Attach up to 10 documents per post.', 400);
      const entry = (await request.formData()).get('file');
      if (!(entry instanceof File) || !entry.size) fail('Choose a non-empty file.', 400);
      const file = entry as File;
      if (file.size > maxBytes) fail('Documents are limited to 4 MB each.', 413);
      const name = file.name.slice(0, 120);
      const mime = documentTypes[name.split('.').pop()?.toLowerCase() || ''];
      if (!mime) fail('Unsupported document. Use PDF, Word, Excel, PowerPoint, TXT or CSV.', 415);
      const bytes = await file.arrayBuffer();
      if (mime === 'application/pdf' && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') fail('This PDF file is damaged.', 415);
      const key = `${account}/${id}/${crypto.randomUUID()}`;
      const store = getStore({ name: 'milkyway-post-files', consistency: 'strong' });
      await store.set(key, bytes);
      try { await db.insert(postFiles).values({ key, postId: id, ownerId: account, name, mime, size: file.size }); }
      catch (error) { await store.delete(key); throw error; }
      return Response.json({ key, postId: id, ownerId: account, name, mime, size: file.size }, { status: 201, headers });
    }
    if (request.method === 'DELETE' && action === 'post') {
      if (post) fail('Delete the post first.', 409);
      const files = await db.select({ key: postFiles.key }).from(postFiles).where(and(eq(postFiles.postId, id), eq(postFiles.ownerId, account)));
      const store = getStore({ name: 'milkyway-post-files', consistency: 'strong' });
      for (const file of files) await store.delete(file.key);
      await db.delete(postFiles).where(and(eq(postFiles.postId, id), eq(postFiles.ownerId, account)));
      await db.delete(postAudiences).where(and(eq(postAudiences.postId, id), eq(postAudiences.ownerId, account)));
      await db.delete(postReposts).where(and(eq(postReposts.repostId, id), eq(postReposts.userId, account)));
      return new Response(null, { status: 204, headers });
    }
    fail('Unknown action.', 400);
  } catch (error) {
    const known = error as { status?: number; message?: string };
    return Response.json({ error: known.status ? known.message : 'Service unavailable. Retry after reconnecting.' }, { status: known.status || (error instanceof SyntaxError ? 400 : 503), headers });
  }
}
