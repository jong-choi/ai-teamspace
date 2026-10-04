CREATE TYPE "public"."chat_conversation_kind" AS ENUM('channel', 'direct', 'system');--> statement-breakpoint
CREATE TYPE "public"."chat_message_content_type" AS ENUM('text');--> statement-breakpoint
CREATE TYPE "public"."chat_message_sender_kind" AS ENUM('system', 'user');--> statement-breakpoint
CREATE TABLE "chat_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "chat_conversation_kind" NOT NULL,
	"name" text,
	"topic" text,
	"direct_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_kind" "chat_message_sender_kind" NOT NULL,
	"sender_user_id" text,
	"content_type" "chat_message_content_type" NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_participant" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "chat_participant_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversation_id_chat_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_participant" ADD CONSTRAINT "chat_participant_conversation_id_chat_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_participant" ADD CONSTRAINT "chat_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversation_direct_key_uidx" ON "chat_conversation" USING btree ("direct_key");--> statement-breakpoint
CREATE INDEX "chat_conversation_updated_at_idx" ON "chat_conversation" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "chat_message_conversation_created_id_idx" ON "chat_message" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "chat_message_sender_user_idx" ON "chat_message" USING btree ("sender_user_id");--> statement-breakpoint
CREATE INDEX "chat_participant_user_conversation_idx" ON "chat_participant" USING btree ("user_id","conversation_id");