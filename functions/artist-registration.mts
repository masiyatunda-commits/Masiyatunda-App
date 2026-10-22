import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import { getStore } from '@netlify/blobs';
import { db } from '../db/index.js';
import { artistRegistrations } from '../db/schema.js';
import { verifiedAccount } from '../lib/account-check.js';
import { pushToAdmins } from '../lib/fcm.js';

// Artist registration from the Arts & Media section. Anyone may submit; only administrators can list,
// open files, review or delete submissions. Files never get a public URL.
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status, safe: true }); };
const files = () => getStore({ name: 'artist-registrations', consistency: 'strong' });

export const FILE_FIELDS = ['front', 'left', 'right', 'passport', 'identity'] as const;
const ROLES = ['teacher', 'artist', 'camera', 'director', 'writer'];
const GENDERS = ['female', 'male'];
const STATUSES = ['new', 'contacted', 'approved', 'rejected'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE = 4 * 1024 * 1024;

const text = (form: FormData, name: string) => { const value = form.get(name); return typeof value === 'string' ? value.trim() : ''; };

function validDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const age = (Date.now() - date.getTime()) / (365.25 * 86400000);
  return age >= 5 && age <= 110;
}

async function submit(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 6 * 1024 * 1024) fail('Faili ni kubwa mno. Punguza ukubwa wa picha. / Files are too large.', 413);
  let form: FormData;
  try { form = await request.formData(); } catch { fail('Fomu haikusomeka. Jaribu tena. / The form could not be read.'); }
  const details = {
    fullName: text(form!, 'fullName'), phone: text(form!, 'phone'), country: text(form!, 'country'), gender: text(form!, 'gender'),
    birthDate: text(form!, 'birthDate'), training: text(form!, 'training'), role: text(form!, 'role'), bio: text(form!, 'bio'),
  };
  if (text(form!, 'website')) fail('Invalid submission.');
  if (details.fullName.length < 3 || details.fullName.length > 120) fail('Jina kamili linahitajika. / Full name is required.');
  if (!/^\+?[0-9][0-9 ()-]{6,19}$/.test(details.phone)) fail('Namba ya simu si sahihi. / Enter a valid phone number.');
  if (details.country.length < 2 || details.country.length > 80) fail('Nchi unayotoka inahitajika. / Country of origin is required.');
  if (!GENDERS.includes(details.gender)) fail('Chagua jinsia. / Select gender.');
  if (!validDate(details.birthDate)) fail('Tarehe ya kuzaliwa si sahihi. / Enter a valid date of birth.');
  if (details.training.length > 500) fail('Maelezo ya mafunzo ni marefu mno. / Training background is too long.');
  if (!ROLES.includes(details.role)) fail('Chagua nafasi yako kwenye sanaa. / Select your role.');
  if (details.bio.length < 20 || details.bio.length > 2000) fail('Andika maelezo mafupi (angalau herufi 20). / Write a short bio (at least 20 characters).');

  const uploads: Record<string, File> = {};
  for (const field of FILE_FIELDS) {
    const file = form!.get(field);
    if (!(file instanceof File) || !file.size) fail(`Faili inakosekana: ${field}. / A required file is missing: ${field}.`);
    const upload = file as File;
    const allowed = field === 'identity' ? [...IMAGE_TYPES, 'application/pdf'] : IMAGE_TYPES;
    if (!allowed.includes(upload.type)) fail(`Aina ya faili haikubaliki: ${field}. / Unsupported file type: ${field}.`);
    if (upload.size > MAX_FILE) fail(`Faili ni kubwa mno: ${field}. / File too large: ${field}.`);
    uploads[field] = upload;
  }

  const recent = await db.select({ id: artistRegistrations.id }).from(artistRegistrations)
    .where(and(eq(artistRegistrations.phone, details.phone), gt(artistRegistrations.createdAt, new Date(Date.now() - 10 * 60000)))).limit(1);
  if (recent.length) fail('Fomu yako tayari imepokelewa. Subiri Admin akujibu. / Your registration was already received.', 429);

  const id = randomUUID();
  const stored: Record<string, { key: string; name: string; mime: string; size: number }> = {};
  for (const field of FILE_FIELDS) {
    const upload = uploads[field];
    const key = `${id}/${field}`;
    await files().set(key, await upload.arrayBuffer(), { metadata: { mime: upload.type } });
    stored[field] = { key, name: upload.name.slice(0, 150) || field, mime: upload.type, size: upload.size };
  }
  await db.insert(artistRegistrations).values({ id, ...details, files: stored });
  await pushToAdmins({ title: 'Msanii mpya amejisajili', body: `${details.fullName} · ${details.country}`, url: '/admin.html#artists', tag: `artist-${id}` }).catch(() => 0);
  return Response.json({ ok: true, id }, { status: 201, headers });
}

export default async function handler(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';
    if (request.method === 'POST' && action === 'submit') return await submit(request);

    const account = await verifiedAccount(request);
    if (!account) fail('Ingia kama Admin. / Sign in as admin.', 401);
    if (!(await account!.isAdmin())) fail('Admin pekee. / Administrators only.', 403);

    if (request.method === 'GET' && action === 'list') {
      const rows = await db.select().from(artistRegistrations).orderBy(desc(artistRegistrations.createdAt)).limit(300);
      return Response.json({ registrations: rows }, { headers });
    }
    if (request.method === 'GET' && action === 'file') {
      const id = url.searchParams.get('id') || '';
      const field = url.searchParams.get('field') || '';
      const [row] = await db.select().from(artistRegistrations).where(eq(artistRegistrations.id, id));
      const file = row?.files?.[field];
      if (!file) fail('File unavailable.', 404);
      const content = await files().get(file!.key, { type: 'arrayBuffer' });
      if (!content) fail('File unavailable.', 404);
      return new Response(content, { headers: { ...headers, 'Content-Type': file!.mime, 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': `inline; filename="${field}"` } });
    }
    if (request.method === 'POST' && action === 'status') {
      const body = await request.json().catch(() => ({}));
      if (typeof body.id !== 'string' || !STATUSES.includes(body.status)) fail('Invalid update.');
      const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : '';
      const updated = await db.update(artistRegistrations).set({ status: body.status, adminNote: note, reviewedAt: new Date() }).where(eq(artistRegistrations.id, body.id)).returning({ id: artistRegistrations.id });
      if (!updated.length) fail('Registration not found.', 404);
      return Response.json({ ok: true }, { headers });
    }
    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id') || '';
      const [row] = await db.select().from(artistRegistrations).where(eq(artistRegistrations.id, id));
      if (!row) fail('Registration not found.', 404);
      await Promise.all(Object.values(row!.files || {}).map(file => files().delete(file.key)));
      await db.delete(artistRegistrations).where(eq(artistRegistrations.id, id));
      return Response.json({ ok: true }, { headers });
    }
    fail('Not found.', 404);
  } catch (error) {
    if (!(error as { safe?: boolean }).safe) console.error("artist-registration", error);
    const known = error as { safe?: boolean; message?: string; status?: number };
    return Response.json({ error: known.safe ? known.message : 'Huduma haipatikani kwa sasa. Jaribu tena. / Service temporarily unavailable.' }, { status: known.safe ? known.status : 503, headers });
  }
}

export const config = { path: '/api/artist-registration' };
