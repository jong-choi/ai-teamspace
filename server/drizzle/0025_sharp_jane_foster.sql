CREATE TABLE "kg_graph_rebuild_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by_user_id" text,
	"mode" text NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"pipeline_fingerprint" text NOT NULL,
	"phase" text,
	"cursor_kind" text,
	"cursor_after_id" text,
	"lease_token" uuid,
	"lease_expires_at" timestamp (3) with time zone,
	"fence_token" bigint DEFAULT 0 NOT NULL,
	"pages_committed" integer DEFAULT 0 NOT NULL,
	"projection_intents" integer DEFAULT 0 NOT NULL,
	"semantic_requests" integer DEFAULT 0 NOT NULL,
	"skipped_deleted" integer DEFAULT 0 NOT NULL,
	"failed_sources" integer,
	"last_error_code" text,
	"accepted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp (3) with time zone,
	"catch_up_started_at" timestamp (3) with time zone,
	"cancel_requested_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kg_graph_rebuild_request_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "kg_graph_rebuild_request_mode_check" CHECK ("kg_graph_rebuild_request"."mode" in ('projection_repair', 'semantic_reindex', 'full')),
	CONSTRAINT "kg_graph_rebuild_request_status_check" CHECK ("kg_graph_rebuild_request"."status" in ('accepted', 'running', 'catching_up', 'cancel_requested', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "kg_graph_rebuild_request_phase_check" CHECK ("kg_graph_rebuild_request"."phase" is null or "kg_graph_rebuild_request"."phase" in ('projection', 'semantic')),
	CONSTRAINT "kg_graph_rebuild_request_lease_check" CHECK (("kg_graph_rebuild_request"."lease_token" is null) = ("kg_graph_rebuild_request"."lease_expires_at" is null)),
	CONSTRAINT "kg_graph_rebuild_request_terminal_check" CHECK (("kg_graph_rebuild_request"."status" in ('succeeded', 'failed', 'cancelled')) = ("kg_graph_rebuild_request"."completed_at" is not null)),
	CONSTRAINT "kg_graph_rebuild_request_failed_code_check" CHECK (("kg_graph_rebuild_request"."status" = 'failed') = ("kg_graph_rebuild_request"."last_error_code" is not null)),
	CONSTRAINT "kg_graph_rebuild_request_cancel_check" CHECK ("kg_graph_rebuild_request"."status" not in ('cancel_requested', 'cancelled') or "kg_graph_rebuild_request"."cancel_requested_at" is not null),
	CONSTRAINT "kg_graph_rebuild_request_counts_check" CHECK ("kg_graph_rebuild_request"."pages_committed" >= 0 and "kg_graph_rebuild_request"."projection_intents" >= 0 and "kg_graph_rebuild_request"."semantic_requests" >= 0 and "kg_graph_rebuild_request"."skipped_deleted" >= 0 and ("kg_graph_rebuild_request"."failed_sources" is null or "kg_graph_rebuild_request"."failed_sources" >= 0) and "kg_graph_rebuild_request"."fence_token" >= 0 and "kg_graph_rebuild_request"."fence_token" <= 9007199254740991),
	CONSTRAINT "kg_graph_rebuild_request_fingerprint_check" CHECK ("kg_graph_rebuild_request"."pipeline_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "kg_graph_rebuild_request" ADD CONSTRAINT "kg_graph_rebuild_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_graph_rebuild_request" ADD CONSTRAINT "kg_graph_rebuild_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kg_graph_rebuild_request_active_unique" ON "kg_graph_rebuild_request" USING btree ("organization_id") WHERE "kg_graph_rebuild_request"."status" in ('accepted', 'running', 'catching_up', 'cancel_requested');--> statement-breakpoint
CREATE INDEX "kg_graph_rebuild_request_claim_idx" ON "kg_graph_rebuild_request" USING btree ("status","lease_expires_at","updated_at");--> statement-breakpoint
CREATE INDEX "kg_graph_rebuild_request_org_recent_idx" ON "kg_graph_rebuild_request" USING btree ("organization_id","accepted_at");