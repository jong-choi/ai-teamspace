CREATE TYPE "public"."mcp_access_key_allocation_state" AS ENUM('reserving', 'active');--> statement-breakpoint
CREATE TYPE "public"."mcp_access_key_operation_kind" AS ENUM('create', 'rotate');--> statement-breakpoint
CREATE TYPE "public"."mcp_access_key_operation_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 60000,
	"rate_limit_max" integer DEFAULT 60,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp,
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"refresh_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"revoked" timestamp,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"client_discovery_id" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"client_credentials_scopes" text[] DEFAULT '{}',
	"user_id" text,
	"created_at" timestamp,
	"updated_at" timestamp,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"backchannel_logout_uri" text,
	"backchannel_logout_session_required" boolean,
	"token_endpoint_auth_method" text,
	"application_type" text,
	"jwks" text,
	"jwks_uri" text,
	"grant_types" text[],
	"response_types" text[],
	"require_pkce" boolean,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_assertion" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"scopes" text[] NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"revoked" timestamp,
	"rotated_at" timestamp,
	"rotation_replay_response" text,
	"rotation_replay_expires_at" timestamp,
	"auth_time" timestamp,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp,
	"updated_at" timestamp,
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb,
	CONSTRAINT "oauth_resource_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "mcp_access_key_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"slot" integer NOT NULL,
	"better_auth_key_id" text,
	"state" "mcp_access_key_allocation_state" DEFAULT 'reserving' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_access_key_allocation_user_slot_unique" UNIQUE("user_id","slot"),
	CONSTRAINT "mcp_access_key_allocation_better_auth_key_unique" UNIQUE("better_auth_key_id"),
	CONSTRAINT "mcp_access_key_allocation_slot_nonnegative_check" CHECK ("mcp_access_key_allocation"."slot" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mcp_access_key_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" "mcp_access_key_operation_kind" NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" "mcp_access_key_operation_status" DEFAULT 'pending' NOT NULL,
	"resulting_key_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "mcp_access_key_operation_user_idempotency_unique" UNIQUE("user_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "mcp_agent_delegation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"issuer" text NOT NULL,
	"resource_url" text NOT NULL,
	"oauth_client_identity" text NOT NULL,
	"granted_scopes" text[] NOT NULL,
	"tokens_format_version" integer NOT NULL,
	"tokens_algorithm" text NOT NULL,
	"tokens_key_id" text NOT NULL,
	"tokens_nonce" text NOT NULL,
	"tokens_ciphertext" text NOT NULL,
	"tokens_auth_tag" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"refresh_lease_owner" text,
	"refresh_lease_expires_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	CONSTRAINT "mcp_agent_delegation_actor_issuer_client_unique" UNIQUE("user_id","organization_id","issuer","oauth_client_identity"),
	CONSTRAINT "mcp_agent_delegation_tokens_format_version_positive_check" CHECK ("mcp_agent_delegation"."tokens_format_version" > 0),
	CONSTRAINT "mcp_agent_delegation_revision_nonnegative_check" CHECK ("mcp_agent_delegation"."revision" >= 0),
	CONSTRAINT "mcp_agent_delegation_refresh_lease_complete_check" CHECK ((
        "mcp_agent_delegation"."refresh_lease_owner" IS NULL
        AND "mcp_agent_delegation"."refresh_lease_expires_at" IS NULL
      ) OR (
        "mcp_agent_delegation"."refresh_lease_owner" IS NOT NULL
        AND "mcp_agent_delegation"."refresh_lease_expires_at" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "mcp_agent_oauth_flow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"oauth_client_identity" text NOT NULL,
	"issuer" text,
	"state_hash" text NOT NULL,
	"requested_scopes" text[] NOT NULL,
	"resource_url" text NOT NULL,
	"redirect_url" text NOT NULL,
	"return_to" text NOT NULL,
	"completion_url" text NOT NULL,
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
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_agent_oauth_flow_state_hash_unique" UNIQUE("state_hash"),
	CONSTRAINT "mcp_agent_oauth_flow_state_hash_sha256_check" CHECK (char_length("mcp_agent_oauth_flow"."state_hash") = 64),
	CONSTRAINT "mcp_agent_oauth_flow_expiry_after_creation_check" CHECK ("mcp_agent_oauth_flow"."expires_at" > "mcp_agent_oauth_flow"."created_at"),
	CONSTRAINT "mcp_agent_oauth_flow_verifier_envelope_complete_check" CHECK ((
        "mcp_agent_oauth_flow"."verifier_format_version" IS NULL
        AND "mcp_agent_oauth_flow"."verifier_algorithm" IS NULL
        AND "mcp_agent_oauth_flow"."verifier_key_id" IS NULL
        AND "mcp_agent_oauth_flow"."verifier_nonce" IS NULL
        AND "mcp_agent_oauth_flow"."verifier_ciphertext" IS NULL
        AND "mcp_agent_oauth_flow"."verifier_auth_tag" IS NULL
      ) OR (
        "mcp_agent_oauth_flow"."verifier_format_version" IS NOT NULL
        AND "mcp_agent_oauth_flow"."verifier_algorithm" IS NOT NULL
        AND "mcp_agent_oauth_flow"."verifier_key_id" IS NOT NULL
        AND "mcp_agent_oauth_flow"."verifier_nonce" IS NOT NULL
        AND "mcp_agent_oauth_flow"."verifier_ciphertext" IS NOT NULL
        AND "mcp_agent_oauth_flow"."verifier_auth_tag" IS NOT NULL
      )),
	CONSTRAINT "mcp_agent_oauth_flow_discovery_envelope_complete_check" CHECK ((
        "mcp_agent_oauth_flow"."discovery_format_version" IS NULL
        AND "mcp_agent_oauth_flow"."discovery_algorithm" IS NULL
        AND "mcp_agent_oauth_flow"."discovery_key_id" IS NULL
        AND "mcp_agent_oauth_flow"."discovery_nonce" IS NULL
        AND "mcp_agent_oauth_flow"."discovery_ciphertext" IS NULL
        AND "mcp_agent_oauth_flow"."discovery_auth_tag" IS NULL
      ) OR (
        "mcp_agent_oauth_flow"."discovery_format_version" IS NOT NULL
        AND "mcp_agent_oauth_flow"."discovery_algorithm" IS NOT NULL
        AND "mcp_agent_oauth_flow"."discovery_key_id" IS NOT NULL
        AND "mcp_agent_oauth_flow"."discovery_nonce" IS NOT NULL
        AND "mcp_agent_oauth_flow"."discovery_ciphertext" IS NOT NULL
        AND "mcp_agent_oauth_flow"."discovery_auth_tag" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_refresh_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_resource_id_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."oauth_resource"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_access_key_allocation" ADD CONSTRAINT "mcp_access_key_allocation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_access_key_operation" ADD CONSTRAINT "mcp_access_key_operation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_agent_delegation" ADD CONSTRAINT "mcp_agent_delegation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_agent_delegation" ADD CONSTRAINT "mcp_agent_delegation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_agent_oauth_flow" ADD CONSTRAINT "mcp_agent_oauth_flow_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_agent_oauth_flow" ADD CONSTRAINT "mcp_agent_oauth_flow_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apikey_configId_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_referenceId_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "oauthAccessToken_clientId_idx" ON "oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauthAccessToken_sessionId_idx" ON "oauth_access_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauthAccessToken_userId_idx" ON "oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthAccessToken_authorizationCodeId_idx" ON "oauth_access_token" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "oauthAccessToken_refreshId_idx" ON "oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauthClient_userId_idx" ON "oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauthClientResource_clientId_resourceId_uidx" ON "oauth_client_resource" USING btree ("client_id","resource_id");--> statement-breakpoint
CREATE INDEX "oauthClientResource_clientId_idx" ON "oauth_client_resource" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauthClientResource_resourceId_idx" ON "oauth_client_resource" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "oauthConsent_clientId_idx" ON "oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauthConsent_userId_idx" ON "oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthRefreshToken_clientId_idx" ON "oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauthRefreshToken_sessionId_idx" ON "oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauthRefreshToken_userId_idx" ON "oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthRefreshToken_authorizationCodeId_idx" ON "oauth_refresh_token" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "mcp_access_key_allocation_user_state_idx" ON "mcp_access_key_allocation" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "mcp_access_key_operation_user_status_idx" ON "mcp_access_key_operation" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "mcp_access_key_operation_expires_at_idx" ON "mcp_access_key_operation" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mcp_agent_delegation_actor_active_idx" ON "mcp_agent_delegation" USING btree ("user_id","organization_id","revoked_at");--> statement-breakpoint
CREATE INDEX "mcp_agent_oauth_flow_actor_expiry_idx" ON "mcp_agent_oauth_flow" USING btree ("user_id","organization_id","expires_at");