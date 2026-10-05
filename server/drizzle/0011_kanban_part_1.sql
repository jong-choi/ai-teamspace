CREATE TYPE "public"."ticket_priority" AS ENUM('urgent', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TABLE "project_column" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_column_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "project_column_position_nonnegative_check" CHECK ("project_column"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"lead_user_id" text,
	"created_by_user_id" text NOT NULL,
	"next_ticket_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "project_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "project_next_ticket_number_positive_check" CHECK ("project"."next_ticket_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description_markdown" text DEFAULT '' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"assignee_user_id" text,
	"reporter_user_id" text NOT NULL,
	"position" integer NOT NULL,
	"due_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "ticket_number_positive_check" CHECK ("ticket"."number" > 0),
	CONSTRAINT "ticket_position_nonnegative_check" CHECK ("ticket"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "project_column" ADD CONSTRAINT "project_column_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_lead_user_id_user_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_project_organization_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."project"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_column_project_fk" FOREIGN KEY ("column_id","project_id") REFERENCES "public"."project_column"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_column_project_position_idx" ON "project_column" USING btree ("project_id","position","id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_organization_key_uidx" ON "project" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "project_organization_archived_updated_idx" ON "project" USING btree ("organization_id","archived_at","updated_at");--> statement-breakpoint
CREATE INDEX "project_lead_user_idx" ON "project" USING btree ("lead_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_project_number_uidx" ON "ticket" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "ticket_project_column_position_idx" ON "ticket" USING btree ("project_id","column_id","position","id");--> statement-breakpoint
CREATE INDEX "ticket_organization_project_archived_idx" ON "ticket" USING btree ("organization_id","project_id","archived_at");--> statement-breakpoint
CREATE INDEX "ticket_assignee_user_idx" ON "ticket" USING btree ("assignee_user_id");