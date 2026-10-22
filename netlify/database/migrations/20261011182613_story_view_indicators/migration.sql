CREATE TABLE "mw_story_views" (
	"owner_id" uuid,
	"story_id" uuid,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mw_story_views_pkey" PRIMARY KEY("owner_id","story_id")
);
