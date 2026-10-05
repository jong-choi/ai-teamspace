CREATE TABLE "wiki_collection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_collection_organization_unique" UNIQUE("organization_id"),
	CONSTRAINT "wiki_collection_id_organization_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "wiki_document_revision_collaborator" (
	"document_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"user_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "wiki_document_revision_collaborator_pk" PRIMARY KEY("document_id","revision","user_id")
);
--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "collection_id" uuid;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "parent_document_id" uuid;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "collaboration_state" "bytea";--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "collaboration_schema_version" integer;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "collaboration_persisted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "created_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD COLUMN "updated_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "wiki_collection" ADD CONSTRAINT "wiki_collection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document_revision_collaborator" ADD CONSTRAINT "wiki_document_revision_collaborator_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document_revision_collaborator" ADD CONSTRAINT "wiki_document_revision_collaborator_revision_fk" FOREIGN KEY ("document_id","revision") REFERENCES "public"."wiki_document_revision"("document_id","revision") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_document_revision_collaborator_order_idx" ON "wiki_document_revision_collaborator" USING btree ("document_id","revision","ordinal");--> statement-breakpoint
CREATE INDEX "wiki_document_revision_collaborator_user_idx" ON "wiki_document_revision_collaborator" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_collection_id_wiki_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."wiki_collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_id_collection_organization_unique" UNIQUE("id","collection_id","organization_id");--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_id_organization_unique" UNIQUE("id","organization_id");