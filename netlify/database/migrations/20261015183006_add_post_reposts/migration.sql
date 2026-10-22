CREATE TABLE "mw_post_reposts" (
	"repost_id" uuid PRIMARY KEY,
	"original_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"original_author_id" uuid NOT NULL,
	"original_author_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mw_post_reposts_user_original" ON "mw_post_reposts" ("user_id","original_id");--> statement-breakpoint
CREATE INDEX "mw_post_reposts_original" ON "mw_post_reposts" ("original_id");