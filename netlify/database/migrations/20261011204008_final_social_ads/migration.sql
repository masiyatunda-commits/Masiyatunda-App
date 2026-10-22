CREATE TABLE "mw_ad_dismissals" (
	"campaign_id" uuid,
	"user_id" uuid,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mw_ad_dismissals_pkey" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "mw_comment_extras" (
	"comment_id" uuid PRIMARY KEY,
	"post_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"parent_id" uuid,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"media" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mw_post_extras" (
	"post_id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"media" jsonb DEFAULT '[]' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "cta_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "audience" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "frequency" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "dismiss_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "mw_comment_extras_post" ON "mw_comment_extras" ("post_id");