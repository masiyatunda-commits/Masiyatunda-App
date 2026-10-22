CREATE TABLE "mw_account_balances" (
	"user_id" uuid PRIMARY KEY,
	"coins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mw_account_suspensions" (
	"user_id" uuid PRIMARY KEY,
	"reason" text DEFAULT '' NOT NULL,
	"suspended_by" uuid NOT NULL,
	"suspended_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid
);
