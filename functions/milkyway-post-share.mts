import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accountPreferences, postAudiences, postExtras } from '../db/schema.js';
import { supabaseConfig } from '../lib/supabase.js';

// Shareable post page: /milkyway/p/<post id>.
// Link-preview crawlers (WhatsApp, Facebook, X, Telegram, LinkedIn…) read the Open Graph tags below, which carry the
// post's own photo or video and its caption. People are sent straight to that post inside the app.
export const config = { path: '/milkyway/p/:id' };

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const storageMarker = '/storage/v1/object/public/portfolio/';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const clip = (value: string, length: number) => { const text = value.replace(/\s+/g, ' ').trim(); return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text; };
const videoTypes: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg', '3gp': 'video/3gpp' };

// The publishable Supabase key is public (the app page ships it). Without it in the Functions environment,
// read it from the app page once per instance so crawlers, which send no headers, still get a preview.
let pageKey: Promise<string> | null = null;
const publicKey = (origin: string) => pageKey ||= fetch(`${origin}/milkyway/index.html`, { signal: AbortSignal.timeout(4000) })
  .then(response => response.ok ? response.text() : '')
  .then(html => /const SUPABASE_ANON_KEY='([A-Za-z0-9._-]{20,1000})'/.exec(html)?.[1] || '')
  .catch(() => '')
  .then(key => { if (!key) pageKey = null; return key; });

