ALTER TYPE "public"."chat_message_content_type" ADD VALUE 'organization_invitation' BEFORE 'text';--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "system_user_id" text;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "reference_kind" text;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "reference_id" text;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_system_user_id_user_id_fk" FOREIGN KEY ("system_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversation_system_user_uidx" ON "chat_conversation" USING btree ("system_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_reference_uidx" ON "chat_message" USING btree ("reference_kind","reference_id");