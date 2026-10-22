import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accountSuspensions } from '../db/schema.js';

// The account-management panel is reserved for this single verified owner account.
export const ownerEmail = 'masiyatunda@gmail.com';

export function isOwner(account: { email?: unknown; email_confirmed_at?: unknown; confirmed_at?: unknown }) {
  return typeof account.email === 'string' && account.email.toLowerCase() === ownerEmail && Boolean(account.email_confirmed_at || account.confirmed_at);
}

export async function activeSuspension(userId: string) {
  const [record] = await db.select({ reason: accountSuspensions.reason, suspendedAt: accountSuspensions.suspendedAt }).from(accountSuspensions)
    .where(and(eq(accountSuspensions.userId, userId), isNull(accountSuspensions.liftedAt)));
  return record || null;
}

export async function assertActive(userId: string) {
  if (await activeSuspension(userId)) throw Object.assign(new Error('This account is suspended for violating the MilkyWay terms. Contact info@masiyatunda.com.'), { status: 403, safe: true });
}
