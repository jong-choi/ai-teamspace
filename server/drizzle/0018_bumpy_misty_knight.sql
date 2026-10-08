ALTER TABLE "outbox_aggregate_version" ADD COLUMN "applied_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD COLUMN "applied_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD COLUMN "last_error" text;