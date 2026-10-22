import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { postExtras, commentExtras, postAudiences, postReposts } from '../db/schema.js';
import { supabaseConfig } from '../lib/supabase.js';
import { assertActive } from '../lib/suspensions.js';

// Extra post and comment details (people tags, location, additional media, replies) that the original Supabase tables cannot hold.
// Ownership is always verified against Supabase with the caller's own token, so row-level security there stays authoritative.
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const idList = (value: string | null) => [...new Set((value || '').split(','))].filter(id => uuid.test(id)).slice(0, 60);

type Tag = { id: string; name: string; username: string };
function cleanTags(value: unknown): Tag[] {
  if (!Array.isArray(value) || value.length > 20) fail('Tag up to 20 people.', 400);
  return (value as Tag[]).map(tag => {
    if (!tag || !uuid.test(tag.id) || typeof tag.name !== 'string' || typeof tag.username !== 'string') fail('Invalid tagged person.', 400);
    return { id: tag.id, name: tag.name.slice(0, 80), username: tag.username.slice(0, 40) };
  });
}
// Media must already live in the caller's own public post folder, which Supabase storage policies restrict to that account.
function cleanMedia(value: unknown, base: string, owner: string, limit: number) {
  if (!Array.isArray(value) || value.length > limit) fail(`Attach up to ${limit} files.`, 400);
  const prefix = `${base}/storage/v1/object/public/portfolio/milkyway/${owner}/`;
  return (value as { url: string; type: string; name?: string }[]).map(item => {
    if (!item || typeof item.url !== 'string' || !item.url.startsWith(prefix) || item.url.length > 600 || !['image', 'video', 'file'].includes(item.type)) fail('Attachments must be uploaded from your account first.', 400);
    let address: URL;
    try {
      address = new URL(item.url);
      const segments = address.pathname.split('/').slice(1).map(segment => decodeURIComponent(segment));
      if (!address.href.startsWith(prefix) || address.search || address.hash || address.username || address.password || segments.some(segment => !segment || ['.', '..'].includes(segment) || /[/\\\u0000-\u001f]/.test(segment))) fail('Attachments must be uploaded from your account first.', 400);
    } catch { fail('Attachments must be uploaded from your account first.', 400); }
    return { url: address!.href, type: item.type, name: String(item.name || '').slice(0, 120) };
  });
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  try {
    if (request.method === 'GET' && action === 'posts') {
      const ids = idList(url.searchParams.get('ids'));
      const records = ids.length ? await db.select().from(postExtras).where(inArray(postExtras.postId, ids)) : [];
      // Reposts carry a "Reposted from" line; this only names the original author, which the post card shows anyway.
      const reposts = (ids.length ? await db.select().from(postReposts).where(inArray(postReposts.repostId, ids)) : [])
        .map(row => ({ postId: row.repostId, originalId: row.originalId, originalAuthorId: row.originalAuthorId, originalAuthorName: row.originalAuthorName }));
      // "Only me" posts keep their extra media private (only a verified owner gets them back); "Followers only" posts also open for followers.
      const hidden = ids.length ? await db.select({ postId: postAudiences.postId, ownerId: postAudiences.ownerId, audience: postAudiences.audience }).from(postAudiences).where(and(inArray(postAudiences.postId, ids), inArray(postAudiences.audience, ['only_me', 'followers']))) : [];
      if (!hidden.length) return Response.json({ posts: records, reposts }, { headers: { ...headers, 'Cache-Control': 'public, max-age=15' } });
      let viewer = '';
      const authorization = request.headers.get('Authorization') || '';
      const { base, apiKey } = supabaseConfig(request);
      if (authorization.startsWith('Bearer ') && base && apiKey) {
        try { const response = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: authorization, apikey: apiKey }, signal: AbortSignal.timeout(10000) }); if (response.ok) viewer = (await response.json()).id || ''; } catch {}
      }
      let follows = new Set<string>();
      const owners = [...new Set(hidden.filter(row => row.audience === 'followers' && row.ownerId !== viewer).map(row => row.ownerId))];
      if (viewer && owners.length && base && apiKey) {
        try {
          const response = await fetch(`${base}/rest/v1/mw_follows?follower_id=eq.${viewer}&following_id=in.(${owners.join(',')})&select=following_id`, { headers: { Authorization: authorization, apikey: apiKey }, signal: AbortSignal.timeout(10000) });
          if (response.ok) follows = new Set((await response.json()).map((row: { following_id: string }) => row.following_id));
        } catch {}
      }
      const blocked = new Set(hidden.filter(row => row.ownerId !== viewer && (row.audience === 'only_me' || !follows.has(row.ownerId))).map(row => row.postId));
      return Response.json({ posts: records.filter(record => !blocked.has(record.postId)), reposts }, { headers });
    }
    if (request.method === 'GET' && action === 'comments') {
      const ids = idList(url.searchParams.get('posts'));
      const records = ids.length ? await db.select().from(commentExtras).where(inArray(commentExtras.postId, ids)) : [];
      return Response.json({ comments: records }, { headers });
    }
    if (!['POST', 'DELETE'].includes(request.method)) fail('Method not allowed.', 405);
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) fail('Sign in first.', 401);
    const { base, apiKey } = supabaseConfig(request);
    if (!base || !apiKey) fail('Service is not configured.', 503);
    const authHeaders = { Authorization: authorization, apikey: apiKey! };
    const query = async (path: string) => {
      const response = await fetch(`${base}/${path}`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      if (!response.ok) fail('Ownership could not be verified.', response.status === 401 ? 401 : 503);
      return response.json();
    };
    const account = await query('auth/v1/user');
    if (!uuid.test(account.id)) fail('Sign in again.', 401);
    if (request.method === 'POST') await assertActive(account.id);
    const raw = request.method === 'POST' ? await request.text() : '{}';
    if (raw.length > 16384) fail('Request too large.', 413);
    const body = JSON.parse(raw || '{}');
    if (action === 'post') {
      const id = url.searchParams.get('id') || body.id || '';
      if (!uuid.test(id)) fail('Invalid post.', 400);
      const [post] = await query(`rest/v1/mw_posts?id=eq.${id}&author_id=eq.${account.id}&select=id&limit=1`);
      if (!post) fail('Only the author can change this post.', 403);
      if (request.method === 'DELETE') {
        await db.delete(postExtras).where(and(eq(postExtras.postId, id), eq(postExtras.ownerId, account.id)));
        return new Response(null, { status: 204, headers });
      }
      if (typeof (body.location ?? '') !== 'string' || (body.location || '').length > 120) fail('Location must be under 120 characters.', 400);
      const values = { location: (body.location || '').trim(), tags: cleanTags(body.tags || []), media: cleanMedia(body.media || [], base!, account.id, 9), updatedAt: new Date() };
      await db.insert(postExtras).values({ postId: id, ownerId: account.id, ...values }).onConflictDoUpdate({ target: postExtras.postId, set: values, where: eq(postExtras.ownerId, account.id) });
      return Response.json({ ok: true }, { headers });
    }
    if (action === 'repost' && request.method === 'POST') {
      const id = url.searchParams.get('id') || body.id || '';
      if (!uuid.test(id)) fail('Invalid post.', 400);
      // Reading the post with the caller's token lets Supabase apply private-account and block rules.
      const [source] = await query(`rest/v1/mw_posts?id=eq.${id}&select=id,author_id,caption,media_url,media_type&limit=1`);
      if (!source) fail('This post is no longer available.', 404);
      // Reposting a repost links back to the first post, so one person reposts a post only once.
      const [parent] = await db.select().from(postReposts).where(eq(postReposts.repostId, id));
      const originalId = parent?.originalId || id, originalAuthorId = parent?.originalAuthorId || source.author_id;
      if (originalAuthorId === account.id || source.author_id === account.id) fail('You cannot repost your own post.', 400);
      const [privateRow] = await db.select({ postId: postAudiences.postId }).from(postAudiences).where(and(inArray(postAudiences.postId, [...new Set([id, originalId])]), inArray(postAudiences.audience, ['only_me', 'followers']))).limit(1);
      if (privateRow) fail('This post is private.', 403);
      const [existing] = await db.select().from(postReposts).where(and(eq(postReposts.userId, account.id), eq(postReposts.originalId, originalId)));
      if (existing) {
        const [still] = await query(`rest/v1/mw_posts?id=eq.${existing.repostId}&select=id&limit=1`);
        if (still) fail('You already reposted this post.', 409);
        await db.delete(postReposts).where(eq(postReposts.repostId, existing.repostId)); // the earlier repost was deleted
      }
      const [author] = await query(`rest/v1/mw_profiles?id=eq.${originalAuthorId}&select=display_name,username&limit=1`).catch(() => []);
      const [me] = await query(`rest/v1/mw_profiles?id=eq.${account.id}&select=display_name&limit=1`).catch(() => []);
      const repostId = crypto.randomUUID();
      // Claim the (user, original) pair first: a second tap that arrives at the same time finds it taken.
      const claimed = await db.insert(postReposts).values({ repostId, originalId, userId: account.id, originalAuthorId, originalAuthorName: String(author?.display_name || author?.username || '').slice(0, 80) }).onConflictDoNothing().returning({ repostId: postReposts.repostId });
      if (!claimed.length) fail('You already reposted this post.', 409);
      // The repost is an ordinary post owned by the caller, inserted with their own token so Supabase insert rules still apply.
      const created = await fetch(`${base}/rest/v1/mw_posts`, {
        method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ id: repostId, author_id: account.id, author_name: String(me?.display_name || account.user_metadata?.display_name || 'Msafiri').slice(0, 80), caption: source.caption || null, media_url: source.media_url || null, media_type: source.media_type || null }),
      }).catch(() => null);
      if (!created?.ok) {
        await db.delete(postReposts).where(eq(postReposts.repostId, repostId));
        fail('The repost could not be saved. Retry.', created?.status === 401 ? 401 : created?.status === 403 ? 403 : 502);
      }
      return Response.json({ ok: true, postId: repostId, originalId }, { status: 201, headers });
    }
    if (action === 'comment') {
      const id = url.searchParams.get('id') || body.id || '';
      if (!uuid.test(id)) fail('Invalid comment.', 400);
      if (request.method === 'DELETE') {
        await db.delete(commentExtras).where(and(eq(commentExtras.commentId, id), eq(commentExtras.ownerId, account.id)));
        return new Response(null, { status: 204, headers });
      }
      const [comment] = await query(`rest/v1/mw_echoes?id=eq.${id}&user_id=eq.${account.id}&select=id,post_id&limit=1`);
      if (!comment) fail('Only the author can change this comment.', 403);
      if (body.parentId && !uuid.test(body.parentId)) fail('Invalid reply.', 400);
      if (body.parentId) {
        const [parent] = await query(`rest/v1/mw_echoes?id=eq.${body.parentId}&post_id=eq.${comment.post_id}&select=id&limit=1`);
        if (!parent) fail('The comment you replied to is no longer available.', 409);
      }
      const values = { parentId: body.parentId || null, tags: cleanTags(body.tags || []), media: cleanMedia(body.media || [], base!, account.id, 4) };
      await db.insert(commentExtras).values({ commentId: id, postId: comment.post_id, ownerId: account.id, ...values }).onConflictDoUpdate({ target: commentExtras.commentId, set: values, where: eq(commentExtras.ownerId, account.id) });
      return Response.json({ ok: true }, { headers });
    }
    fail('Unknown action.', 400);
  } catch (error) {
    const known = error as { status?: number; message?: string };
    return Response.json({ error: known.status ? known.message : 'Service unavailable. Retry after reconnecting.' }, { status: known.status || (error instanceof SyntaxError ? 400 : 503), headers });
  }
}
