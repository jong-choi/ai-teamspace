CREATE TABLE "kg_semantic_correction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"correction_target_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"action" text NOT NULL,
	"anchor" jsonb NOT NULL,
	"value" jsonb,
	"linked_correction_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_revision" bigint NOT NULL,
	"cancelled_revision" bigint,
	"created_by_user_id" text,
	"cancelled_by_user_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp (3) with time zone,
	"last_match_state" text,
	"last_matched_generation_id" uuid,
	"last_matched_at" timestamp (3) with time zone,
	CONSTRAINT "kg_semantic_correction_id_source_unique" UNIQUE("id","organization_id","source_kind","source_id"),
	CONSTRAINT "kg_semantic_correction_target_check" CHECK ("kg_semantic_correction"."target_kind" in ('entity', 'relation')),
	CONSTRAINT "kg_semantic_correction_action_check" CHECK ("kg_semantic_correction"."action" in ('label_override', 'suppress', 'asserted_relation')),
	CONSTRAINT "kg_semantic_correction_status_check" CHECK ("kg_semantic_correction"."status" in ('active', 'cancelled')),
	CONSTRAINT "kg_semantic_correction_match_check" CHECK ("kg_semantic_correction"."last_match_state" is null or "kg_semantic_correction"."last_match_state" in ('matched', 'pending_review', 'ambiguous_review')),
	CONSTRAINT "kg_semantic_correction_cancel_check" CHECK (("kg_semantic_correction"."status" = 'cancelled') = ("kg_semantic_correction"."cancelled_revision" is not null) and ("kg_semantic_correction"."status" = 'cancelled') = ("kg_semantic_correction"."cancelled_at" is not null)),
	CONSTRAINT "kg_semantic_correction_value_check" CHECK (("kg_semantic_correction"."value" is not null) = ("kg_semantic_correction"."action" in ('label_override', 'asserted_relation')) and ("kg_semantic_correction"."action" <> 'asserted_relation' or "kg_semantic_correction"."target_kind" = 'relation')),
	CONSTRAINT "kg_semantic_correction_revision_check" CHECK ("kg_semantic_correction"."created_revision" > 0 and "kg_semantic_correction"."created_revision" <= 9007199254740991 and ("kg_semantic_correction"."cancelled_revision" is null or ("kg_semantic_correction"."cancelled_revision" > "kg_semantic_correction"."created_revision" and "kg_semantic_correction"."cancelled_revision" <= 9007199254740991))),
	CONSTRAINT "kg_semantic_correction_target_id_check" CHECK ("kg_semantic_correction"."correction_target_id" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "kg_semantic_correction_source" (
	"organization_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"edit_revision" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kg_semantic_correction_source_organization_id_source_kind_source_id_pk" PRIMARY KEY("organization_id","source_kind","source_id"),
	CONSTRAINT "kg_semantic_correction_source_kind_check" CHECK ("kg_semantic_correction_source"."source_kind" in ('wiki_document')),
	CONSTRAINT "kg_semantic_correction_source_revision_check" CHECK ("kg_semantic_correction_source"."edit_revision" >= 0 and "kg_semantic_correction_source"."edit_revision" <= 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "outbox_semantic_source_state" (
	"organization_id" text NOT NULL,
	"aggregate_kind" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"observed_seq" bigint DEFAULT 0 NOT NULL,
	"observed_at" timestamp (3) with time zone,
	"manual_request_seq" bigint DEFAULT 0 NOT NULL,
	"manual_request_id" uuid,
	"manual_requested_at" timestamp (3) with time zone,
	"manual_requested_by_user_id" text,
	"manual_target_seq" bigint DEFAULT 0 NOT NULL,
	"manual_delivered_seq" bigint DEFAULT 0 NOT NULL,
	"indexed_seq" bigint DEFAULT 0 NOT NULL,
	"indexed_manual_seq" bigint DEFAULT 0 NOT NULL,
	"indexed_signature" text,
	"indexed_source_updated_at" timestamp (3) with time zone,
	"indexed_fingerprint" text,
	"active_generation_id" uuid,
	"last_indexed_at" timestamp (3) with time zone,
	"run_status" text DEFAULT 'idle' NOT NULL,
	"attempt_seq" bigint DEFAULT 0 NOT NULL,
	"attempt_manual_seq" bigint DEFAULT 0 NOT NULL,
	"attempt_fingerprint" text,
	"lease_token" uuid,
	"lease_expires_at" timestamp (3) with time zone,
	"fence_token" bigint DEFAULT 0 NOT NULL,
	"gc_required" boolean DEFAULT false NOT NULL,
	"last_error_code" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"requeue_count" integer DEFAULT 0 NOT NULL,
	"last_requeued_at" timestamp (3) with time zone,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_semantic_source_state_organization_id_aggregate_kind_aggregate_id_pk" PRIMARY KEY("organization_id","aggregate_kind","aggregate_id"),
	CONSTRAINT "outbox_semantic_source_state_kind_check" CHECK ("outbox_semantic_source_state"."aggregate_kind" in ('wiki_document')),
	CONSTRAINT "outbox_semantic_source_state_run_status_check" CHECK ("outbox_semantic_source_state"."run_status" in ('idle', 'running', 'retry_waiting', 'validation_failed', 'failed')),
	CONSTRAINT "outbox_semantic_source_state_error_check" CHECK ("outbox_semantic_source_state"."last_error_code" is null or "outbox_semantic_source_state"."last_error_code" in ('EXTRACTION_INVALID_RESPONSE', 'EMBEDDING_INVALID', 'PROVIDER_UNAUTHORIZED', 'PROVIDER_FORBIDDEN', 'PROVIDER_RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'GRAPH_STORE_UNAVAILABLE', 'SEMANTIC_SOURCE_TOO_LARGE', 'SEMANTIC_INTERNAL')),
	CONSTRAINT "outbox_semantic_source_state_manual_seq_check" CHECK ("outbox_semantic_source_state"."indexed_manual_seq" <= "outbox_semantic_source_state"."manual_request_seq" and "outbox_semantic_source_state"."manual_delivered_seq" <= "outbox_semantic_source_state"."manual_request_seq" and "outbox_semantic_source_state"."attempt_manual_seq" <= "outbox_semantic_source_state"."manual_request_seq"),
	CONSTRAINT "outbox_semantic_source_state_seq_range_check" CHECK (("outbox_semantic_source_state"."observed_seq" >= 0 and "outbox_semantic_source_state"."observed_seq" <= 9007199254740991) and ("outbox_semantic_source_state"."manual_request_seq" >= 0 and "outbox_semantic_source_state"."manual_request_seq" <= 9007199254740991) and ("outbox_semantic_source_state"."manual_target_seq" >= 0 and "outbox_semantic_source_state"."manual_target_seq" <= 9007199254740991) and ("outbox_semantic_source_state"."manual_delivered_seq" >= 0 and "outbox_semantic_source_state"."manual_delivered_seq" <= 9007199254740991) and ("outbox_semantic_source_state"."indexed_seq" >= 0 and "outbox_semantic_source_state"."indexed_seq" <= 9007199254740991) and ("outbox_semantic_source_state"."indexed_manual_seq" >= 0 and "outbox_semantic_source_state"."indexed_manual_seq" <= 9007199254740991) and ("outbox_semantic_source_state"."attempt_seq" >= 0 and "outbox_semantic_source_state"."attempt_seq" <= 9007199254740991) and ("outbox_semantic_source_state"."attempt_manual_seq" >= 0 and "outbox_semantic_source_state"."attempt_manual_seq" <= 9007199254740991) and ("outbox_semantic_source_state"."fence_token" >= 0 and "outbox_semantic_source_state"."fence_token" <= 9007199254740991)),
	CONSTRAINT "outbox_semantic_source_state_digest_check" CHECK (("outbox_semantic_source_state"."indexed_signature" is null or "outbox_semantic_source_state"."indexed_signature" ~ '^[0-9a-f]{64}$') and ("outbox_semantic_source_state"."indexed_fingerprint" is null or "outbox_semantic_source_state"."indexed_fingerprint" ~ '^[0-9a-f]{64}$') and ("outbox_semantic_source_state"."attempt_fingerprint" is null or "outbox_semantic_source_state"."attempt_fingerprint" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "outbox_semantic_source_state_lease_check" CHECK (("outbox_semantic_source_state"."lease_token" is null) = ("outbox_semantic_source_state"."lease_expires_at" is null)),
	CONSTRAINT "outbox_semantic_source_state_running_check" CHECK (("outbox_semantic_source_state"."run_status" = 'running') = ("outbox_semantic_source_state"."lease_token" is not null)),
	CONSTRAINT "outbox_semantic_source_state_manual_request_check" CHECK (("outbox_semantic_source_state"."manual_request_seq" = 0) = ("outbox_semantic_source_state"."manual_request_id" is null) and ("outbox_semantic_source_state"."manual_request_seq" = 0) = ("outbox_semantic_source_state"."manual_requested_at" is null)),
	CONSTRAINT "outbox_semantic_source_state_observed_check" CHECK (("outbox_semantic_source_state"."observed_seq" = 0) = ("outbox_semantic_source_state"."observed_at" is null)),
	CONSTRAINT "outbox_semantic_source_state_counts_check" CHECK ("outbox_semantic_source_state"."retry_count" >= 0 and "outbox_semantic_source_state"."requeue_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "kg_semantic_correction" ADD CONSTRAINT "kg_semantic_correction_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_semantic_correction" ADD CONSTRAINT "kg_semantic_correction_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_semantic_correction" ADD CONSTRAINT "kg_semantic_correction_source_fk" FOREIGN KEY ("organization_id","source_kind","source_id") REFERENCES "public"."kg_semantic_correction_source"("organization_id","source_kind","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_semantic_correction" ADD CONSTRAINT "kg_semantic_correction_link_fk" FOREIGN KEY ("linked_correction_id","organization_id","source_kind","source_id") REFERENCES "public"."kg_semantic_correction"("id","organization_id","source_kind","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_semantic_source_state" ADD CONSTRAINT "outbox_semantic_source_state_manual_requested_by_user_id_user_id_fk" FOREIGN KEY ("manual_requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_semantic_source_state" ADD CONSTRAINT "outbox_semantic_source_state_version_fk" FOREIGN KEY ("organization_id","aggregate_kind","aggregate_id") REFERENCES "public"."outbox_aggregate_version"("organization_id","aggregate_kind","aggregate_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kg_semantic_correction_source_idx" ON "kg_semantic_correction" USING btree ("organization_id","source_kind","source_id","status");--> statement-breakpoint
CREATE INDEX "outbox_semantic_source_state_requeue_idx" ON "outbox_semantic_source_state" USING btree ((coalesce("last_requeued_at", 'epoch'::timestamptz)),"updated_at","organization_id","aggregate_kind","aggregate_id");