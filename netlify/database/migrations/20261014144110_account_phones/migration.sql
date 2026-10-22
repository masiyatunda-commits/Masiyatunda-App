CREATE TABLE "mw_account_phones" (
	"user_id" uuid PRIMARY KEY,
	"phone" text NOT NULL,
	"phone_tail" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mw_account_phones_phone" ON "mw_account_phones" ("phone");--> statement-breakpoint
CREATE INDEX "mw_account_phones_tail" ON "mw_account_phones" ("phone_tail");