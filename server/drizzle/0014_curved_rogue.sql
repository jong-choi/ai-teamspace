CREATE TABLE "mcp_organization_policy" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"allowed_scopes" text[] NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_organization_policy_revision_nonnegative_check" CHECK ("mcp_organization_policy"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mcp_user_policy" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"requested_scopes" text[] NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_user_policy_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "mcp_user_policy_revision_nonnegative_check" CHECK ("mcp_user_policy"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "mcp_organization_policy" ADD CONSTRAINT "mcp_organization_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_organization_policy" ADD CONSTRAINT "mcp_organization_policy_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_user_policy" ADD CONSTRAINT "mcp_user_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_user_policy" ADD CONSTRAINT "mcp_user_policy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_user_policy_user_organization_idx" ON "mcp_user_policy" USING btree ("user_id","organization_id");