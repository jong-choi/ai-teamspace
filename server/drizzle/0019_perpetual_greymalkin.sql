CREATE TABLE "kg_curated_edge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"predicate" text NOT NULL,
	"directed" boolean DEFAULT true NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "kg_curated_edge_predicate_check" CHECK ("kg_curated_edge"."predicate" = 'related_to'),
	CONSTRAINT "kg_curated_edge_revision_check" CHECK ("kg_curated_edge"."revision" > 0),
	CONSTRAINT "kg_curated_edge_status_check" CHECK ("kg_curated_edge"."status" in ('active', 'deleted')),
	CONSTRAINT "kg_curated_edge_delete_state_check" CHECK (("kg_curated_edge"."status" = 'active' and "kg_curated_edge"."deleted_at" is null) or ("kg_curated_edge"."status" = 'deleted' and "kg_curated_edge"."deleted_at" is not null)),
	CONSTRAINT "kg_curated_edge_no_self_loop_check" CHECK ("kg_curated_edge"."source_node_id" <> "kg_curated_edge"."target_node_id")
);
--> statement-breakpoint
CREATE TABLE "kg_edit_audit" (
	"event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"target_revision" integer NOT NULL,
	"before_digest" text,
	"after_digest" text,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kg_edit_audit_target_kind_check" CHECK ("kg_edit_audit"."target_kind" in ('node', 'edge')),
	CONSTRAINT "kg_edit_audit_operation_check" CHECK ("kg_edit_audit"."operation" in ('create', 'update', 'delete')),
	CONSTRAINT "kg_edit_audit_revision_check" CHECK ("kg_edit_audit"."target_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "kg_curated_node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "kg_curated_node_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "kg_curated_node_kind_check" CHECK ("kg_curated_node"."kind" = 'custom'),
	CONSTRAINT "kg_curated_node_status_check" CHECK ("kg_curated_node"."status" in ('active', 'deleted')),
	CONSTRAINT "kg_curated_node_revision_check" CHECK ("kg_curated_node"."revision" > 0),
	CONSTRAINT "kg_curated_node_delete_state_check" CHECK (("kg_curated_node"."status" = 'active' and "kg_curated_node"."deleted_at" is null) or ("kg_curated_node"."status" = 'deleted' and "kg_curated_node"."deleted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD COLUMN "projection_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD COLUMN "last_attempted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_source_organization_fk" FOREIGN KEY ("source_node_id","organization_id") REFERENCES "public"."kg_curated_node"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_target_organization_fk" FOREIGN KEY ("target_node_id","organization_id") REFERENCES "public"."kg_curated_node"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_edit_audit" ADD CONSTRAINT "kg_edit_audit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_edit_audit" ADD CONSTRAINT "kg_edit_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_curated_node" ADD CONSTRAINT "kg_curated_node_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_curated_node" ADD CONSTRAINT "kg_curated_node_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_curated_node" ADD CONSTRAINT "kg_curated_node_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kg_curated_edge_active_unique" ON "kg_curated_edge" USING btree ("organization_id","source_node_id","target_node_id","predicate","directed") WHERE "kg_curated_edge"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "kg_curated_edge_organization_status_idx" ON "kg_curated_edge" USING btree ("organization_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "kg_curated_edge_source_idx" ON "kg_curated_edge" USING btree ("organization_id","source_node_id","status");--> statement-breakpoint
CREATE INDEX "kg_curated_edge_target_idx" ON "kg_curated_edge" USING btree ("organization_id","target_node_id","status");--> statement-breakpoint
CREATE INDEX "kg_edit_audit_org_target_idx" ON "kg_edit_audit" USING btree ("organization_id","target_kind","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "kg_curated_node_organization_status_idx" ON "kg_curated_node" USING btree ("organization_id","status","updated_at","id");--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD CONSTRAINT "outbox_aggregate_version_projection_status_check" CHECK ("outbox_aggregate_version"."projection_status" in ('pending', 'applying', 'applied', 'retry_scheduled', 'failed'));--> statement-breakpoint
ALTER TABLE "outbox_aggregate_version" ADD CONSTRAINT "outbox_aggregate_version_applied_seq_check" CHECK ("outbox_aggregate_version"."applied_seq" <= "outbox_aggregate_version"."desired_seq");