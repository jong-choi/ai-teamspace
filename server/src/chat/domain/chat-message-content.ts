import { z } from 'zod';

export const chatTextMessageContentSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
});

export const chatOrganizationInvitationMessageContentSchema = z.object({
  type: z.literal('organization_invitation'),
  invitationId: z.string(),
  organizationId: z.string(),
  inviterUserId: z.string(),
  organizationNameAtSend: z.string().optional(),
  inviterDisplayNameAtSend: z.string().optional(),
});

export const chatMessageContentSchema = z.union([
  chatTextMessageContentSchema,
  chatOrganizationInvitationMessageContentSchema,
]);

export type ChatTextMessageContent = z.infer<
  typeof chatTextMessageContentSchema
>;
export type ChatOrganizationInvitationMessageContent = z.infer<
  typeof chatOrganizationInvitationMessageContentSchema
>;

export type ChatMessageContentInput =
  | {
      contentType: 'text';
      content: ChatTextMessageContent;
    }
  | {
      contentType: 'organization_invitation';
      content: ChatOrganizationInvitationMessageContent;
    };
