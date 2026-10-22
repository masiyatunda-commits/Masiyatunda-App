CREATE TABLE "mw_live_alerts" (
	"room" text,
	"recipient_id" uuid,
	"host_id" uuid NOT NULL,
	"host_name" text NOT NULL,
	"avatar" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "mw_live_alerts_pkey" PRIMARY KEY("room","recipient_id")
);
--> statement-breakpoint
CREATE TABLE "mw_notification_preferences" (
	"user_id" uuid PRIMARY KEY,
	"live_enabled" boolean DEFAULT true NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"language" text DEFAULT 'sw' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mw_push_deliveries" (
	"room" text,
	"subscription_id" text,
	"recipient_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mw_push_deliveries_pkey" PRIMARY KEY("room","subscription_id")
);
--> statement-breakpoint
CREATE TABLE "mw_push_subscriptions" (
	"id" text PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mw_conversation_rooms" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mw_conversation_rooms" ADD COLUMN "lifecycle_status" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_conversation_rooms" ADD COLUMN "notifications_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_conversation_rooms" ADD COLUMN "notification_cursor" uuid;--> statement-breakpoint
CREATE INDEX "mw_live_alerts_recipient_time" ON "mw_live_alerts" ("recipient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mw_conversation_one_active_host" ON "mw_conversation_rooms" ("host_id") WHERE "ended_at" is null and "lifecycle_status" in ('preparing', 'live');--> statement-breakpoint
CREATE INDEX "mw_push_deliveries_due" ON "mw_push_deliveries" ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "mw_push_subscriptions_user" ON "mw_push_subscriptions" ("user_id");--> statement-breakpoint
ALTER TABLE "mw_live_alerts" ADD CONSTRAINT "mw_live_alerts_room_mw_conversation_rooms_room_fkey" FOREIGN KEY ("room") REFERENCES "mw_conversation_rooms"("room");--> statement-breakpoint
ALTER TABLE "mw_push_deliveries" ADD CONSTRAINT "mw_push_deliveries_room_mw_conversation_rooms_room_fkey" FOREIGN KEY ("room") REFERENCES "mw_conversation_rooms"("room");--> statement-breakpoint
ALTER TABLE "mw_push_deliveries" ADD CONSTRAINT "mw_push_deliveries_hV3jFxeKeKQd_fkey" FOREIGN KEY ("subscription_id") REFERENCES "mw_push_subscriptions"("id") ON DELETE CASCADE;