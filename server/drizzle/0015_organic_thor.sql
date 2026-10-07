CREATE TYPE "public"."agent_mcp_auth_kind" AS ENUM('none', 'bearer', 'oauth');--> statement-breakpoint
CREATE TYPE "public"."agent_mcp_last_error_category" AS ENUM('connection_unavailable', 'authorization_required', 'credential_expired', 'protocol_incompatible', 'discovery_failed', 'tool_not_allowed', 'tool_timeout', 'tool_error', 'response_too_large', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_mcp_tool_policy_mode" AS ENUM('selected', 'all');--> statement-breakpoint
CREATE TYPE "public"."agent_mcp_transport" AS ENUM('http');--> statement-breakpoint
CREATE TABLE "agent_mcp_connection_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"original_tool_name" text NOT NULL,
	"schema_fingerprint" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_mcp_connection_tool_identity_unique" UNIQUE("connection_id","original_tool_name")
);
--> statement-breakpoint
CREATE TABLE "agent_mcp_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"display_name" text NOT NULL,
	"namespace" text NOT NULL,
	"endpoint" text NOT NULL,
	"transport" "agent_mcp_transport" DEFAULT 'http' NOT NULL,
	"auth_kind" "agent_mcp_auth_kind" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"tool_policy_mode" "agent_mcp_tool_policy_mode" DEFAULT 'selected' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"last_tested_at" timestamp (3) with time zone,
	"last_error_category" "agent_mcp_last_error_category",
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_mcp_connection_owner_org_namespace_unique" UNIQUE("owner_user_id","organization_id","namespace"),
	CONSTRAINT "agent_mcp_connection_revision_nonnegative_check" CHECK ("agent_mcp_connection"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_mcp_credential" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"format_version" integer DEFAULT 1 NOT NULL,
	"algorithm" text NOT NULL,
	"key_id" text NOT NULL,
	"nonce" text NOT NULL,
	"ciphertext" text NOT NULL,
	"auth_tag" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"refresh_lease_id" text,
	"refresh_lease_expires_at" timestamp (3) with time zone,
	"expires_at" timestamp (3) with time zone,
	"refreshed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_mcp_credential_format_version_positive_check" CHECK ("agent_mcp_credential"."format_version" > 0),
	CONSTRAINT "agent_mcp_credential_revision_nonnegative_check" CHECK ("agent_mcp_credential"."revision" >= 0),
	CONSTRAINT "agent_mcp_credential_refresh_lease_complete_check" CHECK ((
        "agent_mcp_credential"."refresh_lease_id" IS NULL
        AND "agent_mcp_credential"."refresh_lease_expires_at" IS NULL
      ) OR (
        "agent_mcp_credential"."refresh_lease_id" IS NOT NULL
        AND "agent_mcp_credential"."refresh_lease_expires_at" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "agent_mcp_oauth_state" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"resource_identity" text NOT NULL,
	"authorization_server" text,
	"redirect_uri" text NOT NULL,
	"verifier_format_version" integer,
	"verifier_algorithm" text,
	"verifier_key_id" text,
	"verifier_nonce" text,
	"verifier_ciphertext" text,
	"verifier_auth_tag" text,
	"discovery_format_version" integer,
	"discovery_algorithm" text,
	"discovery_key_id" text,
	"discovery_nonce" text,
	"discovery_ciphertext" text,
	"discovery_auth_tag" text,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"consumed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_mcp_oauth_state_verifier_envelope_complete_check" CHECK ((
        "agent_mcp_oauth_state"."verifier_format_version" IS NULL
        AND "agent_mcp_oauth_state"."verifier_algorithm" IS NULL
        AND "agent_mcp_oauth_state"."verifier_key_id" IS NULL
        AND "agent_mcp_oauth_state"."verifier_nonce" IS NULL
        AND "agent_mcp_oauth_state"."verifier_ciphertext" IS NULL
        AND "agent_mcp_oauth_state"."verifier_auth_tag" IS NULL
      ) OR (
        "agent_mcp_oauth_state"."verifier_format_version" IS NOT NULL
        AND "agent_mcp_oauth_state"."verifier_algorithm" IS NOT NULL
        AND "agent_mcp_oauth_state"."verifier_key_id" IS NOT NULL
        AND "agent_mcp_oauth_state"."verifier_nonce" IS NOT NULL
        AND "agent_mcp_oauth_state"."verifier_ciphertext" IS NOT NULL
        AND "agent_mcp_oauth_state"."verifier_auth_tag" IS NOT NULL
      )),
	CONSTRAINT "agent_mcp_oauth_state_verifier_format_version_positive_check" CHECK ("agent_mcp_oauth_state"."verifier_format_version" IS NULL OR "agent_mcp_oauth_state"."verifier_format_version" > 0),
	CONSTRAINT "agent_mcp_oauth_state_discovery_envelope_complete_check" CHECK ((
        "agent_mcp_oauth_state"."discovery_format_version" IS NULL
        AND "agent_mcp_oauth_state"."discovery_algorithm" IS NULL
        AND "agent_mcp_oauth_state"."discovery_key_id" IS NULL
        AND "agent_mcp_oauth_state"."discovery_nonce" IS NULL
        AND "agent_mcp_oauth_state"."discovery_ciphertext" IS NULL
        AND "agent_mcp_oauth_state"."discovery_auth_tag" IS NULL
      ) OR (
        "agent_mcp_oauth_state"."discovery_format_version" IS NOT NULL
        AND "agent_mcp_oauth_state"."discovery_algorithm" IS NOT NULL
        AND "agent_mcp_oauth_state"."discovery_key_id" IS NOT NULL
        AND "agent_mcp_oauth_state"."discovery_nonce" IS NOT NULL
        AND "agent_mcp_oauth_state"."discovery_ciphertext" IS NOT NULL
        AND "agent_mcp_oauth_state"."discovery_auth_tag" IS NOT NULL
      )),
	CONSTRAINT "agent_mcp_oauth_state_discovery_format_version_positive_check" CHECK ("agent_mcp_oauth_state"."discovery_format_version" IS NULL OR "agent_mcp_oauth_state"."discovery_format_version" > 0),
	CONSTRAINT "agent_mcp_oauth_state_expiry_after_creation_check" CHECK ("agent_mcp_oauth_state"."expires_at" > "agent_mcp_oauth_state"."created_at")
);
--> statement-breakpoint
ALTER TABLE "agent_mcp_connection_tools" ADD CONSTRAINT "agent_mcp_connection_tools_connection_id_agent_mcp_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_mcp_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_connection" ADD CONSTRAINT "agent_mcp_connection_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_connection" ADD CONSTRAINT "agent_mcp_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_credential" ADD CONSTRAINT "agent_mcp_credential_connection_id_agent_mcp_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_mcp_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_oauth_state" ADD CONSTRAINT "agent_mcp_oauth_state_connection_id_agent_mcp_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_mcp_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_oauth_state" ADD CONSTRAINT "agent_mcp_oauth_state_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_oauth_state" ADD CONSTRAINT "agent_mcp_oauth_state_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_mcp_connection_tool_enabled_idx" ON "agent_mcp_connection_tools" USING btree ("connection_id","enabled");--> statement-breakpoint
CREATE INDEX "agent_mcp_connection_owner_org_enabled_idx" ON "agent_mcp_connection" USING btree ("owner_user_id","organization_id","enabled");