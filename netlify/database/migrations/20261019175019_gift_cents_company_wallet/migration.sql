CREATE TABLE "mw_company_wallet" (
	"id" text PRIMARY KEY,
	"balance_milli" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mw_gifts" ADD COLUMN "company_milli" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_account_balances" ALTER COLUMN "coins" SET DATA TYPE numeric(14,1) USING "coins"::numeric(14,1);--> statement-breakpoint
ALTER TABLE "mw_account_balances" ALTER COLUMN "coins" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "mw_gifts" ALTER COLUMN "coins" SET DATA TYPE numeric(10,1) USING "coins"::numeric(10,1);--> statement-breakpoint
-- Gifts sent before the company wallet existed: record their 40% and open the wallet with the total.
UPDATE "mw_gifts" SET "company_milli" = ("coins" * 1000)::integer - "creator_milli" WHERE "company_milli" = 0;--> statement-breakpoint
INSERT INTO "mw_company_wallet" ("id", "balance_milli") SELECT 'company', coalesce(sum("company_milli"), 0) FROM "mw_gifts" ON CONFLICT ("id") DO NOTHING;
