CREATE TABLE "mw_post_audiences" (
	"post_id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"audience" text DEFAULT 'everyone' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mw_post_files" (
	"key" text PRIMARY KEY,
	"post_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mw_post_audiences_owner" ON "mw_post_audiences" ("owner_id");--> statement-breakpoint
CREATE INDEX "mw_post_files_post" ON "mw_post_files" ("post_id");--> statement-breakpoint
CREATE INDEX "mw_post_files_owner" ON "mw_post_files" ("owner_id");