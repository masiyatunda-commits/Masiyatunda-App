CREATE TABLE "mw_account_preferences" (
	"user_id" uuid PRIMARY KEY,
	"is_private" boolean DEFAULT false NOT NULL,
	"allow_messages" text DEFAULT 'everyone' NOT NULL,
	"notify_follow" boolean DEFAULT true NOT NULL,
	"notify_echo" boolean DEFAULT true NOT NULL,
	"notify_signal" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
