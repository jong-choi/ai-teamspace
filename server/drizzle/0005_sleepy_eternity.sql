CREATE TYPE "public"."wiki_entry_kind" AS ENUM('folder', 'document');--> statement-breakpoint
CREATE TABLE "wiki_document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"content_markdown" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"parent_folder_id" uuid,
	"kind" "wiki_entry_kind" NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_entry_organization_parent_name_unique" UNIQUE NULLS NOT DISTINCT("organization_id","parent_folder_id","name")
);
--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_id_wiki_entry_id_fk" FOREIGN KEY ("id") REFERENCES "public"."wiki_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document" ADD CONSTRAINT "wiki_document_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_entry" ADD CONSTRAINT "wiki_entry_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_entry" ADD CONSTRAINT "wiki_entry_parent_folder_id_wiki_entry_id_fk" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."wiki_entry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_entry" ADD CONSTRAINT "wiki_entry_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_entry_organization_parent_position_idx" ON "wiki_entry" USING btree ("organization_id","parent_folder_id","position","id");--> statement-breakpoint
CREATE INDEX "wiki_entry_parent_folder_idx" ON "wiki_entry" USING btree ("parent_folder_id");--> statement-breakpoint
CREATE INDEX "wiki_entry_created_by_user_idx" ON "wiki_entry" USING btree ("created_by_user_id");