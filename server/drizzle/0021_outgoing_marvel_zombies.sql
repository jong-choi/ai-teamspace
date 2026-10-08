ALTER TABLE "kg_curated_edge" DROP CONSTRAINT "kg_curated_edge_predicate_check";--> statement-breakpoint
ALTER TABLE "kg_curated_edge" DROP CONSTRAINT "kg_curated_edge_no_self_loop_check";--> statement-breakpoint
ALTER TABLE "kg_curated_node" DROP CONSTRAINT "kg_curated_node_kind_check";--> statement-breakpoint
ALTER TABLE "kg_curated_edge" DROP CONSTRAINT "kg_curated_edge_source_organization_fk";
--> statement-breakpoint
ALTER TABLE "kg_curated_edge" DROP CONSTRAINT "kg_curated_edge_target_organization_fk";
--> statement-breakpoint
DROP INDEX "kg_curated_edge_active_unique";--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD COLUMN "source_node_kind" text DEFAULT 'curated_node' NOT NULL;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD COLUMN "target_node_kind" text DEFAULT 'curated_node' NOT NULL;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD COLUMN "source_curated_node_id" uuid GENERATED ALWAYS AS (case when source_node_kind = 'curated_node' then source_node_id else null end) STORED;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD COLUMN "target_curated_node_id" uuid GENERATED ALWAYS AS (case when target_node_kind = 'curated_node' then target_node_id else null end) STORED;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_source_organization_fk" FOREIGN KEY ("source_curated_node_id","organization_id") REFERENCES "public"."kg_curated_node"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_target_organization_fk" FOREIGN KEY ("target_curated_node_id","organization_id") REFERENCES "public"."kg_curated_node"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kg_curated_edge_active_unique" ON "kg_curated_edge" USING btree ("organization_id","source_node_kind",(case when "directed" then "source_node_id" else least("source_node_id", "target_node_id") end),"target_node_kind",(case when "directed" then "target_node_id" else greatest("source_node_id", "target_node_id") end),"predicate","directed") WHERE "kg_curated_edge"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_source_kind_check" CHECK ("kg_curated_edge"."source_node_kind" in ('curated_node', 'wiki_document', 'project', 'ticket', 'meeting'));--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_target_kind_check" CHECK ("kg_curated_edge"."target_node_kind" in ('curated_node', 'wiki_document', 'project', 'ticket', 'meeting'));--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_endpoint_policy_check" CHECK ("kg_curated_edge"."predicate" = 'references' or ("kg_curated_edge"."source_node_kind" = 'curated_node' and "kg_curated_edge"."target_node_kind" = 'curated_node'));--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_direction_check" CHECK ("kg_curated_edge"."predicate" = 'related_to' or "kg_curated_edge"."directed" = true);--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_predicate_check" CHECK ("kg_curated_edge"."predicate" in ('related_to', 'depends_on', 'contains', 'references'));--> statement-breakpoint
ALTER TABLE "kg_curated_edge" ADD CONSTRAINT "kg_curated_edge_no_self_loop_check" CHECK ("kg_curated_edge"."predicate" = 'references' or "kg_curated_edge"."source_node_kind" <> "kg_curated_edge"."target_node_kind" or "kg_curated_edge"."source_node_id" <> "kg_curated_edge"."target_node_id");--> statement-breakpoint
ALTER TABLE "kg_curated_node" ADD CONSTRAINT "kg_curated_node_kind_check" CHECK ("kg_curated_node"."kind" in ('custom', 'concept', 'topic', 'technology', 'reference'));