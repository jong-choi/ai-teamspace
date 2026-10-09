CREATE TABLE "kg_request_quota" (
	"organization_id" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"action" text NOT NULL,
	"window_start_at" timestamp (3) with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kg_request_quota_organization_id_subject_kind_subject_id_action_window_start_at_pk" PRIMARY KEY("organization_id","subject_kind","subject_id","action","window_start_at"),
	CONSTRAINT "kg_request_quota_subject_check" CHECK ("kg_request_quota"."subject_kind" in ('actor', 'organization')),
	CONSTRAINT "kg_request_quota_action_check" CHECK ("kg_request_quota"."action" in ('wiki_refresh', 'search_query', 'graph_rebuild')),
	CONSTRAINT "kg_request_quota_count_check" CHECK ("kg_request_quota"."count" >= 0),
	CONSTRAINT "kg_request_quota_org_subject_check" CHECK ("kg_request_quota"."subject_kind" <> 'organization' or "kg_request_quota"."subject_id" = "kg_request_quota"."organization_id")
);
--> statement-breakpoint
ALTER TABLE "kg_request_quota" ADD CONSTRAINT "kg_request_quota_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;