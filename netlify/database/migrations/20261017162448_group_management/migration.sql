CREATE TABLE "mw_chat_group_bans" (
	"group_id" uuid,
	"user_id" uuid,
	"banned_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mw_chat_group_bans_pkey" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "mw_chat_groups" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_chat_groups" ADD COLUMN "caption" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_chat_groups" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_chat_group_bans" ADD CONSTRAINT "mw_chat_group_bans_group_id_mw_chat_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "mw_chat_groups"("id") ON DELETE CASCADE;