CREATE TYPE "public"."ticket_label_color" AS ENUM('neutral', 'red', 'orange', 'amber', 'green', 'blue', 'violet', 'pink');--> statement-breakpoint
CREATE TABLE "ticket_checklist_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"title" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_checklist_item_position_nonnegative_check" CHECK ("ticket_checklist_item"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ticket_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_checklist_position_nonnegative_check" CHECK ("ticket_checklist"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ticket_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"content_markdown" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_label_assignment" (
	"ticket_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "ticket_label_assignment_ticket_id_label_id_pk" PRIMARY KEY("ticket_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_label" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" "ticket_label_color" DEFAULT 'neutral' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_checklist_item" ADD CONSTRAINT "ticket_checklist_item_checklist_id_ticket_checklist_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."ticket_checklist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist" ADD CONSTRAINT "ticket_checklist_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_label_assignment" ADD CONSTRAINT "ticket_label_assignment_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_label_assignment" ADD CONSTRAINT "ticket_label_assignment_label_id_ticket_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."ticket_label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_label" ADD CONSTRAINT "ticket_label_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_checklist_item_checklist_position_idx" ON "ticket_checklist_item" USING btree ("checklist_id","position","id");--> statement-breakpoint
CREATE INDEX "ticket_checklist_ticket_position_idx" ON "ticket_checklist" USING btree ("ticket_id","position","id");--> statement-breakpoint
CREATE INDEX "ticket_comment_ticket_created_idx" ON "ticket_comment" USING btree ("ticket_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ticket_label_project_name_idx" ON "ticket_label" USING btree ("project_id","name","id");