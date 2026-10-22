CREATE TABLE "mw_coin_topups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"coins" integer NOT NULL,
	"amount_tzs" integer NOT NULL,
	"network" text NOT NULL,
	"phone" text NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "mw_coin_withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"milli" integer NOT NULL,
	"payout_tzs" integer NOT NULL,
	"gross_tzs" integer NOT NULL,
	"commission_tzs" integer NOT NULL,
	"network" text NOT NULL,
	"phone" text NOT NULL,
	"account_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payout_ref" text DEFAULT '' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "mw_creator_earnings" (
	"user_id" uuid PRIMARY KEY,
	"available_milli" integer DEFAULT 0 NOT NULL,
	"lifetime_milli" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mw_gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"gift_key" text NOT NULL,
	"coins" integer NOT NULL,
	"creator_milli" integer NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mw_wallet_settings" (
	"key" text PRIMARY KEY,
	"value" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mw_coin_topups_reference" ON "mw_coin_topups" ("reference");--> statement-breakpoint
CREATE INDEX "mw_coin_topups_user" ON "mw_coin_topups" ("user_id");--> statement-breakpoint
CREATE INDEX "mw_coin_topups_status" ON "mw_coin_topups" ("status");--> statement-breakpoint
CREATE INDEX "mw_coin_withdrawals_user" ON "mw_coin_withdrawals" ("user_id");--> statement-breakpoint
CREATE INDEX "mw_coin_withdrawals_status" ON "mw_coin_withdrawals" ("status");--> statement-breakpoint
CREATE INDEX "mw_gifts_recipient_time" ON "mw_gifts" ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "mw_gifts_target" ON "mw_gifts" ("target_type","target_id");