type Post = { id: string; author_id: string; author_name: string | null; caption: string | null; media_url: string | null; media_type: string | null; created_at: string };
type Profile = { display_name: string | null; username: string | null; avatar_url: string | null; is_banned?: boolean; suspended_until?: string | null };

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  const appUrl = new URL('/milkyway/', url.origin);
  if (!uuid.test(id)) return Response.redirect(appUrl.href, 302);
  appUrl.searchParams.set('post', id);
  appUrl.hash = `post-${id}`;
  const shareUrl = `${url.origin}/milkyway/p/${id}`;

  let post: Post | undefined, profile: Profile | undefined, withheld = false, extraImage = '';
  try {
    const config = supabaseConfig(request);
    const apiKey = config.apiKey || await publicKey(url.origin);
    const read = async <T,>(path: string): Promise<T[]> => {
      if (!config.base || !apiKey) return [];
      const response = await fetch(`${config.base}/rest/v1/${path}`, { headers: { apikey: apiKey }, signal: AbortSignal.timeout(5000) });
      return response.ok ? response.json() : [];
    };
    [post] = await read<Post>(`mw_posts?id=eq.${id}&select=id,author_id,author_name,caption,media_url,media_type,created_at&limit=1`);
    if (post) {
      const authorId = uuid.test(post.author_id) ? post.author_id : '';
      const [profiles, audience, preferences, extras] = await Promise.all([
        authorId ? read<Profile>(`mw_profiles?id=eq.${authorId}&select=*&limit=1`) : Promise.resolve([]),
        db.select({ audience: postAudiences.audience }).from(postAudiences).where(eq(postAudiences.postId, id)).catch(() => null),
        authorId ? db.select({ isPrivate: accountPreferences.isPrivate }).from(accountPreferences).where(eq(accountPreferences.userId, authorId)).catch(() => null) : Promise.resolve([]),
        db.select({ media: postExtras.media }).from(postExtras).where(eq(postExtras.postId, id)).catch(() => []),
      ]);
      profile = profiles[0];
      const suspended = profile?.suspended_until && new Date(profile.suspended_until).getTime() > Date.now();
      // "Only me" and "Followers only" posts, private accounts and banned or suspended authors never leak into a public preview.
      // If privacy could not be checked, fail closed.
      withheld = !audience || !preferences || ['only_me', 'followers'].includes(audience[0]?.audience || '') || !!preferences[0]?.isPrivate || !!profile?.is_banned || !!suspended;
      extraImage = extras[0]?.media?.find(item => item.type === 'image')?.url || '';
    }
  } catch {}

  const name = clip(profile?.display_name || post?.author_name || 'MilkyWay', 60);
  const visible = post && !withheld;
  const title = visible ? `${name}${profile?.username ? ` (@${clip(profile.username, 30)})` : ''} · MilkyWay` : 'MilkyWay — Freedom · Truth · Light';
  const caption = visible ? clip(post!.caption || '', 280) : '';
  const description = caption || (visible ? (post!.media_type === 'video' ? `Tazama video ya ${name} kwenye MilkyWay` : `Tazama post ya ${name} kwenye MilkyWay`) : 'Fungua post hii kwenye MilkyWay.');

  // Photos go through the Image CDN as a JPEG that every link preview accepts; videos use the poster saved at upload.
  const cdnImage = (source: string, width = 1200) => {
    try {
      const address = new URL(source);
      if (!address.pathname.startsWith(storageMarker)) return address.protocol === 'https:' ? address.href : '';
      return `${url.origin}/.netlify/images?url=${encodeURIComponent(address.href)}&w=${width}&q=80&fm=jpg`;
    } catch { return ''; }
  };
  const isVideo = visible && post!.media_type === 'video' && !!post!.media_url;
  let image = '';
  if (visible && post!.media_url && post!.media_type !== 'video') image = cdnImage(post!.media_url);
  if (isVideo) {
    const poster = `${post!.media_url!.split('?')[0]}.poster.jpg`;
    const found = await fetch(poster, { method: 'HEAD', signal: AbortSignal.timeout(3000) }).then(response => response.ok).catch(() => false);
    if (found) image = cdnImage(poster);
  }
  if (visible && !image && extraImage) image = cdnImage(extraImage);
  if (visible && !image && profile?.avatar_url) image = cdnImage(profile.avatar_url, 600);
  const fallback = !image;
  if (!image) image = `${url.origin}/milkyway/icon-512.png`;
  const video = isVideo ? post!.media_url! : '';
  const videoType = videoTypes[video.split('?')[0].split('.').pop()?.toLowerCase() || ''] || 'video/mp4';

  const meta = [
    ['property', 'og:site_name', 'MilkyWay'],
    ['property', 'og:type', isVideo ? 'video.other' : 'article'],
    ['property', 'og:url', shareUrl],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:image', image],
    ['property', 'og:image:secure_url', image],
    ['property', 'og:image:alt', caption || title],
    ...(fallback ? [] : [['property', 'og:image:type', 'image/jpeg']]),
    ...(isVideo ? [['property', 'og:video', video], ['property', 'og:video:secure_url', video], ['property', 'og:video:type', videoType]] : []),
    ...(visible ? [['property', 'article:published_time', post!.created_at]] : []),
    ['name', 'twitter:card', fallback ? 'summary' : 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', image],
    ['name', 'description', description],
  ].map(([kind, key, value]) => `<meta ${kind}="${key}" content="${escapeHtml(value)}">`).join('\n');

  const media = !visible ? '' : isVideo
    ? `<video src="${escapeHtml(video)}"${fallback ? '' : ` poster="${escapeHtml(image)}"`} controls playsinline preload="metadata"></video>`
    : post!.media_url ? `<img src="${escapeHtml(image)}" alt="">` : '';
  const target = escapeHtml(appUrl.pathname + appUrl.search + appUrl.hash);
  const html = `<!doctype html>
<html lang="sw">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
${meta}
<link rel="canonical" href="${escapeHtml(shareUrl)}">
<link rel="icon" href="/milkyway/favicon.ico">
<meta name="theme-color" content="#0F172A">
<script>location.replace(${JSON.stringify(appUrl.pathname + appUrl.search + appUrl.hash).replace(/</g, '\\u003c')});</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#030712;color:#edf4ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{width:min(520px,92vw);padding:20px;text-align:center}img,video{display:block;width:100%;max-height:70vh;object-fit:contain;border-radius:16px;background:#0d1b31;margin:0 auto 14px}p{color:#8fa7ca;white-space:pre-line}a{display:inline-block;margin-top:8px;padding:12px 22px;border-radius:14px;background:linear-gradient(135deg,#3d9cff,#1d4ed8);color:#fff;font-weight:800;text-decoration:none}</style>
</head>
<body><main>${media}<h1>${escapeHtml(visible ? name : 'MilkyWay')}</h1>${caption ? `<p>${escapeHtml(caption)}</p>` : ''}<a href="${target}">Fungua kwenye MilkyWay</a></main></body>
</html>`;
  // Short shared cache: previews stay fast for crawlers, and edits or privacy changes show within a minute.
  return new Response(html, { status: post ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' } });
}
