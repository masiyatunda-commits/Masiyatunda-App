CREATE TABLE "mw_post_watermarks" (
	"post_id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
