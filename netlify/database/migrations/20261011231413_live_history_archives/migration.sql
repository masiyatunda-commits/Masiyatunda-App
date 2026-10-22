CREATE TABLE "mw_live_history_archives" (
	"owner_id" uuid,
	"session_id" uuid,
	"source" text,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mw_live_history_archives_pkey" PRIMARY KEY("owner_id","source","session_id")
);
