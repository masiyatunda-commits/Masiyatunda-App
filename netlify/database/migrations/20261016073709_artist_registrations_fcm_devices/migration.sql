CREATE TABLE "artist_registrations" (
	"id" uuid PRIMARY KEY,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"country" text NOT NULL,
	"gender" text NOT NULL,
	"birth_date" text NOT NULL,
	"training" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"bio" text NOT NULL,
	"files" jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fcm_devices" (
	"token" text PRIMARY KEY,
	"user_id" uuid,
	"is_admin" boolean DEFAULT false NOT NULL,
	"platform" text DEFAULT 'android' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "artist_registrations_time" ON "artist_registrations" ("created_at");--> statement-breakpoint
CREATE INDEX "fcm_devices_user" ON "fcm_devices" ("user_id");