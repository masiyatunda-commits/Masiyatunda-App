CREATE TABLE "mw_ad_campaigns" (
	"id" uuid PRIMARY KEY,
	"business" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"media_url" text NOT NULL,
	"media_type" text NOT NULL,
	"destination" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mw_media_assets" (
	"key" text PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"recipient_id" uuid,
	"purpose" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"retained" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mw_media_assets_owner" ON "mw_media_assets" ("owner_id");