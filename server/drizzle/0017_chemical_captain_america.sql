CREATE TABLE "outbox_aggregate_version" (
	"organization_id" text NOT NULL,
	"aggregate_kind" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"desired_seq" bigint DEFAULT 0 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_aggregate_version_organization_id_aggregate_kind_aggregate_id_pk" PRIMARY KEY("organization_id","aggregate_kind","aggregate_id")
);
