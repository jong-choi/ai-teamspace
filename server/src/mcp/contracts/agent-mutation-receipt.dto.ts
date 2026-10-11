import { z } from 'zod';

/**
 * built-in AI Teamspace write tool이 성공한 뒤 structured output에 담는 변경 영수증이다.
 * client는 Orval 생성 schema로 검증해 영향받은 업무 화면 cache만 갱신한다.
 * 권한 증표가 아니므로 화면 데이터는 항상 REST 재조회로 다시 받는다.
 * 제목·본문·이메일 같은 내용은 담지 않고 식별자와 시각만 담는다.
 */
const receiptBaseShape = {
  version: z.literal(1),
  source: z.literal('teamspace'),
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
};

export const ProjectTicketMutationReceiptSchema = z
  .object({
    ...receiptBaseShape,
    kind: z.literal('project_ticket'),
    operation: z.enum(['created', 'updated', 'moved']),
    projectId: z.string().min(1),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'ProjectTicketMutationReceipt' });

export const WikiDocumentMutationReceiptSchema = z
  .object({
    ...receiptBaseShape,
    kind: z.literal('wiki_document'),
    operation: z.enum(['created', 'updated']),
    revision: z.number().int().positive(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'WikiDocumentMutationReceipt' });

export const CalendarMeetingMutationReceiptSchema = z
  .object({
    ...receiptBaseShape,
    kind: z.literal('calendar_meeting'),
    operation: z.enum(['created', 'updated', 'cancelled']),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'CalendarMeetingMutationReceipt' });

export const CalendarMeetingRsvpMutationReceiptSchema = z
  .object({
    ...receiptBaseShape,
    kind: z.literal('calendar_meeting_rsvp'),
    operation: z.literal('responded'),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'CalendarMeetingRsvpMutationReceipt' });

export const OrganizationInvitationMutationReceiptSchema = z
  .object({
    ...receiptBaseShape,
    kind: z.literal('organization_invitation'),
    operation: z.literal('created'),
  })
  .meta({ id: 'OrganizationInvitationMutationReceipt' });

export const ChatMessageMutationReceiptSchema = z
  .object({
    ...receiptBaseShape,
    kind: z.literal('chat_message'),
    operation: z.literal('created'),
    conversationId: z.string().min(1),
  })
  .meta({ id: 'ChatMessageMutationReceipt' });

export const AgentMutationReceiptSchema = z
  .discriminatedUnion('kind', [
    ProjectTicketMutationReceiptSchema,
    WikiDocumentMutationReceiptSchema,
    CalendarMeetingMutationReceiptSchema,
    CalendarMeetingRsvpMutationReceiptSchema,
    OrganizationInvitationMutationReceiptSchema,
    ChatMessageMutationReceiptSchema,
  ])
  .meta({ id: 'AgentMutationReceipt' });

export type AgentMutationReceipt = z.infer<typeof AgentMutationReceiptSchema>;

/** write tool output은 기존 결과 DTO와 변경 영수증을 함께 담는다. */
export function mutationToolOutputSchema<
  TResult extends z.ZodType,
  TReceipt extends z.ZodType,
>(result: TResult, mutation: TReceipt) {
  return z.object({ result, mutation });
}
