import { pgTable, text, uuid, boolean, integer, bigint, numeric, timestamp, primaryKey, index, uniqueIndex, jsonb, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const liveRooms = pgTable('mw_conversation_rooms', {
  room: text().primaryKey(),
  hostId: uuid('host_id').notNull(),
  admission: text().notNull().default('approval'),
  layout: integer().notNull().default(4),
  layoutStyle: text('layout_style').notNull().default('host-top'),
  hostPosition: text('host_position').notNull().default('start'),
  mobileLayout: text('mobile_layout').notNull().default('stack'),
  featuredId: uuid('featured_id'),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  lifecycleStatus: text('lifecycle_status').notNull().default('legacy'),
  notificationsComplete: boolean('notifications_complete').notNull().default(false),
  notificationCursor: uuid('notification_cursor'),
}, table => [uniqueIndex('mw_conversation_one_active_host').on(table.hostId).where(sql`${table.endedAt} is null and ${table.lifecycleStatus} in ('preparing', 'live')`)]);

export const liveHistoryArchives = pgTable('mw_live_history_archives', {
  ownerId: uuid('owner_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  source: text().notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.ownerId, table.source, table.sessionId] })]);

export const liveMembers = pgTable('mw_conversation_members', {
  room: text().notNull().references(() => liveRooms.room),
  userId: uuid('user_id').notNull(),
  name: text().notNull(),
  avatar: text().notNull().default(''),
  state: text().notNull().default('viewer'),
  hostMuted: boolean('host_muted').notNull().default(false),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
}, table => [primaryKey({ columns: [table.room, table.userId] })]);

export const liveMessages = pgTable('mw_conversation_messages', {
  id: uuid().primaryKey(),
  room: text().notNull().references(() => liveRooms.room),
  userId: uuid('user_id').notNull(),
  name: text().notNull(),
  avatar: text().notNull().default(''),
  body: text().notNull(),
  kind: text().notNull().default('message'),
  deleted: boolean().notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('mw_conversation_messages_room_time').on(table.room, table.createdAt)]);

export const mediaAssets = pgTable('mw_media_assets', {
  key: text().primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  recipientId: uuid('recipient_id'),
  purpose: text().notNull(),
  name: text().notNull(),
  mime: text().notNull(),
  retained: boolean().notNull().default(false),
  deleted: boolean().notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('mw_media_assets_owner').on(table.ownerId)]);

export const campaigns = pgTable('mw_ad_campaigns', {
  id: uuid().primaryKey(),
  business: text().notNull(),
  description: text().notNull().default(''),
  mediaUrl: text('media_url').notNull(),
  mediaType: text('media_type').notNull(),
  destination: text().notNull(),
  status: text().notNull().default('draft'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  title: text().notNull().default(''),
  ctaLabel: text('cta_label').notNull().default(''),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  audience: text().notNull().default('all'),
  frequency: integer().notNull().default(6),
  dismissDays: integer('dismiss_days').notNull().default(7),
  deleted: boolean().notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // Where the ad appears: 'feed' (sponsored orbit post), 'banner' (strip above the feed) or 'video' (pre-roll before feed videos).
  placement: text().notNull().default('feed'),
  skipAfter: integer('skip_after').notNull().default(5),
  // Only paid campaigns are served; payment is recorded by the administrator.
  paid: boolean().notNull().default(false),
  amountPaid: integer('amount_paid').notNull().default(0),
  currency: text().notNull().default('TZS'),
  paymentRef: text('payment_ref').notNull().default(''),
  // Comma-separated language codes and ISO country codes; empty means everyone.
  targetLanguages: text('target_languages').notNull().default(''),
  targetCountries: text('target_countries').notNull().default(''),
  impressions: integer().notNull().default(0),
  clicks: integer().notNull().default(0),
});

export const adDismissals = pgTable('mw_ad_dismissals', {
  campaignId: uuid('campaign_id').notNull(),
  userId: uuid('user_id').notNull(),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.campaignId, table.userId] })]);

export const messageEdits = pgTable('mw_message_edits', {
  id: uuid().primaryKey(),
  senderId: uuid('sender_id').notNull(),
  receiverId: uuid('receiver_id').notNull(),
  body: text().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const conversationArchives = pgTable('mw_dm_conversation_archives', {
  ownerId: uuid('owner_id').notNull(),
  peerId: uuid('peer_id').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.ownerId, table.peerId] })]);

export const messageHides = pgTable('mw_message_hides', {
  ownerId: uuid('owner_id').notNull(),
  messageId: uuid('message_id').notNull(),
  hiddenAt: timestamp('hidden_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.ownerId, table.messageId] })]);

export const storyViews = pgTable('mw_story_views', {
  ownerId: uuid('owner_id').notNull(),
  storyId: uuid('story_id').notNull(),
  viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.ownerId, table.storyId] })]);

export const postWatermarks = pgTable('mw_post_watermarks', {
  postId: uuid('post_id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const postExtras = pgTable('mw_post_extras', {
  postId: uuid('post_id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  location: text().notNull().default(''),
  tags: jsonb().$type<{ id: string; name: string; username: string }[]>().notNull().default([]),
  media: jsonb().$type<{ url: string; type: string }[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const liveAlerts = pgTable('mw_live_alerts', {
  room: text().notNull().references(() => liveRooms.room),
  recipientId: uuid('recipient_id').notNull(),
  hostId: uuid('host_id').notNull(),
  hostName: text('host_name').notNull(),
  avatar: text().notNull().default(''),
  title: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp('read_at', { withTimezone: true }),
}, table => [primaryKey({ columns: [table.room, table.recipientId] }), index('mw_live_alerts_recipient_time').on(table.recipientId, table.createdAt)]);

export const notificationPreferences = pgTable('mw_notification_preferences', {
  userId: uuid('user_id').primaryKey(),
  liveEnabled: boolean('live_enabled').notNull().default(true),
  soundEnabled: boolean('sound_enabled').notNull().default(true),
  language: text().notNull().default('sw'),
});

export const pushSubscriptions = pgTable('mw_push_subscriptions', {
  id: text().primaryKey(),
  userId: uuid('user_id').notNull(),
  endpoint: text().notNull(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('mw_push_subscriptions_user').on(table.userId)]);

export const pushDeliveries = pgTable('mw_push_deliveries', {
  room: text().notNull().references(() => liveRooms.room),
  subscriptionId: text('subscription_id').notNull().references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
  recipientId: uuid('recipient_id').notNull(),
  status: text().notNull().default('pending'),
  attempts: integer().notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.room, table.subscriptionId] }), index('mw_push_deliveries_due').on(table.status, table.nextAttemptAt)]);

export const commentExtras = pgTable('mw_comment_extras', {
  commentId: uuid('comment_id').primaryKey(),
  postId: uuid('post_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  parentId: uuid('parent_id'),
  tags: jsonb().$type<{ id: string; name: string; username: string }[]>().notNull().default([]),
  media: jsonb().$type<{ url: string; type: string; name: string }[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('mw_comment_extras_post').on(table.postId)]);

export const accountSuspensions = pgTable('mw_account_suspensions', {
  userId: uuid('user_id').primaryKey(),
  reason: text().notNull().default(''),
  suspendedBy: uuid('suspended_by').notNull(),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }).notNull().defaultNow(),
  liftedAt: timestamp('lifted_at', { withTimezone: true }),
  liftedBy: uuid('lifted_by'),
});

// Suspended members can ask the owner to review their suspension; approving an appeal lifts it.
export const accountAppeals = pgTable('mw_account_appeals', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  message: text().notNull(),
  status: text().notNull().default('pending'),
  adminNote: text('admin_note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by'),
}, table => [index('mw_account_appeals_user').on(table.userId), index('mw_account_appeals_status').on(table.status)]);

// Coins to spend on gifts. Gifts start at a tenth of a coin (100 TZS), so balances keep one decimal place.
export const accountBalances = pgTable('mw_account_balances', {
  userId: uuid('user_id').primaryKey(),
  coins: numeric({ precision: 14, scale: 1, mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Group chats and 1:1 call signalling live here because the Supabase project never received the V25 DM tables.
export const chatGroups = pgTable('mw_chat_groups', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  description: text().notNull().default(''),
  caption: text().notNull().default(''),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Accounts an admin removed and blocked from rejoining a group.
export const chatGroupBans = pgTable('mw_chat_group_bans', {
  groupId: uuid('group_id').notNull().references(() => chatGroups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  bannedBy: uuid('banned_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.groupId, table.userId] })]);

export const chatGroupMembers = pgTable('mw_chat_group_members', {
  groupId: uuid('group_id').notNull().references(() => chatGroups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  role: text().notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.groupId, table.userId] }), index('mw_chat_group_members_user').on(table.userId)]);

export const chatGroupMessages = pgTable('mw_chat_group_messages', {
  id: uuid().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => chatGroups.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull(),
  body: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('mw_chat_group_messages_timeline').on(table.groupId, table.createdAt)]);

export const directCalls = pgTable('mw_direct_calls', {
  id: uuid().primaryKey().defaultRandom(),
  callerId: uuid('caller_id').notNull(),
  calleeId: uuid('callee_id').notNull(),
  mode: text().notNull().default('audio'),
  status: text().notNull().default('ringing'),
  outcome: text(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, table => [index('mw_direct_calls_incoming').on(table.calleeId, table.status, table.createdAt)]);

// Account privacy and notification choices from Settings (the Supabase profile table has no columns for them).
export const accountPreferences = pgTable('mw_account_preferences', {
  userId: uuid('user_id').primaryKey(),
  isPrivate: boolean('is_private').notNull().default(false),
  allowMessages: text('allow_messages').notNull().default('everyone'),
  notifyFollow: boolean('notify_follow').notNull().default(true),
  notifyEcho: boolean('notify_echo').notNull().default(true),
  notifySignal: boolean('notify_signal').notNull().default(true),
  // Message Settings in the Chats menu.
  readReceipts: boolean('read_receipts').notNull().default(true),
  notifyMessages: boolean('notify_messages').notNull().default(true),
  messageSound: boolean('message_sound').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Optional phone number from sign-up or Settings. Only exact lookups are served, so numbers are never listed.
export const accountPhones = pgTable('mw_account_phones', {
  userId: uuid('user_id').primaryKey(),
  phone: text('phone').notNull(),
  phoneTail: text('phone_tail').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('mw_account_phones_phone').on(table.phone), index('mw_account_phones_tail').on(table.phoneTail)]);

// Per-post audience for the profile gallery: 'everyone' (public) or 'only_me' (private). A missing row means everyone.
export const postAudiences = pgTable('mw_post_audiences', {
  postId: uuid('post_id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  audience: text().notNull().default('everyone'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('mw_post_audiences_owner').on(table.ownerId)]);

// Documents (PDF and office files) attached to posts. The bytes live in Netlify Blobs and are only served after an audience check.
export const postFiles = pgTable('mw_post_files', {
  key: text().primaryKey(),
  postId: uuid('post_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text().notNull(),
  mime: text().notNull(),
  size: integer().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('mw_post_files_post').on(table.postId), index('mw_post_files_owner').on(table.ownerId)]);

// One-tap reposts: the repost itself is a normal Supabase post owned by the reposter; this row links it to the original.
// The unique (user, original) index stops double taps from creating duplicate reposts.
export const postReposts = pgTable('mw_post_reposts', {
  repostId: uuid('repost_id').primaryKey(),
  originalId: uuid('original_id').notNull(),
  userId: uuid('user_id').notNull(),
  originalAuthorId: uuid('original_author_id').notNull(),
  originalAuthorName: text('original_author_name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('mw_post_reposts_user_original').on(table.userId, table.originalId), index('mw_post_reposts_original').on(table.originalId)]);

// Artist registrations from the Arts & Media form. Only administrators can read them; the five
// required files live in the private 'artist-registrations' Blobs store under the keys recorded in `files`.
export const artistRegistrations = pgTable('artist_registrations', {
  id: uuid().primaryKey(),
  fullName: text('full_name').notNull(),
  phone: text().notNull(),
  country: text().notNull(),
  gender: text().notNull(),
  birthDate: text('birth_date').notNull(),
  training: text().notNull().default(''),
  role: text().notNull(),
  bio: text().notNull(),
  files: jsonb().$type<Record<string, { key: string; name: string; mime: string; size: number }>>().notNull(),
  status: text().notNull().default('new'),
  adminNote: text('admin_note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, table => [index('artist_registrations_time').on(table.createdAt)]);

// Firebase Cloud Messaging device tokens from the native Android app. `userId` links the device to a
// MilkyWay account; `isAdmin` devices also receive admin alerts such as new artist registrations.
export const fcmDevices = pgTable('fcm_devices', {
  token: text().primaryKey(),
  userId: uuid('user_id'),
  isAdmin: boolean('is_admin').notNull().default(false),
  platform: text().notNull().default('android'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('fcm_devices_user').on(table.userId)]);

// Creator earnings from gifts, in thousandths of a coin. Only the creator's net share is ever stored here,
// so dashboards and payouts read it directly; the company commission is recorded on each gift row instead.
export const creatorEarnings = pgTable('mw_creator_earnings', {
  userId: uuid('user_id').primaryKey(),
  availableMilli: integer('available_milli').notNull().default(0),
  lifetimeMilli: integer('lifetime_milli').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per gift sent on a post or a LIVE. `coins` is what the sender paid; `creatorMilli` is the creator's 60% net
// share and `companyMilli` the 40% credited to the company wallet.
export const gifts = pgTable('mw_gifts', {
  id: uuid().primaryKey().defaultRandom(),
  senderId: uuid('sender_id').notNull(),
  recipientId: uuid('recipient_id').notNull(),
  giftKey: text('gift_key').notNull(),
  coins: numeric({ precision: 10, scale: 1, mode: 'number' }).notNull(),
  creatorMilli: integer('creator_milli').notNull(),
  companyMilli: integer('company_milli').notNull().default(0),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('mw_gifts_recipient_time').on(table.recipientId, table.createdAt), index('mw_gifts_target').on(table.targetType, table.targetId)]);

// Masiyatunda Co. Ltd's 40% of every gift, in thousandths of a coin (one row, id 'company'). Owner dashboard only.
export const companyWallet = pgTable('mw_company_wallet', {
  id: text().primaryKey(),
  balanceMilli: bigint('balance_milli', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Coin purchases paid by mobile money. An administrator checks the transaction reference and approves the credit.
export const coinTopups = pgTable('mw_coin_topups', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  coins: integer().notNull(),
  amountTzs: integer('amount_tzs').notNull(),
  // What the buyer saw on screen: their local currency and the converted price, in that currency's minor units.
  currency: text().notNull().default('TZS'),
  amountLocalMinor: integer('amount_local_minor').notNull().default(0),
  network: text().notNull(),
  phone: text().notNull(),
  reference: text().notNull(),
  status: text().notNull().default('pending'),
  adminNote: text('admin_note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by'),
}, table => [uniqueIndex('mw_coin_topups_reference').on(table.reference), index('mw_coin_topups_user').on(table.userId), index('mw_coin_topups_status').on(table.status)]);

// Creator payout requests. The coins are reserved when the request is made and returned if it is rejected.
// `payoutTzs` is the creator's net amount; `grossTzs`/`commissionTzs` are for the company's own accounting.
export const coinWithdrawals = pgTable('mw_coin_withdrawals', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  milli: integer().notNull(),
  payoutTzs: integer('payout_tzs').notNull(),
  grossTzs: integer('gross_tzs').notNull(),
  commissionTzs: integer('commission_tzs').notNull(),
  currency: text().notNull().default('TZS'),
  payoutLocalMinor: integer('payout_local_minor').notNull().default(0),
  network: text().notNull(),
  phone: text().notNull(),
  accountName: text('account_name').notNull(),
  status: text().notNull().default('pending'),
  payoutRef: text('payout_ref').notNull().default(''),
  adminNote: text('admin_note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by'),
}, table => [index('mw_coin_withdrawals_user').on(table.userId), index('mw_coin_withdrawals_status').on(table.status)]);

// Country detected when the account joins (network location first, then the device's region settings).
// It sets the currency coin prices and earnings are shown in, and is kept as first detected.
export const accountCountries = pgTable('mw_account_countries', {
  userId: uuid('user_id').primaryKey(),
  country: text().notNull(),
  currency: text().notNull(),
  source: text().notNull().default('network'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
});

// Date of birth and gender given on the sign-up form. Only the account itself can read or change them;
// they are never shown on the public profile.
export const accountDetails = pgTable('mw_account_details', {
  userId: uuid('user_id').primaryKey(),
  birthDate: date('birth_date', { mode: 'string' }).notNull(),
  gender: text().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Small administrator-edited settings, such as the mobile money payment instructions shown on the top-up screen.
export const walletSettings = pgTable('mw_wallet_settings', {
  key: text().primaryKey(),
  value: text().notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
