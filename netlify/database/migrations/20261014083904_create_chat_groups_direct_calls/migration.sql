CREATE TABLE "mw_chat_group_members" (
	"group_id" uuid,
	"user_id" uuid,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mw_chat_group_members_pkey" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "mw_chat_group_messages" (
	"id" uuid PRIMARY KEY,
	"group_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mw_chat_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mw_direct_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"caller_id" uuid NOT NULL,
	"callee_id" uuid NOT NULL,
	"mode" text DEFAULT 'audio' NOT NULL,
	"status" text DEFAULT 'ringing' NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "mw_chat_group_members_user" ON "mw_chat_group_members" ("user_id");--> statement-breakpoint
CREATE INDEX "mw_chat_group_messages_timeline" ON "mw_chat_group_messages" ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "mw_direct_calls_incoming" ON "mw_direct_calls" ("callee_id","status","created_at");--> statement-breakpoint
ALTER TABLE "mw_chat_group_members" ADD CONSTRAINT "mw_chat_group_members_group_id_mw_chat_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "mw_chat_groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mw_chat_group_messages" ADD CONSTRAINT "mw_chat_group_messages_group_id_mw_chat_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "mw_chat_groups"("id") ON DELETE CASCADE;