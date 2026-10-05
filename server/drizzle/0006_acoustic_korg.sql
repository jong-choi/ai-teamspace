CREATE TABLE "wiki_document_edit_lock" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"locked_by_user_id" text NOT NULL,
	"acquired_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_document_revision" (
	"document_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"revision" integer NOT NULL,
	"editor_user_id" text NOT NULL,
	"content_markdown" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_document_revision_pk" PRIMARY KEY("document_id","revision")
);
--> statement-breakpoint
ALTER TABLE "wiki_document_edit_lock" ADD CONSTRAINT "wiki_document_edit_lock_document_id_wiki_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."wiki_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document_edit_lock" ADD CONSTRAINT "wiki_document_edit_lock_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document_edit_lock" ADD CONSTRAINT "wiki_document_edit_lock_locked_by_user_id_user_id_fk" FOREIGN KEY ("locked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document_revision" ADD CONSTRAINT "wiki_document_revision_document_id_wiki_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."wiki_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document_revision" ADD CONSTRAINT "wiki_document_revision_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_document_revision" ADD CONSTRAINT "wiki_document_revision_editor_user_id_user_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_document_edit_lock_organization_expires_idx" ON "wiki_document_edit_lock" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE INDEX "wiki_document_edit_lock_owner_idx" ON "wiki_document_edit_lock" USING btree ("locked_by_user_id");--> statement-breakpoint
CREATE INDEX "wiki_document_revision_organization_document_idx" ON "wiki_document_revision" USING btree ("organization_id","document_id","revision");--> statement-breakpoint
CREATE INDEX "wiki_document_revision_editor_idx" ON "wiki_document_revision" USING btree ("editor_user_id");--> statement-breakpoint
ALTER TABLE "wiki_entry" ADD CONSTRAINT "wiki_entry_id_organization_unique" UNIQUE("id","organization_id");