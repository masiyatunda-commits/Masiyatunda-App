CREATE TABLE "mw_dm_conversation_archives" (
	"owner_id" uuid,
	"peer_id" uuid,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mw_dm_conversation_archives_pkey" PRIMARY KEY("owner_id","peer_id")
);
