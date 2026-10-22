CREATE TABLE "mw_account_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "placement" text DEFAULT 'feed' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "skip_after" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "amount_paid" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "currency" text DEFAULT 'TZS' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "payment_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "target_languages" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "target_countries" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "impressions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_ad_campaigns" ADD COLUMN "clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "mw_account_appeals_user" ON "mw_account_appeals" ("user_id");--> statement-breakpoint
CREATE INDEX "mw_account_appeals_status" ON "mw_account_appeals" ("status");--> statement-breakpoint
-- Campaigns approved before payments were tracked keep running.
UPDATE "mw_ad_campaigns" SET "paid" = true WHERE "status" = 'approved';
