CREATE TABLE "mw_message_edits" (
	"id" uuid PRIMARY KEY,
	"sender_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
