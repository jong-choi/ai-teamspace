CREATE TYPE "public"."meeting_attendee_status" AS ENUM('pending', 'accepted', 'tentative', 'declined');--> statement-breakpoint
CREATE TYPE "public"."meeting_recurrence_frequency" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."meeting_category" AS ENUM('team', 'sprint', '1on1', 'allhands', 'client');--> statement-breakpoint
CREATE TYPE "public"."meeting_location_type" AS ENUM('online', 'meeting_room', 'other');--> statement-breakpoint
CREATE TABLE "meeting_attendee" (
	"meeting_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "meeting_attendee_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_attendee_pk" PRIMARY KEY("meeting_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_recurrence_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"frequency" "meeting_recurrence_frequency" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"count" integer,
	"until" timestamp (3) with time zone,
	"by_weekday" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_zone" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_recurrence_series_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "meeting_recurrence_interval_check" CHECK ("meeting_recurrence_series"."interval" > 0),
	CONSTRAINT "meeting_recurrence_count_check" CHECK ("meeting_recurrence_series"."count" is null or "meeting_recurrence_series"."count" >= 2),
	CONSTRAINT "meeting_recurrence_end_check" CHECK (("meeting_recurrence_series"."count" is not null and "meeting_recurrence_series"."until" is null) or ("meeting_recurrence_series"."count" is null and "meeting_recurrence_series"."until" is not null))
);
--> statement-breakpoint
CREATE TABLE "meeting_room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"floor" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_room_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "meeting_room_capacity_check" CHECK ("meeting_room"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "meeting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"organizer_user_id" text NOT NULL,
	"title" text NOT NULL,
	"category" "meeting_category" NOT NULL,
	"start_at" timestamp (3) with time zone NOT NULL,
	"end_at" timestamp (3) with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"location_type" "meeting_location_type" NOT NULL,
	"meeting_room_id" uuid,
	"location_text" text,
	"agenda_markdown" text DEFAULT '' NOT NULL,
	"notes_markdown" text DEFAULT '' NOT NULL,
	"reminder_minutes" integer,
	"ical_uid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"ical_sequence" integer DEFAULT 0 NOT NULL,
	"recurrence_series_id" uuid,
	"recurrence_original_start_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp (3) with time zone,
	"canceled_by_user_id" text,
	"cancel_reason" text,
	CONSTRAINT "meeting_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "meeting_recurrence_occurrence_unique" UNIQUE("recurrence_series_id","recurrence_original_start_at"),
	CONSTRAINT "meeting_time_range_check" CHECK ("meeting"."end_at" > "meeting"."start_at"),
	CONSTRAINT "meeting_location_room_check" CHECK (("meeting"."location_type" = 'meeting_room' and "meeting"."meeting_room_id" is not null) or ("meeting"."location_type" <> 'meeting_room' and "meeting"."meeting_room_id" is null)),
	CONSTRAINT "meeting_reminder_minutes_check" CHECK ("meeting"."reminder_minutes" is null or "meeting"."reminder_minutes" >= 0),
	CONSTRAINT "meeting_ical_sequence_check" CHECK ("meeting"."ical_sequence" >= 0),
	CONSTRAINT "meeting_recurrence_pair_check" CHECK (("meeting"."recurrence_series_id" is null and "meeting"."recurrence_original_start_at" is null) or ("meeting"."recurrence_series_id" is not null and "meeting"."recurrence_original_start_at" is not null)),
	CONSTRAINT "meeting_cancel_metadata_check" CHECK (("meeting"."canceled_at" is null and "meeting"."canceled_by_user_id" is null and "meeting"."cancel_reason" is null) or ("meeting"."canceled_at" is not null and "meeting"."canceled_by_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "meeting_attendee" ADD CONSTRAINT "meeting_attendee_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendee" ADD CONSTRAINT "meeting_attendee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_recurrence_series" ADD CONSTRAINT "meeting_recurrence_series_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_room" ADD CONSTRAINT "meeting_room_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_organizer_user_id_user_id_fk" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_canceled_by_user_id_user_id_fk" FOREIGN KEY ("canceled_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_room_organization_fk" FOREIGN KEY ("meeting_room_id","organization_id") REFERENCES "public"."meeting_room"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_recurrence_series_organization_fk" FOREIGN KEY ("recurrence_series_id","organization_id") REFERENCES "public"."meeting_recurrence_series"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_attendee_user_idx" ON "meeting_attendee" USING btree ("user_id","meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_recurrence_series_organization_idx" ON "meeting_recurrence_series" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "meeting_room_organization_active_name_idx" ON "meeting_room" USING btree ("organization_id","active","name");--> statement-breakpoint
CREATE INDEX "meeting_organization_time_idx" ON "meeting" USING btree ("organization_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "meeting_organization_category_idx" ON "meeting" USING btree ("organization_id","category");--> statement-breakpoint
CREATE INDEX "meeting_organization_project_idx" ON "meeting" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "meeting_organization_room_idx" ON "meeting" USING btree ("organization_id","meeting_room_id");--> statement-breakpoint
CREATE INDEX "meeting_organizer_time_idx" ON "meeting" USING btree ("organizer_user_id","start_at");--> statement-breakpoint
CREATE INDEX "meeting_recurrence_series_start_idx" ON "meeting" USING btree ("recurrence_series_id","recurrence_original_start_at");