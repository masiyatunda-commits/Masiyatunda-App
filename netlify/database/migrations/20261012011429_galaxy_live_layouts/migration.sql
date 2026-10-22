ALTER TABLE "mw_conversation_rooms" ADD COLUMN "layout_style" text DEFAULT 'host-top' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_conversation_rooms" ADD COLUMN "host_position" text DEFAULT 'start' NOT NULL;--> statement-breakpoint
ALTER TABLE "mw_conversation_rooms" ADD COLUMN "mobile_layout" text DEFAULT 'stack' NOT NULL;