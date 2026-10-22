CREATE TABLE "mw_account_countries" (
	"user_id" uuid PRIMARY KEY,
	"country" text NOT NULL,
	"currency" text NOT NULL,
	"source" text DEFAULT 'network' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mw_coin_topups" ADD COLUMN "currency" text DEFAULT 'TZS' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_coin_topups" ADD COLUMN "amount_local_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_coin_withdrawals" ADD COLUMN "currency" text DEFAULT 'TZS' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_coin_withdrawals" ADD COLUMN "payout_local_minor" integer DEFAULT 0 NOT NULL;