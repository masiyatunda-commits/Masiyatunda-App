CREATE TABLE "mw_message_hides" (
	"owner_id" uuid,
	"message_id" uuid,
	"hidden_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mw_message_hides_pkey" PRIMARY KEY("owner_id","message_id")
);
