import { z } from 'zod';

export const WikiCollaborationInvalidationEventSchema = z.discriminatedUnion(
  'scope',
  [
    z.object({
      scope: z.literal('organization-user'),
      organizationId: z.string().min(1),
      userId: z.string().min(1),
    }),
    z.object({
      scope: z.literal('document'),
      organizationId: z.string().min(1),
      documentId: z.string().uuid(),
    }),
    // 공동편집 서버 밖에서 본문이 저장되어 메모리의 문서가 뒤처진 경우다.
    z.object({
      scope: z.literal('document-content'),
      organizationId: z.string().min(1),
      documentId: z.string().uuid(),
    }),
  ],
);

export type WikiCollaborationInvalidationEvent = z.infer<
  typeof WikiCollaborationInvalidationEventSchema
>;

export abstract class WikiCollaborationInvalidationPublisher {
  abstract publish(event: WikiCollaborationInvalidationEvent): Promise<void>;
}

export abstract class WikiCollaborationInvalidationSubscriber {
  abstract subscribe(
    handler: (
      event: WikiCollaborationInvalidationEvent,
    ) => void | Promise<void>,
  ): Promise<() => Promise<void>>;
}
