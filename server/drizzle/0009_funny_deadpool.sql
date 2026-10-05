ALTER TABLE "wiki_document_revision" DROP CONSTRAINT "wiki_document_revision_document_id_wiki_document_id_fk";
--> statement-breakpoint
ALTER TABLE "wiki_document_revision" DROP CONSTRAINT "wiki_document_revision_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "wiki_document_revision" DROP CONSTRAINT "wiki_document_revision_entry_organization_fk";
--> statement-breakpoint
ALTER TABLE "wiki_document" DROP CONSTRAINT "wiki_document_id_wiki_entry_id_fk";
--> statement-breakpoint
ALTER TABLE "wiki_document" DROP CONSTRAINT "wiki_document_collection_id_wiki_collection_id_fk";
--> statement-breakpoint
ALTER TABLE "wiki_document" DROP CONSTRAINT "wiki_document_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "collection_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "position" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "collaboration_state" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "collaboration_schema_version" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "collaboration_schema_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "collaboration_persisted_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "created_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "wiki_document" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wiki_document_revision" ADD CONSTRAINT "wiki_document_revision_document_organization_fk" FOREIGN KEY ("document_id","organization_id") REFERENCES "public"."wiki_document"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_collection_organization_fk" FOREIGN KEY ("collection_id","organization_id") REFERENCES "public"."wiki_collection"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_parent_scope_fk" FOREIGN KEY ("parent_document_id","collection_id","organization_id") REFERENCES "public"."wiki_document"("id","collection_id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_document_collection_parent_position_idx" ON "wiki_document" USING btree ("collection_id","parent_document_id","position","id");--> statement-breakpoint
CREATE INDEX "wiki_document_parent_idx" ON "wiki_document" USING btree ("parent_document_id");--> statement-breakpoint
CREATE INDEX "wiki_document_created_by_user_idx" ON "wiki_document" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "wiki_document_updated_by_user_idx" ON "wiki_document" USING btree ("updated_by_user_id");--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_collection_parent_title_unique" UNIQUE NULLS NOT DISTINCT("collection_id","parent_document_id","title");--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_parent_not_self_check" CHECK ("wiki_document"."parent_document_id" is null or "wiki_document"."parent_document_id" <> "wiki_document"."id");