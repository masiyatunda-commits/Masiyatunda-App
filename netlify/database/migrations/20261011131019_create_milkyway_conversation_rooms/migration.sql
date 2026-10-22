CREATE TABLE "mw_conversation_members" (
	"room" text,
	"user_id" uuid,
	"name" text NOT NULL,
	"avatar" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'viewer' NOT NULL,
	"host_muted" boolean DEFAULT false NOT NULL,
	"last_sent_at" timestamp with time zone,
	CONSTRAINT "mw_conversation_members_pkey" PRIMARY KEY("room","user_id")
);
--> statement-breakpoint
CREATE TABLE "mw_conversation_messages" (
	"id" uuid PRIMARY KEY,
	"room" text NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"avatar" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"kind" text DEFAULT 'message' NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mw_conversation_rooms" (
	"room" text PRIMARY KEY,
	"host_id" uuid NOT NULL,
	"admission" text DEFAULT 'approval' NOT NULL,
	"layout" integer DEFAULT 4 NOT NULL,
	"featured_id" uuid
);
--> statement-breakpoint
CREATE INDEX "mw_conversation_messages_room_time" ON "mw_conversation_messages" ("room","created_at");--> statement-breakpoint
ALTER TABLE "mw_conversation_members" ADD CONSTRAINT "mw_conversation_members_room_mw_conversation_rooms_room_fkey" FOREIGN KEY ("room") REFERENCES "mw_conversation_rooms"("room");--> statement-breakpoint
ALTER TABLE "mw_conversation_messages" ADD CONSTRAINT "mw_conversation_messages_room_mw_conversation_rooms_room_fkey" FOREIGN KEY ("room") REFERENCES "mw_conversation_rooms"("room");