ALTER TABLE "mw_account_preferences" ADD COLUMN "read_receipts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_account_preferences" ADD COLUMN "notify_messages" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_account_preferences" ADD COLUMN "message_sound" boolean DEFAULT true NOT NULL;