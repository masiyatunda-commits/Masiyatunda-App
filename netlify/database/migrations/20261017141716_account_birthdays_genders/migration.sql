CREATE TABLE "mw_account_details" (
	"user_id" uuid PRIMARY KEY,
	"birth_date" date NOT NULL,
	"gender" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
