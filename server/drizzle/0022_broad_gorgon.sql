CREATE TABLE "kg_reconciliation_scope" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"organization_id" text,
	"aggregate_kind" text,
	"after_organization_id" text,
	"after_aggregate_id" text,
	"lease_token" uuid,
	"lease_until" timestamp (3) with time zone,
	"next_run_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kg_reconciliation_scope_purpose_check" CHECK ("kg_reconciliation_scope"."purpose" in ('organizations', 'owner_sources', 'membership_sources', 'organization_presence')),
	CONSTRAINT "kg_reconciliation_scope_kind_check" CHECK ("kg_reconciliation_scope"."aggregate_kind" is null or "kg_reconciliation_scope"."aggregate_kind" in ('wiki_document', 'project', 'ticket_label', 'ticket', 'meeting', 'meeting_room', 'meeting_recurrence', 'membership', 'curated_node', 'curated_edge')),
	CONSTRAINT "kg_reconciliation_scope_owner_check" CHECK (("kg_reconciliation_scope"."purpose" = 'owner_sources' and "kg_reconciliation_scope"."organization_id" is not null and "kg_reconciliation_scope"."aggregate_kind" is not null) or ("kg_reconciliation_scope"."purpose" <> 'owner_sources' and "kg_reconciliation_scope"."organization_id" is null and "kg_reconciliation_scope"."aggregate_kind" is null)),
	CONSTRAINT "kg_reconciliation_scope_lease_check" CHECK (("kg_reconciliation_scope"."lease_token" is null and "kg_reconciliation_scope"."lease_until" is null) or ("kg_reconciliation_scope"."lease_token" is not null and "kg_reconciliation_scope"."lease_until" is not null)),
	CONSTRAINT "kg_reconciliation_scope_cursor_check" CHECK (("kg_reconciliation_scope"."purpose" in ('organizations', 'organization_presence') and "kg_reconciliation_scope"."after_aggregate_id" is null)
        or ("kg_reconciliation_scope"."purpose" = 'owner_sources' and "kg_reconciliation_scope"."after_organization_id" is null)
        or ("kg_reconciliation_scope"."purpose" = 'membership_sources' and (("kg_reconciliation_scope"."after_organization_id" is null) = ("kg_reconciliation_scope"."after_aggregate_id" is null)))),
	CONSTRAINT "kg_reconciliation_scope_failure_count_check" CHECK ("kg_reconciliation_scope"."failure_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD COLUMN "applied_snapshot_digest" text;--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD COLUMN "requeue_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD COLUMN "last_requeued_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE INDEX "kg_reconciliation_scope_claim_idx" ON "kg_reconciliation_scope" USING btree ("purpose","next_run_at","lease_until","id");--> statement-breakpoint
CREATE INDEX "outbox_aggregate_version_pending_requeue_idx" ON "outbox_aggregate_version" USING btree ((coalesce("last_requeued_at", 'epoch'::timestamptz)),"updated_at","organization_id","aggregate_kind","aggregate_id") WHERE "outbox_aggregate_version"."applied_seq" < "outbox_aggregate_version"."desired_seq";--> statement-breakpoint
CREATE INDEX "outbox_aggregate_version_membership_observation_idx" ON "outbox_aggregate_version" USING btree ("organization_id","aggregate_id") WHERE "outbox_aggregate_version"."aggregate_kind" = 'membership';--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD CONSTRAINT "outbox_aggregate_version_kind_check" CHECK ("outbox_aggregate_version"."aggregate_kind" in ('wiki_document', 'project', 'ticket_label', 'ticket', 'meeting', 'meeting_room', 'meeting_recurrence', 'membership', 'curated_node', 'curated_edge'));--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD CONSTRAINT "outbox_aggregate_version_safe_seq_check" CHECK ("outbox_aggregate_version"."applied_seq" >= 0 and "outbox_aggregate_version"."desired_seq" >= 0 and "outbox_aggregate_version"."desired_seq" <= 9007199254740991);--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD CONSTRAINT "outbox_aggregate_version_snapshot_digest_check" CHECK ("outbox_aggregate_version"."applied_snapshot_digest" is null or "outbox_aggregate_version"."applied_snapshot_digest" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD CONSTRAINT "outbox_aggregate_version_requeue_count_check" CHECK ("outbox_aggregate_version"."requeue_count" >= 0);